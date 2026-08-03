import { auth } from '$lib/stores/auth.svelte.js';
import { privacyService, type PrivacySettings } from '$lib/api/privacyService.js';
import { ApiError } from '$lib/api/client.js';
import { i18n } from '$lib/i18n/i18n.svelte.js';

export function usePrivacy() {
	let settings = $state<PrivacySettings>({
		onlineStatus: 'all',
		phone: 'friends',
		email: 'friends',
		messaging: 'all',
		profile: 'all',
		photo: 'all',
		groupInvite: 'all',
	});
	let loading = $state(true);
	let saving = $state(false);
	let error = $state('');
	let success = $state('');

	$effect(() => {
		if (!auth.isAuthenticated) return;
		privacyService.get().then((res) => {
			settings = res.privacy;
		}).catch(() => {
			// keep defaults
		}).finally(() => {
			loading = false;
		});
	});

	async function update(field: keyof PrivacySettings, value: string) {
		if (settings[field] === value) return;
		error = '';
		success = '';
		const prev = settings[field];
		settings = { ...settings, [field]: value };
		try {
			await privacyService.update({ [field]: value });
		} catch (err) {
			settings = { ...settings, [field]: prev };
			error = err instanceof ApiError ? err.message : i18n.t.errors.failedToSave;
		}
	}

	const visibility = $derived([
		{ value: 'all', label: i18n.t.privacy.everyone },
		{ value: 'friends', label: i18n.t.privacy.friends },
		{ value: 'nobody', label: i18n.t.privacy.nobody },
	]);

	const messaging = $derived([
		{ value: 'all', label: i18n.t.privacy.everyone },
		{ value: 'existing', label: i18n.t.privacy.existingChats },
	]);

	// Every row on the screen, in order. The page renders this rather than
	// repeating the same block once per field.
	const fields = $derived([
		{ key: 'onlineStatus', label: i18n.t.privacy.onlineStatus, desc: i18n.t.privacy.onlineStatusDesc, options: visibility },
		{ key: 'phone', label: i18n.t.privacy.phone, desc: i18n.t.privacy.phoneDesc, options: visibility },
		{ key: 'email', label: i18n.t.privacy.email, desc: i18n.t.privacy.emailDesc, options: visibility },
		{ key: 'messaging', label: i18n.t.privacy.messaging, desc: i18n.t.privacy.messagingDesc, options: messaging },
		{ key: 'profile', label: i18n.t.privacy.profile, desc: i18n.t.privacy.profileDesc, options: visibility },
		{ key: 'photo', label: i18n.t.privacy.photo, desc: i18n.t.privacy.photoDesc, options: visibility },
		{ key: 'groupInvite', label: i18n.t.privacy.groupInvite, desc: i18n.t.privacy.groupInviteDesc, options: visibility },
	] satisfies { key: keyof PrivacySettings; label: string; desc: string; options: { value: string; label: string }[] }[]);

	return {
		get fields() { return fields; },
		get settings() { return settings; },
		get loading() { return loading; },
		get saving() { return saving; },
		get error() { return error; },
		get success() { return success; },
		update,
	};
}
