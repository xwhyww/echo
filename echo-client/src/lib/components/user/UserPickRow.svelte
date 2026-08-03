<script lang="ts">
	import Avatar from '$lib/components/user/Avatar.svelte';

	// One selectable person in a multi-select picker. The whole row toggles, so
	// the checkbox is a readout rather than a separate target.
	interface Props {
		name: string;
		username: string;
		avatarUrl: string | null;
		checked: boolean;
		onclick: () => void;
	}

	let { name, username, avatarUrl, checked, onclick }: Props = $props();
</script>

<button type="button" class="pick-row" class:checked {onclick} aria-pressed={checked}>
	<Avatar {name} {avatarUrl} size={32} />
	<span class="pick-row-meta">
		<span class="pick-row-name body-sm fw-medium">{name}</span>
		<span class="pick-row-sub body-xs text-faint">@{username}</span>
	</span>
	<input type="checkbox" {checked} tabindex="-1" readonly />
</button>

<style>
	.pick-row {
		width: 100%;
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		padding: var(--sp-2);
		border: none;
		border-radius: var(--radius-sm);
		background: transparent;
		text-align: left;
		cursor: pointer;
		transition: background var(--duration-fast) var(--ease-default);
	}

	.pick-row:hover { background: var(--c-bg-3); }
	.pick-row.checked { background: var(--c-accent-subtle); }

	.pick-row-meta {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}

	.pick-row-name,
	.pick-row-sub {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.pick-row input[type='checkbox'] {
		width: 16px;
		height: 16px;
		accent-color: var(--c-accent-solid);
		pointer-events: none;
	}
</style>
