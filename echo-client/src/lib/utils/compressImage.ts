const MAX_DIMENSION = 2048;
const QUALITY = 0.82;

/**
 * Compress an image file client-side using Canvas API.
 * Resizes to max 2048px on longest side and re-encodes as WebP.
 * GIFs are returned as-is (Canvas loses animation).
 */
export async function compressImage(file: File): Promise<File> {
	if (file.type === 'image/gif') return file;

	const bitmap = await createImageBitmap(file);
	const { width, height } = bitmap;

	// Skip tiny images — not worth re-encoding
	if (width <= MAX_DIMENSION && height <= MAX_DIMENSION && file.size < 200 * 1024) {
		bitmap.close();
		return file;
	}

	let newW = width;
	let newH = height;

	if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
		const ratio = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height);
		newW = Math.round(width * ratio);
		newH = Math.round(height * ratio);
	}

	const canvas = new OffscreenCanvas(newW, newH);
	const ctx = canvas.getContext('2d')!;
	ctx.drawImage(bitmap, 0, 0, newW, newH);
	bitmap.close();

	const blob = await canvas.convertToBlob({ type: 'image/webp', quality: QUALITY });

	// Only use compressed version if it's actually smaller
	if (blob.size >= file.size) return file;

	const name = file.name.replace(/\.[^.]+$/, '.webp');
	return new File([blob], name, { type: 'image/webp' });
}

/**
 * Compress all image files in an array, leaving non-images untouched.
 */
export async function compressFiles(files: File[]): Promise<File[]> {
	return Promise.all(
		files.map(async (file) => {
			if (file.type.startsWith('image/')) {
				return compressImage(file);
			}
			return file;
		}),
	);
}

/** SHA-256 hex digest of a File's bytes. Loads the whole file into memory —
 *  fine for normal chat attachments (under ~100MB). */
export async function hashFile(file: File): Promise<string> {
	const buf = await file.arrayBuffer();
	const digest = await crypto.subtle.digest('SHA-256', buf);
	return Array.from(new Uint8Array(digest))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}
