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
const THUMB_DIMENSION = 200;
const THUMB_QUALITY = 75;
const VIDEO_MAX_HEIGHT = 720;
const VIDEO_CRF = 28;

// Extension to use when we keep the uploaded bytes instead of our WebP re-encode.
const ORIGINAL_EXT: Record<string, string> = {
	'image/png': 'png',
	'image/webp': 'webp',
	'image/avif': 'avif',
};

export interface CompressedImage {
	buffer: Buffer;
	mimeType: string;
	ext: string;
	// 200px WebP thumbnail. Generated for static images. Skipped for GIFs so
	// the chat plays the animation instead of a frozen first frame. Null when
	// skipped or when thumb generation throws (corrupt input). Callers store
	// it as `${hash}_thumb.webp`.
	thumb: { buffer: Buffer; ext: 'webp' } | null;
}

async function makeThumb(buffer: Buffer): Promise<{ buffer: Buffer; ext: 'webp' } | null> {
	try {
		const out = await sharp(buffer, { animated: false })
			.resize(THUMB_DIMENSION, THUMB_DIMENSION, {
				fit: 'inside',
				withoutEnlargement: true,
			})
			.rotate()
			.webp({ quality: THUMB_QUALITY })
			.toBuffer();
		return { buffer: out, ext: 'webp' };
	} catch {
		return null;
	}
}

export async function compressImage(buffer: Buffer, mimeType: string): Promise<CompressedImage> {
	if (mimeType === 'image/gif') {
		return { buffer, mimeType, ext: 'gif', thumb: null };
	}

	const thumb = await makeThumb(buffer);

	const result = await sharp(buffer)
		.resize(IMAGE_MAX_DIMENSION, IMAGE_MAX_DIMENSION, {
			fit: 'inside',
			withoutEnlargement: true,
		})
		.rotate()
		.webp({ quality: IMAGE_QUALITY })
		.toBuffer();

	// AVIF often beats our WebP re-encode, so the original is kept fairly
	// often — the stored extension has to match what we actually keep.
	if (result.length >= buffer.length) {
		return { buffer, mimeType, ext: ORIGINAL_EXT[mimeType] ?? 'jpg', thumb };
	}

	return { buffer: result, mimeType: 'image/webp', ext: 'webp', thumb };
}

export async function compressVideo(
	buffer: Buffer,
	tmpDir: string,
): Promise<{ filePath: string; ext: string; mimeType: string; size: number }> {
	const tempId = randomUUID();
	const inputPath = path.join(tmpDir, `_tmp_in_${tempId}`);
	const outputPath = path.join(tmpDir, `${tempId}.mp4`);

	await writeFile(inputPath, buffer);

	try {
		await new Promise<void>((resolve, reject) => {
			ffmpeg(inputPath)
				.videoCodec('libx264')
				.audioCodec('aac')
				.outputOptions([
					`-crf ${VIDEO_CRF}`,
					`-vf scale=-2:'min(${VIDEO_MAX_HEIGHT},ih)'`,
					'-movflags +faststart',
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
