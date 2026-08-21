import { pgTable, text, timestamp, uuid, unique, index, boolean } from 'drizzle-orm/pg-core';

/**
 * One row per (device, install). The token is what APNs/FCM addresses, and it
 * is the natural key: the same physical device reinstalling the app gets a new
 * token, and the same token can migrate to a different user when someone signs
 * out and a colleague signs in on the same phone — so registration upserts on
 * the token and overwrites `userId` rather than accumulating rows.
 *
 * `environment` matters on iOS and has no safe default: a token minted by a
 * development build only exists in APNs' sandbox, and sending it to the
 * production host returns BadDeviceToken. The client reports which build it is.
 */
export const deviceTokens = pgTable('device_tokens', {
	id: uuid('id').defaultRandom().primaryKey(),
	userId: uuid('user_id').notNull(),
	token: text('token').notNull(),
	platform: text('platform', { enum: ['ios', 'android'] }).notNull(),
	environment: text('environment', { enum: ['sandbox', 'production'] }).notNull().default('sandbox'),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	// Refreshed on every re-registration, so a sweep can retire tokens belonging
	// to installs that have not been opened in months.
	lastSeenAt: timestamp('last_seen_at').defaultNow().notNull(),
}, (table) => [
	unique('unique_device_token').on(table.token),
	index('device_tokens_user_idx').on(table.userId),
]);

/**
 * What a user wants to be woken for. One row per user, created on first write.
 *
 * Absence means defaults, so nothing has to be seeded when an account is made
 * and the table stays empty for everyone who never opens the settings screen —
 * `loadSettings` returns the defaults for a missing row rather than inserting
 * one.
 *
 * `mutedChats` and `mutedGroups` are id lists rather than their own tables: the
 * only question ever asked of them is "is this id in the set", they are read on
 * the hot path of every delivery, and a person mutes a handful of
 * conversations, not thousands.
 */
export const notificationSettings = pgTable('notification_settings', {
	userId: uuid('user_id').primaryKey(),
	/** Master switch. Off means no banner is ever sent to this account. */
	enabled: boolean('enabled').notNull().default(true),
	directMessages: boolean('direct_messages').notNull().default(true),
	groupMessages: boolean('group_messages').notNull().default(true),
	friendRequests: boolean('friend_requests').notNull().default(true),
	groupInvites: boolean('group_invites').notNull().default(true),
	/**
	 * Per-user override of PUSH_MESSAGE_PREVIEW. Null means "follow the server
	 * default", which is what an untouched account gets — a user who has never
	 * expressed a preference should not be pinned to whatever the default
	 * happened to be on the day they signed up.
	 */
	showPreview: boolean('show_preview'),
	mutedChats: text('muted_chats').array().notNull().default([]),
	mutedGroups: text('muted_groups').array().notNull().default([]),
	updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
