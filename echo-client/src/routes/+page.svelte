<script lang="ts">
	import { auth } from '$lib/stores/auth.svelte.js';
	import { i18n } from '$lib/i18n/i18n.svelte.js';

	const t = $derived(i18n.t);
</script>

{#if auth.loading}
	<div class="center">
		<p class="text-muted">{t.common.loading}</p>
	</div>
{:else if auth.isAuthenticated}
	<div class="center">
		<h1 class="heading-xl">Welcome, {auth.user!.displayName ?? auth.user!.username}</h1>
		<p class="body-sm text-muted">{t.home.text}</p>
	</div>
{/if}

<style>
	.center {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 100vh;
		gap: var(--sp-2);
		padding: 0 var(--sp-2);
		text-align: center;
	}
</style>
