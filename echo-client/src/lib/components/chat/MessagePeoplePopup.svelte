<script lang="ts" module>
	/** Widest the flyout gets: the menu needs it to pick a side before opening. */
	export const MESSAGE_POPUP_W = 280;
</script>

<script lang="ts">
	import Avatar from '$lib/components/user/Avatar.svelte';
	import AppleEmoji from '$lib/components/emoji/AppleEmoji.svelte';
	import type { PopupAnchor } from '$lib/hooks/ui/useHoverPopup.svelte.js';
	import { formatSeenAt, type PersonRow } from '$lib/utils/messageMenu.js';
	import { i18n } from '$lib/i18n/i18n.svelte.js';

	const t = $derived(i18n.t);

	interface Props {
		rows: PersonRow[];
		anchor: PopupAnchor;
		/** True when there is no room to the right and the flyout opens leftwards. */
		flipX?: boolean;
		onpick: (userId: string) => void;
		onenter: () => void;
		onleave: () => void;
	}

	let { rows, anchor, flipX = false, onpick, onenter, onleave }: Props = $props();
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="people-popup"
	style:top="{anchor.top - 5}px"
	style:left={flipX ? undefined : `${anchor.left + 6}px`}
	style:right={flipX ? `${window.innerWidth - anchor.right + 4}px` : undefined}
	style:max-width="{MESSAGE_POPUP_W}px"
	onmouseenter={onenter}
	onmouseleave={onleave}
>
	{#each rows as row (row.userId + (row.emoji ?? ''))}
		<button
			type="button"
			class="people-row"
			onclick={(e) => {
				e.stopPropagation();
				onpick(row.userId);
			}}
		>
			<Avatar name={row.name} avatarUrl={row.avatarUrl} size={24} />
			<span class="people-info">
				<span class="people-name body-sm">{row.name}</span>
				<span class="people-time body-xs text-muted">{formatSeenAt(row.at, i18n.locale, t.chat.yesterdayAt)}</span>
			</span>
			{#if row.emoji}
				<span class="people-emoji"><AppleEmoji emoji={row.emoji} size={20} /></span>
			{/if}
		</button>
	{/each}
</div>

<style>
	.people-popup {
		position: fixed;
		background: var(--c-bg-2);
		border: 1px solid var(--c-border);
		border-radius: var(--radius-md);
		padding: var(--sp-1);
		min-width: 200px;
		max-height: 320px;
		overflow-y: auto;
		box-shadow: var(--shadow-xl);
		z-index: var(--z-message-popup);
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.people-row {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		padding: var(--sp-1) var(--sp-2);
		border: none;
		background: none;
		color: inherit;
		text-align: left;
		border-radius: var(--radius-sm);
		cursor: pointer;
		width: 100%;
		transition: background var(--duration-fast) var(--ease-default);
	}

	.people-info {
		display: flex;
		flex-direction: column;
		min-width: 0;
		flex: 1;
	}

	.people-name {
		display: block;
		color: var(--c-text);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.people-time {
		display: block;
	}

	.people-emoji {
		display: flex;
		justify-content: center;
		align-items: center;
	}
</style>
