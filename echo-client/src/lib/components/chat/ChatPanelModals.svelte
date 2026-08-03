<script lang="ts">
	import MediaViewer from '$lib/components/media/MediaViewer.svelte';
	import ReactionPickerModal from '$lib/components/emoji/ReactionPickerModal.svelte';
	import ForwardPicker, { type ForwardTarget } from '$lib/components/chat/ForwardPicker.svelte';
	import type { useChatPanelDialogs } from '$lib/hooks/chat/useChatPanelDialogs.svelte.js';

	// The panel's three overlays, as `PersonalChatModals` is for the personal
	// chat. Each closes itself before acting: the choice has been made, and a
	// dialog still standing over the result is the thing users click twice.
	interface Props {
		dialogs: ReturnType<typeof useChatPanelDialogs>;
		onreact: (messageId: string, emoji: string) => void;
		onforward: (target: ForwardTarget) => void;
	}

	let { dialogs, onreact, onforward }: Props = $props();
</script>

{#if dialogs.forwarding}
	<ForwardPicker
		onselect={(target) => {
			dialogs.closeForward();
			onforward(target);
		}}
		onclose={dialogs.closeForward}
	/>
{/if}

{#if dialogs.media}
	<MediaViewer
		attachments={dialogs.media.attachments}
		startIndex={dialogs.media.index}
		onclose={dialogs.closeMedia}
	/>
{/if}

{#if dialogs.reactionPickerFor}
	<ReactionPickerModal
		onselect={(emoji) => {
			const target = dialogs.reactionPickerFor;
			dialogs.closeReactionPicker();
			if (target) onreact(target, emoji);
		}}
		onclose={dialogs.closeReactionPicker}
	/>
{/if}
