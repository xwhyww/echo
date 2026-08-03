<script lang="ts">
	import Avatar from '$lib/components/user/Avatar.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { i18n } from '$lib/i18n/i18n.svelte.js';

	const t = $derived(i18n.t);

	// One pending invitation: which group, who asked, and the two answers.
	interface Props {
		groupName: string;
		groupAvatarUrl?: string | null;
		inviterUsername: string;
		busy?: boolean;
		onaccept: () => void;
		ondecline: () => void;
	}

	let {
		groupName,
		groupAvatarUrl = null,
		inviterUsername,
		busy = false,
		onaccept,
		ondecline,
	}: Props = $props();
</script>

<li class="row">
	<Avatar name={groupName} avatarUrl={groupAvatarUrl} size={42} />
	<div class="meta">
		<div class="fw-medium truncate">{groupName}</div>
		<div class="body-sm text-faint truncate">{t.invites.invitedBy(inviterUsername)}</div>
	</div>
	<div class="actions">
		<Button variant="primary" disabled={busy} onclick={onaccept}>{t.common.accept}</Button>
		<Button variant="ghost" disabled={busy} onclick={ondecline}>{t.common.decline}</Button>
	</div>
</li>

<style>
	.row {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		padding: var(--sp-3);
		background: var(--c-bg-2);
		border-radius: var(--radius-md);
	}

	.meta {
		flex: 1;
		min-width: 0;
	}

	.actions {
		display: flex;
		gap: var(--sp-2);
	}
</style>
