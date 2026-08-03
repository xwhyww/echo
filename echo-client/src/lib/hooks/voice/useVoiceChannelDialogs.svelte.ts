import { voiceService } from '$lib/api/voiceService.js';
import { toasts } from '$lib/stores/toasts.svelte.js';
import { i18n } from '$lib/i18n/i18n.svelte.js';
import type { VoiceChannel, VoiceCategory } from '$lib/api/voice.js';

/**
 * Which dialog the voice channel list has open. Every modal owns its own draft,
 * so all this keeps is the subject — plus renaming a category, which is the one
 * call the list has to make itself (`RenameModal` hands back a string).
 *
 * `onopen` runs before each dialog appears: whatever kebab raised it must close.
 */
export function useVoiceChannelDialogs(onopen: () => void) {
	const t = $derived(i18n.t);

	// `undefined` — closed; `null` — open with no category preselected.
	let createChannelIn = $state<string | null | undefined>(undefined);
	let createCategoryOpen = $state(false);
	let renameTarget = $state<VoiceCategory | null>(null);
	let moveTarget = $state<VoiceChannel | null>(null);
	let accessTarget = $state<VoiceChannel | null>(null);
	let savingRename = $state(false);

	return {
		get createChannelIn() { return createChannelIn; },
		get createCategoryOpen() { return createCategoryOpen; },
		get renameTarget() { return renameTarget; },
		get moveTarget() { return moveTarget; },
		get accessTarget() { return accessTarget; },
		get savingRename() { return savingRename; },

		openCreateChannel(categoryId: string | null) {
			onopen();
			createChannelIn = categoryId;
		},
		closeCreateChannel() { createChannelIn = undefined; },

		openCreateCategory() {
			onopen();
			createCategoryOpen = true;
		},
		closeCreateCategory() { createCategoryOpen = false; },

		openRename(cat: VoiceCategory) {
			onopen();
			renameTarget = cat;
		},
		closeRename() { renameTarget = null; },

		openMove(channel: VoiceChannel) {
			onopen();
			moveTarget = channel;
		},
		closeMove() { moveTarget = null; },

		openAccess(channel: VoiceChannel) {
			onopen();
			accessTarget = channel;
		},
		closeAccess() { accessTarget = null; },

		async renameCategory(name: string) {
			const target = renameTarget;
			if (!target) return;
			savingRename = true;
			try {
				// The WS event updates the list; nothing to patch locally.
				await voiceService.updateCategory(target.id, { name });
				renameTarget = null;
			} catch (err) {
				console.error('[useVoiceChannelDialogs] rename category failed', err);
				toasts.error((err as Error).message ?? t.voice.renameCategoryFailed);
			} finally {
				savingRename = false;
			}
		},
	};
}
