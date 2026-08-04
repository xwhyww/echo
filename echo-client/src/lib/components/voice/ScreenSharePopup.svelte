<script lang="ts">
	import { Monitor, AppWindow, Globe, StopCircle } from 'lucide-svelte';
	import { voiceClient, type ScreenShareSurface } from '$lib/stores/voiceClient.svelte.js';
	import Modal from '$lib/components/ui/Modal.svelte';
	import { i18n } from '$lib/i18n/i18n.svelte.js';

	const t = $derived(i18n.t);

	interface Props {
		onclose: () => void;
	}

	const { onclose }: Props = $props();

	let starting = $state<ScreenShareSurface | 'any' | null>(null);
	let errorMessage = $state<string | null>(null);

	async function pick(surface?: ScreenShareSurface) {
		if (starting) return;
		starting = surface ?? 'any';
		errorMessage = null;
		try {
			await voiceClient.startScreenShare({ surface });
			// If the user cancelled the native picker, isScreenSharing stays
			// false — keep the popup open so they can try again.
			if (voiceClient.isScreenSharing) {
				onclose();
			}
		} catch (err) {
			console.error('[ScreenSharePopup] startScreenShare failed', err);
			errorMessage = (err as Error)?.message ?? t.voice.screenShare.startFailed;
		} finally {
			starting = null;
		}
	}

	async function stop() {
		if (starting) return;
		await voiceClient.stopScreenShare();
		onclose();
	}
</script>

<!-- The three source tiles sit in a grid, so this dialog caps its width rather
     than taking the shell's default near-full-width card. -->
<Modal
	title={t.voice.screenShare.title}
	desc={t.voice.screenShare.desc}
	maxWidth="640px"
	{onclose}
>
	<div class="ss-tiles">
		<button class="ss-tile text-default" disabled={starting !== null} onclick={() => pick('monitor')}>
			<span class="ss-tile-icon text-default text-accent">
				<Monitor size={28} />
			</span>
			<span class="ss-tile-title body-sm fw-semibold text-default">{t.voice.screenShare.entireScreen}</span>
			<span class="ss-tile-sub body-xs text-default text-faint">{t.voice.screenShare.entireScreenDesc}</span>
			{#if starting === 'monitor'}<span class="ss-tile-busy body-xxs overline text-default text-accent">{t.voice.screenShare.requesting}</span>{/if}
		</button>

		<button class="ss-tile text-default" disabled={starting !== null} onclick={() => pick('window')}>
			<span class="ss-tile-icon text-default text-accent">
				<AppWindow size={28} />
			</span>
			<span class="ss-tile-title body-sm fw-semibold text-default">{t.voice.screenShare.window}</span>
			<span class="ss-tile-sub body-xs text-default text-faint">{t.voice.screenShare.windowDesc}</span>
			{#if starting === 'window'}<span class="ss-tile-busy body-xxs overline text-default text-accent">{t.voice.screenShare.requesting}</span>{/if}
		</button>

		<button class="ss-tile text-default" disabled={starting !== null} onclick={() => pick('browser')}>
			<span class="ss-tile-icon text-default text-accent">
				<Globe size={28} />
			</span>
			<span class="ss-tile-title body-sm fw-semibold text-default">{t.voice.screenShare.tab}</span>
			<span class="ss-tile-sub body-xs text-default text-faint">{t.voice.screenShare.tabDesc}</span>
			{#if starting === 'browser'}<span class="ss-tile-busy body-xxs overline text-default text-accent">{t.voice.screenShare.requesting}</span>{/if}
		</button>
	</div>

	{#if errorMessage}
		<p class="ss-error body-xs text-error">{errorMessage}</p>
	{/if}

	{#if voiceClient.isScreenSharing}
		<div class="ss-active">
			<span class="ss-active-dot"></span>
			<span class="ss-active-text body-sm text-default">{t.voice.screenShare.currentlySharing}</span>
			<button class="ss-stop body-sm" onclick={stop} disabled={starting !== null}>
				<StopCircle size={16} />
				<span>{t.voice.screenShare.stopSharing}</span>
			</button>
		</div>
	{/if}
</Modal>

<style lang="scss">
	@use '$lib/styles/glass.mixin' as *;

	.ss-tiles {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: var(--sp-3);
	}

	@media (max-width: 720px) {
		.ss-tiles { grid-template-columns: 1fr; }
	}

	.ss-tile {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--sp-2);
		padding: var(--sp-3) var(--sp-2);
		border: 1px solid var(--c-border);
		border-radius: var(--radius-md);
		cursor: pointer;
		text-align: center;
		transition:
			background var(--duration-fast) var(--ease-default),
			border-color var(--duration-fast) var(--ease-default),
			transform var(--duration-fast) var(--ease-default);

		@include glass-more;
	}
	.ss-tile:hover:not(:disabled) {
		background: var(--c-bg-3);
		border-color: var(--c-accent-solid);
	}
	.ss-tile:active:not(:disabled) { transform: scale(0.99); }
	.ss-tile:disabled { opacity: 0.55; cursor: not-allowed; }

	.ss-tile-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 56px;
		height: 56px;
		border-radius: var(--radius-md);
		background: var(--c-accent-subtle);
	}

	.ss-error {
		margin: 0;
	}

	.ss-active {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--sp-2);
		padding: var(--sp-2);
		border-radius: var(--radius-md);
		@include glass-more;
	}

	.ss-active-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: #ef4444;
		box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7);
		animation: pulse 1.4s var(--ease-default) infinite;
	}
	@keyframes pulse {
		0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.6); }
		70% { box-shadow: 0 0 0 8px rgba(239, 68, 68, 0); }
		100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
	}

	.ss-active-text {
		flex: 1;
	}

	.ss-stop {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-1);
		padding: var(--sp-1) var(--sp-3);
		background: rgba(239, 68, 68, 0.15);
		color: #ef4444;
		border: none;
		border-radius: var(--radius-md);
		cursor: pointer;
		transition: background var(--duration-fast) var(--ease-default);
	}
	.ss-stop:hover:not(:disabled) { background: rgba(239, 68, 68, 0.25); }
	.ss-stop:disabled { opacity: 0.6; cursor: not-allowed; }
</style>
