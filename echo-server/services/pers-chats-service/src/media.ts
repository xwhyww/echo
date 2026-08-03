import sharp from 'sharp';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import { writeFile, unlink } from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';

if (ffmpegStatic) {
	ffmpeg.setFfmpegPath(ffmpegStatic);
}

const IMAGE_MAX_DIMENSION = 1920;
const IMAGE_QUALITY = 80;
const VIDEO_MAX_HEIGHT = 720;
const VIDEO_CRF = 28; // lower = better quality, 23 is default, 28 is smaller

/**
 * Compress an image buffer with sharp.
 * Converts to WebP, resizes to max 1920px, strips metadata.
 * GIFs are returned as-is (sharp loses animation for multi-frame).
 */
export async function compressImage(
	buffer: Buffer,
	mimeType: string,
): Promise<{ buffer: Buffer; mimeType: string; ext: string }> {
	if (mimeType === 'image/gif') {
		return { buffer, mimeType, ext: 'gif' };
	}

	const result = await sharp(buffer)
		.resize(IMAGE_MAX_DIMENSION, IMAGE_MAX_DIMENSION, {
			fit: 'inside',
			withoutEnlargement: true,
		})
		.rotate() // auto-rotate based on EXIF
		.webp({ quality: IMAGE_QUALITY })
		.toBuffer();

	// Only use compressed if smaller
	if (result.length >= buffer.length) {
		const ext = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
		return { buffer, mimeType, ext };
	}

	return { buffer: result, mimeType: 'image/webp', ext: 'webp' };
}

/**
 * Compress a video file with ffmpeg.
 * Re-encodes to H.264 MP4, caps height at 720p, uses CRF for quality control.
 * Returns path to the compressed file.
 */
export async function compressVideo(
	buffer: Buffer,
	uploadsDir: string,
): Promise<{ filePath: string; ext: string; mimeType: string; size: number }> {
	const tempId = randomUUID();
	const inputPath = path.join(uploadsDir, `_tmp_in_${tempId}`);
	const outputPath = path.join(uploadsDir, `${tempId}.mp4`);

	await writeFile(inputPath, buffer);

	try {
		await new Promise<void>((resolve, reject) => {
			ffmpeg(inputPath)
				.videoCodec('libx264')
				.audioCodec('aac')
				.outputOptions([
					`-crf ${VIDEO_CRF}`,
					`-vf scale=-2:'min(${VIDEO_MAX_HEIGHT},ih)'`,
					'-movflags +faststart', // streaming-friendly
					'-preset fast',
				])
				.output(outputPath)
				.on('end', () => resolve())
				.on('error', (err) => reject(err))
				.run();
		});

		const { size } = await import('fs').then((fs) =>
			fs.statSync(outputPath),
		);

		return { filePath: outputPath, ext: 'mp4', mimeType: 'video/mp4', size };
	} finally {
		await unlink(inputPath).catch(() => {});
	}
}
