<script lang="ts">
	import { MicOff, HeadphoneOff, ScreenShare } from 'lucide-svelte';
	import Avatar from '$lib/components/user/Avatar.svelte';
	import { longpress } from '$lib/actions/longpress.js';
	import { participantLabel } from '$lib/utils/voiceChannels.js';
	import type { VoiceChannelParticipant } from '$lib/api/voice.js';

	// One person sitting in a voice channel, as the sidebar shows them: face,
	// name, and whichever of the three state icons apply.
	interface Props {
		participant: VoiceChannelParticipant;
		/** True when LiveKit reports them presenting, ahead of the server flag. */
		sharing?: boolean;
		/** Right-click or long-press opens the per-person volume popup. */
		onmenu: (x: number, y: number, participant: VoiceChannelParticipant) => void;
	}

	let { participant: p, sharing = false, onmenu }: Props = $props();

	const name = $derived(participantLabel(p));
	const isSharing = $derived(p.sharing || sharing);

	function handleContextMenu(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		onmenu(e.clientX, e.clientY, p);
	}
</script>

<li
	class="g-person body-xs text-muted"
	class:muted={p.micMuted}
	class:deafened={p.deafened}
	oncontextmenu={handleContextMenu}
	use:longpress={{ onlongpress: ({ x, y }) => onmenu(x, y, p) }}
>
	<Avatar {name} avatarUrl={p.avatarUrl} size={20} />
	<span class="g-person-name truncate">{name}</span>
	{#if isSharing}
		<ScreenShare size={11} class="g-person-icon share" />
	{/if}
	{#if p.micMuted}
		<MicOff size={11} class="g-person-icon mic" />
	{/if}
	{#if p.deafened}
		<HeadphoneOff size={11} class="g-person-icon deaf" />
	{/if}
</li>

<style>
	.g-person {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		border-radius: var(--radius-sm);
		padding: var(--sp-2) var(--sp-1) 0 var(--sp-6);
		min-width: 0;
	}

	.g-person-name {
		flex: 1;
		min-width: 0;
	}

	.g-person.muted .g-person-name,
	.g-person.deafened .g-person-name {
		color: var(--c-text-faint);
	}

	.g-person :global(.g-person-icon) {
		flex-shrink: 0;
		color: var(--c-text-faint);
	}

	.g-person :global(.g-person-icon.mic),
	.g-person :global(.g-person-icon.deaf) {
		color: var(--c-error);
	}

	.g-person :global(.g-person-icon.share) {
		color: var(--c-accent-text);
	}
</style>
