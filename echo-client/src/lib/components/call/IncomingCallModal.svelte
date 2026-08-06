<script lang="ts">
	import { Phone, PhoneOff, Video } from 'lucide-svelte';
	import Avatar from '$lib/components/user/Avatar.svelte';
	import { portal } from '$lib/actions/portal.js';
	import { call } from '$lib/stores/call.svelte.js';
	import { i18n } from '$lib/i18n/i18n.svelte.js';

	const t = $derived(i18n.t);

	const peer = $derived(call.peer);
	const name = $derived(peer?.displayName ?? peer?.username ?? i18n.t.common.unknown);
</script>

{#if call.status === 'incoming' && peer}
	<div class="ic-backdrop" use:portal>
		<div class="ic-card" role="dialog" aria-label={t.call.incomingCall}>
			<Avatar name={name} avatarUrl={peer.avatarUrl} size={72} />
			<div class="ic-text">
				<span class="ic-name heading-lg text-default">{name}</span>
				<span class="ic-sub body-sm text-muted">
					{#if call.incomingVideo}
						<Video size={15} /> Incoming video call
					{:else}
						<Phone size={15} /> Incoming call
					{/if}
				</span>
			</div>
			<div class="ic-actions">
				<button class="ic-btn ic-decline" onclick={() => call.decline()} aria-label={t.common.decline}>
					<PhoneOff size={22} />
				</button>
				<button class="ic-btn ic-accept" onclick={() => call.accept()} aria-label={t.common.accept}>
					<Phone size={22} />
				</button>
			</div>
		</div>
	</div>
{/if}

<style lang="scss">
	@use '$lib/styles/modal.mixin' as *;

	.ic-backdrop {
		@include modal-backdrop;
		/* An incoming call outranks whatever dialog is already open. */
		z-index: var(--z-urgent);
	}

	.ic-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--sp-4);
		padding: var(--sp-6);
		width: 320px;
		@include modal-surface;
		animation: ic-pop var(--duration-fast) var(--ease-default);
	}

	@keyframes ic-pop {
		from { opacity: 0; transform: scale(0.96); }
		to { opacity: 1; transform: scale(1); }
	}

	.ic-text {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--sp-1);
	}

	.ic-sub {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-1);
	}

	.ic-actions {
		display: flex;
		gap: var(--sp-6);
		margin-top: var(--sp-2);
	}

	.ic-btn {
		width: 56px;
		height: 56px;
		border-radius: 50%;
		border: none;
		display: flex;
		align-items: center;
		justify-content: center;
		color: #fff;
		cursor: pointer;
		transition: transform var(--duration-fast) var(--ease-default), opacity var(--duration-fast) var(--ease-default);
	}

	.ic-accept { background: var(--c-success, #22c55e); }
	.ic-decline { background: var(--c-error, #ef4444); }
</style>
