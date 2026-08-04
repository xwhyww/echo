<script lang="ts">
	import { Shield } from 'lucide-svelte';
	import LoadState from '$lib/components/ui/LoadState.svelte';
	import NavRow from '$lib/components/ui/NavRow.svelte';
	import PageColumn from '$lib/components/layouts/PageColumn.svelte';
	import { useGroupVoiceSettings } from '$lib/hooks/voice/useGroupVoiceSettings.svelte.js';
	import { i18n } from '$lib/i18n/i18n.svelte.js';

	const t = $derived(i18n.t);

	const settings = useGroupVoiceSettings();
</script>

<PageColumn gap="var(--sp-2)">
	<LoadState loading={settings.loading} error={settings.loadError}>
		<!-- Not a load state: non-managers get redirected away, so this renders
		     nothing rather than explaining itself. -->
		{#if settings.canManage}
			<nav class="vs-rows">
				<NavRow
					href={settings.rolesHref}
					title={t.voice.settings.rolesRow}
					desc={t.voice.settings.rolesRowDesc}
				>
					{#snippet icon()}<Shield size={20} />{/snippet}
				</NavRow>
			</nav>
		{/if}
	</LoadState>
</PageColumn>

<style>
	.vs-rows {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}
</style>
