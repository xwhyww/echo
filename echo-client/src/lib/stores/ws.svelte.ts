import type { PersonalMessage } from '$lib/api/personalChats.js';
import type { Group, GroupMember, GroupMessage, GroupInvite, GroupRole, GroupMessageReaction, GroupAttachment } from '$lib/api/groups.js';
import type { VoiceChannel, VoiceCategory } from '$lib/api/voice.js';
import type { VoiceChannelMessage, VoiceChannelMessageAttachment, VoiceChannelMessageReaction } from '$lib/api/voiceChat.js';
import { API_HOST } from '$lib/api/client.js';

// Same host the page came from — see API_HOST. VITE_WS_URL overrides it for a
// deployment, where ws-gateway sits behind TLS on its own subdomain.
const WS_URL = import.meta.env.VITE_WS_URL || `ws://${API_HOST}:3004/ws`;

type WsEvent =
	| { type: 'connected'; userId: string }
	| { type: 'dm'; chatId: string; message: PersonalMessage; unreadCount?: number }
	| { type: 'dm_edited'; chatId: string; messageId: string; content: string; attachments: import('$lib/api/personalChats.js').Attachment[]; updatedAt: string }
	| { type: 'dm_deleted'; chatId: string; messageId: string }
	| { type: 'dm_pinned'; chatId: string; messageId: string; pinnedAt: string; pinnedBy: string }
	| { type: 'dm_unpinned'; chatId: string; messageId: string }
	| { type: 'dm_reaction'; chatId: string; messageId: string; messageAuthorId: string; reactions: import('$lib/api/personalChats.js').MessageReaction[] }
	| { type: 'typing'; chatId: string; userId: string; username: string }
	| { type: 'presence'; userId: string; online: boolean }
	| { type: 'chat_read'; chatId: string; userId: string; lastReadAt: string }
	| { type: 'friend_request'; fromUserId: string }
	| { type: 'friend_accepted'; fromUserId: string }
	| { type: 'friend_removed'; fromUserId: string }
	| { type: 'friend_declined'; fromUserId: string }
	| { type: 'friend_cancelled'; fromUserId: string }
	| { type: 'group_created'; group: Omit<Group, 'role'>; memberIds: string[] }
	| { type: 'group_updated'; groupId: string; patch: Partial<Group> }
	| { type: 'group_deleted'; groupId: string }
	| { type: 'group_member_joined'; groupId: string; member: { userId: string; role: GroupRole; nickname: string | null; joinedAt: string; user: { id: string; username: string; displayName: string | null; avatarUrl: string | null } } }
	| { type: 'group_member_left'; groupId: string; userId: string; kicked: boolean }
	| { type: 'group_member_role'; groupId: string; userId: string; role: GroupRole }
	| { type: 'group_invite_created'; invite: GroupInvite }
	| { type: 'group_invite_responded'; inviteId: string; groupId: string; inviteeId: string; status: 'accepted' | 'declined' | 'revoked' }
	| { type: 'group_message'; groupId: string; message: GroupMessage }
	| { type: 'group_message_edited'; groupId: string; messageId: string; content: string; attachments: GroupAttachment[]; updatedAt: string }
	| { type: 'group_message_deleted'; groupId: string; messageId: string }
	| { type: 'group_message_pinned'; groupId: string; messageId: string; pinnedAt: string; pinnedBy: string }
	| { type: 'group_message_unpinned'; groupId: string; messageId: string }
	| { type: 'group_message_reaction'; groupId: string; messageId: string; reactions: GroupMessageReaction[] }
	| { type: 'group_read'; groupId: string; userId: string; lastReadAt: string }
	| { type: 'voice_participant'; groupId: string; channelId: string; kind: 'joined' | 'left' | 'updated'; participant: { userId: string; username: string; displayName: string | null; avatarUrl: string | null; micMuted: boolean; deafened: boolean; sharing: boolean } }
	| { type: 'voice_channel_created'; channel: VoiceChannel }
	| { type: 'voice_channel_updated'; groupId: string; channelId: string; patch: { name?: string; categoryId?: string | null } }
	| { type: 'voice_channel_deleted'; groupId: string; channelId: string }
	| { type: 'voice_category_created'; category: VoiceCategory }
	| { type: 'voice_category_updated'; groupId: string; categoryId: string; patch: { name?: string; position?: number } }
	| { type: 'voice_category_deleted'; groupId: string; categoryId: string }
	| { type: 'voice_channel_message'; groupId: string; channelId: string; message: VoiceChannelMessage }
	| { type: 'voice_channel_message_edited'; groupId: string; channelId: string; messageId: string; content: string; attachments: VoiceChannelMessageAttachment[]; updatedAt: string }
	| { type: 'voice_channel_message_deleted'; groupId: string; channelId: string; messageId: string }
	| { type: 'voice_channel_message_pinned'; groupId: string; channelId: string; messageId: string; pinnedAt: string; pinnedBy: string }
	| { type: 'voice_channel_message_unpinned'; groupId: string; channelId: string; messageId: string }
	| { type: 'voice_channel_message_reaction'; groupId: string; channelId: string; messageId: string; reactions: VoiceChannelMessageReaction[] }
	| { type: 'voice_channel_read'; groupId: string; channelId: string; userId: string; lastReadAt: string }
	| { type: 'voice_role_created'; role: { id: string; groupId: string; name: string; color: string | null; permissions: number; position: number; createdBy: string; createdAt: string } }
	| { type: 'voice_role_updated'; groupId: string; roleId: string; patch: { name?: string; color?: string | null; permissions?: number; position?: number } }
	| { type: 'voice_role_deleted'; groupId: string; roleId: string }
	| { type: 'voice_role_members_changed'; groupId: string; roleId: string; kind: 'added' | 'removed'; userId: string }
	| { type: 'voice_channel_access_changed'; groupId: string; channelId: string; roleIds: string[] }
	| { type: 'call_ring'; roomName: string; from: CallParty; video: boolean }
	| { type: 'call_accepted'; roomName: string; fromUserId: string }
	| { type: 'call_declined'; roomName: string; fromUserId: string }
	| { type: 'call_cancelled'; roomName: string; fromUserId: string }
	| { type: 'call_ended'; roomName: string; fromUserId: string }
	| { type: 'error'; message: string }
	| { type: 'reconnected' };

export interface CallParty {
	id: string;
	username: string;
	displayName: string | null;
	avatarUrl: string | null;
}

type WsListener = (event: WsEvent) => void;

class WsStore {
	private ws: WebSocket | null = null;
	private token: string | null = null;
	private listeners = new Set<WsListener>();
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private wasConnected = false;
	connected = $state(false);

	connect(token: string) {
		if (this.ws) this.disconnect();
		this.token = token;
		this.open();
	}

	disconnect() {
		this.token = null;
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
		if (this.ws) {
			this.ws.onclose = null; // prevent reconnect
			this.ws.close();
			this.ws = null;
		}
		this.connected = false;
	}

	on(listener: WsListener): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	send(data: Record<string, unknown>) {
		if (this.ws?.readyState === WebSocket.OPEN) {
			this.ws.send(JSON.stringify(data));
		}
	}

	private open() {
		if (!this.token) return;

		const ws = new WebSocket(`${WS_URL}?token=${this.token}`);

		ws.onopen = () => {
			const isReconnect = this.wasConnected;
			this.connected = true;
			this.wasConnected = true;
			if (isReconnect) {
				for (const listener of this.listeners) {
					listener({ type: 'reconnected' });
				}
			}
		};

		ws.onmessage = (evt) => {
			try {
				const event: WsEvent = JSON.parse(evt.data);
				for (const listener of this.listeners) {
					listener(event);
				}
			} catch {
				// ignore malformed messages
			}
		};

		ws.onclose = () => {
			this.connected = false;
			this.ws = null;
			// Reconnect after 1 second if we still have a token
			if (this.token) {
				this.reconnectTimer = setTimeout(() => this.open(), 1000);
			}
		};

		ws.onerror = () => {
			ws.close();
		};

		this.ws = ws;
	}
}

export const ws = new WsStore();
export type { WsEvent };