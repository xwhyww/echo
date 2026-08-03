<script lang="ts">
	import EmojiPicker from '$lib/components/emoji/EmojiPicker.svelte';
	import { portal } from '$lib/actions/portal.js';
	import { i18n } from '$lib/i18n/i18n.svelte.js';

	const t = $derived(i18n.t);

	// The emoji picker on its own, sized to the grid. Deliberately not `Modal`:
	// a title bar and an actions row would crowd out the only thing here.
	interface Props {
		onselect: (emoji: string) => void;
		onclose: () => void;
	}

	let { onselect, onclose }: Props = $props();

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onclose();
	}
</script>

<svelte:window onkeydown={onKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="reaction-backdrop" use:portal onclick={onclose}>
	<div
		class="reaction-modal"
		onclick={(e) => e.stopPropagation()}
		role="dialog"
		aria-modal="true"
		aria-label={t.common.emoji}
		tabindex="-1"
	>
		<EmojiPicker {onselect} />
	</div>
</div>

<style lang="scss">
	@use '$lib/styles/modal.mixin' as *;

	.reaction-backdrop {
		@include modal-backdrop;
	}

	.reaction-modal {
		@include modal-surface;
		width: 352px;
		max-width: calc(100% - var(--sp-4));
		height: 440px;
		max-height: calc(100% - var(--sp-8));
		overflow: hidden;
	}
</style>
