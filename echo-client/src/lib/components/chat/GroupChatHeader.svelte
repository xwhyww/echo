<script lang="ts">
	import { Users } from 'lucide-svelte';
	import Avatar from '$lib/components/user/Avatar.svelte';
	import BackButton from '$lib/components/ui/BackButton.svelte';
	import { routes } from '$lib/routes.js';
	import { i18n } from '$lib/i18n/i18n.svelte.js';
	import type { Group } from '$lib/api/groups.js';

	const t = $derived(i18n.t);

	// The bar floating over a group conversation. The whole bar opens the group's
	// info page; the avatar on the right is a separate target for its settings.
	interface Props {
		group: Group | null;
		memberCount: number;
		onopeninfo: () => void;
		onopensettings: () => void;
	}

	let { group, memberCount, onopeninfo, onopensettings }: Props = $props();
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="chat-header" onclick={onopeninfo}>
	<div class="chat-header-back">
		<BackButton backHref={routes.chats.root} size={48} />
	</div>

	<div class="header-info">
		<div class="header-text">
			<h2 class="body-sm">{group?.name ?? '...'}</h2>
			<span class="body-xs text-faint">
				<Users size={12} />
				{t.groupInfo.memberCount(memberCount)}
			</span>
		</div>
	</div>

	<div class="header-actions">
		<button
			class="header-avatar-btn"
			onclick={(e) => {
				e.stopPropagation();
				onopensettings();
			}}
			title={t.groupInfo.groupSettings}
			aria-label={t.groupInfo.groupSettings}
		>
			<Avatar name={group?.name ?? '?'} avatarUrl={group?.avatarUrl ?? null} size={48} />
		</button>
	</div>
</div>

<style lang="scss">
	@use '$lib/styles/glass.mixin' as *;
	@use '$lib/styles/chat-layout.mixin' as *;
	@use '$lib/styles/layout.mixin' as *;

	.chat-header {
		@include chat-header-overlay;
		justify-content: space-between;
		cursor: pointer;
		padding: var(--safe-top) var(--sp-2) 0;
	}

	.header-info {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--sp-3);
		padding: 0 var(--sp-10);
		border-radius: var(--radius-full);
		height: 48px;

		@include glass;
	}

	.header-text {
		display: flex;
		flex-direction: column;
		text-align: center;
	}

	.header-text h2 {
		margin: 0;
	}

	.header-text span {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		/* Pulls the count up against the name — they read as one block. */
	}

	.header-actions {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		padding: 2px;
	}

	.header-avatar-btn {
		width: 32px;
		height: 32px;
		border-radius: var(--radius-full);
		background: transparent;
		cursor: pointer;
		transition: background var(--duration-fast) var(--ease-default);

		@include flex-center;
		@include glass;
	}

	.header-avatar-btn:hover {
		background: var(--c-bg-3);
	}
</style>
