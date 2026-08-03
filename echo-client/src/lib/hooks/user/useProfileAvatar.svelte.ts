import { auth } from '$lib/stores/auth.svelte.js';
import { ApiError } from '$lib/api/client.js';
import { i18n } from '$lib/i18n/i18n.svelte.js';
import {
	type Avatar,
	getAvatars,
	uploadAvatar,
	setActiveAvatar,
	clearAvatar,
	deleteAvatar,
} from '$lib/api/auth.js';

export function useProfileAvatar() {
	let avatars = $state<Avatar[]>([]);
	let cropImageUrl = $state<string | null>(null);
	let error = $state('');

	let avatarsLoaded = false;
	$effect(() => {
		if (avatarsLoaded || !auth.user) return;
		avatarsLoaded = true;
		getAvatars().then((res) => { avatars = res.avatars; });
	});

	async function handleUpload(file: File) {
		if (file.type === 'image/gif') {
			error = '';
			try {
				const { avatar } = await uploadAvatar(file);
				avatars = [...avatars, avatar];
			} catch (err) {
				error = err instanceof ApiError ? err.message : i18n.t.errors.uploadAvatarFailed;
			}
			return;
		}

		cropImageUrl = URL.createObjectURL(file);
	}

	async function handleCropSave(file: File) {
		error = '';
		try {
			const { avatar } = await uploadAvatar(file);
			avatars = [...avatars, avatar];
		} catch (err) {
			error = err instanceof ApiError ? err.message : i18n.t.errors.uploadAvatarFailed;
		} finally {
			closeCropModal();
		}
	}

	function closeCropModal() {
		if (cropImageUrl) URL.revokeObjectURL(cropImageUrl);
		cropImageUrl = null;
	}

	async function handleSelect(avatar: Avatar) {
		error = '';
		try {
			const { user } = await setActiveAvatar(avatar.id);
			auth.user = user;
		} catch (err) {
			error = err instanceof ApiError ? err.message : i18n.t.errors.setAvatarFailed;
		}
	}

	async function handleClear() {
		error = '';
		try {
			const { user } = await clearAvatar();
			auth.user = user;
		} catch (err) {
			error = err instanceof ApiError ? err.message : i18n.t.errors.clearAvatarFailed;
		}
	}

	async function handleDelete(avatar: Avatar) {
		error = '';
		try {
			const { user } = await deleteAvatar(avatar.id);
			auth.user = user;
			avatars = avatars.filter((a) => a.id !== avatar.id);
		} catch (err) {
			error = err instanceof ApiError ? err.message : i18n.t.errors.deleteAvatarFailed;
		}
	}

	return {
		get avatars() { return avatars; },
		get cropImageUrl() { return cropImageUrl; },
		get error() { return error; },
		set error(v: string) { error = v; },
		handleUpload,
		handleCropSave,
		closeCropModal,
		handleSelect,
		handleClear,
		handleDelete,
	};
}
