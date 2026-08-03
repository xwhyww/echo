<script lang="ts">
	import { Volume2, Volume1, VolumeX } from 'lucide-svelte';
	import Slider from '$lib/components/ui/Slider.svelte';
	import { audioPlayer } from '$lib/stores/audioPlayer.svelte.js';
	import { audioVolume } from '$lib/stores/audioVolume.svelte.js';
	import { i18n } from '$lib/i18n/i18n.svelte.js';

	const t = $derived(i18n.t);

	// The speaker button and the slider that drops out of it. All of its state —
	// open, idle countdown, readout — dies with the popover, so it lives here
	// rather than in a hook.
	interface Props {
		/** Which edge the bar is docked against: the popover opens the other way. */
		dockTop?: boolean;
	}

	let { dockTop = false }: Props = $props();

	// The stored volume is the source of truth; the element is told about it
	// whenever it changes, including on the first render after a reload.
	$effect(() => {
		audioPlayer.applyVolume(audioVolume.value);
	});

	let open = $state(false);

	// While the volume is being changed the speaker icon is replaced by the
	// numeric readout. Driven by an idle timer rather than by the slider's
	// commit event: dragging keeps firing `input` so the readout stays up, and
	// a keyboard arrow (which fires input+change together) still gets to show.
	const READOUT_MS = 500;
	let changing = $state(false);
	let changingTimer: ReturnType<typeof setTimeout> | null = null;

	function markChanging() {
		changing = true;
		if (changingTimer) clearTimeout(changingTimer);
		changingTimer = setTimeout(endChange, READOUT_MS);
	}

	function endChange() {
		if (changingTimer) { clearTimeout(changingTimer); changingTimer = null; }
		changing = false;
	}

	// The popover dismisses itself once it has been left alone: adjusting the
	// slider restarts the countdown, and hovering the control suspends it so it
	// never disappears out from under the pointer.
	const IDLE_MS = 2000;
	let idleTimer: ReturnType<typeof setTimeout> | null = null;

	function stopIdleTimer() {
		if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
	}

	function restartIdleTimer() {
		stopIdleTimer();
		if (open) idleTimer = setTimeout(close, IDLE_MS);
	}

	function close() {
		stopIdleTimer();
		open = false;
		endChange();
	}

	$effect(() => () => { endChange(); stopIdleTimer(); });

	function toggle(e: MouseEvent) {
		e.stopPropagation();
		open = !open;
		if (open) restartIdleTimer();
		else close();
	}

	function onInput(v: number) {
		audioVolume.set(v / 100);
		markChanging();
		restartIdleTimer();
	}
</script>

<svelte:window onclick={() => { if (open) close(); }} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="volume-wrap"
	class:dock-top={dockTop}
	onpointerenter={stopIdleTimer}
	onpointerleave={restartIdleTimer}
	onfocusin={stopIdleTimer}
	onfocusout={restartIdleTimer}
>
	<button type="button" class="icon-btn text-muted" onclick={toggle} aria-label={t.chat.volume}>
		{#if changing}
			<span class="volume-label body-xs text-muted">{Math.round(audioVolume.value * 100)}%</span>
		{:else if audioVolume.value === 0}
			<VolumeX size={16} />
		{:else if audioVolume.value <= 0.5}
			<Volume1 size={16} />
		{:else}
			<Volume2 size={16} />
		{/if}
	</button>

	{#if open}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="volume-popover" onclick={(e) => e.stopPropagation()}>
			<div class="volume-slider">
				<Slider
					orientation="vertical"
					min={0}
					max={100}
					step={1}
					value={Math.round(audioVolume.value * 100)}
					oninput={onInput}
					ariaLabel={t.chat.volumeLevel}
				/>
			</div>
		</div>
	{/if}
</div>

<style>
	.volume-wrap {
		position: relative;
		display: flex;
		align-items: center;
	}

	.icon-btn {
		background: none;
		border: none;
		padding: var(--sp-1);
		border-radius: var(--radius-sm);
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition:
			background var(--duration-fast) var(--ease-default),
			color var(--duration-fast) var(--ease-default);
	}

	.volume-popover {
		/* Opens away from whichever edge the bar is docked to, so it never
		 * grows off-screen: upward from a bottom-docked bar, downward from a
		 * top-docked one. */
		position: absolute;
		bottom: 40px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--sp-2);
		z-index: 20;

		background-color: transparent;
	}

	.volume-wrap.dock-top .volume-popover {
		top: 40px;
		bottom: auto;
	}

	.volume-slider {
		display: flex;
		justify-content: center;
		--slider-length: 120px;
		--slider-thickness: 4px;
		--slider-thumb-size: 10px;
		--slider-track: var(--c-bg-3);
	}

	.volume-label {
		font-variant-numeric: tabular-nums;
		text-align: center;
		width: 16px;
	}
</style>
