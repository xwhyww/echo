<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import FriendActionButtons from '$lib/components/friends/FriendActionButtons.svelte';
	import ProfileDetailRow from '$lib/components/user/ProfileDetailRow.svelte';
	import UserProfileCard from '$lib/components/user/UserProfileCard.svelte';
	import UndoBar from '$lib/components/ui/UndoBar.svelte';
	import { formatPhone } from '$lib/utils.js';
	import { i18n } from '$lib/i18n/i18n.svelte.js';
	import type { useUserProfile } from '$lib/hooks/user/useUserProfile.svelte.js';

	const t = $derived(i18n.t);

	// Everything below the load state on someone's profile. Restricted profiles
	// keep the card and the friendship actions but lose the avatars, presence
	// and contact details — the server never sent them.
	interface Props {
		profile: ReturnType<typeof useUserProfile>;
	}

	let { profile }: Props = $props();

	const user = $derived(profile.user!);
</script>

<UserProfileCard
	{user}
	displayName={profile.displayName}
	avatars={profile.avatars}
	showPresence={!profile.restricted}
>
	{#snippet actions()}
		{#if profile.isMe}
			<Button variant="ghost" onclick={profile.editProfile}>
				{t.userProfile.editProfile}
			</Button>
		{:else}
			<FriendActionButtons
				friendship={profile.friendship}
				onmessage={profile.message}
				onremove={profile.startRemove}
				allowRemove={!profile.restricted}
			/>
		{/if}
	{/snippet}
</UserProfileCard>

{#if profile.restricted}
	<p class="body-sm text-faint">{t.chat.privateProfile}</p>
{:else}
	{#if user.username}
		<ProfileDetailRow label={t.userProfile.userId} text={'@' + user.username}>
			@{user.username}
		</ProfileDetailRow>
	{/if}

	{#if user.email}
		<ProfileDetailRow label={t.userProfile.email} text={user.email}>
			{user.email}
		</ProfileDetailRow>
	{/if}

	{#if user.phone}
		<ProfileDetailRow label={t.userProfile.phone} text={user.phone}>
			{formatPhone(user.phone)}
		</ProfileDetailRow>
	{/if}
{/if}

{#if profile.pendingRemove}
	<UndoBar
		message={t.friendsPage.removingFriend}
		onconfirm={profile.commitRemove}
		oncancel={profile.cancelRemove}
	/>
{/if}
