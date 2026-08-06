<script lang="ts">
	import { goto } from '$app/navigation';
	import { auth } from '$lib/stores/auth.svelte.js';
	import { friendsStore } from '$lib/stores/friends.svelte.js';
	import UserInfo from '$lib/components/user/UserInfo.svelte';
	import { User, Users, MessagesSquare, UserPlus } from 'lucide-svelte';
	import { getActiveSidebar } from '$lib/stores/sidebar.svelte.js';
	import { useSlidingPill } from '$lib/hooks/ui/useSlidingPill.svelte.js';
	import { routes } from '$lib/routes.js';
	import { i18n } from '$lib/i18n/i18n.svelte.js';

	const t = $derived(i18n.t);

	// The first three tabs all lead to the same chat list — they only set the
	// filter it reads off the query. Friends is a tab like them, it only looks
	// different because it carries a count. Listing it here is also what makes
	// the pill's "is the active route even on this bar" check a question about
	// `tabs`.
	const tabs = $derived([
		{ id: 'pc', path: routes.chats.list('personal'), icon: User, title: t.nav.personalChats, badge: 0 },
		{ id: 'gr', path: routes.chats.list('groups'), icon: Users, title: t.nav.groups, badge: 0 },
		{ id: 'ac', path: routes.chats.list(), icon: MessagesSquare, title: t.nav.allChats, badge: 0 },
		{
			id: 'friends',
			path: routes.friends.root,
			icon: UserPlus,
			title: t.nav.friends,
			badge: friendsStore.incomingCount,
		},
	]);

	const activeTab = $derived(getActiveSidebar());

	// One highlight glides between the buttons instead of each lighting up on
	// its own: it follows the hovered tab and settles back on the active one
	// when the cursor leaves.
	let hovered = $state<string | null>(null);
	const pillTarget = $derived(
		hovered ?? (tabs.some((tab) => tab.id === activeTab) ? activeTab : null),
	);
	const pill = useSlidingPill(() => pillTarget);
</script>

<svelte:window onresize={pill.measure} />

<aside class="sidebar">
	<div class="sidebar-top">
		<nav class="tab-buttons" bind:this={pill.nav} onmouseleave={() => (hovered = null)}>
			<span
				class="tab-pill"
				class:animated={pill.animated}
				class:visible={pill.box.visible}
				style="transform: translate({pill.box.x}px, {pill.box.y}px); width: {pill.box.w}px; height: {pill.box.h}px"
			></span>
			{#each tabs as tab (tab.id)}
				{@const Icon = tab.icon}
				<!-- The icon inverts exactly when the pill arrives under it, so it
				     follows the pill's target rather than the active route. -->
				<button
					class="tab-btn {pillTarget === tab.id ? 'text-inverse' : 'text-faint'}"
					bind:this={pill.items[tab.id]}
					onmouseenter={() => (hovered = tab.id)}
					onclick={() => goto(tab.path)}
					title={tab.title}
				>
					<span class="tab-icon">
						<Icon size={20} />
						{#if tab.badge > 0}
							<span class="tab-badge body-xxs fw-semibold lh-none text-inverse">{tab.badge}</span>
						{/if}
					</span>
				</button>
			{/each}
		</nav>
	</div>

	<div class="sidebar-bottom">
		<button class="user-trigger" onclick={() => goto(routes.settings)} title={t.settings.title}>
			<UserInfo
				displayName={auth.user?.displayName}
				username={auth.user?.username}
				avatarUrl={auth.user?.avatarUrl}
				showName={false}
				size="sidebar"
			/>
		</button>
	</div>
</aside>

<style lang="scss">
	@use '$lib/styles/glass.mixin' as *;

	.sidebar {
		height: 100vh;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;

		flex-shrink: 0;
	}

	/* Mobile: the vertical icon rail becomes a horizontal bottom tab bar. */
	@media (max-width: 767px) {
		.sidebar {
			width: 100%;
			height: calc(var(--bottom-nav-h) + var(--safe-bottom) + 12px);
			flex-direction: row;
			position: absolute;
			bottom: calc(var(--safe-bottom) + var(--sp-2));
			/* Float above .main-content — it's position:relative and later in
			   the DOM, so without this the page overlays the bar and eats
			   every tap (broken nav on /friends and /profile). */
			z-index: var(--z-sticky);
		}

		.sidebar-top {
			flex-direction: row;
			gap: var(--sp-2);
		}

		.tab-buttons {
			flex-direction: row;
			gap: var(--sp-2);
		}

		.sidebar-bottom {
			flex-direction: row;
		}
	}

	.sidebar-top {
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: var(--sp-3);

		/* Same glass treatment as the header back button. */
		@include glass;
		padding: var(--sp-2) var(--sp-2);
		border-radius: 32px;
		width: 100%;
	}

	.sidebar-bottom {
		display: flex;
		flex-direction: column;
		align-items: center;

		margin-left: 8px;
		border-radius: 32px;
	}

	.tab-buttons {
		display: flex;
		flex-direction: row;
		gap: var(--sp-1);
		width: 100%;
		/* Anchor for the sliding pill. */
		position: relative;
	}

	/* The single highlight that glides between tabs. Painted behind the
	   buttons; position/size come from inline styles measured off the target. */
	.tab-pill {
		position: absolute;
		top: 0;
		left: 0;
		background: var(--c-accent-sidebar);
		border-radius: 32px;
		opacity: 0;
		will-change: transform;
		pointer-events: none;
	}

	.tab-pill.visible {
		opacity: 1;
	}

	.tab-pill.animated {
		transition:
			transform var(--duration-slow) cubic-bezier(0.3, 0.9, 0.3, 1.15),
			width var(--duration-slow) cubic-bezier(0.3, 0.9, 0.3, 1.15),
			height var(--duration-slow) cubic-bezier(0.3, 0.9, 0.3, 1.15),
			opacity var(--duration-fast) var(--ease-default);
	}

	.tab-btn {
		width: 100%;
		height: 50px;
		display: flex;
		align-items: center;
		justify-content: center;
		text-decoration: none;
		/* Above the pill so icons stay visible while it slides underneath. */
		position: relative;
		z-index: 1;
		transition: color var(--duration-base) var(--ease-default);
	}

	.user-trigger {
		transition: background var(--duration-fast) var(--ease-default);

		@include glass;
		border-radius: 50%;
	}

	.tab-icon {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.tab-badge {
		position: absolute;
		top: -6px;
		right: -8px;
		min-width: 16px;
		height: 16px;
		padding: 0 4px;
		border-radius: var(--radius-full);
		background: var(--c-accent);
		display: flex;
		align-items: center;
		justify-content: center;
	}

</style>
