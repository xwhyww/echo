export interface VoiceChannelParticipant {
	userId: string;
	username: string;
	displayName: string | null;
	avatarUrl: string | null;
	// Live state from LiveKit. micMuted is derived from the participant's
	// published microphone track; deafened is an app-level attribute the
	// client publishes when the user toggles their headphones button.
	micMuted: boolean;
	deafened: boolean;
	// True while this participant is presenting a screen. Surfaced in the
	// sidebar so members can see who's sharing without joining the channel.
	sharing: boolean;
}

export interface VoiceChannel {
	id: string;
	groupId: string;
	categoryId: string | null;
	name: string;
	createdBy: string;
	createdAt: string;
	// Populated by GET /voice/channels (point-in-time snapshot from LiveKit).
	// Other endpoints that return a single channel may omit it.
	participants?: VoiceChannelParticipant[];
}

export interface VoiceCategory {
	id: string;
	groupId: string;
	name: string;
	position: number;
	createdBy: string;
	createdAt: string;
}

export interface JoinVoiceResponse {
	url: string;
	token: string;
	channel: VoiceChannel;
	// Whether the joining user's role grants screen sharing. The token enforces
	// this regardless; the flag just lets the UI hide the control up front.
	canShare: boolean;
}

// Mirror of the server's permission bitfield. Anywhere we render a role's
// permissions or compute "can the current user manage X" goes through these
// constants so a future bit addition is one place to change.
export const VOICE_PERMS = {
	CONNECT: 1,
	SPEAK: 2,
	MANAGE_CHANNELS: 4,
	MANAGE_ROLES: 8,
	CAN_SHARE: 16,
} as const;
export type VoicePermissionBit = typeof VOICE_PERMS[keyof typeof VOICE_PERMS];

export interface VoiceRoleMember {
	userId: string;
	username: string;
	displayName: string | null;
	avatarUrl: string | null;
}

export interface VoiceRole {
	id: string;
	groupId: string;
	name: string;
	color: string | null;
	permissions: number;
	position: number;
	createdBy: string;
	createdAt: string;
	// Populated by GET /voice/roles. Single-role endpoints (create response)
	// also include it (as []).
	members: VoiceRoleMember[];
}

export interface VoiceChannelAccess {
	channelId: string;
	roleIds: string[];
	canManage: boolean;
}
