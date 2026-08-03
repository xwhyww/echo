<script lang="ts">
	import type { Snippet } from 'svelte';

	// A titled section of a settings page: heading, one line of explanation, and
	// the controls. Blocks separate themselves with a rule.
	interface Props {
		title: string;
		desc?: string;
		children: Snippet;
	}

	let { title, desc, children }: Props = $props();
</script>

<section class="settings-block">
	<div class="settings-block-head">
		<h2 class="heading-md fw-semibold">{title}</h2>
		{#if desc}
			<p class="body-xs lh-base text-faint">{desc}</p>
		{/if}
	</div>
	{@render children()}
</section>

<style>
	.settings-block {
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
		padding: var(--sp-4) 0;
		border-bottom: 1px solid var(--c-border);
	}

	.settings-block-head {
		display: flex;
		flex-direction: column;
		gap: var(--sp-1);
	}

	.settings-block-head h2,
	.settings-block-head p {
		margin: 0;
	}
</style>
