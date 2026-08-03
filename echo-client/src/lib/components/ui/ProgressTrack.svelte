<script lang="ts">
	// The plain seekable line an audio file gets when there is no waveform to
	// draw. The bar itself stays thin; `height` only sets how tall a strip
	// listens for the click, because a 4px target is not one.
	interface Props {
		/** Playhead position, 0–1. */
		progress: number;
		onseek?: (e: MouseEvent) => void;
		height?: string;
		/** Take the free space in its row instead of sitting at natural width. */
		grow?: boolean;
		/** Inside an own (accent) bubble, where accent-on-accent would vanish. */
		own?: boolean;
	}

	let { progress, onseek, height = '4px', grow = false, own = false }: Props = $props();
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="hit" class:grow class:seekable={!!onseek} style:height onclick={onseek}>
	<div class="track" class:own>
		<span class="fill" style="width: {progress * 100}%"></span>
	</div>
</div>

<style>
	.hit {
		display: flex;
		align-items: center;
		min-width: 0;
	}

	.hit.seekable {
		cursor: pointer;
	}

	.hit.grow {
		flex: 1;
		width: 100px;
	}

	.track {
		width: 100%;
		height: 4px;
		border-radius: var(--radius-full);
		background: var(--c-text-faint);
		overflow: hidden;
	}

	.fill {
		display: block;
		height: 100%;
		background: var(--c-accent-text);
		transition: width 120ms linear;
	}

	.track.own {
		background: var(--c-on-accent-faint);
	}

	.track.own .fill {
		background: var(--c-text-inverse);
	}
</style>
