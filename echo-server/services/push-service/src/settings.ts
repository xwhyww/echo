import { eq } from 'drizzle-orm';
import { createDb } from './db/index.js';
import { notificationSettings } from './db/schema.js';
import { config } from './config.js';

const db = createDb(config.databaseUrl);

export interface NotificationSettings {
	enabled: boolean;
	directMessages: boolean;
	groupMessages: boolean;
	friendRequests: boolean;
	groupInvites: boolean;
	/** null = follow the server default (`PUSH_MESSAGE_PREVIEW`). */
	showPreview: boolean | null;
	mutedChats: string[];
	mutedGroups: string[];
}

export const DEFAULTS: NotificationSettings = {
	enabled: true,
	directMessages: true,
	groupMessages: true,
	friendRequests: true,
	groupInvites: true,
	showPreview: null,
	mutedChats: [],
	mutedGroups: [],
};

export async function loadSettings(userId: string): Promise<NotificationSettings> {
	const [row] = await db
		.select()
		.from(notificationSettings)
		.where(eq(notificationSettings.userId, userId))
		.limit(1);
	if (!row) return DEFAULTS;
	return {
		enabled: row.enabled,
		directMessages: row.directMessages,
		groupMessages: row.groupMessages,
		friendRequests: row.friendRequests,
		groupInvites: row.groupInvites,
		showPreview: row.showPreview,
		mutedChats: row.mutedChats,
		mutedGroups: row.mutedGroups,
	};
}

/** Upsert; only the keys present in `patch` are touched. */
export async function saveSettings(
	userId: string,
	patch: Partial<NotificationSettings>,
): Promise<NotificationSettings> {
	const next = { ...(await loadSettings(userId)), ...patch, updatedAt: new Date() };
	await db
		.insert(notificationSettings)
		.values({ userId, ...next })
		.onConflictDoUpdate({ target: notificationSettings.userId, set: next });
	const { updatedAt: _ignored, ...settings } = next;
	return settings;
}

/**
 * The kinds of event a notification can belong to. Kept as a closed union so
 * adding an event to the subscriber forces a decision about which switch it
 * answers to, rather than silently defaulting to "always send".
 */
export type NotificationKind = 'dm' | 'group' | 'friend' | 'invite';

/**
 * Whether a given notification may be delivered to this user.
 *
 * `scopeId` is the chat or group it belongs to, so a muted conversation stays
 * silent even when its category is on. Events with no conversation behind them
 * (friend requests) pass it as undefined.
 */
export function allows(
	settings: NotificationSettings,
	kind: NotificationKind,
	scopeId?: string,
): boolean {
	if (!settings.enabled) return false;
	switch (kind) {
		case 'dm':
			if (!settings.directMessages) return false;
			return !scopeId || !settings.mutedChats.includes(scopeId);
		case 'group':
			if (!settings.groupMessages) return false;
			return !scopeId || !settings.mutedGroups.includes(scopeId);
		case 'friend':
			return settings.friendRequests;
		case 'invite':
			return settings.groupInvites;
	}
}

/**
 * Whether the banner for this user may quote the message.
 *
 * The per-user choice wins when it exists; otherwise the server default
 * applies. Note which way round that is: a user who turned previews *on* gets
 * them even on a server that defaults to off, because they asked for it about
 * their own device.
 */
export function previewAllowed(settings: NotificationSettings): boolean {
	return settings.showPreview ?? config.includeMessagePreview;
}
