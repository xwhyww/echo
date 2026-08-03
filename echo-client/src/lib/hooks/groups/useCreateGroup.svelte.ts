import { groupsService } from '$lib/api/groupsService.js';
import { groupsStore } from '$lib/stores/groups.svelte.js';
import { friendsService } from '$lib/api/friendsService.js';
import { userService } from '$lib/api/userService.js';
import { toasts } from '$lib/stores/toasts.svelte.js';
import { useUserSearch } from '$lib/hooks/user/useUserSearch.svelte.js';
import { gotoKeepSearch } from '$lib/utils.js';
import { routes } from '$lib/routes.js';
import { i18n } from '$lib/i18n/i18n.svelte.js';

export interface PickableUser {
	id: string;
	username: string;
	displayName: string | null;
	avatarUrl: string | null;
}

function toPickable(u: {
	id: string;
	username: string;
	displayName?: string | null;
	avatarUrl?: string | null;
}): PickableUser {
	return {
		id: u.id,
		username: u.username,
		displayName: u.displayName ?? null,
		avatarUrl: u.avatarUrl ?? null,
	};
}

/**
 * The create-group flow: the draft, who to invite, and the two places those
 * people come from — your friends (fetched once, filtered locally) and a search
 * across everyone else.
 */
export function useCreateGroup(onclose: () => void) {
	const t = $derived(i18n.t);
	const search = useUserSearch();

	let name = $state('');
	let description = $state('');
	let selected = $state<PickableUser[]>([]);
	let creating = $state(false);

	let friends = $state<PickableUser[]>([]);
	let friendsLoading = $state(true);

	const selectedIds = $derived(new Set(selected.map((u) => u.id)));

	const visibleFriends = $derived.by(() => {
		const q = search.query.trim().toLowerCase();
		if (!q) return friends;
		return friends.filter(
			(f) =>
				f.username.toLowerCase().includes(q)
				|| (f.displayName ?? '').toLowerCase().includes(q),
		);
	});

	// The search endpoint doesn't know who your friends are, so drop anyone
	// already listed in the section above.
	const otherUsers = $derived(
		search.results.map(toPickable).filter((r) => !friends.some((f) => f.id === r.id)),
	);

	const searchActive = $derived(search.query.trim().length >= 2);

	// Mounting is opening — the modal only exists while the flow is running.
	$effect(() => {
		void loadFriends();
	});

	async function loadFriends() {
		friendsLoading = true;
		try {
			const { items } = await friendsService.listFriends({ limit: 200 });
			if (items.length === 0) {
				friends = [];
				return;
			}
			const { users } = await userService.getBulk(items.map((i) => i.userId));
			friends = users.map(toPickable);
		} catch (err) {
			console.error('[useCreateGroup] load friends failed', err);
			toasts.error(t.groupsPage.loadFriendsFailed);
		} finally {
			friendsLoading = false;
		}
	}

	return {
		get name() { return name; },
		set name(v: string) { name = v; },
		get description() { return description; },
		set description(v: string) { description = v; },
		get query() { return search.query; },
		set query(v: string) { search.query = v; },
		onQueryInput: search.handleInput,

		get creating() { return creating; },
		get friendsLoading() { return friendsLoading; },
		get hasFriends() { return friends.length > 0; },
		get visibleFriends() { return visibleFriends; },
		get otherUsers() { return otherUsers; },
		get searchActive() { return searchActive; },
		get searching() { return search.searching; },
		get selected() { return selected; },
		isSelected(id: string) { return selectedIds.has(id); },

		toggle(u: PickableUser) {
			selected = selectedIds.has(u.id)
				? selected.filter((s) => s.id !== u.id)
				: [...selected, u];
		},
		deselect(id: string) {
			selected = selected.filter((s) => s.id !== id);
		},

		async submit() {
			const trimmed = name.trim();
			if (!trimmed || creating) return;
			creating = true;
			try {
				const { group } = await groupsService.create({
					name: trimmed,
					description: description.trim() || undefined,
				});
				groupsStore.upsert(group);

				// Invites are best-effort: the group exists either way, so report how
				// many failed rather than unwinding it.
				const results = await Promise.allSettled(
					selected.map((u) => groupsService.invite(group.id, u.id)),
				);
				const failed = results.filter((r) => r.status === 'rejected').length;
				if (failed > 0) toasts.error(t.groupsPage.invitesFailed(failed));

				onclose();
				gotoKeepSearch(routes.chats.group(group.id));
			} catch (err) {
				console.error('[useCreateGroup] failed', err);
				toasts.error(t.groupsPage.createFailed);
			} finally {
				creating = false;
			}
		},
	};
}
