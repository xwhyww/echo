<script lang="ts">
	import LoadState from '$lib/components/ui/LoadState.svelte';
	import PageColumn from '$lib/components/layouts/PageColumn.svelte';
	import UserProfilePanel from '$lib/components/user/UserProfilePanel.svelte';
	import { useUserProfile } from '$lib/hooks/user/useUserProfile.svelte.js';

	const profile = useUserProfile();
</script>

<PageColumn gap="var(--sp-3)" maxWidth="560px">
	<LoadState loading={profile.loading} error={profile.loadError}>
		{#if profile.user}
			<UserProfilePanel {profile} />
		{/if}
	</LoadState>
</PageColumn>
