<script lang="ts">
	import ErrorAlert from '$lib/components/ui/ErrorAlert.svelte';
	import LoadState from '$lib/components/ui/LoadState.svelte';
	import SegmentedControl from '$lib/components/ui/SegmentedControl.svelte';
	import SettingRow from '$lib/components/settings/SettingRow.svelte';
	import Switch from '$lib/components/ui/Switch.svelte';
	import PageColumn from '$lib/components/layouts/PageColumn.svelte';
	import { useNotificationSettings } from '$lib/hooks/user/useNotificationSettings.svelte.js';
	import { i18n } from '$lib/i18n/i18n.svelte.js';

	const notifications = useNotificationSettings();
	const t = $derived(i18n.t);

	// The per-category switches only mean anything while the master switch is on,
	// so they are disabled rather than hidden — hiding them would make the screen
	// jump and lose the explanation of what is being turned off.
	const off = $derived(!notifications.settings.enabled);

	const previewOptions = $derived([
		{ value: 'default', label: t.notifications.previewDefault },
		{ value: 'on', label: t.notifications.previewOn },
		{ value: 'off', label: t.notifications.previewOff },
	]);

	const previewValue = $derived(
		notifications.settings.showPreview === null
			? 'default'
			: notifications.settings.showPreview
				? 'on'
				: 'off',
	);

	function onPreviewChange(value: string) {
		if (value === 'default') notifications.clearShowPreview();
		else notifications.setShowPreview(value === 'on');
	}
</script>

<PageColumn gap="var(--sp-6)">
	<LoadState loading={notifications.loading}>
		<div class="settings">
			<SettingRow
				layout="inline"
				label={t.notifications.enabled}
				desc={t.notifications.enabledDesc}
			>
				<Switch
					checked={notifications.settings.enabled}
					onchange={(v) => notifications.setEnabled(v)}
					label={t.notifications.enabled}
				/>
			</SettingRow>

			{#each notifications.toggles as toggle (toggle.key)}
				<SettingRow layout="inline" label={toggle.label} desc={toggle.desc}>
					<Switch
						checked={notifications.settings[toggle.key]}
						onchange={(v) => notifications.setToggle(toggle.key, v)}
						disabled={off}
						label={toggle.label}
					/>
				</SettingRow>
			{/each}

			<SettingRow label={t.notifications.preview} desc={t.notifications.previewDesc}>
				<SegmentedControl
					options={previewOptions}
					value={previewValue}
					onchange={onPreviewChange}
					disabled={off}
					label={t.notifications.preview}
				/>
			</SettingRow>
		</div>
	</LoadState>

	{#if notifications.error}
		<ErrorAlert message={notifications.error} />
	{/if}
</PageColumn>

<style>
	.settings {
		display: flex;
		flex-direction: column;
		gap: var(--sp-5);
	}
</style>
