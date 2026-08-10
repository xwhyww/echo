<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Check, CheckCheck } from 'lucide-svelte';
	import Avatar from '$lib/components/user/Avatar.svelte';
	import AppleEmoji from '$lib/components/emoji/AppleEmoji.svelte';
	import AppleEmojiText from '$lib/components/emoji/AppleEmojiText.svelte';
	import {
		formatDateTime,
		formatDayMonthNumeric,
		formatTime,
		formatWeekday,
		isSameDay,
	} from '$lib/utils/datetime.js';
	import { i18n } from '$lib/i18n/i18n.svelte.js';

	const t = $derived(i18n.t);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	type AnyComponent = any;

	interface Props {
		name: string;
		active?: boolean;
		avatarUrl?: string | null;
		icon?: AnyComponent;
		subtitle?: string | null;
		// Small lucide icon drawn just before the subtitle text, e.g. a mic for
		// a voice-message summary.
		subtitleIcon?: AnyComponent;
		subtitleAccent?: boolean;
		online?: boolean | null;
		badge?: string | number | null;
		messageRead?: boolean | null;
		timestamp?: string | null;
		reactionEmoji?: string | null;
		onclick?: () => void;
		size?: string;
		chatName?: string | null;
		trailing?: Snippet;
		// Destructive action styling (red text), e.g. "Log out".
		danger?: boolean;
		// Skip the leading Avatar/icon block entirely.
		noAvatar?: boolean;
	}

	let {
		name,
		active = false,
		avatarUrl = null,
		icon,
		subtitle = null,
		subtitleIcon = undefined,
		subtitleAccent = false,
		online = null,
		badge = null,
		messageRead = null,
		timestamp = null,
		reactionEmoji = null,
		chatName = null,
		onclick,
		size = 'sm',
		trailing,
		danger = false,
		noAvatar = false,
	}: Props = $props();

	function handleKey(e: KeyboardEvent) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			onclick?.();
		}
	}

	const avatarSize = $derived(size === 's' ? 48 : 48);

	// Narrows as the message ages: clock today, weekday within the week, date
	// beyond it. Formatted against the app's language, not the browser's — the
	// hour cycle has to match the rest of the UI.
	function formatTimestamp(iso: string, locale: string): string {
		const d = new Date(iso);
		if (Number.isNaN(d.getTime())) return '';
		const now = new Date();
		if (isSameDay(d, now)) return formatTime(iso, locale);
		const diffDays = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
		if (diffDays < 7) return formatWeekday(iso, locale);
		return formatDayMonthNumeric(iso, locale);
	}

	const timestampLabel = $derived(timestamp ? formatTimestamp(timestamp, i18n.locale) : '');
	const timestampTitle = $derived(timestamp ? formatDateTime(timestamp, i18n.locale) : '');
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="sidebar-item body-sm text-muted" class:active class:danger role="button" tabindex="0" {onclick} onkeydown={handleKey}>
	{#if !noAvatar}
		<Avatar {name} {avatarUrl} {icon} {online} size={avatarSize}/>
	{/if}

	{#if subtitle}
		<div class="item-info">
			<span class="item-name truncate body-xs">{chatName || name}</span>
			<span class="item-subtitle truncate body-xs text-faint" class:accent={subtitleAccent}>
				{#if messageRead !== null}
					<span class="msg-status text-faint" class:read={messageRead}>
						{#if messageRead}
							<CheckCheck size={14} />
						{:else}
							<Check size={14} />
						{/if}
					</span>
				{/if}
				{#if subtitleIcon}
					{@const SubtitleIcon = subtitleIcon}
					<span class="subtitle-icon text-faint"><SubtitleIcon size={12} /></span>
				{/if}
				<AppleEmojiText text={subtitle} size={14} />
			</span>
		</div>
		<div class="item-meta">
			{#if timestampLabel}
				<span class="item-timestamp body-xs lh-none text-faint" title={timestampTitle}>{timestampLabel}</span>
			{/if}
			{#if reactionEmoji}
				<span class="item-reaction body-sm lh-none" title={t.chat.newReaction}><AppleEmoji emoji={reactionEmoji} size={14} /></span>
			{/if}
		</div>
	{:else}
		<span class="item-name body-sm truncate">{name}</span>
	{/if}

	{#if badge}
		<span class="item-badge body-xs fw-semibold lh-none text-inverse">{badge}</span>
	{/if}

	{#if trailing}
		<span class="item-trailing">{@render trailing()}</span>
	{/if}
</div>

<style>
	.sidebar-item {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		padding: var(--sp-1) 0;
		border-radius: var(--radius-md);
		cursor: pointer;
		user-select: none;
		transition:
			color var(--duration-fast) var(--ease-default),
			background var(--duration-fast) var(--ease-default);
	}

	.sidebar-item:focus-visible {
		outline: 2px solid var(--c-accent-solid);
		outline-offset: -2px;
	}

	.item-trailing {
		display: flex;
		align-items: center;
		flex-shrink: 0;
	}

	.sidebar-item.danger {
		color: var(--c-error);
	}

	.item-info {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		min-width: 0;
		flex: 1;
	}

	.item-name {
		min-width: 0;
		text-align: left;
	}

	.item-meta {
		position: relative;
		align-self: stretch;
		flex-shrink: 0;
		min-width: 100px;
	}

	.item-timestamp {
		display: block;
		text-align: right;
		margin-top: 4px;
	}

	.item-subtitle {
		width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		text-align: left;
		margin-top: 4px;
	}

	.item-subtitle.accent {
		color: var(--c-accent, #25939d);
	}

	.msg-status {
		display: inline-flex;
		margin-right: 2px;
		vertical-align: middle;
	}

	.subtitle-icon {
		display: inline-flex;
		margin-right: 3px;
		vertical-align: middle;
	}

	.msg-status.read {
		color: var(--c-accent, #25939d);
	}

	.item-reaction {
		position: absolute;
		right: 0;
		bottom: 4px;
	}

	.item-badge {
		background: var(--c-accent);
		margin-left: auto;
		min-width: 18px;
		height: 18px;
		padding: 0 5px;
		border-radius: var(--radius-full);
		display: flex;
		align-items: center;
		justify-content: center;
	}
</style>
