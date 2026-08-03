import { pgTable, text, timestamp, integer, primaryKey, index } from 'drizzle-orm/pg-core';

export const fileBlobs = pgTable('file_blobs', {
	hash: text('hash').primaryKey(),
	storedName: text('stored_name').notNull(),
	mimeType: text('mime_type').notNull(),
	size: integer('size').notNull(),
	// Pre-generated 200px WebP thumbnail. Only set for image uploads. Stored
	// next to the original as `${hash}_thumb.webp`. Nullable so non-image rows
	// (PDFs, video, audio) and rows from before the thumbnail rollout work.
	thumbStoredName: text('thumb_stored_name'),
	thumbSize: integer('thumb_size'),
	createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const rawBlobMap = pgTable('raw_blob_map', {
	rawHash: text('raw_hash').primaryKey(),
	fileHash: text('file_hash').notNull().references(() => fileBlobs.hash, { onDelete: 'cascade' }),
	createdAt: timestamp('created_at').defaultNow().notNull(),
});

// A grant authorizes a scope to read a blob. The set of grants for a hash is
// the source of truth both for "who can fetch this" and for GC ("delete when
// no grants remain"). Replaces the old refCount column.
//
// scopeType:
//   'chat'    — scopeId is a personal chat id; readable by chat members
//   'avatar'  — scopeId is a user id; world-readable to authenticated users
//   'pending' — scopeId is the uploader's user id; readable only by uploader.
//               Created by /upload before a chat exists; swapped to 'chat'
//               on /send. GC sweeps stale pending grants > 24h old.
export const blobGrants = pgTable('blob_grants', {
	fileHash: text('file_hash').notNull().references(() => fileBlobs.hash, { onDelete: 'cascade' }),
	scopeType: text('scope_type').notNull(),
	scopeId: text('scope_id').notNull(),
	createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
	pk: primaryKey({ columns: [t.fileHash, t.scopeType, t.scopeId] }),
	scopeIdx: index('blob_grants_scope_idx').on(t.scopeType, t.scopeId),
}));

// Local mirror of personal-chat membership, kept in sync via NATS
// (echo.chats.dm.created / .deleted). Used by the file-fetch authz check.
export const dmChatMembers = pgTable('dm_chat_members', {
	chatId: text('chat_id').notNull(),
	userId: text('user_id').notNull(),
}, (t) => ({
	pk: primaryKey({ columns: [t.chatId, t.userId] }),
	userIdx: index('dm_chat_members_user_idx').on(t.userId),
}));

// Local mirror of group membership, kept in sync via NATS
// (echo.groups.created / .member.joined / .member.left / .deleted).
// Used to authorize group-scoped blob reads.
export const groupMembersMirror = pgTable('group_members_mirror', {
	groupId: text('group_id').notNull(),
	userId: text('user_id').notNull(),
}, (t) => ({
	pk: primaryKey({ columns: [t.groupId, t.userId] }),
	userIdx: index('group_members_mirror_user_idx').on(t.userId),
}));
