<script lang="ts">
	import Avatar from '$lib/components/user/Avatar.svelte';
	import { i18n } from '$lib/i18n/i18n.svelte.js';

	const t = $derived(i18n.t);

	// A group in the "my groups" list: identity on the left, your standing in it
	// on the right.
	interface Props {
		name: string;
		avatarUrl: string | null;
		description?: string | null;
		role: 'owner' | 'admin' | 'member';
		onclick: () => void;
	}

	let { name, avatarUrl, description, role, onclick }: Props = $props();
</script>

<button type="button" class="group-row" {onclick}>
	<Avatar {name} {avatarUrl} size={40} />
	<span class="group-row-meta">
		<span class="body-sm fw-medium">{name}</span>
		<span class="group-row-sub body-xs text-faint">{description || t.groupsPage.groupChat}</span>
	</span>
	<span class="group-row-badge body-xs badge-{role} text-muted">{t.groupsPage.roles[role]}</span>
</button>

<style>
	.group-row {
		width: 100%;
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		padding: var(--sp-3);
		background: var(--c-bg-2);
		border: none;
		border-radius: var(--radius-md);
		text-align: left;
		cursor: pointer;
		transition: background var(--duration-fast) var(--ease-default);
	}

	.group-row:hover { background: var(--c-bg-3); }

	.group-row-meta {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}

	.group-row-sub {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.group-row-badge {
		flex-shrink: 0;
		padding: 2px 8px;
		border-radius: var(--radius-full);
		background: var(--c-bg-3);
		text-transform: capitalize;
	}

	.badge-owner { background: var(--c-accent); color: var(--c-text-inverse); }
	.badge-admin { background: var(--c-accent-subtle); color: var(--c-accent-text); }
</style>
