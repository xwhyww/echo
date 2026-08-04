<script lang="ts">
	import { Move, FolderOpen } from 'lucide-svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { voiceService } from '$lib/api/voiceService.js';
	import { toasts } from '$lib/stores/toasts.svelte.js';
	import { i18n } from '$lib/i18n/i18n.svelte.js';
	import type { VoiceChannel, VoiceCategory } from '$lib/api/voice.js';

	const t = $derived(i18n.t);

	// Picking a channel's category. Choosing one applies it immediately and
	// closes — there's nothing else to confirm.
	interface Props {
		channel: VoiceChannel;
		categories: VoiceCategory[];
		onclose: () => void;
	}

	let { channel, categories, onclose }: Props = $props();

	let moving = $state(false);

	const currentId = $derived(channel.categoryId ?? null);

	function close() {
		if (!moving) onclose();
	}

	async function moveTo(categoryId: string | null) {
		if (currentId === categoryId) {
			onclose();
			return;
		}
		moving = true;
		try {
			// The WS event updates the list; nothing to patch locally.
			await voiceService.updateChannel(channel.id, { categoryId });
			onclose();
		} catch (err) {
			console.error('[MoveChannelModal] move failed', err);
			toasts.error((err as Error).message ?? t.voice.moveChannelFailed);
		} finally {
			moving = false;
		}
	}
</script>

<Modal
	title={t.voice.moveChannelTitle(channel.name)}
	desc={t.voice.moveChannelDesc}
	onclose={close}
	closeDisabled={moving}
>
	{#snippet icon()}<Move size={22} />{/snippet}

	<ul class="move-list">
		<li>
			<button
				class="move-option body-sm text-default"
				class:active={currentId === null}
				disabled={moving}
				onclick={() => moveTo(null)}
			>
				<span>{t.voice.noCategory}</span>
			</button>
		</li>
		{#each categories as cat (cat.id)}
			<li>
				<button
					class="move-option body-sm text-default"
					class:active={currentId === cat.id}
					disabled={moving}
					onclick={() => moveTo(cat.id)}
				>
					<FolderOpen size={16} />
					<span>{cat.name}</span>
				</button>
			</li>
		{/each}
	</ul>

	{#snippet actions()}
		<Button variant="ghost" onclick={close} disabled={moving}>{t.common.cancel}</Button>
	{/snippet}
</Modal>

<style>
	.move-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.move-option {
		width: 100%;
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		padding: var(--sp-2) var(--sp-3);
		background: var(--c-bg-3);
		border: none;
		border-radius: var(--radius-sm);
		cursor: pointer;
		text-align: left;
		transition: background var(--duration-fast) var(--ease-default);
	}

	.move-option:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.move-option.active {
		background: var(--c-accent);
		color: var(--c-text-inverse);
	}
</style>
