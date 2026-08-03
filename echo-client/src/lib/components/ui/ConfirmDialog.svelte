<script lang="ts">
	import { AlertTriangle } from 'lucide-svelte';
	import type { Snippet } from 'svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Input from '$lib/components/ui/Input.svelte';
	import { i18n } from '$lib/i18n/i18n.svelte.js';

	const t = $derived(i18n.t);

	// A yes/no question in the shared modal shell. Everything below is what makes
	// it a *confirmation* — the destructive tone, the type-the-name gate and
	// Enter-to-confirm; the chrome itself comes from `Modal`.
	interface Props {
		title: string;
		message?: string;
		body?: Snippet;
		confirmLabel?: string;
		cancelLabel?: string;
		tone?: 'danger' | 'default';
		busy?: boolean;
		requireText?: string | null;
		onconfirm: () => void;
		onclose: () => void;
	}

	let {
		title,
		message,
		body,
		confirmLabel,
		cancelLabel,
		tone = 'default',
		busy = false,
		requireText = null,
		onconfirm,
		onclose,
	}: Props = $props();

	let typed = $state('');

	// Defaulted here rather than in $props() so the labels follow locale changes.
	const confirmText = $derived(confirmLabel ?? t.common.confirm);
	const cancelText = $derived(cancelLabel ?? t.common.cancel);

	const blocked = $derived(
		busy || (requireText !== null && typed.trim() !== requireText),
	);

	// Escape and the other exits belong to `Modal`; Enter is ours, because only
	// this component knows whether the confirmation is still gated.
	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !blocked) onconfirm();
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<Modal {title} {onclose} {tone} layout="alert" closeDisabled={busy}>
	{#snippet icon()}<AlertTriangle size={22} />{/snippet}

	{#if body}
		<div class="confirm-body body-sm text-muted">{@render body()}</div>
	{:else if message}
		<p class="confirm-body body-sm text-muted">{message}</p>
	{/if}

	{#if requireText !== null}
		{@const hint = t.common.typeToConfirm(requireText)}
		<label class="confirm-field">
			<span class="confirm-label body-xs text-muted">
				{hint.before}<strong class="fw-semibold">{hint.value}</strong>{hint.after}
			</span>
			<Input
				bind:value={typed}
				placeholder={requireText}
				disabled={busy}
				radius="var(--radius-md)"
				autocomplete="off"
				autocapitalize="off"
				spellcheck="false"
			/>
		</label>
	{/if}

	{#snippet actions()}
		<Button variant="ghost" onclick={onclose} disabled={busy}>{cancelText}</Button>
		<Button variant={tone === 'danger' ? 'danger' : 'primary'} onclick={onconfirm} disabled={blocked}>
			{busy ? '...' : confirmText}
		</Button>
	{/snippet}
</Modal>

<style>
	.confirm-body {
		margin: 0;
	}

	.confirm-field {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
		margin-top: var(--sp-1);
	}

	.confirm-field strong {
		color: var(--c-text);
	}
</style>
