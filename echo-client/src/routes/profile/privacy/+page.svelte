<script lang="ts">
	import ErrorAlert from '$lib/components/ui/ErrorAlert.svelte';
	import LoadState from '$lib/components/ui/LoadState.svelte';
	import SegmentedControl from '$lib/components/ui/SegmentedControl.svelte';
	import SettingRow from '$lib/components/settings/SettingRow.svelte';
	import PageColumn from '$lib/components/layouts/PageColumn.svelte';
	import { usePrivacy } from '$lib/hooks/user/usePrivacy.svelte.js';

	const privacy = usePrivacy();
</script>

<!-- `paddingTop="0"`: the /profile layout already clears the header. -->
<PageColumn paddingTop="0" gap="var(--sp-6)">
	<LoadState loading={privacy.loading}>
		<div class="settings">
			{#each privacy.fields as field (field.key)}
				<SettingRow label={field.label} desc={field.desc}>
					<SegmentedControl
						options={field.options}
						value={privacy.settings[field.key]}
						onchange={(v) => privacy.update(field.key, v)}
						label={field.label}
					/>
				</SettingRow>
			{/each}
		</div>
	</LoadState>

	{#if privacy.error}
		<ErrorAlert message={privacy.error} />
	{/if}
</PageColumn>

<style>
	.settings {
		display: flex;
		flex-direction: column;
		gap: var(--sp-5);
	}
</style>
