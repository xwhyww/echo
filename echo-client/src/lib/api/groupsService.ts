import { api, apiUpload } from './client.js';
import type { Group, GroupMember, GroupMessage, GroupInvite, GroupRole, GroupAttachment, GroupMessageReaction } from './groups.js';

class GroupsService {
	list() {
		return api<{ groups: Group[] }>('/groups');
	}

	create(input: { name: string; description?: string; isPublic?: boolean }) {
		return api<{ group: Group }>('/groups', { method: 'POST', body: input });
	}

	get(id: string) {
		return api<{ group: Group; members: GroupMember[] }>(`/groups/${id}`);
	}

	/**
	 * Sets the group picture, replacing whatever was there. A group keeps one:
	 * the server drops its claim on the previous blob as part of the swap, so
	 * there is no separate "delete the old one" call to make.
	 */
	uploadAvatar(id: string, file: File) {
		const formData = new FormData();
		formData.append('avatar', file);
		return apiUpload<{ group: Group }>(`/groups/${id}/avatar`, formData);
	}

	removeAvatar(id: string) {
		return api<{ group: Group }>(`/groups/${id}/avatar`, { method: 'DELETE' });
	}

	getStats(id: string) {
		return api<{
			messages: number;
			links: number;
			photos: number;
			videos: number;
			files: number;
			gifs: number;
			/** Uploaded audio files — excludes recorded voice notes. */
			audio: number;
			voiceMessages: number;
		}>(`/groups/${id}/stats`);
	}

	getLinks(id: string, cursor?: string | null, signal?: AbortSignal) {
		const params = new URLSearchParams();
		params.set('kind', 'links');
		if (cursor) params.set('cursor', cursor);
		return api<{
			items: { id: number; messageId: string; createdAt: string; url: string }[];
			hasMore: boolean;
			nextCursor: string | null;
		}>(`/groups/${id}/media?${params.toString()}`, { signal });
	}

	getMedia(id: string, kind: 'photos' | 'videos' | 'gifs' | 'audio' | 'files', cursor?: string | null, signal?: AbortSignal) {
		const params = new URLSearchParams();
		params.set('kind', kind);
		if (cursor) params.set('cursor', cursor);
		return api<{
			items: { messageId: string; createdAt: string; attachment: GroupAttachment }[];
			hasMore: boolean;
			nextCursor: string | null;
		}>(`/groups/${id}/media?${params.toString()}`, { signal });
	}

	update(id: string, patch: Partial<Pick<Group, 'name' | 'description' | 'avatarUrl' | 'isPublic' | 'invitePolicy' | 'messagePolicy' | 'pinPolicy' | 'editInfoPolicy' | 'historyVisible'>>) {
		return api<{ group: Group }>(`/groups/${id}`, { method: 'PATCH', body: patch });
	}

	remove(id: string) {
		return api<{ success: boolean }>(`/groups/${id}`, { method: 'DELETE' });
	}

	transfer(id: string, newOwnerId: string) {
		return api<{ success: boolean }>(`/groups/${id}/transfer`, {
			method: 'POST', body: { newOwnerId },
		});
	}

	listMembers(id: string) {
		return api<{ members: GroupMember[] }>(`/groups/${id}/members`);
	}

	updateMember(id: string, userId: string, patch: { role?: 'admin' | 'member'; nickname?: string | null }) {
		return api<{ success: boolean }>(`/groups/${id}/members/${userId}`, {
			method: 'PATCH', body: patch,
		});
	}

	removeMember(id: string, userId: string) {
		return api<{ success: boolean }>(`/groups/${id}/members/${userId}`, { method: 'DELETE' });
	}

	leave(id: string, selfId: string) {
		return this.removeMember(id, selfId);
	}

	// Invites
	invite(id: string, userId: string) {
		return api<{ invite: { id: string; groupId: string; inviterId: string; inviteeId: string; status: string; createdAt: string } }>(
			`/groups/${id}/invites`, { method: 'POST', body: { userId } },
		);
	}

	incomingInvites() {
		return api<{ invites: GroupInvite[] }>('/groups/invites/incoming');
	}

	acceptInvite(inviteId: string) {
		return api<{ success: boolean; groupId: string }>(`/groups/invites/${inviteId}/accept`, { method: 'POST' });
	}

	declineInvite(inviteId: string) {
		return api<{ success: boolean }>(`/groups/invites/${inviteId}/decline`, { method: 'POST' });
	}

	revokeInvite(inviteId: string) {
		return api<{ success: boolean }>(`/groups/invites/${inviteId}`, { method: 'DELETE' });
	}

	regenerateInviteLink(id: string) {
		return api<{ inviteCode: string }>(`/groups/${id}/invite-link/regenerate`, { method: 'POST' });
	}

	joinByCode(code: string) {
		return api<{ groupId: string; alreadyMember: boolean }>(`/groups/join/${code}`, { method: 'POST' });
	}

	// Messages
	getMessages(id: string, opts?: { cursor?: string; after?: string; limit?: number }) {
		const params = new URLSearchParams();
		if (opts?.cursor) params.set('cursor', opts.cursor);
		if (opts?.after) params.set('after', opts.after);
		if (opts?.limit) params.set('limit', String(opts.limit));
		const qs = params.toString();
		return api<{ messages: GroupMessage[]; hasMore: boolean; nextCursor: string | null }>(
			`/groups/${id}/messages${qs ? `?${qs}` : ''}`,
		);
	}

	sendMessage(
		id: string,
		content: string,
		attachments?: GroupAttachment[],
		replyToId?: string,
		forwardedFrom?: { authorId: string; authorName: string; content: string; attachments?: GroupAttachment[] } | null,
	) {
		return api<{ message: GroupMessage }>(`/groups/${id}/messages`, {
			method: 'POST', body: { content, attachments, replyToId, forwardedFrom },
		});
	}

	editMessage(messageId: string, content: string, attachments?: GroupAttachment[]) {
		const body: Record<string, unknown> = { content };
		if (attachments !== undefined) body.attachments = attachments;
		return api<{ message: GroupMessage }>(`/groups/messages/${messageId}`, {
			method: 'PATCH', body,
		});
	}

	deleteMessage(messageId: string) {
		return api<{ success: boolean }>(`/groups/messages/${messageId}`, { method: 'DELETE' });
	}

	markRead(id: string) {
		return api<{ success: boolean }>(`/groups/${id}/read`, { method: 'POST' });
	}

	getPinned(id: string) {
		return api<{ messages: GroupMessage[] }>(`/groups/${id}/pinned`);
	}

	pin(messageId: string) {
		return api<{ success: boolean; pinnedAt: string; pinnedBy: string }>(
			`/groups/messages/${messageId}/pin`, { method: 'POST' },
		);
	}

	unpin(messageId: string) {
		return api<{ success: boolean }>(`/groups/messages/${messageId}/pin`, { method: 'DELETE' });
	}

	toggleReaction(messageId: string, emoji: string) {
		return api<{ reactions: GroupMessageReaction[] }>(
			`/groups/messages/${messageId}/reactions`,
			{ method: 'POST', body: { emoji } },
		);
	}
}

export const groupsService = new GroupsService();
