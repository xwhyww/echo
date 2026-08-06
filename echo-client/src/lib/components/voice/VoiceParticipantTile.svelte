<script lang="ts">
	import { MicOff } from 'lucide-svelte';
	import Avatar from '$lib/components/user/Avatar.svelte';
	import VoiceSharePreview from '$lib/components/voice/VoiceSharePreview.svelte';
	import { longpress } from '$lib/actions/longpress.js';
	import { i18n } from '$lib/i18n/i18n.svelte.js';
	import type { VoiceParticipant, VoiceScreenShare } from '$lib/stores/voiceClient.svelte.js';

	const t = $derived(i18n.t);

	// One square in the participant grid. Normally a face and a name; when that
	// person is presenting, the tile becomes a live preview you can click into.
	interface Props {
		participant: VoiceParticipant;
		share?: VoiceScreenShare | null;
		/** Preferred edge length in px — the grid shrinks it as people join. */
		size: number;
		onwatch: (identity: string) => void;
		onmenu: (x: number, y: number, participant: VoiceParticipant) => void;
	}

	let { participant: p, share = null, size, onwatch, onmenu }: Props = $props();

	// The avatar and mute badge scale with the tile so a crowded grid stays legible.
	const avatarSize = $derived(Math.round(size * 0.42));
	const muteSize = $derived(Math.max(14, Math.round(size * 0.12)));
	const muteIcon = $derived(Math.max(8, Math.round(muteSize * 0.55)));

	const label = $derived(`${p.name}${p.isLocal ? t.common.youSuffix : ''}`);

	function handleKey(e: KeyboardEvent) {
		if (!share || (e.key !== 'Enter' && e.key !== ' ')) return;
		e.preventDefault();
		onwatch(p.identity);
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
	class="vc-tile"
	class:speaking={p.isSpeaking}
	class:sharing={!!share}
	role={share ? 'button' : undefined}
	tabindex={share ? 0 : undefined}
	title={share ? t.voice.watchScreenOf(p.name) : undefined}
	onclick={share ? () => onwatch(p.identity) : undefined}
	onkeydown={share ? handleKey : undefined}
	oncontextmenu={(e) => {
		e.preventDefault();
		onmenu(e.clientX, e.clientY, p);
	}}
	use:longpress={{ onlongpress: ({ x, y }) => onmenu(x, y, p) }}
>
	{#if share}
		<VoiceSharePreview
			{share}
			{label}
			micMuted={p.isMuted}
			onwatch={() => onwatch(p.identity)}
		/>
	{:else}
		<div class="vc-avatar-wrap">
			<Avatar name={p.name} avatarUrl={p?.avatarUrl ?? null} size={avatarSize} />
			{#if p.isMuted}
				<div class="vc-mute-indicator text-inverse" style="width: {muteSize}px; height: {muteSize}px">
					<MicOff size={muteIcon} />
				</div>
			{/if}
		</div>
		<span class="vc-tile-name body-xs text-default truncate">{label}</span>
	{/if}
</div>

<style lang="scss">
	@use '$lib/styles/glass.mixin' as *;
	@use '$lib/styles/layout.mixin' as *;

	.vc-tile {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
		padding: var(--sp-2);
		width: 100%;
		aspect-ratio: 1;
		border: 1px solid transparent;
		border-radius: var(--radius-xl);
		transition: border-color var(--duration-fast) var(--ease-default);

		@include flex-center;
		@include glass;
	}

	.vc-tile.speaking {
		border-color: var(--c-success);
	}

	/* A sharing tile becomes a live preview: the <VoiceSharePreview> video fills
	   it (absolute inset:0) with the name and Watch button overlaid. Make the
	   tile the positioning context, clip to its rounded corners, and drop the
	   avatar-mode padding so the video reaches the edges. */
	.vc-tile.sharing {
		position: relative;
		overflow: hidden;
		padding: 0;
		background: #000;
		cursor: pointer;
		border-color: var(--c-accent-subtle-2);
	}

	.vc-tile.sharing:focus-visible {
		border-color: var(--c-accent-solid);
		outline: none;
	}

	.vc-avatar-wrap {
		position: relative;
	}

	.vc-mute-indicator {
		position: absolute;
		bottom: -2px;
		right: -2px;
		border-radius: var(--radius-full);
		background: var(--c-error);
		border: 1px solid var(--c-bg-2);

		@include flex-center;
	}

	.vc-tile-name {
		text-align: center;
		max-width: 100%;
	}
</style>
