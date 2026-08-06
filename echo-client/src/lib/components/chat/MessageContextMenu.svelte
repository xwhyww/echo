<script lang="ts" module>
	export interface SeenByEntry {
		userId: string;
		name: string;
		avatarUrl: string | null;
		seenAt: string;
	}

	// Built by `reactorRows`, next to the reaction maths it comes out of;
	// re-exported here because this menu is what renders it.
	import type { ReactorRow } from '$lib/utils/reactions.js';
	export type { ReactorRow };
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Pencil, Trash2, Pin, PinOff, Copy, Download, Reply, CheckSquare, Forward, SmilePlus, Eye } from 'lucide-svelte';
	import MessagePeopleItem from '$lib/components/chat/MessagePeopleItem.svelte';
	import QuickReactStrip from '$lib/components/emoji/QuickReactStrip.svelte';
	import { MESSAGE_POPUP_W } from '$lib/components/chat/MessagePeoplePopup.svelte';
	import type { PersonRow } from '$lib/utils/messageMenu.js';
	import { i18n } from '$lib/i18n/i18n.svelte.js';

	const t = $derived(i18n.t);

	interface Props {
		/** The message the menu acts on, restated above it. */
		preview: Snippet;
		/** Selection mode offers only "Select" — every other action is hidden. */
		selectOnly?: boolean;
		isPinned?: boolean;
		canEdit?: boolean;
		canCopy?: boolean;
		/** Label for the download item; null hides it. */
		downloadLabel?: string | null;
		myReactionEmoji?: string | null;
		reactorRows?: ReactorRow[];
		reactionsTotalCount?: number;
		seenBy?: SeenByEntry[];
		onclose: () => void;
		onpin?: () => void;
		onunpin?: () => void;
		onreply?: () => void;
		onforward?: () => void;
		oncopy?: () => void;
		ondownload?: () => void;
		onedit?: () => void;
		ondelete?: () => void;
		onreact?: (emoji: string) => void;
		onopenemoji?: () => void;
		onselect?: () => void;
		onuserclick?: (userId: string) => void;
	}

	let {
		preview,
		selectOnly = false,
		isPinned = false,
		canEdit = false,
		canCopy = false,
		downloadLabel = null,
		myReactionEmoji = null,
		reactorRows = [],
		reactionsTotalCount = 0,
		seenBy = [],
		onclose,
		onpin,
		onunpin,
		onreply,
		onforward,
		oncopy,
		ondownload,
		onedit,
		ondelete,
		onreact,
		onopenemoji,
		onselect,
		onuserclick,
	}: Props = $props();

	let menuEl = $state<HTMLDivElement>();

	/* The menu itself is centred in CSS, so the only placement decision left is
	 * which side the hover popups (reactors, seen-by) fly out to. */
	let menuFlipX = $state(false);

	$effect(() => {
		if (!menuEl) return;
		menuFlipX = menuEl.getBoundingClientRect().right + MESSAGE_POPUP_W > window.innerWidth;
	});

	const reactorPeople = $derived(
		reactorRows.map((r): PersonRow => ({ ...r, at: r.reactedAt })),
	);
	const seenByPeople = $derived(
		seenBy.map((s): PersonRow => ({ ...s, at: s.seenAt })),
	);

	function closeMenu() {
		// The flyouts die with the overlay, so there is nothing else to dismiss.
		onclose();
	}

	/** Every item dismisses the menu before it acts. */
	function run(action?: () => void) {
		closeMenu();
		action?.();
	}

	function pickUser(userId: string) {
		closeMenu();
		onuserclick?.(userId);
	}

	/** Taken off a real icon rather than spelled out — every lucide icon shares it. */
	type IconComponent = typeof Pencil;

	type MenuItem = {
		icon: IconComponent;
		label: string;
		run: () => void;
		danger?: boolean;
	};

	// The plain action items, as data — they differ only in icon, label and
	// handler, and which of them appear is a matter of what the caller passed.
	const items = $derived.by((): MenuItem[] => {
		if (selectOnly) return [];
		const list: MenuItem[] = [
			isPinned
				? { icon: PinOff, label: t.chat.unpin, run: () => run(onunpin) }
				: { icon: Pin, label: t.chat.pin, run: () => run(onpin) },
			{ icon: Reply, label: t.chat.reply, run: () => run(onreply) },
		];
		if (onforward) list.push({ icon: Forward, label: t.chat.forward, run: () => run(onforward) });
		if (canCopy) list.push({ icon: Copy, label: t.chat.copyText, run: () => run(oncopy) });
		if (downloadLabel) list.push({ icon: Download, label: downloadLabel, run: () => run(ondownload) });
		if (canEdit) list.push({ icon: Pencil, label: t.chat.edit, run: () => run(onedit) });
		list.push({ icon: Trash2, label: t.chat.delete, run: () => run(ondelete), danger: true });
		return list;
	});
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="context-overlay" onclick={closeMenu} oncontextmenu={(e) => { e.preventDefault(); closeMenu(); }}>
	{@render preview()}
	<div class="context-menu" bind:this={menuEl}>
		{#if !selectOnly && reactorPeople.length > 0}
			<MessagePeopleItem
				icon={SmilePlus}
				rows={reactorPeople}
				countLabel={t.chat.reactionsCount(reactionsTotalCount)}
				flipX={menuFlipX}
				onpick={pickUser}
			/>
		{/if}
		{#if !selectOnly && seenByPeople.length > 0}
			<MessagePeopleItem
				icon={Eye}
				rows={seenByPeople}
				countLabel={t.chat.seenByCount(seenBy.length)}
				flipX={menuFlipX}
				onpick={pickUser}
			/>
		{/if}
		{#if !selectOnly && onreact}
			<QuickReactStrip
				{myReactionEmoji}
				onreact={(emoji) => run(() => onreact?.(emoji))}
				onmore={onopenemoji ? () => run(onopenemoji) : undefined}
			/>
		{/if}
		{#each items as item (item.label)}
			{@const Icon = item.icon}
			<button class="context-item body-sm text-default" class:danger={item.danger} onclick={item.run}>
				<Icon size={16} />
				{item.label}
			</button>
		{/each}
		{#if onselect}
			<button class="context-item body-sm text-default" onclick={() => run(onselect)}>
				<CheckSquare size={16} />
				{t.chat.select}
			</button>
		{/if}
	</div>
</div>

<style lang="scss">
	@use '$lib/styles/glass.mixin' as *;
	@use '$lib/styles/button.mixin' as *;

	.context-overlay {
		position: fixed;
		inset: 0;
		z-index: var(--z-message-overlay);
		/* The menu no longer touches what it acts on, so the scrim is what ties
		   it to the message and reads it as modal rather than floating loose. */
		background: rgba(0, 0, 0, 0.8);
		/* Menu and preview centre as one stack. The hover popups are fixed, so
		   they sit outside this flow and keep their own anchored placement. */
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--sp-3);
		padding: var(--sp-4);
	}

	.context-menu {
		position: relative;
		background: var(--c-bg-2);
		border: 1px solid var(--c-border);
		border-radius: var(--radius-md);
		padding: var(--sp-1);
		min-width: 140px;
		/* Menu keeps priority over the preview when the two can't both fit. */
		max-width: 100%;
		max-height: 70%;
		flex-shrink: 0;
		overflow-y: auto;
		box-shadow: var(--shadow-xl);
		z-index: var(--z-message-menu);
		@include glass-less;
	}

	.context-item {
		@include context-item;
	}

	.context-item.danger {
		color: var(--c-error);
	}

</style>
