<script lang="ts">
	import { voiceClient } from '$lib/stores/voiceClient.svelte.js';
	import { i18n } from '$lib/i18n/i18n.svelte.js';
	import { qualityMeta } from '$lib/utils/connectionQuality.js';
	import { pickQuadrant, type Quadrant } from '$lib/utils/popoverPlacement.js';

	const t = $derived(i18n.t);

	const ms = $derived(voiceClient.latencyMs);
	const loss = $derived(voiceClient.packetLossPercent);
	const jitter = $derived(voiceClient.jitterMs);

	const meta = $derived(qualityMeta(voiceClient.connectionQuality, t));

	// Hover with a small open delay so a mouse passing over the bars on the way
	// somewhere else doesn't flash the popover. The close is also delayed so a
	// user moving from the bars across the 8px gap onto the popover doesn't
	// trigger an immediate close.
	const OPEN_DELAY_MS = 150;
	const CLOSE_DELAY_MS = 120;

	// Conservative size estimates used for placement. The real popover is about
	// 200×130 with `padding: var(--sp-3)`; we round up so a slightly larger
	// rendered box still fits inside the chosen quadrant.
	const POPOVER_W = 220;
	const POPOVER_H = 150;
	const VIEWPORT_MARGIN = 8;

	let open = $state(false);
	let openTimer: ReturnType<typeof setTimeout> | null = null;
	let closeTimer: ReturnType<typeof setTimeout> | null = null;
	let wrapperEl = $state<HTMLDivElement | null>(null);

	// Placement is recomputed at open-time. Defaults give the same look as
	// before (above + right-aligned) for the very first paint.
	let placement = $state<Quadrant>({ horiz: 'left', vert: 'up' });

	function computePlacement() {
		if (!wrapperEl || typeof window === 'undefined') return;
		placement = pickQuadrant(
			wrapperEl.getBoundingClientRect(),
			{ width: window.innerWidth, height: window.innerHeight },
			{ width: POPOVER_W, height: POPOVER_H },
			VIEWPORT_MARGIN,
		);
	}

	function clearTimers() {
		if (openTimer) {
			clearTimeout(openTimer);
			openTimer = null;
		}
		if (closeTimer) {
			clearTimeout(closeTimer);
			closeTimer = null;
		}
	}

	function handleEnter() {
		clearTimers();
		if (open) return;
		openTimer = setTimeout(() => {
			computePlacement();
			open = true;
			openTimer = null;
		}, OPEN_DELAY_MS);
	}

	function handleLeave() {
		clearTimers();
		closeTimer = setTimeout(() => {
			open = false;
			closeTimer = null;
		}, CLOSE_DELAY_MS);
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="cq body-xs text-faint"
	data-tone={meta.tone}
	bind:this={wrapperEl}
	onmouseenter={handleEnter}
	onmouseleave={handleLeave}
>
	<div class="bars" aria-label={meta.label}>
		{#each [1, 2, 3] as i}
			<span class="bar" class:filled={meta.bars >= i}></span>
		{/each}
	</div>
	{#if ms !== null}
		<span class="ms {meta.textClass}">{ms} ms</span>
	{/if}

	{#if open}
		<div
			class="popover"
			class:h-left={placement.horiz === 'left'}
			class:h-right={placement.horiz === 'right'}
			class:v-up={placement.vert === 'up'}
			class:v-down={placement.vert === 'down'}
			role="tooltip"
		>
			<div class="popover-head">
				<span class="dot" data-tone={meta.tone}></span>
				<span class="popover-label body-sm fw-semibold text-default">{meta.label}</span>
			</div>
			<dl class="popover-rows">
				<div class="row body-xs">
					<dt class="text-faint">{t.voice.quality.ping}</dt>
					<dd class="text-default">{ms !== null ? `${ms} ms` : '—'}</dd>
				</div>
				<div class="row body-xs">
					<dt class="text-faint">{t.voice.quality.packetLoss}</dt>
					<dd class="text-default">{loss !== null ? `${loss.toFixed(1)} %` : '—'}</dd>
				</div>
				<div class="row body-xs">
					<dt class="text-faint">{t.voice.quality.jitter}</dt>
					<dd class="text-default">{jitter !== null ? `${jitter} ms` : '—'}</dd>
				</div>
			</dl>
			<p class="popover-foot body-xxs text-faint">{t.voice.quality.roundTrip}</p>
		</div>
	{/if}
</div>

<style>
	.cq {
		display: inline-flex;
		align-items: flex-start;
		gap: var(--sp-1);
		font-variant-numeric: tabular-nums;
		cursor: help;
		user-select: none;
	}

	.bars {
		display: inline-flex;
		align-items: flex-end;
		gap: 2px;
	}

	.bar {
		display: inline-block;
		width: 3px;
		border-radius: 1px;
		background: var(--c-bg-3);
		transition: background var(--duration-fast) var(--ease-default);
	}

	.bar:nth-child(1) { height: 5px; }
	.bar:nth-child(2) { height: 9px; }
	.bar:nth-child(3) { height: 14px; }

	.cq[data-tone="good"] .bar.filled { background: var(--c-success); }
	.cq[data-tone="warn"] .bar.filled { background: var(--c-warning); }
	.cq[data-tone="bad"]  .bar.filled { background: var(--c-error); }
	.cq[data-tone="unknown"] .bar.filled { background: var(--c-text-faint); }

	/* Popover position is set per-instance via the v-up/v-down/h-left/h-right
	 * classes below, driven by computePlacement so the popover stays inside
	 * the viewport regardless of where the indicator lives on the page. */
	.popover {
		position: absolute;
		min-width: 200px;
		padding: var(--sp-3);
		background: var(--c-bg-2);
		border: 1px solid var(--c-border);
		border-radius: var(--radius-md);
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
		z-index: 200;
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
		animation: cq-fade var(--duration-fast) var(--ease-default);
		cursor: default;
	}

	/* Vertical placement: 8px breathing room between indicator and popover —
	 * matches the close-delay buffer mentioned above so the cursor can cross
	 * the gap without dismissing the popover. */
	.popover.v-up   { bottom: calc(100% + 8px); }
	.popover.v-down { top:    calc(100% + 8px); }

	/* Horizontal placement: anchor the popover edge that's closest to the
	 * indicator so it grows toward the side with more viewport room. */
	.popover.h-left  { right: 0; }
	.popover.h-right { left:  0; }

	@keyframes cq-fade {
		from { opacity: 0; transform: translateY(2px); }
		to { opacity: 1; transform: translateY(0); }
	}

	.popover-head {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
	}

	.dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}
	.dot[data-tone="good"]    { background: var(--c-success); }
	.dot[data-tone="warn"]    { background: var(--c-warning); }
	.dot[data-tone="bad"]     { background: var(--c-error); }
	.dot[data-tone="unknown"] { background: var(--c-text-faint); }

	.popover-rows {
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.row {
		display: flex;
		justify-content: space-between;
		gap: var(--sp-3);
	}
	.row dd {
		margin: 0;
		font-variant-numeric: tabular-nums;
	}

	.popover-foot {
		margin: 0;
	}
</style>
