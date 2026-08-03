<script lang="ts">
	import { Mic, MicOff, Headphones, HeadphoneOff, PhoneOff, Volume2 } from 'lucide-svelte';
	import { voiceClient } from '$lib/stores/voiceClient.svelte.js';
	import { goto } from '$app/navigation';
	import ConnectionQualityIndicator from '$lib/components/voice/ConnectionQualityIndicator.svelte';
	import { i18n } from '$lib/i18n/i18n.svelte.js';

	const t = $derived(i18n.t);

	function openCallScreen() {
		const ch = voiceClient.currentChannel;
		if (!ch) return;
		goto(`/chats/groups/${ch.groupId}/voice/${ch.id}`);
	}
</script>

{#if voiceClient.currentChannel}
	{@const ch = voiceClient.currentChannel}
	<div class="vsb">
		<div class="vsb-inner">
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="vsb-info" onclick={openCallScreen}>
				<div class="vsb-icon text-inverse">
					<Volume2 size={14} />
				</div>
				<div class="vsb-text lh-tight">
					<span class="vsb-status body-xs text-success">
						{#if voiceClient.isConnecting}Connecting...{:else if voiceClient.isConnected}Connected{:else}Disconnected{/if}
					</span>
					<span class="vsb-channel body-xs text-default">{ch.name}</span>
				</div>
				{#if voiceClient.isConnected}
					<div class="cq">
						<ConnectionQualityIndicator />
					</div>
				{/if}
			</div>
			
			<div class="vsb-actions">
				<button
					type="button"
					class="vsb-btn text-muted"
					class:active={voiceClient.isMuted}
					onclick={() => voiceClient.toggleMuted()}
					title={voiceClient.isMuted ? t.call.unmute : t.call.mute}
				>
					{#if voiceClient.isMuted}
						<MicOff size={14} />
					{:else}
						<Mic size={14} />
					{/if}
				</button>
				<button
					type="button"
					class="vsb-btn text-muted"
					class:active={voiceClient.isDeafened}
					onclick={() => voiceClient.toggleDeafened()}
					title={voiceClient.isDeafened ? t.voice.undeafen : t.voice.deafen}
				>
					{#if voiceClient.isDeafened}
						<HeadphoneOff size={14} />
					{:else}
						<Headphones size={14} />
					{/if}
				</button>
				<button
					type="button"
					class="vsb-btn vsb-leave text-muted text-error"
					onclick={() => voiceClient.disconnect()}
					title={t.voice.disconnect}
				>
					<PhoneOff size={14} />
				</button>
			</div>
		</div>
	</div>
{/if}

<style lang="scss">
	@use '$lib/styles/glass.mixin' as *;

	.vsb {
		/* Placement is the bar stack's job — see AppBars.svelte. */
		width: 100%;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--sp-2);
		padding: var(--sp-2) var(--sp-6);
		flex-shrink: 0;

		@include glass;
		border-radius: var(--radius-full);
	}

	.cq	{
		display: flex;
	}

	.vsb-inner {
		display: flex;
		flex-direction: row;
		width: 100%;
	}

	.vsb-info {
		display: flex;
		align-items: flex-end;
		gap: var(--sp-2);
		flex: 1;
		min-width: 0;
		cursor: pointer;
	}

	.vsb-info:hover .vsb-channel {
		color: var(--c-accent-text);
	}

	.vsb-icon {
		width: 28px;
		height: 28px;
		border-radius: var(--radius-sm);
		background: var(--c-accent);
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.vsb-text {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.vsb-channel {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		transition: color var(--duration-fast) var(--ease-default);
		margin-top: -3px;
	}

	.vsb-actions {
		display: flex;
		gap: var(--sp-1);
		flex-shrink: 0;
		align-items: flex-end;
	}

	.vsb-btn {
		width: 30px;
		height: 30px;
		border: none;
		border-radius: var(--radius-sm);
		background: var(--c-bg-3);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition:
			background var(--duration-fast) var(--ease-default),
			color var(--duration-fast) var(--ease-default);
	}

	.vsb-btn:hover {
		background: var(--c-bg-1);
		color: var(--c-text);
	}

	.vsb-btn.active {
		background: var(--c-accent-subtle-2);
		color: var(--c-accent-text);
	}

	.vsb-leave:hover {
		background: var(--c-error, #ef4444);
		color: var(--c-text-inverse);
	}
</style>
