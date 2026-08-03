import { pgTable, text, timestamp, boolean, uuid, index, uniqueIndex, varchar, jsonb, serial, smallint, customType } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

// postgres-js returns bytea as either a "\x…" hex string or a Uint8Array
// depending on version/config. Normalise to Buffer so the crypto helpers
// (which rely on Buffer.subarray / cipher.update accepting Buffer) get what
// they expect on every read.
const bytea = customType<{ data: Buffer; driverData: Buffer | Uint8Array | string; default: false }>({
	dataType() {
		return 'bytea';
	},
	fromDriver(value) {
		if (Buffer.isBuffer(value)) return value;
		if (value instanceof Uint8Array) return Buffer.from(value);
		if (typeof value === 'string') {
			const hex = value.startsWith('\\x') ? value.slice(2) : value;
			return Buffer.from(hex, 'hex');
		}
		throw new Error(`bytea: unexpected driver value type ${typeof value}`);
	},
	toDriver(value) {
		return value;
	},
});

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
	updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
	uniqueIndex('idx_uc_username').on(t.username),
]);

// ─── Personal Chats ──────────────────────────────────────────────

export const personalChats = pgTable('personal_chats', {
	id: uuid('id').defaultRandom().primaryKey(),
	user1Id: uuid('user1_id').notNull().references(() => userCache.id),
	user2Id: uuid('user2_id').notNull().references(() => userCache.id),
	createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
	index('idx_pc_user1').on(t.user1Id),
	index('idx_pc_user2').on(t.user2Id),
]);

export const personalMessages = pgTable('personal_messages', {
	id: uuid('id').defaultRandom().primaryKey(),
	chatId: uuid('chat_id').notNull().references(() => personalChats.id),
	authorId: uuid('author_id').notNull().references(() => userCache.id),
	content: text('content').notNull(),
	attachments: jsonb('attachments').default([]).notNull(),
	isEdited: boolean('is_edited').default(false).notNull(),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at').defaultNow().notNull(),
	pinnedAt: timestamp('pinned_at'),
	pinnedBy: uuid('pinned_by').references(() => userCache.id),
	readAt: timestamp('read_at'),
	contentSearch: text('content_search'),
	replyToId: uuid('reply_to_id'),
	replyToSnapshot: jsonb('reply_to_snapshot'),
	forwardedFrom: jsonb('forwarded_from'),
	contentCiphertext: bytea('content_ciphertext'),
	contentNonce: bytea('content_nonce'),
	contentKeyId: smallint('content_key_id'),
	replyToSnapshotCiphertext: bytea('reply_to_snapshot_ciphertext'),
	replyToSnapshotNonce: bytea('reply_to_snapshot_nonce'),
	replyToSnapshotKeyId: smallint('reply_to_snapshot_key_id'),
	attachmentsCiphertext: bytea('attachments_ciphertext'),
	attachmentsNonce: bytea('attachments_nonce'),
	attachmentsKeyId: smallint('attachments_key_id'),
	attachmentsMeta: jsonb('attachments_meta'),
}, (t) => [
	index('idx_pm_chat_created').on(t.chatId, t.createdAt),
	index('idx_pm_chat_pinned').on(t.chatId, t.pinnedAt),
]);

export const personalChatReads = pgTable('personal_chat_reads', {
	id: uuid('id').defaultRandom().primaryKey(),
	chatId: uuid('chat_id').notNull().references(() => personalChats.id),
	userId: uuid('user_id').notNull().references(() => userCache.id),
	lastReadAt: timestamp('last_read_at').defaultNow().notNull(),
}, (t) => [
	uniqueIndex('idx_pcr_user_chat').on(t.userId, t.chatId),
]);

// ─── Message Reactions ─────────────────────────────────────────

export const personalMessageReactions = pgTable('personal_message_reactions', {
	id: uuid('id').defaultRandom().primaryKey(),
	messageId: uuid('message_id').notNull().references(() => personalMessages.id, { onDelete: 'cascade' }),
	userId: uuid('user_id').notNull().references(() => userCache.id),
	emoji: text('emoji').notNull(),
	createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
	uniqueIndex('idx_pmr_user_message').on(t.userId, t.messageId),
	index('idx_pmr_message').on(t.messageId),
]);

// ─── Per-user message deletions ("delete for me") ──────────────

export const personalMessageDeletions = pgTable('personal_message_deletions', {
	id: uuid('id').defaultRandom().primaryKey(),
	messageId: uuid('message_id').notNull().references(() => personalMessages.id, { onDelete: 'cascade' }),
	userId: uuid('user_id').notNull().references(() => userCache.id),
	createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
	uniqueIndex('idx_pmd_user_message').on(t.userId, t.messageId),
	index('idx_pmd_user').on(t.userId),
]);

// ─── Message Links (extracted URLs from message content) ────────

export const personalMessageLinks = pgTable('personal_message_links', {
	id: serial('id').primaryKey(),
	messageId: uuid('message_id').notNull().references(() => personalMessages.id, { onDelete: 'cascade' }),
	chatId: uuid('chat_id').notNull().references(() => personalChats.id),
	url: text('url').notNull(),
	createdAt: timestamp('created_at').notNull(),
}, (t) => [
	index('idx_pml_chat_created').on(t.chatId, t.createdAt),
	index('idx_pml_message').on(t.messageId),
]);

// ─── Friendship Cache (populated via NATS events from friends-service) ───

export const friendshipCache = pgTable('friendship_cache', {
	id: uuid('id').defaultRandom().primaryKey(),
	user1Id: uuid('user1_id').notNull(),
	user2Id: uuid('user2_id').notNull(),
	status: varchar('status', { length: 16 }).notNull(), // 'pending' | 'accepted'
	requesterId: uuid('requester_id').notNull(),
	updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
	uniqueIndex('idx_fc_users').on(t.user1Id, t.user2Id),
]);

// ─── Relations ───────────────────────────────────────────────────

export const userCacheRelations = relations(userCache, ({ many }) => ({
	personalMessages: many(personalMessages),
}));

export const personalChatsRelations = relations(personalChats, ({ one, many }) => ({
	user1: one(userCache, { fields: [personalChats.user1Id], references: [userCache.id], relationName: 'user1' }),
	user2: one(userCache, { fields: [personalChats.user2Id], references: [userCache.id], relationName: 'user2' }),
	messages: many(personalMessages),
	reads: many(personalChatReads),
}));

export const personalMessagesRelations = relations(personalMessages, ({ one, many }) => ({
	chat: one(personalChats, { fields: [personalMessages.chatId], references: [personalChats.id] }),
	author: one(userCache, { fields: [personalMessages.authorId], references: [userCache.id] }),
	links: many(personalMessageLinks),
	reactions: many(personalMessageReactions),
}));

export const personalMessageReactionsRelations = relations(personalMessageReactions, ({ one }) => ({
	message: one(personalMessages, { fields: [personalMessageReactions.messageId], references: [personalMessages.id] }),
	user: one(userCache, { fields: [personalMessageReactions.userId], references: [userCache.id] }),
}));

export const personalMessageLinksRelations = relations(personalMessageLinks, ({ one }) => ({
	message: one(personalMessages, { fields: [personalMessageLinks.messageId], references: [personalMessages.id] }),
	chat: one(personalChats, { fields: [personalMessageLinks.chatId], references: [personalChats.id] }),
}));

export const personalChatReadsRelations = relations(personalChatReads, ({ one }) => ({
	chat: one(personalChats, { fields: [personalChatReads.chatId], references: [personalChats.id] }),
	user: one(userCache, { fields: [personalChatReads.userId], references: [userCache.id] }),
}));

export const personalMessageDeletionsRelations = relations(personalMessageDeletions, ({ one }) => ({
	message: one(personalMessages, { fields: [personalMessageDeletions.messageId], references: [personalMessages.id] }),
	user: one(userCache, { fields: [personalMessageDeletions.userId], references: [userCache.id] }),
}));
