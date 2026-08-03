<script lang="ts">
	import BackButton from '$lib/components/ui/BackButton.svelte';

	interface Props {
		// Fallback destination: landing on the page directly (deep link,
		// reload) leaves no history to go back to.
		backHref: string;
		title?: string;
	}

	let { backHref, title = '' }: Props = $props();
</script>

<header class="app-header">
	<div class="header-back">
		<BackButton {backHref} size={36} />
	</div>
	{#if title}
		<h2 class="title body-base">{title}</h2>
	{/if}
</header>

<style>
	.app-header {
		height: var(--header-h);
		flex-shrink: 0;
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		padding: 0 var(--sp-2);
		background: transparent;
		position: absolute;
		width: 100%;
		top: 0;
		right: 0;
	}

	.header-back {
		position: absolute;
		left: var(--sp-2);
		top: 50%;
		transform: translateY(-50%);
	}

	.title {
		text-align: center;
		width: 100%;
	}
</style>
