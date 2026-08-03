<script lang="ts">
	import { untrack } from 'svelte';
	import { voiceVolumes, VOICE_VOLUME_MIN, VOICE_VOLUME_MAX } from '$lib/stores/voiceVolumes.svelte.js';
	import { Mic, Volume2 } from 'lucide-svelte';
	import Slider from '$lib/components/ui/Slider.svelte';
	import { i18n } from '$lib/i18n/i18n.svelte.js';

	const t = $derived(i18n.t);

	interface Props {
		x: number;
		y: number;
		identity: string;
		name: string;
		isLocal: boolean;
		onclose: () => void;
	}

	const { x, y, identity, name, isLocal, onclose }: Props = $props();

	const volume = $derived(
		isLocal ? voiceVolumes.micGain : voiceVolumes.getRemoteVolume(identity),
	);

	let popupEl: HTMLDivElement | undefined = $state();
	// Render at the click point, then nudge back inside the viewport once we
	// know the popup's measured size. The first frame can briefly overflow,
	// which is fine — the second frame settles.
	let pos = $state(untrack(() => ({ x, y })));

	$effect(() => {
		if (!popupEl) return;
		const rect = popupEl.getBoundingClientRect();
		const PAD = 8;
		const vw = window.innerWidth;
		const vh = window.innerHeight;
		let nx = x;
		let ny = y;
		if (nx + rect.width > vw - PAD) nx = vw - rect.width - PAD;
		if (ny + rect.height > vh - PAD) ny = vh - rect.height - PAD;
		if (nx < PAD) nx = PAD;
		if (ny < PAD) ny = PAD;
		pos = { x: nx, y: ny };
	});

	function onSlide(v: number) {
		if (isLocal) voiceVolumes.setMicGain(v);
		else voiceVolumes.setRemoteVolume(identity, v);
	}

	function reset() {
		if (isLocal) voiceVolumes.setMicGain(1);
		else voiceVolumes.setRemoteVolume(identity, 1);
	}

	function onDocMouseDown(e: MouseEvent) {
		if (popupEl && popupEl.contains(e.target as Node)) return;
		onclose();
	}
	function onDocKey(e: KeyboardEvent) {
		if (e.key === 'Escape') onclose();
	}
	function onDocContextMenu(e: MouseEvent) {
		// A second right-click outside the popup should close it (and let the
		// new target open its own popup).
		if (popupEl && popupEl.contains(e.target as Node)) return;
		onclose();
	}

	$effect(() => {
		document.addEventListener('mousedown', onDocMouseDown);
		document.addEventListener('contextmenu', onDocContextMenu);
		document.addEventListener('keydown', onDocKey);
		return () => {
			document.removeEventListener('mousedown', onDocMouseDown);
			document.removeEventListener('contextmenu', onDocContextMenu);
			document.removeEventListener('keydown', onDocKey);
		};
	});

	const percent = $derived(Math.round(volume * 100));
</script>

<div
	bind:this={popupEl}
	class="vu-popup body-sm"
	style="left: {pos.x}px; top: {pos.y}px"
	role="dialog"
	aria-label={isLocal ? t.voice.userVolume.micVolume : t.voice.userVolume.volumeFor(name)}
>
	<div class="vu-head text-default">
		{#if isLocal}
			<Mic size={14} />
		{:else}
			<Volume2 size={14} />
		{/if}
		<span class="vu-name fw-semibold">{name}{isLocal ? t.common.youSuffix : ''}</span>
	</div>
	<div class="vu-label body-xs text-faint">{isLocal ? t.voice.userVolume.micVolume : t.voice.userVolume.volumeForMe}</div>
	<div class="vu-row">
		<div class="vu-slider">
			<Slider
				min={VOICE_VOLUME_MIN}
				max={VOICE_VOLUME_MAX}
				step={0.01}
				value={volume}
				oninput={onSlide}
				ariaLabel={isLocal ? t.voice.userVolume.micVolume : t.voice.userVolume.volumeFor(name)}
			/>
		</div>
		<span class="vu-value body-xs text-muted" class:boost={percent > 100}>{percent}%</span>
	</div>
	<button type="button" class="vu-reset body-xs text-muted" onclick={reset} disabled={percent === 100}>
		{t.voice.userVolume.resetTo100}
	</button>
</div>

<style>
	.vu-popup {
		position: fixed;
		z-index: 100;
		min-width: 240px;
		padding: var(--sp-3);
		background: var(--c-bg-2);
		border: 1px solid var(--c-border);
		border-radius: var(--radius-md);
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}

	.vu-head {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
	}

	.vu-name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.vu-row {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
	}

	.vu-slider {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
	}

	.vu-value {
		min-width: 42px;
		text-align: right;
		font-variant-numeric: tabular-nums;
	}

	.vu-value.boost {
		color: var(--c-accent-text);
	}

	.vu-reset {
		align-self: flex-start;
		padding: 2px var(--sp-2);
		background: none;
		border: 1px solid var(--c-border);
		border-radius: var(--radius-sm);
		cursor: pointer;
		transition:
			background var(--duration-fast) var(--ease-default),
			color var(--duration-fast) var(--ease-default);
	}

	.vu-reset:hover:not(:disabled) {
		background: var(--c-bg-3);
		color: var(--c-text);
	}

	.vu-reset:disabled {
		opacity: 0.5;
		cursor: default;
	}
</style>
