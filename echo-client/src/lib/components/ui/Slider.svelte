<script lang="ts">
	// Custom range slider with identical rendering across browsers. The native
	// <input type="range"> only honours `accent-color`, which Chromium, Firefox
	// and WebKit each interpret differently — so we strip the platform chrome
	// (appearance: none) and draw the track + thumb ourselves via pseudo-elements.
	//
	// The fill is a CSS gradient driven by `--pct` (computed from value) rather
	// than ::-moz-range-progress / a JS overlay, so one rule covers both axes and
	// both engines. Colours and sizing are themeable via CSS custom properties so
	// the same component works on light panels and over dark video tiles:
	//   --slider-track, --slider-fill, --slider-thumb, --slider-thumb-ring,
	//   --slider-thickness, --slider-thumb-size, --slider-length (vertical only).

	interface Props {
		value?: number;
		min?: number;
		max?: number;
		step?: number;
		disabled?: boolean;
		orientation?: 'horizontal' | 'vertical';
		ariaLabel?: string;
		/** Fires continuously while dragging, with the parsed numeric value. */
		oninput?: (value: number) => void;
		/** Fires on commit (pointer up / keyboard change). */
		onchange?: (value: number) => void;
		/** Extra class(es) merged onto the root input — handy for sizing in a flex row. */
		class?: string;
	}

	let {
		value = $bindable(0),
		min = 0,
		max = 1,
		step = 0.01,
		disabled = false,
		orientation = 'horizontal',
		ariaLabel,
		oninput,
		onchange,
		class: className = '',
	}: Props = $props();

	const pct = $derived(
		max <= min ? 0 : Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100)),
	);

	function handleInput(e: Event) {
		const v = parseFloat((e.currentTarget as HTMLInputElement).value);
		if (Number.isNaN(v)) return;
		value = v;
		oninput?.(v);
	}

	function handleChange(e: Event) {
		const v = parseFloat((e.currentTarget as HTMLInputElement).value);
		if (Number.isNaN(v)) return;
		onchange?.(v);
	}
</script>

<input
	class="slider {orientation} {className}"
	type="range"
	{min}
	{max}
	{step}
	{value}
	{disabled}
	aria-label={ariaLabel}
	aria-orientation={orientation}
	style="--pct: {pct}%"
	oninput={handleInput}
	onchange={handleChange}
/>

<style>
	.slider {
		--_track: var(--slider-track, var(--c-bg-4));
		/* Must be a plain colour: it is used as a stop inside the track gradient,
		 * and --c-accent is itself a gradient — nesting one drops the whole
		 * background and the track renders as nothing. */
		--_fill: var(--slider-fill, var(--c-accent-text));
		--_thumb: var(--slider-thumb, var(--c-text));
		--_thumb-ring: var(--slider-thumb-ring, transparent);
		--_thickness: var(--slider-thickness, 6px);
		--_thumb-size: var(--slider-thumb-size, 14px);
		--_length: var(--slider-length, 120px);

		appearance: none;
		-webkit-appearance: none;
		background: transparent;
		margin: 0;
		cursor: pointer;
	}

	.slider:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}

	/* ─── Horizontal ─────────────────────────────────────────────── */
	.slider.horizontal {
		width: 100%;
		height: var(--_thumb-size);
	}

	.slider.horizontal::-webkit-slider-runnable-track {
		height: var(--_thickness);
		border-radius: var(--radius-full);
		background: linear-gradient(
			to right,
			var(--_fill) 0%,
			var(--_fill) var(--pct, 0%),
			var(--_track) var(--pct, 0%),
			var(--_track) 100%
		);
	}

	.slider.horizontal::-moz-range-track {
		height: var(--_thickness);
		border-radius: var(--radius-full);
		background: linear-gradient(
			to right,
			var(--_fill) 0%,
			var(--_fill) var(--pct, 0%),
			var(--_track) var(--pct, 0%),
			var(--_track) 100%
		);
	}

	.slider.horizontal::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		box-sizing: border-box;
		width: var(--_thumb-size);
		height: var(--_thumb-size);
		border-radius: 50%;
		background: var(--_thumb);
		border: 2px solid var(--_thumb-ring);
		/* Recenter the thumb on the thinner track. */
		margin-top: calc((var(--_thickness) - var(--_thumb-size)) / 2);
		box-shadow: var(--shadow-sm);
		transition: transform var(--duration-fast) var(--ease-default);
	}

	.slider.horizontal::-moz-range-thumb {
		box-sizing: border-box;
		width: var(--_thumb-size);
		height: var(--_thumb-size);
		border-radius: 50%;
		background: var(--_thumb);
		border: 2px solid var(--_thumb-ring);
		box-shadow: var(--shadow-sm);
		transition: transform var(--duration-fast) var(--ease-default);
	}

	/* ─── Vertical ───────────────────────────────────────────────── */
	/* writing-mode makes the inline axis vertical (so track `width` = thickness);
	 * direction: rtl keeps the visual top = max value. */
	.slider.vertical {
		writing-mode: vertical-lr;
		direction: rtl;
		width: var(--_thumb-size);
		height: var(--_length);
	}

	.slider.vertical::-webkit-slider-runnable-track {
		width: var(--_thickness);
		border-radius: var(--radius-full);
		background: linear-gradient(
			to top,
			var(--_fill) 0%,
			var(--_fill) var(--pct, 0%),
			var(--_track) var(--pct, 0%),
			var(--_track) 100%
		);
	}

	.slider.vertical::-moz-range-track {
		width: var(--_thickness);
		border-radius: var(--radius-full);
		background: linear-gradient(
			to top,
			var(--_fill) 0%,
			var(--_fill) var(--pct, 0%),
			var(--_track) var(--pct, 0%),
			var(--_track) 100%
		);
	}

	.slider.vertical::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		box-sizing: border-box;
		width: var(--_thumb-size);
		height: var(--_thumb-size);
		border-radius: 50%;
		background: var(--_thumb);
		border: 2px solid var(--_thumb-ring);
		margin-inline-start: calc((var(--_thickness) - var(--_thumb-size)) / 2);
		box-shadow: var(--shadow-sm);
		transition: transform var(--duration-fast) var(--ease-default);
		margin-left: -3px;
	}

	.slider.vertical::-moz-range-thumb {
		box-sizing: border-box;
		width: var(--_thumb-size);
		height: var(--_thumb-size);
		border-radius: 50%;
		background: var(--_thumb);
		border: 2px solid var(--_thumb-ring);
		box-shadow: var(--shadow-sm);
		transition: transform var(--duration-fast) var(--ease-default);
	}

	/* ─── Interaction states ─────────────────────────────────────── */
	.slider:hover:not(:disabled)::-webkit-slider-thumb {
		transform: scale(1.12);
	}
	.slider:hover:not(:disabled)::-moz-range-thumb {
		transform: scale(1.12);
	}

	.slider:focus-visible {
		outline: none;
	}
	.slider:focus-visible::-webkit-slider-thumb {
		box-shadow: 0 0 0 4px var(--c-accent-subtle);
	}
	.slider:focus-visible::-moz-range-thumb {
		box-shadow: 0 0 0 4px var(--c-accent-subtle);
	}
</style>
