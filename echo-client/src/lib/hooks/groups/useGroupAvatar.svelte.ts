import { ApiError } from '$lib/api/client.js';
import { groupsService } from '$lib/api/groupsService.js';
import { groupsStore } from '$lib/stores/groups.svelte.js';
import { toasts } from '$lib/stores/toasts.svelte.js';
import { i18n } from '$lib/i18n/i18n.svelte.js';
import type { Group } from '$lib/api/groups.js';

/**
 * The group picture: picking a file, cropping it, uploading it, taking it away
 * again, and the fullscreen preview behind a click on the avatar.
 *
 * Unlike a user, who keeps a carousel of avatars to switch between, a group has
 * exactly one picture — so there is nothing to select from and no gallery to
 * hold. Uploading replaces; the server lets go of the old blob as part of the
 * same request.
 */
export function useGroupAvatar(opts: {
	groupId: () => string;
	/** Hands the updated group back so the page's state stays in step. */
	onchange: (group: Group) => void;
}) {
	const t = $derived(i18n.t);

	let cropImageUrl = $state<string | null>(null);
	let uploading = $state(false);
	let previewOpen = $state(false);

	function fail(err: unknown, fallback: string) {
		console.error('[useGroupAvatar]', err);
		toasts.error(err instanceof ApiError ? err.message : fallback);
	}

	function applied(group: Group) {
		opts.onchange(group);
		groupsStore.patch(opts.groupId(), group);
	}

	async function upload(file: File) {
		uploading = true;
		try {
			const { group } = await groupsService.uploadAvatar(opts.groupId(), file);
			applied(group);
		} catch (err) {
			fail(err, t.groupSettings.avatarUploadFailed);
		} finally {
			uploading = false;
		}
	}

	/**
	 * A GIF goes up as it is: cropping rasterises a single frame to canvas and
	 * would quietly turn an animated picture into a still one.
	 */
	async function pick(file: File) {
		if (file.type === 'image/gif') {
			await upload(file);
			return;
		}
		cropImageUrl = URL.createObjectURL(file);
	}

	async function saveCrop(file: File) {
		try {
			await upload(file);
		} finally {
			closeCrop();
		}
	}

	function closeCrop() {
		if (cropImageUrl) URL.revokeObjectURL(cropImageUrl);
		cropImageUrl = null;
	}

	async function remove() {
		uploading = true;
		try {
			const { group } = await groupsService.removeAvatar(opts.groupId());
			applied(group);
			previewOpen = false;
		} catch (err) {
			fail(err, t.groupSettings.avatarRemoveFailed);
		} finally {
			uploading = false;
		}
	}

	return {
		get cropImageUrl() { return cropImageUrl; },
		get uploading() { return uploading; },
		get previewOpen() { return previewOpen; },
		set previewOpen(v: boolean) { previewOpen = v; },
		pick,
		saveCrop,
		closeCrop,
		remove,
	};
}
