<script lang="ts">
	import SidebarItem from '$lib/components/sidebar/SidebarItem.svelte';
	import SidebarVoiceAccordion from '$lib/components/sidebar/SidebarVoiceAccordion.svelte';
	import { ChevronRight, ChevronDown } from 'lucide-svelte';
	import { gotoKeepSearch, lastMessageLabel, lastMessageIcon } from '$lib/utils.js';
	import { routes } from '$lib/routes.js';
	import { authorPrefix } from '$lib/utils/groupRow.js';
	import { auth } from '$lib/stores/auth.svelte.js';
	import { useSidebarVoiceChannels } from '$lib/hooks/voice/useSidebarVoiceChannels.svelte.js';
	import { i18n } from '$lib/i18n/i18n.svelte.js';
	import type { GroupListItem } from '$lib/stores/groups.svelte.js';

	const t = $derived(i18n.t);

	interface Props {
		group: GroupListItem;
		active: boolean;
		subtitle?: string;
	}

	let { group, active, subtitle }: Props = $props();

	const voice = useSidebarVoiceChannels(() => group.id);

	// The last-message summary wins whenever there's been a message at all; the
	// caller's `subtitle` (typically the description) only stands in for a group
	// nobody has written in yet.
	const messageLabel = $derived(lastMessageLabel(group.lastMessage));
	const effectiveSubtitle = $derived(
		messageLabel
			? `${authorPrefix(group.lastMessage, auth.user?.id)}${messageLabel}`
			: (subtitle ?? t.chat.groupChat),
	);

	// Suppressed on the description fallback — the icon belongs to the message
	// summary, not to whatever stands in for it.
	const subtitleIcon = $derived(messageLabel ? lastMessageIcon(group.lastMessage) : undefined);

	function toggle(e: MouseEvent) {
		e.stopPropagation();
		voice.toggle();
	}
</script>

<div class="g-row" class:expanded={voice.expanded}>
	<div class="g-row-head">
		<SidebarItem
			name={group.name}
			avatarUrl={group.avatarUrl}
			subtitle={effectiveSubtitle}
			{subtitleIcon}
			badge={group.unreadCount > 0 ? group.unreadCount : null}
			timestamp={group.lastMessage?.createdAt ?? null}
			messageRead={group.isLastMessageRead ?? null}
			{active}
			onclick={() => gotoKeepSearch(routes.chats.group(group.id))}
		/>
		<button
			type="button"
			class="g-toggle text-faint"
			onclick={toggle}
			title={voice.expanded ? t.sidebar.hideVoiceChannels : t.sidebar.showVoiceChannels}
		>
			{#if voice.expanded}
				<ChevronDown size={14} />
			{:else}
				<ChevronRight size={14} />
			{/if}
		</button>
	</div>

	{#if voice.expanded}
		<SidebarVoiceAccordion {voice} />
	{/if}
</div>

<style>
	.g-row-head {
		position: relative;
	}

	.g-toggle {
		position: absolute;
		right: var(--sp-3);
		bottom: var(--sp-1);
		width: 22px;
		height: 22px;
		border: none;
		border-radius: var(--radius-sm);
		background: transparent;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		opacity: 0;
		transition:
			opacity var(--duration-fast) var(--ease-default),
			background var(--duration-fast) var(--ease-default),
			color var(--duration-fast) var(--ease-default);
	}

	/* Hidden until the row is hovered so the list stays quiet, but pinned open
	   while the accordion is expanded — otherwise the only way to collapse it
	   would be to find an invisible button. */
	.g-row-head .g-toggle,
	.g-row.expanded .g-toggle,
	.g-toggle:focus-visible {
		opacity: 1;
	}

	.g-toggle:hover {
		background: var(--c-bg-3);
		color: var(--c-text);
	}
</style>
