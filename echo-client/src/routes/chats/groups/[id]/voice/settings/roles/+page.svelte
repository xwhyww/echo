<script lang="ts">
	import LoadState from '$lib/components/ui/LoadState.svelte';
	import PageColumn from '$lib/components/layouts/PageColumn.svelte';
	import VoiceRolesPanel from '$lib/components/voice/VoiceRolesPanel.svelte';
	import { useGroupVoiceSettings } from '$lib/hooks/voice/useGroupVoiceSettings.svelte.js';

	const settings = useGroupVoiceSettings();
</script>

<PageColumn>
	<LoadState loading={settings.loading} error={settings.loadError}>
		<!-- Not a load state: non-managers get redirected away, so this renders
		     nothing rather than explaining itself. -->
		{#if settings.canManage}
			<VoiceRolesPanel groupId={settings.groupId} />
		{/if}
	</LoadState>
</PageColumn>
