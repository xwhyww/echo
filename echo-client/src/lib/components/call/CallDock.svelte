<script lang="ts">
	import { Mic, MicOff, PhoneOff, Phone } from 'lucide-svelte';
	import Avatar from '$lib/components/user/Avatar.svelte';
	import { call } from '$lib/stores/call.svelte.js';
	import { i18n } from '$lib/i18n/i18n.svelte.js';

	const t = $derived(i18n.t);

	const client = call.client;
	const peer = $derived(call.peer);
	const name = $derived(peer?.displayName ?? peer?.username ?? '');
	const statusLabel = $derived(call.status === 'outgoing' ? i18n.t.call.ringing : i18n.t.call.inCall);
</script>

{#if call.showDock && peer}
	<div class="cd">
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="cd-info" onclick={() => call.expand()} title={t.call.openCall}>
			<Avatar name={name} avatarUrl={peer.avatarUrl} size={28} />
			<div class="cd-text lh-tight">
				<span class="cd-status body-xs text-success"><Phone size={12} /> {statusLabel}</span>
				<span class="cd-name body-sm text-default">{name}</span>
			</div>
		</div>
		<div class="cd-actions">
			<button
				class="cd-btn text-muted"
				class:active={client.isMuted}
				onclick={() => client.toggleMute()}
				title={client.isMuted ? t.call.unmute : t.call.mute}
				aria-label={client.isMuted ? t.call.unmute : t.call.mute}
			>
				{#if client.isMuted}<MicOff size={16} />{:else}<Mic size={16} />{/if}
			</button>
			<button
				class="cd-btn cd-leave text-muted text-error"
				onclick={() => (call.status === 'outgoing' ? call.cancel() : call.hangUp())}
				title={t.call.hangUp}
				aria-label={t.call.hangUp}
			>
				<PhoneOff size={16} />
			</button>
		</div>
	</div>
{/if}

<style>
	.cd {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		padding: var(--sp-3) var(--sp-3);
		background: var(--c-bg-3);
		border-top: 1px solid var(--c-border);
		flex-shrink: 0;
	}

	.cd-info {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		flex: 1;
		min-width: 0;
		cursor: pointer;
	}

	.cd-text {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.cd-status {
		display: inline-flex;
		align-items: center;
		gap: 3px;
	}

	.cd-name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		margin-top: 3px;
		transition: color var(--duration-fast) var(--ease-default);
	}

	.cd-actions { display: flex; gap: var(--sp-1); flex-shrink: 0; }

	.cd-btn {
		width: 30px;
		height: 30px;
		border: none;
		border-radius: var(--radius-sm);
		background: var(--c-bg-3);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: background var(--duration-fast) var(--ease-default), color var(--duration-fast) var(--ease-default);
	}
	.cd-btn.active { background: var(--c-accent-subtle-2); color: var(--c-accent-text); }
</style>
