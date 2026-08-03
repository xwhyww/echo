<script lang="ts">
	import CreateVoiceChannelModal from '$lib/components/voice/CreateVoiceChannelModal.svelte';
	import CreateVoiceCategoryModal from '$lib/components/voice/CreateVoiceCategoryModal.svelte';
	import MoveChannelModal from '$lib/components/voice/MoveChannelModal.svelte';
	import RenameModal from '$lib/components/ui/RenameModal.svelte';
	import VoiceChannelAccessModal from '$lib/components/voice/VoiceChannelAccessModal.svelte';
	import UndoBar from '$lib/components/ui/UndoBar.svelte';
	import { i18n } from '$lib/i18n/i18n.svelte.js';
	import type { useGroupVoiceChannels } from '$lib/hooks/voice/useGroupVoiceChannels.svelte.js';
	import type { useVoiceChannelDialogs } from '$lib/hooks/voice/useVoiceChannelDialogs.svelte.js';

	const t = $derived(i18n.t);

	// Every overlay the voice channel list can raise, gathered so the panel is
	// just the list. At most one is ever open.
	interface Props {
		voice: ReturnType<typeof useGroupVoiceChannels>;
		dialogs: ReturnType<typeof useVoiceChannelDialogs>;
	}

	let { voice, dialogs }: Props = $props();
</script>

{#if dialogs.createChannelIn !== undefined}
	<CreateVoiceChannelModal
		groupId={voice.groupId}
		categories={voice.categories}
		presetCategoryId={dialogs.createChannelIn}
		onclose={dialogs.closeCreateChannel}
		oncreated={voice.addChannel}
	/>
{/if}

{#if dialogs.createCategoryOpen}
	<CreateVoiceCategoryModal
		groupId={voice.groupId}
		onclose={dialogs.closeCreateCategory}
		oncreated={voice.addCategory}
	/>
{/if}

{#if dialogs.renameTarget}
	<RenameModal
		title={t.voice.renameCategory}
		value={dialogs.renameTarget.name}
		saving={dialogs.savingRename}
		onclose={dialogs.closeRename}
		onsave={dialogs.renameCategory}
	/>
{/if}

{#if dialogs.moveTarget}
	<MoveChannelModal
		channel={dialogs.moveTarget}
		categories={voice.categories}
		onclose={dialogs.closeMove}
	/>
{/if}

{#if dialogs.accessTarget}
	<VoiceChannelAccessModal
		channel={dialogs.accessTarget}
		groupId={voice.groupId}
		onclose={dialogs.closeAccess}
	/>
{/if}

<!-- The delete only reaches the server when the bar's timer runs out; until then
     the row is merely hidden from the list. -->
{#if voice.pendingDeleteChannel}
	<UndoBar
		message={t.voice.deletingChannel(voice.pendingDeleteChannel.name)}
		duration={5000}
		onconfirm={voice.commitDeleteChannel}
		oncancel={voice.cancelDeleteChannel}
	/>
{:else if voice.pendingDeleteCategory}
	<UndoBar
		message={t.voice.deletingCategory(voice.pendingDeleteCategory.name)}
		duration={5000}
		onconfirm={voice.commitDeleteCategory}
		oncancel={voice.cancelDeleteCategory}
	/>
{/if}
