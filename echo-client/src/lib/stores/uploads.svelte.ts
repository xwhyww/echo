import { blobService } from '$lib/api/blobService.js';
import { compressFiles, hashFile } from '$lib/utils/compressImage.js';
import type { Attachment } from '$lib/api/personalChats.js';
import { i18n } from '$lib/i18n/i18n.svelte.js';

export type UploadStatus = 'uploading' | 'processing' | 'failed';

export interface UploadTask {
	id: string;
	companionId: string;
	files: File[];
	text: string;
	status: UploadStatus;
	progress: number;
	error: string | null;
	abort: (() => void) | null;
}

let tasks = $state<UploadTask[]>([]);

function generateId() {
	return crypto.randomUUID();
}

function getAllByCompanion(companionId: string): UploadTask[] {
	return tasks.filter(t => t.companionId === companionId);
}

function getById(id: string): UploadTask | undefined {
	return tasks.find(t => t.id === id);
}

async function startUpload(
	companionId: string,
	files: File[],
	text: string,
): Promise<{ id: string; attachments: Attachment[]; text: string } | null> {
	const task: UploadTask = {
		id: generateId(),
		companionId,
		files,
		text,
		status: 'uploading',
		progress: 0,
		error: null,
		abort: null,
	};
	tasks = [...tasks, task];

	try {
		const compressed = await compressFiles(files);

		// Hash each file and ask the server which ones it already has.
		const hashes = await Promise.all(compressed.map((f) => hashFile(f)));
		let hits: (Attachment | null)[] = compressed.map(() => null);
		try {
			const { results } = await blobService.checkBlobs(
				compressed.map((f, i) => ({ rawHash: hashes[i], filename: f.name })),
			);
			if (Array.isArray(results) && results.length === compressed.length) {
				hits = results;
			}
		} catch {
			// Check failed — fall through and upload everything normally.
		}

		const missIndices: number[] = [];
		const missFiles: File[] = [];
		for (let i = 0; i < compressed.length; i++) {
			if (!hits[i]) {
				missIndices.push(i);
				missFiles.push(compressed[i]);
			}
		}

		const finalAttachments: Attachment[] = new Array(compressed.length);
		for (let i = 0; i < compressed.length; i++) {
			if (hits[i]) finalAttachments[i] = hits[i] as Attachment;
		}

		if (missFiles.length === 0) {
			// Everything was a cache hit — no upload needed at all.
			updateTask(task.id, { progress: 100, status: 'processing' });
			tasks = tasks.filter(t => t.id !== task.id);
			return { id: task.id, attachments: finalAttachments, text };
		}

		const { promise, abort } = blobService.uploadFiles(missFiles, (p) => {
			updateTask(task.id, { progress: p });
			if (p >= 100) updateTask(task.id, { status: 'processing' });
		});
		updateTask(task.id, { abort });

		const result = await promise;
		for (let i = 0; i < missIndices.length; i++) {
			finalAttachments[missIndices[i]] = result.blobs[i];
		}

		// Success — remove task
		tasks = tasks.filter(t => t.id !== task.id);
		return { id: task.id, attachments: finalAttachments, text };
	} catch (e) {
		const errorMsg = e instanceof Error ? e.message : i18n.t.errors.uploadFailed;
		updateTask(task.id, {
			status: 'failed',
			error: errorMsg,
			abort: null,
		});
		return null;
	}
}

function updateTask(id: string, updates: Partial<UploadTask>) {
	tasks = tasks.map(t => t.id === id ? { ...t, ...updates } : t);
}

function cancelUpload(taskId: string) {
	const task = getById(taskId);
	if (!task) return;
	task.abort?.();
	tasks = tasks.filter(t => t.id !== taskId);
}

function removeTask(taskId: string) {
	tasks = tasks.filter(t => t.id !== taskId);
}

async function retryUpload(
	taskId: string,
): Promise<{ id: string; attachments: Attachment[]; text: string } | null> {
	const task = getById(taskId);
	if (!task || task.status !== 'failed') return null;
	const { companionId, files, text } = task;
	tasks = tasks.filter(t => t.id !== taskId);
	return startUpload(companionId, files, text);
}

export const uploadStore = {
	get tasks() { return tasks; },
	getAllByCompanion,
	getById,
	startUpload,
	cancelUpload,
	removeTask,
	retryUpload,
};
