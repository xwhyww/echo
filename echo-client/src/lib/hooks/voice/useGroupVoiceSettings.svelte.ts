import { untrack } from 'svelte';
import { page } from '$app/state';
import { goto } from '$app/navigation';
import { groupsService } from '$lib/api/groupsService.js';
import { groupsStore } from '$lib/stores/groups.svelte.js';
import { i18n } from '$lib/i18n/i18n.svelte.js';
import { routes } from '$lib/routes.js';
import type { Group } from '$lib/api/groups.js';

/**
 * The shell shared by every group voice-settings screen: loads the group so the
 * page can tell whether the viewer is allowed to see it at all, and bounces
 * everyone else back to the channel list. Route-bound, so it reads `page`
 * itself rather than having each component thread the params through.
 */
export function useGroupVoiceSettings() {
	const t = $derived(i18n.t);

	const groupId = $derived(page.params.id!);
	const voiceHref = $derived(routes.chats.groupVoice(groupId));

	let group = $state<Group | null>(null);
	let loading = $state(true);
	let loadError = $state<string | null>(null);

	const canManage = $derived(group?.role === 'owner' || group?.role === 'admin');

	$effect(() => {
		const id = groupId;
		if (!id) return;
		untrack(() => {
			void load(id);
		});
	});

	async function load(id: string) {
		loading = true;
		loadError = null;
		try {
			const info = await groupsService.get(id);
			group = info.group;
			groupsStore.patch(id, info.group);
		} catch (err) {
			console.error('[useGroupVoiceSettings] load failed', err);
			loadError = t.voice.loadFailed;
		} finally {
			loading = false;
		}
	}

	// Managers only. Anyone else who lands here by URL goes straight back to the
	// channel list — replaceState so Back doesn't bounce them in again.
	$effect(() => {
		if (loading || loadError || canManage) return;
		goto(voiceHref, { replaceState: true });
	});

	return {
		get groupId() { return groupId; },
		get group() { return group; },
		get loading() { return loading; },
		get loadError() { return loadError; },
		get canManage() { return canManage; },
		get voiceHref() { return voiceHref; },
		get settingsHref() { return `${voiceHref}/settings`; },
		get rolesHref() { return `${voiceHref}/settings/roles`; },
		back() { goto(`${voiceHref}/settings`); },
	};
}
