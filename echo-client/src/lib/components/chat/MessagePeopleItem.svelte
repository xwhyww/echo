<script lang="ts">
	import { ChevronRight } from 'lucide-svelte';
	import AppleEmoji from '$lib/components/emoji/AppleEmoji.svelte';
	import MessagePeoplePopup from '$lib/components/chat/MessagePeoplePopup.svelte';
	import { useHoverPopup } from '$lib/hooks/ui/useHoverPopup.svelte.js';
	import { formatSeenAt, type PersonRow } from '$lib/utils/messageMenu.js';
	import { i18n } from '$lib/i18n/i18n.svelte.js';

	const t = $derived(i18n.t);

	// A context-menu row that stands for a list of people — who reacted, who
	// read it. One person is spelled out inline; several collapse behind a count
	// that opens the full list on hover.
	/** Taken off a real icon rather than spelled out — every lucide icon shares it. */
	type IconComponent = typeof ChevronRight;

	interface Props {
		icon: IconComponent;
		rows: PersonRow[];
		/** Collapsed wording for more than one — "Seen by 5", "3 reactions". */
		countLabel: string;
		/** True when the menu sits too far right for the flyout to open rightwards. */
		flipX?: boolean;
		onpick: (userId: string) => void;
	}

	let { icon: TriggerIcon, rows, countLabel, flipX = false, onpick }: Props = $props();

	const popup = useHoverPopup<HTMLButtonElement>();
</script>

<button
	type="button"
	class="people-item body-sm text-default"
	bind:this={popup.el}
	onclick={(e) => e.stopPropagation()}
	onmouseenter={popup.show}
	onmouseleave={popup.hide}
	onfocus={popup.show}
	onblur={popup.hide}
>
	<TriggerIcon size={16} />
	{#if rows.length === 1}
		<span class="people-label">
			{rows[0].name}
			{#if rows[0].emoji}<AppleEmoji emoji={rows[0].emoji} size={16} />{/if}
		</span>
		<span class="people-time-inline body-xs text-muted">
			{formatSeenAt(rows[0].at, i18n.locale, t.chat.yesterdayAt)}
		</span>
	{:else}
		<span class="people-label">{countLabel}</span>
		<ChevronRight size={16} class="people-chevron" />
	{/if}
</button>

<!-- Rendered next to its trigger, not at the end of the menu: the flyout is
     `position: fixed`, so nothing around it here affects where it lands. -->
{#if popup.open && popup.anchor && rows.length > 0}
	<MessagePeoplePopup
		{rows}
		anchor={popup.anchor}
		{flipX}
		{onpick}
		onenter={popup.show}
		onleave={popup.hide}
	/>
{/if}

<style lang="scss">
	@use '$lib/styles/button.mixin' as *;

	.people-item {
		@include context-item;
		justify-content: flex-start;
	}

	.people-label {
		flex: 1;
		text-align: left;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.people-time-inline {
		margin-left: var(--sp-2);
	}

	:global(.people-chevron) {
		color: var(--c-text-muted);
	}
</style>
