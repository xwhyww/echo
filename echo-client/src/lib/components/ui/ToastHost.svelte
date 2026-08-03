<script lang="ts">
	import Toast from '$lib/components/ui/Toast.svelte';
	import { toasts } from '$lib/stores/toasts.svelte.js';
</script>

<!-- Mounted once, in the root layout. The stack owns the placement so several
     toasts queue up the screen instead of landing on the same spot; each Toast
     still runs its own timer and tells us when it's done. -->
<div class="toast-host">
	{#each toasts.items as toast (toast.id)}
		<Toast
			message={toast.message}
			type={toast.type}
			duration={toast.duration}
			onclose={() => toasts.dismiss(toast.id)}
		/>
	{/each}
</div>

<style>
	.toast-host {
		position: fixed;
		bottom: 32px;
		left: 50%;
		translate: -50% 0;
		z-index: var(--z-toast);
		display: flex;
		/* Newest at the bottom, nearest the thumb; older ones ride up. */
		flex-direction: column-reverse;
		align-items: center;
		gap: var(--sp-2);
		/* The strip spans the screen so its children can centre, but only the
		   toasts themselves may swallow clicks. */
		pointer-events: none;
		max-width: calc(100vw - var(--sp-8));
	}

	.toast-host > :global(*) {
		pointer-events: auto;
	}
</style>
