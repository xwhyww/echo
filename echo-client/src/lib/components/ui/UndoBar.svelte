<script lang="ts">
	import { X } from 'lucide-svelte';
	import { useCountdown } from '$lib/hooks/ui/useCountdown.svelte.js';
	import { i18n } from '$lib/i18n/i18n.svelte.js';

	const t = $derived(i18n.t);

	interface Props {
		message: string;
		duration?: number;
		onconfirm: () => void;
		oncancel: () => void;
	}

	let { message, duration = 4000, onconfirm, oncancel }: Props = $props();

	// Running out is the *confirmation*: the bar is the only chance to cancel.
	const countdown = useCountdown(() => duration, () => onconfirm());
</script>

<div class="undo-bar">
	<div class="progress" style:scale="{countdown.progress} 1"></div>
	<span class="message body-sm text-default">{message}</span>
	<button class="cancel body-sm text-accent" onclick={oncancel}>
		<X size={16} />
		{t.common.cancel}
	</button>
</div>

<style>
	.undo-bar {
		position: fixed;
		bottom: 32px;
		left: 50%;
		translate: -50% 0;
		z-index: 1000;
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

	.progress {
		position: absolute;
		inset: 0;
		background: var(--c-accent);
		opacity: 0.1;
		transform-origin: left center;
	}

	.message {
		position: relative;
		white-space: nowrap;
	}

	.cancel {
		position: relative;
		display: inline-flex;
		align-items: center;
		gap: var(--sp-1);
		cursor: pointer;
		white-space: nowrap;
		transition: opacity var(--duration-fast) var(--ease-default);
	}

	.cancel:hover {
		opacity: 0.8;
	}

	@keyframes slide-up {
		from {
			translate: -50% 16px;
			opacity: 0;
		}
		to {
			translate: -50% 0;
			opacity: 1;
		}
	}
</style>
