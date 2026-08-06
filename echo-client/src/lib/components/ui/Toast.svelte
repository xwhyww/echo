<script lang="ts">
	import { X } from 'lucide-svelte';
	import { useCountdown } from '$lib/hooks/ui/useCountdown.svelte.js';
	import { i18n } from '$lib/i18n/i18n.svelte.js';

	const t = $derived(i18n.t);

	interface Props {
		message: string;
		type?: 'error' | 'info';
		duration?: number;
		onclose: () => void;
	}

	let { message, type = 'error', duration = 4000, onclose }: Props = $props();

	const countdown = useCountdown(() => duration, () => onclose());
</script>

<div class="toast" class:error={type === 'error'}>
	<div class="progress" style:scale="{countdown.progress} 1"></div>
	<span class="message body-sm text-default">{message}</span>
	<button class="close text-muted" onclick={onclose} aria-label={t.common.close}>
		<X size={18} />
	</button>
</div>

<style>
	/* Placement belongs to ToastHost — this is just the card, so several of them
	   can stack. */
	.toast {
		position: relative;
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		padding: 12px 16px;
		background: var(--c-bg-2);
		border: 1px solid var(--c-border);
		border-radius: 12px;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
		overflow: hidden;
		animation: slide-up 200ms var(--ease-default);
	}

	.toast.error {
		border-color: color-mix(in srgb, var(--c-error, #ef4444) 20%, transparent);
	}

	.progress {
		position: absolute;
		inset: 0;
		background: var(--c-accent);
		opacity: 0.1;
		transform-origin: left center;
	}

	.toast.error .progress {
		background: var(--c-error, #ef4444);
	}

	.message {
		position: relative;
		white-space: nowrap;
	}

	.close {
		position: relative;
		display: inline-flex;
		align-items: center;
		cursor: pointer;
		transition: color var(--duration-fast) var(--ease-default);
	}

	@keyframes slide-up {
		from {
			translate: 0 16px;
			opacity: 0;
		}
		to {
			translate: 0 0;
			opacity: 1;
		}
	}
</style>
