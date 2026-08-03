import type { Group, GroupInvite, GroupMessage, GroupListLastMessage } from '$lib/api/groups.js';

// Sidebar-friendly group entry. `lastMessage` is the slim shape returned by
// /groups for cheap previews; once a full GroupMessage arrives (via WS or a
// detail fetch) it replaces this in-place since GroupMessage is a superset of
// the fields the sidebar reads.
interface GroupListItem extends Group {
	lastMessage: GroupListLastMessage | GroupMessage | null;
	unreadCount: number;
	isLastMessageRead?: boolean | null;
}

let list = $state<GroupListItem[]>([]);
let loaded = $state(false);
let invites = $state<GroupInvite[]>([]);

export const groupsStore = {
	get list() { return list; },
	get loaded() { return loaded; },
	get invites() { return invites; },
	get incomingCount() { return invites.length; },

	setList(groups: Group[]) {
		const prev = new Map(list.map((g) => [g.id, g]));
		list = groups.map((g) => {
			const cached = prev.get(g.id);
			// Trust server-provided lastMessage / unreadCount when present —
			// they're the source of truth on first load. Fall back to whatever
			// the WS feed had built up otherwise (e.g. groups created in this
			// session before a refresh).
			return {
				...g,
				lastMessage: g.lastMessage !== undefined ? g.lastMessage : (cached?.lastMessage ?? null),
				unreadCount: typeof g.unreadCount === 'number' ? g.unreadCount : (cached?.unreadCount ?? 0),
				isLastMessageRead:
					g.isLastMessageRead !== undefined ? g.isLastMessageRead : cached?.isLastMessageRead,
			};
		});
		loaded = true;
	},

	upsert(group: Group, opts?: { lastMessage?: GroupMessage | null; bumpUnread?: boolean }) {
		const idx = list.findIndex((g) => g.id === group.id);
		if (idx === -1) {
			list = [{
				...group,
				lastMessage: opts?.lastMessage ?? null,
				unreadCount: opts?.bumpUnread ? 1 : 0,
			}, ...list];
		} else {
			const prev = list[idx];
			const next = {
				...prev,
				...group,
				lastMessage: opts?.lastMessage !== undefined ? opts.lastMessage : prev.lastMessage,
				unreadCount: opts?.bumpUnread ? prev.unreadCount + 1 : prev.unreadCount,
			};
			const without = list.slice(0, idx).concat(list.slice(idx + 1));
			list = [next, ...without];
		}
	},

	patch(groupId: string, patch: Partial<Group>) {
		list = list.map((g) => (g.id === groupId ? { ...g, ...patch } : g));
	},

	remove(groupId: string) {
		list = list.filter((g) => g.id !== groupId);
	},

	updateLastMessage(groupId: string, msg: GroupMessage, bumpUnread: boolean) {
		const idx = list.findIndex((g) => g.id === groupId);
		if (idx === -1) return;
		const updated = {
			...list[idx],
			lastMessage: msg,
			unreadCount: bumpUnread ? list[idx].unreadCount + 1 : list[idx].unreadCount,
		};
		const without = list.slice(0, idx).concat(list.slice(idx + 1));
		list = [updated, ...without];
	},

	clearUnread(groupId: string) {
		list = list.map((g) => (g.id === groupId ? { ...g, unreadCount: 0 } : g));
	},

	setInvites(next: GroupInvite[]) { invites = next; },
	addInvite(inv: GroupInvite) {
		if (invites.some((i) => i.id === inv.id)) return;
		invites = [inv, ...invites];
	},
	removeInvite(inviteId: string) { invites = invites.filter((i) => i.id !== inviteId); },

	reset() {
		list = [];
		loaded = false;
		invites = [];
	},
};

export type { GroupListItem };
