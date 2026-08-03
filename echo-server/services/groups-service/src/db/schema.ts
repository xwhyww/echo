import { pgTable, text, timestamp, boolean, uuid, index, uniqueIndex, varchar, jsonb, serial, smallint } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

// ─── User Cache (populated via NATS events from auth-service) ────

export const userCache = pgTable('user_cache', {
	id: uuid('id').primaryKey(),
	username: text('username').notNull(),
	displayName: text('display_name'),
	avatarUrl: text('avatar_url'),
	isOnline: boolean('is_online').default(false).notNull(),
	privacyOnlineStatus: varchar('privacy_online_status', { length: 16 }).default('all').notNull(),
	privacyMessaging: varchar('privacy_messaging', { length: 16 }).default('all').notNull(),
	privacyPhoto: varchar('privacy_photo', { length: 16 }).default('all').notNull(),
	privacyGroupInvite: varchar('privacy_group_invite', { length: 16 }).default('all').notNull(),
	updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
	uniqueIndex('idx_uc_username').on(t.username),
]);

// ─── Groups ─────────────────────────────────────────────────────

export const groups = pgTable('groups', {
	id: uuid('id').defaultRandom().primaryKey(),
	name: text('name').notNull(),
	description: text('description'),
	avatarUrl: text('avatar_url'),
	ownerId: uuid('owner_id').notNull().references(() => userCache.id),
	isPublic: boolean('is_public').default(false).notNull(),
	inviteCode: text('invite_code'),
	// 'owner' | 'admins' | 'everyone' — who is allowed to invite/use the invite link
	invitePolicy: varchar('invite_policy', { length: 16 }).default('admins').notNull(),
	// 'owner' | 'admins' | 'everyone' — who can send messages
	messagePolicy: varchar('message_policy', { length: 16 }).default('everyone').notNull(),
	// 'owner' | 'admins' | 'everyone' — who can pin/unpin messages
	pinPolicy: varchar('pin_policy', { length: 16 }).default('admins').notNull(),
	// 'owner' | 'admins' — who can edit group name/description/avatar
	editInfoPolicy: varchar('edit_info_policy', { length: 16 }).default('admins').notNull(),
	// false → hide messages created before a member's joinedAt
	historyVisible: boolean('history_visible').default(true).notNull(),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
	uniqueIndex('idx_groups_invite_code').on(t.inviteCode),
	index('idx_groups_owner').on(t.ownerId),
]);

// role: 'owner' | 'admin' | 'member'
export const groupMembers = pgTable('group_members', {
	id: uuid('id').defaultRandom().primaryKey(),
	groupId: uuid('group_id').notNull().references(() => groups.id, { onDelete: 'cascade' }),
	userId: uuid('user_id').notNull().references(() => userCache.id),
	role: varchar('role', { length: 16 }).default('member').notNull(),
	nickname: text('nickname'),
	joinedAt: timestamp('joined_at').defaultNow().notNull(),
}, (t) => [
	uniqueIndex('idx_gm_group_user').on(t.groupId, t.userId),
	index('idx_gm_user').on(t.userId),
]);

// status: 'pending' | 'accepted' | 'declined' | 'revoked'
export const groupInvites = pgTable('group_invites', {
	id: uuid('id').defaultRandom().primaryKey(),
	groupId: uuid('group_id').notNull().references(() => groups.id, { onDelete: 'cascade' }),
	inviterId: uuid('inviter_id').notNull().references(() => userCache.id),
	inviteeId: uuid('invitee_id').notNull().references(() => userCache.id),
	status: varchar('status', { length: 16 }).default('pending').notNull(),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	respondedAt: timestamp('responded_at'),
}, (t) => [
	index('idx_gi_invitee_status').on(t.inviteeId, t.status),
	index('idx_gi_group_status').on(t.groupId, t.status),
	uniqueIndex('idx_gi_group_invitee_pending').on(t.groupId, t.inviteeId).where(sql`status = 'pending'`),
]);

// ─── Messages ────────────────────────────────────────────────────

// system_kind nullable. When set, message is a system event ('member_joined',
// 'member_left', 'member_kicked', 'role_changed', 'group_renamed').
// content holds JSON payload for system messages, plain text otherwise.
export const groupMessages = pgTable('group_messages', {
	id: uuid('id').defaultRandom().primaryKey(),
	groupId: uuid('group_id').notNull().references(() => groups.id, { onDelete: 'cascade' }),
	authorId: uuid('author_id').notNull().references(() => userCache.id),
	content: text('content').notNull(),
	attachments: jsonb('attachments').default([]).notNull(),
	isEdited: boolean('is_edited').default(false).notNull(),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at').defaultNow().notNull(),
	pinnedAt: timestamp('pinned_at'),
	pinnedBy: uuid('pinned_by').references(() => userCache.id),
	systemKind: varchar('system_kind', { length: 24 }),
	replyToId: uuid('reply_to_id'),
	replyToSnapshot: jsonb('reply_to_snapshot'),
	forwardedFrom: jsonb('forwarded_from'),
	contentKeyId: smallint('content_key_id'),
}, (t) => [
	index('idx_gmsg_group_created').on(t.groupId, t.createdAt),
	index('idx_gmsg_group_pinned').on(t.groupId, t.pinnedAt),
]);

export const groupChatReads = pgTable('group_chat_reads', {
	id: uuid('id').defaultRandom().primaryKey(),
	groupId: uuid('group_id').notNull().references(() => groups.id, { onDelete: 'cascade' }),
	userId: uuid('user_id').notNull().references(() => userCache.id),
	lastReadAt: timestamp('last_read_at').defaultNow().notNull(),
}, (t) => [
	uniqueIndex('idx_gcr_user_group').on(t.userId, t.groupId),
]);

export const groupMessageReactions = pgTable('group_message_reactions', {
	id: uuid('id').defaultRandom().primaryKey(),
	messageId: uuid('message_id').notNull().references(() => groupMessages.id, { onDelete: 'cascade' }),
	userId: uuid('user_id').notNull().references(() => userCache.id),
	emoji: text('emoji').notNull(),
	createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
	uniqueIndex('idx_gmr_user_message').on(t.userId, t.messageId),
	index('idx_gmr_message').on(t.messageId),
]);

export const groupMessageDeletions = pgTable('group_message_deletions', {
	id: uuid('id').defaultRandom().primaryKey(),
	messageId: uuid('message_id').notNull().references(() => groupMessages.id, { onDelete: 'cascade' }),
	userId: uuid('user_id').notNull().references(() => userCache.id),
	createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
	uniqueIndex('idx_gmd_user_message').on(t.userId, t.messageId),
	index('idx_gmd_user').on(t.userId),
]);

export const groupMessageLinks = pgTable('group_message_links', {
	id: serial('id').primaryKey(),
	messageId: uuid('message_id').notNull().references(() => groupMessages.id, { onDelete: 'cascade' }),
	groupId: uuid('group_id').notNull().references(() => groups.id, { onDelete: 'cascade' }),
	url: text('url').notNull(),
	createdAt: timestamp('created_at').notNull(),
}, (t) => [
	index('idx_gml_group_created').on(t.groupId, t.createdAt),
	index('idx_gml_message').on(t.messageId),
]);

// ─── Relations ───────────────────────────────────────────────────

export const userCacheRelations = relations(userCache, ({ many }) => ({
	memberships: many(groupMembers),
	messages: many(groupMessages),
}));

export const groupsRelations = relations(groups, ({ one, many }) => ({
	owner: one(userCache, { fields: [groups.ownerId], references: [userCache.id] }),
	members: many(groupMembers),
	messages: many(groupMessages),
	invites: many(groupInvites),
}));

export const groupMembersRelations = relations(groupMembers, ({ one }) => ({
	group: one(groups, { fields: [groupMembers.groupId], references: [groups.id] }),
	user: one(userCache, { fields: [groupMembers.userId], references: [userCache.id] }),
}));

export const groupInvitesRelations = relations(groupInvites, ({ one }) => ({
	group: one(groups, { fields: [groupInvites.groupId], references: [groups.id] }),
	inviter: one(userCache, { fields: [groupInvites.inviterId], references: [userCache.id], relationName: 'inviter' }),
	invitee: one(userCache, { fields: [groupInvites.inviteeId], references: [userCache.id], relationName: 'invitee' }),
}));

export const groupMessagesRelations = relations(groupMessages, ({ one, many }) => ({
	group: one(groups, { fields: [groupMessages.groupId], references: [groups.id] }),
	author: one(userCache, { fields: [groupMessages.authorId], references: [userCache.id] }),
	reactions: many(groupMessageReactions),
	links: many(groupMessageLinks),
}));

export const groupMessageReactionsRelations = relations(groupMessageReactions, ({ one }) => ({
	message: one(groupMessages, { fields: [groupMessageReactions.messageId], references: [groupMessages.id] }),
	user: one(userCache, { fields: [groupMessageReactions.userId], references: [userCache.id] }),
}));

export const groupMessageDeletionsRelations = relations(groupMessageDeletions, ({ one }) => ({
	message: one(groupMessages, { fields: [groupMessageDeletions.messageId], references: [groupMessages.id] }),
	user: one(userCache, { fields: [groupMessageDeletions.userId], references: [userCache.id] }),
}));

export const groupMessageLinksRelations = relations(groupMessageLinks, ({ one }) => ({
	message: one(groupMessages, { fields: [groupMessageLinks.messageId], references: [groupMessages.id] }),
	group: one(groups, { fields: [groupMessageLinks.groupId], references: [groups.id] }),
}));

export const groupChatReadsRelations = relations(groupChatReads, ({ one }) => ({
	group: one(groups, { fields: [groupChatReads.groupId], references: [groups.id] }),
	user: one(userCache, { fields: [groupChatReads.userId], references: [userCache.id] }),
}));
