<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import SettingRow from '$lib/components/settings/SettingRow.svelte';
	import SettingsBlock from '$lib/components/settings/SettingsBlock.svelte';
	import Slider from '$lib/components/ui/Slider.svelte';
	import Switch from '$lib/components/ui/Switch.svelte';
	import VoiceTestPanel from '$lib/components/voice/VoiceTestPanel.svelte';
	import PageColumn from '$lib/components/layouts/PageColumn.svelte';
	import { VOICE_VOLUME_MIN, VOICE_VOLUME_MAX } from '$lib/stores/voiceVolumes.svelte.js';
	import { useAudioSettings } from '$lib/hooks/audio/useAudioSettings.svelte.js';
	import { i18n } from '$lib/i18n/i18n.svelte.js';

	const t = $derived(i18n.t);

	const audio = useAudioSettings();
</script>

<PageColumn gap="var(--sp-1)">
	<p class="body-sm text-faint">{t.audio.subtitle}</p>

	<SettingsBlock title={t.audio.inputDevice} desc={t.audio.inputDeviceDesc}>
		<div class="row">
			<Select
				options={audio.deviceOptions}
				value={audio.selectedDevice}
				onchange={audio.pickDevice}
				label={t.audio.inputDevice}
			/>
			<Button variant="link" onclick={audio.refreshInputs}>{t.common.refresh}</Button>
		</div>
		{#if audio.labelsHidden}
			<p class="body-xs lh-base text-faint">
				{t.audio.labelsHidden}
				<Button variant="link" onclick={audio.grantAccess}>{t.audio.grantAccess}</Button>
			</p>
		{/if}
		{#if audio.inputsError}
			<p class="body-xs lh-base text-error">{audio.inputsError}</p>
		{/if}
	</SettingsBlock>

	<SettingsBlock title={t.audio.inputVolume} desc={t.audio.inputVolumeDesc}>
		<div class="row">
			<div class="slider">
				<Slider
					min={VOICE_VOLUME_MIN}
					max={VOICE_VOLUME_MAX}
					step={0.01}
					value={audio.micGain}
					oninput={audio.setMicGain}
					ariaLabel={t.audio.inputVolumeAria}
				/>
			</div>
			<span class="value body-sm text-muted" class:boost={audio.micGainPercent > 100}>
				{audio.micGainPercent}%
			</span>
			<Button variant="link" onclick={audio.resetMicGain} disabled={audio.micGainPercent === 100}>
				{t.common.reset}
			</Button>
		</div>
	</SettingsBlock>

	<SettingsBlock title={t.audio.sensitivity} desc={t.audio.sensitivityDesc}>
		<div class="row">
			<Switch
				checked={audio.settings.sensitivityEnabled}
				onchange={() => audio.toggle('sensitivityEnabled')}
				label={t.audio.sensitivityToggleAria}
			/>
			<span class="body-sm">{t.audio.sensitivityToggleLabel}</span>
		</div>
		<div class="row" class:disabled={!audio.settings.sensitivityEnabled}>
			<div class="slider">
				<Slider
					min={-80}
					max={-10}
					step={1}
					value={audio.settings.sensitivityThresholdDb}
					oninput={audio.setSensitivity}
					disabled={!audio.settings.sensitivityEnabled}
					ariaLabel={t.audio.sensitivityThresholdAria}
				/>
			</div>
			<span class="value body-sm text-muted">{audio.settings.sensitivityThresholdDb} dB</span>
		</div>
	</SettingsBlock>

	<SettingsBlock title={t.audio.testMic} desc={t.audio.testMicDesc}>
		<VoiceTestPanel
			sensitivityEnabled={audio.settings.sensitivityEnabled}
			sensitivityThresholdDb={audio.settings.sensitivityThresholdDb}
		/>
	</SettingsBlock>

	<div class="toggles">
		{#each audio.toggles as item (item.key)}
			<SettingRow label={item.label} desc={item.desc} badge={item.badge} layout="inline">
				<Switch
					checked={audio.isOn(item.key)}
					onchange={() => audio.toggle(item.key)}
					label={item.label}
				/>
			</SettingRow>
		{/each}
	</div>
</PageColumn>

<style>
	p {
		margin: 0;
	}

	.row {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
	}

	.row.disabled {
		opacity: 0.5;
	}

	.slider {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
	}

	.value {
		min-width: 48px;
		text-align: right;
		font-variant-numeric: tabular-nums;
	}

	.value.boost {
		color: var(--c-accent-text);
	}

	.toggles {
		display: flex;
		flex-direction: column;
		margin-top: var(--sp-2);
	}
</style>
