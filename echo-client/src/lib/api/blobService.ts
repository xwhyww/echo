import { api, apiUploadWithProgress } from './client.js';
import type { Attachment } from './personalChats.js';

class BlobService {
	uploadFiles(files: File[], onProgress?: (percent: number) => void) {
		const formData = new FormData();
		for (const file of files) {
			formData.append('files', file);
		}
		return apiUploadWithProgress<{ blobs: Attachment[] }>(
			'/blobs/upload',
			formData,
			onProgress,
		);
	}

	checkBlobs(files: { rawHash: string; filename: string }[]) {
		return api<{ results: (Attachment | null)[] }>('/blobs/check', {
			method: 'POST',
			body: { files },
		});
	}
}

export const blobService = new BlobService();
