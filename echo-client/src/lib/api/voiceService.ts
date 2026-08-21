import { api } from './client.js';
import type { VoiceChannel, VoiceCategory, JoinVoiceResponse, VoiceRole } from './voice.js';

class VoiceService {
	listChannels(groupId: string) {
		return api<{ channels: VoiceChannel[]; categories: VoiceCategory[] }>(
			`/voice/channels?groupId=${groupId}`,
		);
	}

	/**
	 * How many voice channels the caller can see inside the given groups.
	 * Returns 0 for an empty list without a round trip.
	 */
	countChannels(groupIds: string[]) {
		if (groupIds.length === 0) return Promise.resolve({ count: 0 });
		return api<{ count: number }>(
			`/voice/channels/count?groupIds=${encodeURIComponent(groupIds.join(','))}`,
		);
	}

	createChannel(input: { groupId: string; name: string; categoryId?: string | null }) {
		return api<{ channel: VoiceChannel }>('/voice/channels', { method: 'POST', body: input });
	}

	updateChannel(id: string, patch: { name?: string; categoryId?: string | null }) {
		return api<{ success: boolean; patch: typeof patch }>(`/voice/channels/${id}`, {
			method: 'PATCH',
			body: patch,
		});
	}

	deleteChannel(id: string) {
		return api<{ success: boolean }>(`/voice/channels/${id}`, { method: 'DELETE' });
	}

	createCategory(input: { groupId: string; name: string }) {
		return api<{ category: VoiceCategory }>('/voice/categories', { method: 'POST', body: input });
	}

	updateCategory(id: string, patch: { name?: string; position?: number }) {
		return api<{ success: boolean; patch: typeof patch }>(`/voice/categories/${id}`, {
			method: 'PATCH',
			body: patch,
		});
	}

	deleteCategory(id: string) {
		return api<{ success: boolean }>(`/voice/categories/${id}`, { method: 'DELETE' });
	}

	join(channelId: string) {
		return api<JoinVoiceResponse>(`/voice/channels/${channelId}/join`, { method: 'POST' });
	}

	// Publish-only token for the native iOS screen-share connection. Fetched at
	// the moment of sharing rather than at join: tokens live five minutes, and
	// people present an hour into a call. See $lib/utils/voiceIdentity.ts.
	screenToken(channelId: string) {
		return api<{ url: string; token: string }>(`/voice/channels/${channelId}/screen-token`, {
			method: 'POST',
		});
	}

	// Fire-and-forget presence signal so other group members see realtime
	// join/leave/mic-state updates. The sidebar list endpoint stays the
	// authoritative source for late-joiners or after a reconnect.
	presence(channelId: string, body: { kind: 'joined' | 'left' | 'updated'; micMuted: boolean; deafened: boolean; sharing: boolean }) {
		return api<{ success: boolean }>(`/voice/channels/${channelId}/presence`, {
			method: 'POST',
			body,
		});
	}

	// ─── Roles ──────────────────────────────────────────────────
	// `canManage` rides along with the list so the page can render in
	// read-only mode for members who only need to see who's in which role.

	listRoles(groupId: string) {
		return api<{ roles: VoiceRole[]; canManage: boolean }>(
			`/voice/roles?groupId=${groupId}`,
		);
	}

	createRole(input: { groupId: string; name: string; color?: string | null; permissions?: number }) {
		return api<{ role: VoiceRole }>(`/voice/roles`, { method: 'POST', body: input });
	}

	updateRole(id: string, patch: { name?: string; color?: string | null; permissions?: number; position?: number }) {
		return api<{ success: boolean; patch: typeof patch }>(`/voice/roles/${id}`, {
			method: 'PATCH',
			body: patch,
		});
	}

	deleteRole(id: string) {
		return api<{ success: boolean }>(`/voice/roles/${id}`, { method: 'DELETE' });
	}

	addRoleMember(roleId: string, userId: string) {
		return api<{ success: boolean }>(`/voice/roles/${roleId}/members`, {
			method: 'POST',
			body: { userId },
		});
	}

	removeRoleMember(roleId: string, userId: string) {
		return api<{ success: boolean }>(`/voice/roles/${roleId}/members/${userId}`, {
			method: 'DELETE',
		});
	}

	// ─── Channel access (allowlist) ─────────────────────────────
	// Read returns the current role-id set + a manage flag. Replace sends the
	// full desired set (PUT semantics); pass [] to make the channel open again.

	getChannelAccess(channelId: string) {
		return api<{ roleIds: string[]; canManage: boolean }>(
			`/voice/channels/${channelId}/access`,
		);
	}

	replaceChannelAccess(channelId: string, roleIds: string[]) {
		return api<{ success: boolean; roleIds: string[] }>(
			`/voice/channels/${channelId}/access`,
			{ method: 'PUT', body: { roleIds } },
		);
	}
}

export const voiceService = new VoiceService();
