<script lang="ts">
	import { onMount } from 'svelte';
	import rawData from '@emoji-mart/data';
	import { Picker } from 'emoji-mart';

	interface Props {
		onselect: (emoji: string) => void;
    pickerStyle?: 'none' | 'default';
	}

	let { onselect, pickerStyle = 'default' }: Props = $props();
	let container = $state<HTMLDivElement>();

	// @emoji-mart/data ships native-only (no sprite x/y). Inject `src` into every
	// skin so the Picker's spritesheet path short-circuits to an <img> tag.
	const data = (() => {
		const cloned = structuredClone(rawData as any);
		for (const id in cloned.emojis) {
			for (const skin of cloned.emojis[id].skins) {
				if (skin.unified) skin.src = `/emojis/apple/64/${skin.unified}.png`;
			}
		}
		return cloned;
	})();

	onMount(() => {
		if (!container) return;

		const picker = new Picker({
			data,
			onEmojiSelect: (emoji: any) => {
				onselect(emoji.native);
			},
			theme: 'dark',
			set: 'apple',
			previewPosition: 'none',
			skinTonePosition: 'search',
			maxFrequentRows: 2,
			dynamicWidth: true,
		});

		// emoji-mart declares `--padding: 12px` on `#root` *inside* its shadow
		// root rather than on `:host`, so setting the variable from the outside
		// can never win — a direct declaration always beats an inherited value.
		// (The `--rgb-*` vars below work because those are read at `:host` level,
		// which is emoji-mart's documented public surface. `--padding` is not.)
		// The only way in is a stylesheet inside the shadow tree. Appended last,
		// so at equal specificity it outranks emoji-mart's own style element,
		// which is injected as the shadow root's first child.
		// (Don't write that tag name literally here — svelte2tsx scans the script
		// for tags and would read it as the start of the component's style block,
		// then report this script as never closed.)
		if (pickerStyle === 'none') {
			const padStyle = document.createElement('style');
			padStyle.textContent = '#root { --padding: 0; }';
			(picker as unknown as HTMLElement).shadowRoot?.appendChild(padStyle);
		}

		container.appendChild(picker as unknown as Node);

		return () => {
			container?.replaceChildren();
		};
	});
</script>

<div class="emoji-picker-wrapper {pickerStyle}" bind:this={container}></div>

<style lang="scss">
  @use '$lib/styles/glass.mixin' as *;
  
	.emoji-picker-wrapper {
		height: 100%;
		overflow: hidden;
    border-radius: 12px;
	}
  
  .default {
    @include glass-more;
  }
  
  /* `--padding` cannot be set from here — see the shadow-root note in onMount. */
  .none {
    border: none;
    background: transparent;
  }

	.emoji-picker-wrapper :global(em-emoji-picker) {
  
		--rgb-background: 38, 38, 36, 0;
		--rgb-input: 50, 50, 48;
		--rgb-color: 200, 200, 195;
		--rgb-accent: 37, 147, 157;
		--font-family: 'Inter', sans-serif;
		width: 100%;
		height: 100%;
	}
</style>
