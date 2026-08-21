import { auth } from '$lib/stores/auth.svelte.js';
import {
	getNotificationSettings,
	updateNotificationSettings,
	type NotificationSettings,
} from '$lib/api/pushService.js';
import { ApiError } from '$lib/api/client.js';
import { i18n } from '$lib/i18n/i18n.svelte.js';

/** The switches this screen shows, in order. Muted lists are managed per chat. */
type ToggleKey = 'directMessages' | 'groupMessages' | 'friendRequests' | 'groupInvites';

export function useNotificationSettings() {
	let settings = $state<NotificationSettings>({
		enabled: true,
		directMessages: true,
		groupMessages: true,
		friendRequests: true,
		groupInvites: true,
		showPreview: null,
		mutedChats: [],
		mutedGroups: [],
	});
	let loading = $state(true);
	let error = $state('');

	$effect(() => {
		if (!auth.isAuthenticated) return;
		getNotificationSettings()
			.then((res) => {
				settings = res.settings;
			})
			.catch(() => {
				// Keep the defaults on screen. They match what the server applies to
				// an account that has never saved anything, so a failed read shows
				// the truth rather than a blank form.
			})
			.finally(() => {
				loading = false;
			});
	});

	// Optimistic, then rolled back on failure: these are switches, and waiting
	// for a round trip before the thumb moves makes the screen feel broken.
	async function patch(next: Partial<NotificationSettings>) {
		error = '';
		const prev = settings;
		settings = { ...settings, ...next };
		try {
			const res = await updateNotificationSettings(next);
			settings = res.settings;
		} catch (err) {
			settings = prev;
			error = err instanceof ApiError ? err.message : i18n.t.errors.failedToSave;
		}
	}

	const toggles = $derived(
		[
			{
				key: 'directMessages',
				label: i18n.t.notifications.directMessages,
				desc: i18n.t.notifications.directMessagesDesc,
			},
			{
				key: 'groupMessages',
				label: i18n.t.notifications.groupMessages,
				desc: i18n.t.notifications.groupMessagesDesc,
			},
			{
				key: 'friendRequests',
				label: i18n.t.notifications.friendRequests,
				desc: i18n.t.notifications.friendRequestsDesc,
			},
			{
				key: 'groupInvites',
				label: i18n.t.notifications.groupInvites,
				desc: i18n.t.notifications.groupInvitesDesc,
			},
		] satisfies { key: ToggleKey; label: string; desc: string }[],
	);

	return {
		get settings() { return settings; },
		get loading() { return loading; },
		get error() { return error; },
		get toggles() { return toggles; },
		/** Master switch — everything below it is disabled while this is off. */
		setEnabled(v: boolean) { return patch({ enabled: v }); },
		setToggle(key: ToggleKey, v: boolean) { return patch({ [key]: v }); },
		setShowPreview(v: boolean) { return patch({ showPreview: v }); },
		/** Back to "follow whatever the server is configured to do". */
		clearShowPreview() { return patch({ showPreview: null }); },
	};
}
