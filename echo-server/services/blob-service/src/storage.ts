import { createReadStream } from 'fs';
import { mkdir, writeFile, rename, copyFile, unlink, stat } from 'fs/promises';
import path from 'path';
import { Readable } from 'stream';
import {
	S3Client,
	PutObjectCommand,
	GetObjectCommand,
	DeleteObjectCommand,
	HeadObjectCommand,
	HeadBucketCommand,
	CreateBucketCommand,
} from '@aws-sdk/client-s3';
import { config } from './config.js';

// Storage abstraction for blob bytes. Metadata, grants, and auth stay in
// Postgres — this only covers where the file contents live. Names are the
// stored names from fileBlobs (`${hash}.${ext}` / `${hash}_thumb.webp`).
export interface BlobStorage {
	put(name: string, data: Buffer, contentType?: string): Promise<void>;
	// Move a finished local file (ffmpeg output) into storage. The source file
	// is consumed: renamed for local storage, uploaded + unlinked for S3.
	putFile(name: string, filePath: string, contentType?: string): Promise<void>;
	delete(name: string): Promise<void>;
	stat(name: string): Promise<{ size: number } | null>;
	read(name: string, range?: { start: number; end: number }): Promise<ReadableStream>;
}

const UPLOADS_DIR = path.resolve('uploads/blobs');

class LocalStorage implements BlobStorage {
	private ready = mkdir(UPLOADS_DIR, { recursive: true });

	async put(name: string, data: Buffer): Promise<void> {
		await this.ready;
		await writeFile(path.join(UPLOADS_DIR, name), data);
	}

	async putFile(name: string, filePath: string): Promise<void> {
		await this.ready;
		const dest = path.join(UPLOADS_DIR, name);
		try {
			await rename(filePath, dest);
		} catch {
			// EXDEV when tmp dir and uploads dir sit on different filesystems
			// (os.tmpdir vs the docker volume) — fall back to copy + unlink.
			await copyFile(filePath, dest);
			await unlink(filePath).catch(() => {});
		}
	}

	async delete(name: string): Promise<void> {
		await unlink(path.join(UPLOADS_DIR, name)).catch(() => {});
	}

	async stat(name: string): Promise<{ size: number } | null> {
		const st = await stat(path.join(UPLOADS_DIR, name)).catch(() => null);
		return st ? { size: st.size } : null;
	}

	async read(name: string, range?: { start: number; end: number }): Promise<ReadableStream> {
		const node = createReadStream(path.join(UPLOADS_DIR, name), range);
		return Readable.toWeb(node) as ReadableStream;
	}
}

class S3Storage implements BlobStorage {
	private client: S3Client;
	private bucket: string;
	private ready: Promise<void>;

	constructor(s3: typeof config.s3) {
		if (!s3.accessKeyId || !s3.secretAccessKey) {
			throw new Error('[blob-service] STORAGE_DRIVER=s3 requires S3_ACCESS_KEY and S3_SECRET_KEY');
		}
		this.bucket = s3.bucket;
		this.client = new S3Client({
			endpoint: s3.endpoint,
			region: s3.region,
			forcePathStyle: s3.forcePathStyle,
			credentials: {
				accessKeyId: s3.accessKeyId,
				secretAccessKey: s3.secretAccessKey,
			},
			// R2 and B2 reject the flexible-checksum headers newer SDKs send by
			// default; only compute them where S3 actually requires it.
			requestChecksumCalculation: 'WHEN_REQUIRED',
			responseChecksumValidation: 'WHEN_REQUIRED',
		});
		this.ready = this.ensureBucket();
	}

	// Create the bucket on first boot (MinIO starts empty). Retries because in
	// docker compose MinIO may still be starting when this service comes up.
	// Managed stores where CreateBucket is forbidden just need the bucket to
	// pre-exist; the failure here is logged and uploads still work.
	private async ensureBucket(): Promise<void> {
		const delays = [500, 1000, 2000, 4000, 8000];
		for (let attempt = 0; ; attempt++) {
			try {
				await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
				return;
			} catch {
				try {
					await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
					console.log(`[blob-service] storage: created bucket "${this.bucket}"`);
					return;
				} catch (err) {
					if (attempt >= delays.length) {
						console.error(`[blob-service] storage: bucket "${this.bucket}" unavailable:`, (err as Error).message);
						return;
					}
					await new Promise((r) => setTimeout(r, delays[attempt]));
				}
			}
		}
	}

	async put(name: string, data: Buffer, contentType?: string): Promise<void> {
		await this.ready;
		await this.client.send(
			new PutObjectCommand({
				Bucket: this.bucket,
				Key: name,
				Body: data,
				ContentType: contentType,
			}),
		);
	}

	async putFile(name: string, filePath: string, contentType?: string): Promise<void> {
		await this.ready;
		const { size } = await stat(filePath);
		await this.client.send(
			new PutObjectCommand({
				Bucket: this.bucket,
				Key: name,
				Body: createReadStream(filePath),
				ContentLength: size,
				ContentType: contentType,
			}),
		);
		await unlink(filePath).catch(() => {});
	}

	async delete(name: string): Promise<void> {
		try {
			await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: name }));
		} catch {
			// GC deletes are best-effort, same as the local unlink().catch().
		}
	}

	async stat(name: string): Promise<{ size: number } | null> {
		try {
			const head = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: name }));
			return { size: head.ContentLength ?? 0 };
		} catch {
			return null;
		}
	}

	async read(name: string, range?: { start: number; end: number }): Promise<ReadableStream> {
		const res = await this.client.send(
			new GetObjectCommand({
				Bucket: this.bucket,
				Key: name,
				Range: range ? `bytes=${range.start}-${range.end}` : undefined,
			}),
		);
		if (!res.Body) throw new Error(`empty body for ${name}`);
		return res.Body.transformToWebStream() as ReadableStream;
	}
}

export const storage: BlobStorage =
	config.storageDriver === 's3' ? new S3Storage(config.s3) : new LocalStorage();

console.log(`[blob-service] storage driver: ${config.storageDriver}`);
