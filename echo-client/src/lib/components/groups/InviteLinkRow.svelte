<script lang="ts">
	import { Link2, RefreshCw, Copy, Check } from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { i18n } from '$lib/i18n/i18n.svelte.js';

	const t = $derived(i18n.t);

	// The shareable join link, or the offer to mint one. Regenerating invalidates
	// the old link, so that button is only for people who may manage the group.
	interface Props {
		link: string;
		copied: boolean;
		canRegenerate: boolean;
		regenerating: boolean;
		oncopy: () => void;
		onregenerate: () => void;
	}

	let { link, copied, canRegenerate, regenerating, oncopy, onregenerate }: Props = $props();
</script>

{#if link}
	<div class="invite-link-row">
		<div class="invite-link body-sm">
			<Link2 size={14} />
			<span>{link}</span>
		</div>
		<div class="invite-link-actions">
			<Button variant="ghost" onclick={oncopy}>
				{#if copied}<Check size={14} />{t.groupSettings.copied}
				{:else}<Copy size={14} />{t.common.copy}{/if}
			</Button>
			{#if canRegenerate}
				<Button variant="ghost" disabled={regenerating} onclick={onregenerate}>
					<RefreshCw size={14} />
					{regenerating ? '...' : t.groupSettings.regenerate}
				</Button>
			{/if}
		</div>
	</div>
{:else}
	<p class="body-sm text-faint">{t.groupSettings.noInviteLink}</p>
	{#if canRegenerate}
		<Button variant="primary" disabled={regenerating} onclick={onregenerate}>
			<Link2 size={14} />
			{t.groupSettings.createLink}
		</Button>
	{/if}
{/if}

<style>
	p {
		margin: 0;
	}

	.invite-link-row {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}

	.invite-link {
		padding: var(--sp-2) var(--sp-3);
		background: var(--c-bg-3);
		border-radius: var(--radius-sm);
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		word-break: break-all;
	}

	.invite-link-actions {
		display: flex;
		gap: var(--sp-2);
	}
</style>
