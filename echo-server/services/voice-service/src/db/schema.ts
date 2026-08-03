import { pgTable, text, timestamp, uuid, integer, boolean, jsonb, smallint, index, uniqueIndex, varchar } from 'drizzle-orm/pg-core';

// ─── User Cache (populated via NATS USER_* events) ───────────────

export const userCache = pgTable('user_cache', {
	id: uuid('id').primaryKey(),
	username: text('username').notNull(),
	displayName: text('display_name'),
	avatarUrl: text('avatar_url'),
	updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
	uniqueIndex('idx_uc_username').on(t.username),
]);

// ─── Group Members Mirror (from NATS GROUP_MEMBER_* events) ─────
// Cache of group memberships so we can authorize voice-channel actions
// without a synchronous round-trip to groups-service.

export const groupMembersMirror = pgTable('group_members_mirror', {
	groupId: uuid('group_id').notNull(),
	userId: uuid('user_id').notNull(),
	role: varchar('role', { length: 16 }).default('member').notNull(),
	joinedAt: timestamp('joined_at').defaultNow().notNull(),
}, (t) => [
	uniqueIndex('idx_gmm_group_user').on(t.groupId, t.userId),
	index('idx_gmm_user').on(t.userId),
]);

// ─── Voice Channel Categories ────────────────────────────────────
// Optional grouping above voice channels. A channel with category_id = null is
// "uncategorized" and shown directly. Deleting a category orphans its channels
// (they become uncategorized) rather than cascading.

export const voiceChannelCategories = pgTable('voice_channel_categories', {
	id: uuid('id').defaultRandom().primaryKey(),
	groupId: uuid('group_id').notNull(),
	name: text('name').notNull(),
	position: integer('position').default(0).notNull(),
	createdBy: uuid('created_by').notNull().references(() => userCache.id),
	createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
	index('idx_vcc_group').on(t.groupId),
	uniqueIndex('idx_vcc_group_name').on(t.groupId, t.name),
]);

// ─── Voice Channels ──────────────────────────────────────────────
// Scoped to a group: only members can list/join, only admins+ can create/delete.

export const voiceChannels = pgTable('voice_channels', {
	id: uuid('id').defaultRandom().primaryKey(),
	groupId: uuid('group_id').notNull(),
	categoryId: uuid('category_id'),
	name: text('name').notNull(),
	createdBy: uuid('created_by').notNull().references(() => userCache.id),
	createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
	index('idx_vc_group').on(t.groupId),
	index('idx_vc_category').on(t.categoryId),
	uniqueIndex('idx_vc_group_name').on(t.groupId, t.name),
]);

// ─── Voice channel chat ─────────────────────────────────────────
// Each voice channel owns its own chat. ON DELETE CASCADE on channelId means
// deleting the channel drops the chat without an extra cleanup step.

export const voiceChannelMessages = pgTable('voice_channel_messages', {
	id: uuid('id').defaultRandom().primaryKey(),
	channelId: uuid('channel_id').notNull().references(() => voiceChannels.id, { onDelete: 'cascade' }),
	groupId: uuid('group_id').notNull(),
	authorId: uuid('author_id').notNull().references(() => userCache.id),
	content: text('content').notNull(),
	attachments: jsonb('attachments').default([]).notNull(),
	isEdited: boolean('is_edited').default(false).notNull(),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at').defaultNow().notNull(),
	pinnedAt: timestamp('pinned_at'),
	pinnedBy: uuid('pinned_by').references(() => userCache.id),
	replyToId: uuid('reply_to_id'),
	replyToSnapshot: jsonb('reply_to_snapshot'),
	forwardedFrom: jsonb('forwarded_from'),
	contentKeyId: smallint('content_key_id'),
}, (t) => [
	index('idx_vcm_channel_created').on(t.channelId, t.createdAt),
	index('idx_vcm_channel_pinned').on(t.channelId, t.pinnedAt),
]);

export const voiceChannelChatReads = pgTable('voice_channel_chat_reads', {
	id: uuid('id').defaultRandom().primaryKey(),
	channelId: uuid('channel_id').notNull().references(() => voiceChannels.id, { onDelete: 'cascade' }),
	userId: uuid('user_id').notNull().references(() => userCache.id),
	lastReadAt: timestamp('last_read_at').defaultNow().notNull(),
}, (t) => [
	uniqueIndex('idx_vccr_user_channel').on(t.userId, t.channelId),
]);

// ─── Voice Roles ─────────────────────────────────────────────────
// Named permission bundles scoped to a group. `permissions` is a bitfield
// (1=CONNECT, 2=SPEAK, 4=MANAGE_CHANNELS, 8=MANAGE_ROLES). Owner/admin in the
// group_members_mirror always have all permissions implicitly — roles only
// ever ADD on top of the baseline. Roles do not nest.

export const voiceRoles = pgTable('voice_roles', {
	id: uuid('id').defaultRandom().primaryKey(),
	groupId: uuid('group_id').notNull(),
	name: text('name').notNull(),
	// Hex color (e.g. '#FF7A1A'). Cosmetic only — used by the UI to tint role
	// chips. Null = no tint.
	color: varchar('color', { length: 9 }),
	permissions: integer('permissions').default(0).notNull(),
	position: integer('position').default(0).notNull(),
	createdBy: uuid('created_by').notNull().references(() => userCache.id),
	createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
	index('idx_vr_group').on(t.groupId),
	uniqueIndex('idx_vr_group_name').on(t.groupId, t.name),
]);

// Membership in a role. Cascade on role deletion so dropping a role cleans up
// its assignments. `user_id` is NOT FK'd to user_cache so we don't block role
// assignment on the cache lag — list responses join lazily.
export const voiceRoleMembers = pgTable('voice_role_members', {
	roleId: uuid('role_id').notNull().references(() => voiceRoles.id, { onDelete: 'cascade' }),
	userId: uuid('user_id').notNull(),
	addedBy: uuid('added_by').notNull(),
	addedAt: timestamp('added_at').defaultNow().notNull(),
}, (t) => [
	uniqueIndex('idx_vrm_role_user').on(t.roleId, t.userId),
	index('idx_vrm_user').on(t.userId),
]);

// Allowlist mapping a voice channel to the roles allowed to see/join it.
// A channel with zero rows here is "open" (any group member). One or more rows
// makes it "restricted" — only members of those roles see it.
export const voiceChannelRoleAccess = pgTable('voice_channel_role_access', {
	channelId: uuid('channel_id').notNull().references(() => voiceChannels.id, { onDelete: 'cascade' }),
	roleId: uuid('role_id').notNull().references(() => voiceRoles.id, { onDelete: 'cascade' }),
	grantedBy: uuid('granted_by').notNull(),
	grantedAt: timestamp('granted_at').defaultNow().notNull(),
}, (t) => [
	uniqueIndex('idx_vcra_channel_role').on(t.channelId, t.roleId),
	index('idx_vcra_role').on(t.roleId),
]);

export const voiceChannelMessageReactions = pgTable('voice_channel_message_reactions', {
	id: uuid('id').defaultRandom().primaryKey(),
	messageId: uuid('message_id').notNull().references(() => voiceChannelMessages.id, { onDelete: 'cascade' }),
	userId: uuid('user_id').notNull().references(() => userCache.id),
	emoji: text('emoji').notNull(),
	createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
	uniqueIndex('idx_vcmr_user_message').on(t.userId, t.messageId),
	index('idx_vcmr_message').on(t.messageId),
]);
