/**
 * What the personal-chat route files have in common: the database handle, the
 * blob-grant helpers, reaction aggregation, link extraction, the privacy checks
 * and the per-message limits.
 *
 * Lifted out of what used to be a single 2100-line `personalChats.ts`, along
 * the same lines groups-service is already divided. Nothing here is new — the
 * bodies are unchanged; they simply have a home now instead of being stacked
 * above the first route.
 */
import { randomUUID } from 'crypto';
import { or, eq, and, gt, count, ne, sql, inArray, lt, desc, max, ilike, isNotNull, isNull } from 'drizzle-orm';
import type { AuthEnv } from '@echo/shared';
import { createDb } from '../../db/index.js';
import { personalChats, personalMessages, personalChatReads, userCache, personalMessageLinks, personalMessageDeletions, personalMessageReactions } from '../../db/schema.js';
import { config } from '../../config.js';
import { publishDmEvent, publishDmReadEvent, publishDmEditedEvent, publishDmDeletedEvent, publishDmPinnedEvent, publishDmUnpinnedEvent, publishDmReactionEvent, publishDmChatCreated } from '../../nats.js';
import type { DmReactionSummary } from '@echo/shared';
import { encryptForInsert, decryptRow, stripCiphertext, attachmentHashesFromRow } from '../../crypto.js';
import { log } from '../../log.js';

export function extractAttachmentHashes(attachments: unknown): string[] {
	if (!Array.isArray(attachments)) return [];
	const hashes: string[] = [];
	for (const a of attachments) {
		const h = a && typeof a === 'object' && 'hash' in a ? (a as { hash?: string }).hash : null;
		if (h) hashes.push(h);
	}
	return hashes;
}

export async function addChatGrants(hashes: string[], chatId: string, token: string): Promise<boolean> {
	if (hashes.length === 0) return true;
	try {
		const r = await fetch(`${config.blobServiceUrl}/blobs/grants`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
			body: JSON.stringify({ scopeType: 'chat', scopeId: chatId, hashes }),
		});
		if (!r.ok) {
			log.error({ status: r.status, chatId }, 'addChatGrants failed');
			return false;
		}
		return true;
	} catch (err) {
		log.error({ err }, 'addChatGrants threw');
		return false;
	}
}

// Used after /send to clean up the temporary pending(userId) grants the
// /upload flow created. Idempotent — pending grants only exist if the client
// uploaded via the bare /upload path with no chat context.
export async function removePendingGrants(hashes: string[], userId: string, token: string): Promise<void> {
	if (hashes.length === 0) return;
	await fetch(`${config.blobServiceUrl}/blobs/grants`, {
		method: 'DELETE',
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
		body: JSON.stringify({ scopeType: 'pending', scopeId: userId, hashes }),
	}).catch(() => {});
}

// Remove the chat grant for each hash that no live message in this chat
// still references. The grant is per-(hash, chat), so if two messages share
// an attachment we must keep the grant until both are gone.
export async function removeChatGrantsIfUnused(hashes: string[], chatId: string, token: string): Promise<void> {
	if (hashes.length === 0) return;

	const toRemove: string[] = [];
	for (const h of hashes) {
		const found = await db
			.select({ one: sql<number>`1` })
			.from(personalMessages)
			.where(
				and(
					eq(personalMessages.chatId, chatId),
					sql`COALESCE(${personalMessages.attachmentsMeta}, ${personalMessages.attachments}) @> ${JSON.stringify([{ hash: h }])}::jsonb`,
				),
			)
			.limit(1);
		if (found.length === 0) toRemove.push(h);
	}

	if (toRemove.length === 0) return;
	await fetch(`${config.blobServiceUrl}/blobs/grants`, {
		method: 'DELETE',
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
		body: JSON.stringify({ scopeType: 'chat', scopeId: chatId, hashes: toRemove }),
	}).catch(() => {});
}

export const MAX_FILES_PER_MESSAGE = 5;
export const MAX_UNIQUE_REACTIONS_PER_MESSAGE = 10;

export const db = createDb(config.databaseUrl);

export async function getReactionsForMessages(messageIds: string[]): Promise<Record<string, DmReactionSummary[]>> {
	const out: Record<string, DmReactionSummary[]> = {};
	if (messageIds.length === 0) return out;
	const rows = await db
		.select({
			messageId: personalMessageReactions.messageId,
			emoji: personalMessageReactions.emoji,
			userId: personalMessageReactions.userId,
			createdAt: personalMessageReactions.createdAt,
		})
		.from(personalMessageReactions)
		.where(inArray(personalMessageReactions.messageId, messageIds))
		.orderBy(personalMessageReactions.createdAt);
	for (const r of rows) {
		const perMsg = (out[r.messageId] ??= []);
		let bucket = perMsg.find((b) => b.emoji === r.emoji);
		if (!bucket) {
			bucket = { emoji: r.emoji, count: 0, userIds: [], reactedAts: [] };
			perMsg.push(bucket);
		}
		bucket.count += 1;
		bucket.userIds.push(r.userId);
		bucket.reactedAts.push(r.createdAt.toISOString());
	}
	return out;
}

export async function aggregateReactionsForMessage(messageId: string): Promise<DmReactionSummary[]> {
	const map = await getReactionsForMessages([messageId]);
	return map[messageId] ?? [];
}

export const URL_REGEX = /https?:\/\/[^\s)>\]]+/g;

// Deduplicated: the links gallery lists a message's URLs, and the same URL
// pasted twice in one message is still one link there, not two rows.
export function extractUrls(content: string): string[] {
	return [...new Set(content.match(URL_REGEX) ?? [])];
}

export async function syncMessageLinks(messageId: string, chatId: string, content: string, createdAt: Date) {
	await db.delete(personalMessageLinks).where(eq(personalMessageLinks.messageId, messageId));
	const urls = extractUrls(content);
	if (urls.length > 0) {
		await db.insert(personalMessageLinks).values(
			urls.map((url) => ({ messageId, chatId, url, createdAt })),
		);
	}
}

export async function areFriends(currentUserId: string, targetId: string, token: string): Promise<boolean> {
	try {
		const resp = await fetch(`${config.friendsServiceUrl}/friends/status/${targetId}`, {
			headers: { Authorization: `Bearer ${token}` },
		});
		if (resp.ok) {
			const data = await resp.json() as { status: string };
			return data.status === 'friends';
		}
	} catch {}
	return false;
}

export function applyPhotoPrivacy(
	user: { avatarUrl?: string | null; privacyPhoto?: string; [key: string]: unknown },
	viewerId: string,
	isFriend: boolean,
) {
	const { privacyPhoto, ...rest } = user;
	if (user.id === viewerId) return rest;
	if (privacyPhoto === 'nobody') rest.avatarUrl = null;
	else if (privacyPhoto === 'friends' && !isFriend) rest.avatarUrl = null;
	return rest;
}

/** Check if the target user's messaging privacy allows this sender to message them */
export async function checkMessagingPrivacy(
	senderId: string, targetId: string, chatExists: boolean,
): Promise<{ allowed: boolean; reason?: string }> {
	const target = await db.query.userCache.findFirst({
		where: eq(userCache.id, targetId),
		columns: { privacyMessaging: true },
	});
	const privacyMessaging = target?.privacyMessaging ?? 'all';

	if (privacyMessaging === 'all') return { allowed: true };

	if (privacyMessaging === 'existing') {
		if (chatExists) return { allowed: true };
		return { allowed: false, reason: 'This user only accepts messages from existing chats' };
	}

	return { allowed: true };
}

/** Look up a user by username — first check local cache, then HTTP fallback to user-service */
export async function findUserByUsername(username: string) {
	const cached = await db.query.userCache.findFirst({
		where: eq(userCache.username, username),
		columns: { id: true, username: true, displayName: true, avatarUrl: true, isOnline: true },
	});
	if (cached) return cached;

	// HTTP fallback to user-service — this path only hits on cache miss
	// User-service requires auth, but this is an internal call so we skip for now
	// In a real setup, use service-to-service auth or an internal endpoint
	return null;
}

/** Count unread messages for a user in a chat */
export async function getUnreadCount(userId: string, chatId: string): Promise<number> {
	const read = await db.query.personalChatReads.findFirst({
		where: and(
			eq(personalChatReads.userId, userId),
			eq(personalChatReads.chatId, chatId)
		),
	});

	if (!read) return 0;

	const [result] = await db
		.select({ count: count() })
		.from(personalMessages)
		.where(
			and(
				eq(personalMessages.chatId, chatId),
				ne(personalMessages.authorId, userId),
				gt(personalMessages.createdAt, read.lastReadAt)
			)
		);

	return result.count;
}

// Re-exported so each route file has one import line instead of the eight
// this module already carries. They are the same symbols, not wrappers.
export {
	DmReactionSummary,
	and,
	attachmentHashesFromRow,
	config,
	count,
	createDb,
	decryptRow,
	desc,
	encryptForInsert,
	eq,
	gt,
	ilike,
	inArray,
	isNotNull,
	isNull,
	log,
	lt,
	max,
	ne,
	or,
	personalChatReads,
	personalChats,
	personalMessageDeletions,
	personalMessageLinks,
	personalMessageReactions,
	personalMessages,
	publishDmChatCreated,
	publishDmDeletedEvent,
	publishDmEditedEvent,
	publishDmEvent,
	publishDmPinnedEvent,
	publishDmReactionEvent,
	publishDmReadEvent,
	publishDmUnpinnedEvent,
	randomUUID,
	sql,
	stripCiphertext,
	userCache,
};
export type { AuthEnv };
