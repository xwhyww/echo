import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { TestUser } from '@echo/test-support';
import { harness } from '../../testing/integration.js';

const { createUser, request, exec } = harness;

/**
 * A personal chat is one row shared by two people, and almost every rule in
 * this service is "is the caller one of them" expressed as a `where` clause.
 * That is precisely the kind of check a mock cannot fail: it either matches the
 * row or it does not, and only a database knows.
 *
 * The other reason to run this against Postgres is that messages are encrypted
 * at rest. `messageCipher.test.ts` proves the cipher; what is untested without
 * a table is that the plaintext columns really are left empty on write, that
 * the AAD binds a row to its own id, and that a read decrypts back to what was
 * sent.
 *
 * Mount order in `personalChats.ts` is load-bearing — `/by-user/:userId` has to
 * win over `/:chatId/messages` — so a couple of tests below exist to keep that
 * from silently regressing.
 */
describe.skipIf(!harness.enabled)('pers-chats-service routes', () => {
	beforeAll(() => harness.setup());
	beforeEach(() => harness.reset());

	/** Two users with a chat between them. */
	async function pair(): Promise<{ me: TestUser; them: TestUser; chatId: string }> {
		const me = await createUser();
		const them = await createUser();
		const res = await request(me, 'POST', '/personal-chats', { username: them.username });
		expect(res.status).toBe(201);
		return { me, them, chatId: res.body.chat.id as string };
	}

	async function send(user: TestUser, chatId: string, content: string) {
		const res = await request(user, 'POST', `/personal-chats/${chatId}/messages`, { content });
		expect(res.status).toBe(201);
		return res.body.message;
	}

	describe('auth', () => {
		it('rejects an unauthenticated request', async () => {
			expect((await request(null, 'GET', '/personal-chats')).status).toBe(401);
		});
	});

	describe('POST /personal-chats', () => {
		it('creates a chat and seeds a read marker for both people', async () => {
			const { me, them, chatId } = await pair();

			expect((await request(me, 'GET', '/personal-chats')).body.chats).toHaveLength(1);
			expect((await request(them, 'GET', '/personal-chats')).body.chats).toHaveLength(1);

			// Both markers, not just the creator's — otherwise the other person's
			// unread count starts undefined and the sidebar has nothing to compare.
			const reads = await exec`SELECT user_id FROM personal_chat_reads WHERE chat_id = ${chatId}`;
			expect(reads).toHaveLength(2);
		});

		it('returns the existing chat instead of making a second one', async () => {
			const { me, them, chatId } = await pair();

			// From the other side this time — the pair is unordered, so a naive
			// (user1, user2) lookup would miss and create a duplicate.
			const again = await request(them, 'POST', '/personal-chats', { username: me.username });
			expect(again.status).toBe(200);
			expect(again.body.chat.id).toBe(chatId);
			expect(await exec`SELECT id FROM personal_chats`).toHaveLength(1);
		});

		it('404s on a username nobody has, and 400s on none at all', async () => {
			const me = await createUser();
			expect((await request(me, 'POST', '/personal-chats', { username: 'ghost' })).status).toBe(404);
			expect((await request(me, 'POST', '/personal-chats', {})).status).toBe(400);
		});

		it('honours privacyMessaging=existing when there is no chat yet', async () => {
			const me = await createUser();
			const them = await createUser();
			await exec`UPDATE user_cache SET privacy_messaging = 'existing' WHERE id = ${them.id}`;

			const blocked = await request(me, 'POST', '/personal-chats', { username: them.username });
			expect(blocked.status).toBe(403);
			expect(await exec`SELECT id FROM personal_chats`).toHaveLength(0);

			// They open it themselves, and now the chat exists — so writing into it
			// is allowed from either side.
			const opened = await request(them, 'POST', '/personal-chats', { username: me.username });
			expect(opened.status).toBe(201);
			expect(
				(await request(me, 'POST', `/personal-chats/${opened.body.chat.id}/messages`, {
					content: 'hi',
				})).status,
			).toBe(201);
		});
	});

	describe('GET /personal-chats/by-user/:userId', () => {
		it('wins over /:chatId/messages, which shares its shape', async () => {
			const { me, them, chatId } = await pair();

			// `by-user` is registered first on purpose. If that order ever flips,
			// this reads as a chat id and 404s.
			const res = await request(me, 'GET', `/personal-chats/by-user/${them.id}`);
			expect(res.status).toBe(200);
			expect(res.body.chat.id).toBe(chatId);
		});

		it('answers with the user but no chat when none has been opened', async () => {
			const me = await createUser();
			const them = await createUser();

			const res = await request(me, 'GET', `/personal-chats/by-user/${them.id}`);
			expect(res.body.chat).toBeNull();
			expect(res.body.user.id).toBe(them.id);
		});

		it('answers with neither for someone who does not exist', async () => {
			const me = await createUser();
			const res = await request(me, 'GET', '/personal-chats/by-user/00000000-0000-0000-0000-000000000000');
			expect(res.body).toEqual({ chat: null });
		});

		it('hides an avatar the other person keeps for friends only', async () => {
			const { me, them } = await pair();
			await exec`UPDATE user_cache SET avatar_url = 'https://x/a.png', privacy_photo = 'friends' WHERE id = ${them.id}`;

			// friends-service is unreachable here, so the check fails closed —
			// which is the behaviour worth pinning down: an outage must not turn
			// into a leak.
			const res = await request(me, 'GET', `/personal-chats/by-user/${them.id}`);
			expect(res.body.chat.user.avatarUrl).toBeNull();
			expect(res.body.chat.user).not.toHaveProperty('privacyPhoto');
		});
	});

	describe('membership gates', () => {
		it('keeps a third party out of the chat entirely', async () => {
			const { me, chatId } = await pair();
			const outsider = await createUser();
			const message = await send(me, chatId, 'private');

			expect((await request(outsider, 'GET', `/personal-chats/${chatId}/messages`)).status)
				.toBe(404);
			expect(
				(await request(outsider, 'POST', `/personal-chats/${chatId}/messages`, { content: 'x' }))
					.status,
			).toBe(404);
			expect((await request(outsider, 'POST', `/personal-chats/${chatId}/read`)).status).toBe(404);
			expect(
				(await request(outsider, 'PUT', `/personal-chats/messages/${message.id}/reaction`, {
					emoji: '👍',
				})).status,
			).toBe(404);
			expect((await request(outsider, 'DELETE', `/personal-chats/messages/${message.id}`)).status)
				.toBe(403);
		});
	});

	describe('messages', () => {
		it('round-trips content through the at-rest encryption', async () => {
			const { me, chatId } = await pair();
			const content = 'привет — ciphertext round trip';

			const sent = await send(me, chatId, content);
			expect(sent.content).toBe(content);

			const listed = await request(me, 'GET', `/personal-chats/${chatId}/messages`);
			expect(listed.body.messages.at(-1).content).toBe(content);

			// The plaintext column is emptied on write, and the ciphertext is what
			// is actually stored.
			const rows = await exec`SELECT content, content_ciphertext FROM personal_messages WHERE id = ${sent.id}`;
			expect(rows[0].content).toBe('');
			expect(rows[0].content_ciphertext).toBeTruthy();
			// And the response never carries the ciphertext back out.
			expect(sent).not.toHaveProperty('contentCiphertext');
		});

		it('refuses ciphertext moved onto another row', async () => {
			const { me, chatId } = await pair();
			const first = await send(me, chatId, 'first message');
			const second = await send(me, chatId, 'second message');

			// The message id is the AAD, so a row's ciphertext must not decrypt
			// under a different id — this is what stops someone with database
			// access from shuffling messages between conversations.
			await exec`
				UPDATE personal_messages
				SET content_ciphertext = (SELECT content_ciphertext FROM personal_messages WHERE id = ${first.id}),
				    content_nonce = (SELECT content_nonce FROM personal_messages WHERE id = ${first.id})
				WHERE id = ${second.id}`;

			const listed = await request(me, 'GET', `/personal-chats/${chatId}/messages`);
			// It refuses outright rather than serving the wrong plaintext. That is
			// the whole point of binding the ciphertext to the row's id, and the
			// price is that one tampered row makes the read fail instead of
			// degrading — which is the correct way round for this trade.
			expect(listed.status).not.toBe(200);
			expect(JSON.stringify(listed.body)).not.toContain('first message');
		});

		it('rejects an empty message and one over the limit', async () => {
			const { me, chatId } = await pair();
			expect(
				(await request(me, 'POST', `/personal-chats/${chatId}/messages`, { content: '   ' }))
					.status,
			).toBe(400);
			expect(
				(await request(me, 'POST', `/personal-chats/${chatId}/messages`, {
					content: 'x'.repeat(501),
				})).status,
			).toBe(400);
		});

		it('snapshots the message being replied to', async () => {
			const { me, them, chatId } = await pair();
			const original = await send(them, chatId, 'the original');

			const reply = await request(me, 'POST', `/personal-chats/${chatId}/messages`, {
				content: 'answering',
				replyToId: original.id,
			});
			expect(reply.body.message.replyToId).toBe(original.id);
			expect(reply.body.message.replyToSnapshot).toMatchObject({
				authorId: them.id,
				content: 'the original',
			});

			// The snapshot survives the original being deleted — that is the point
			// of copying it rather than joining.
			await request(them, 'DELETE', `/personal-chats/messages/${original.id}`);
			const listed = await request(me, 'GET', `/personal-chats/${chatId}/messages`);
			const stillThere = listed.body.messages.find((m: { id: string }) => m.id === reply.body.message.id);
			expect(stillThere.replyToSnapshot.content).toBe('the original');
		});

		it('ignores a replyToId from another chat', async () => {
			const { me, chatId } = await pair();
			const other = await pair();
			const foreign = await send(other.me, other.chatId, 'not yours');

			const res = await request(me, 'POST', `/personal-chats/${chatId}/messages`, {
				content: 'x',
				replyToId: foreign.id,
			});
			expect(res.status).toBe(201);
			// Dropped rather than honoured — a snapshot would copy the other chat's
			// text into this one.
			expect(res.body.message.replyToId).toBeNull();
			expect(res.body.message.replyToSnapshot).toBeNull();
		});

		it('only lets the author edit, and only for a day', async () => {
			const { me, them, chatId } = await pair();
			const message = await send(me, chatId, 'mine');

			expect(
				(await request(them, 'PATCH', `/personal-chats/messages/${message.id}`, {
					content: 'yours',
				})).status,
			).toBe(403);

			const edited = await request(me, 'PATCH', `/personal-chats/messages/${message.id}`, {
				content: 'edited',
			});
			expect(edited.status).toBe(200);

			const listed = await request(me, 'GET', `/personal-chats/${chatId}/messages`);
			expect(listed.body.messages.at(-1)).toMatchObject({ content: 'edited', isEdited: true });

			// Age it past the window rather than waiting a day for it.
			await exec`UPDATE personal_messages SET created_at = now() - interval '25 hours' WHERE id = ${message.id}`;
			expect(
				(await request(me, 'PATCH', `/personal-chats/messages/${message.id}`, { content: 'late' }))
					.status,
			).toBe(403);
		});

		it('pages backwards with a cursor', async () => {
			const { me, chatId } = await pair();
			for (let i = 0; i < 5; i++) await send(me, chatId, `m${i}`);

			const first = await request(me, 'GET', `/personal-chats/${chatId}/messages?limit=2`);
			expect(first.body.messages.map((m: { content: string }) => m.content)).toEqual(['m3', 'm4']);

			const cursor = first.body.messages[0].createdAt;
			const second = await request(
				me,
				'GET',
				`/personal-chats/${chatId}/messages?limit=2&cursor=${encodeURIComponent(cursor)}`,
			);
			expect(second.body.messages.map((m: { content: string }) => m.content)).toEqual(['m1', 'm2']);
		});
	});

	describe('deleting', () => {
		it('for_me hides it from one side only', async () => {
			const { me, them, chatId } = await pair();
			const message = await send(them, chatId, 'awkward');

			expect(
				(await request(me, 'DELETE', `/personal-chats/messages/${message.id}?mode=for_me`)).status,
			).toBe(200);

			// The row is still there — it is hidden, not deleted.
			expect(await exec`SELECT id FROM personal_messages WHERE id = ${message.id}`).toHaveLength(1);
			const mine = await request(me, 'GET', `/personal-chats/${chatId}/messages`);
			expect(mine.body.messages.find((m: { id: string }) => m.id === message.id)).toBeUndefined();
			const theirs = await request(them, 'GET', `/personal-chats/${chatId}/messages`);
			expect(theirs.body.messages.find((m: { id: string }) => m.id === message.id)).toBeTruthy();
		});

		it('for_everyone takes the row and its reactions with it', async () => {
			const { me, them, chatId } = await pair();
			const message = await send(me, chatId, 'doomed');
			await request(them, 'PUT', `/personal-chats/messages/${message.id}/reaction`, { emoji: '👍' });

			expect((await request(me, 'DELETE', `/personal-chats/messages/${message.id}`)).status)
				.toBe(200);
			expect(await exec`SELECT id FROM personal_messages WHERE id = ${message.id}`).toHaveLength(0);
			// ON DELETE CASCADE, otherwise the reaction rows outlive their message.
			expect(await exec`SELECT id FROM personal_message_reactions`).toHaveLength(0);
		});

		it('caps a batch delete and refuses an empty one', async () => {
			const { me } = await pair();
			expect(
				(await request(me, 'POST', '/personal-chats/messages/batch-delete', { messageIds: [] }))
					.status,
			).toBe(400);
			expect(
				(await request(me, 'POST', '/personal-chats/messages/batch-delete', {
					messageIds: Array.from({ length: 51 }, () => '00000000-0000-0000-0000-000000000000'),
				})).status,
			).toBe(400);
		});

		it('will not batch-delete messages from a chat the caller is not in', async () => {
			const { me } = await pair();
			const other = await pair();
			const foreign = await send(other.me, other.chatId, 'not yours');

			const res = await request(me, 'POST', '/personal-chats/messages/batch-delete', {
				messageIds: [foreign.id],
				mode: 'for_me',
			});
			expect(res.status).toBe(403);
			expect(await exec`SELECT id FROM personal_message_deletions`).toHaveLength(0);
		});
	});

	describe('reactions', () => {
		it('keeps one per user per message and clears on request', async () => {
			const { me, them, chatId } = await pair();
			const message = await send(me, chatId, 'react to me');

			const added = await request(them, 'PUT', `/personal-chats/messages/${message.id}/reaction`, {
				emoji: '👍',
			});
			expect(added.body.reactions).toEqual([
				expect.objectContaining({ emoji: '👍', count: 1 }),
			]);

			// The unique index is on (user, message), so a second emoji has to
			// replace the first rather than add a row.
			const swapped = await request(them, 'PUT', `/personal-chats/messages/${message.id}/reaction`, {
				emoji: '🔥',
			});
			expect(swapped.body.reactions).toEqual([
				expect.objectContaining({ emoji: '🔥', count: 1 }),
			]);
			expect(await exec`SELECT id FROM personal_message_reactions`).toHaveLength(1);

			const cleared = await request(
				them,
				'DELETE',
				`/personal-chats/messages/${message.id}/reaction`,
			);
			expect(cleared.body.reactions).toEqual([]);
		});

		it('rejects a missing or absurd emoji', async () => {
			const { me, chatId } = await pair();
			const message = await send(me, chatId, 'x');

			expect(
				(await request(me, 'PUT', `/personal-chats/messages/${message.id}/reaction`, { emoji: '' }))
					.status,
			).toBe(400);
			expect(
				(await request(me, 'PUT', `/personal-chats/messages/${message.id}/reaction`, {
					emoji: 'x'.repeat(33),
				})).status,
			).toBe(400);
		});
	});

	describe('unread counts and pinning', () => {
		it('counts what the other person has not read, and clears on read', async () => {
			const { me, them, chatId } = await pair();
			await send(me, chatId, 'one');
			await send(me, chatId, 'two');

			const before = await request(them, 'GET', '/personal-chats');
			expect(before.body.chats[0].unreadCount).toBe(2);
			// Your own messages are never unread for you.
			expect((await request(me, 'GET', '/personal-chats')).body.chats[0].unreadCount).toBe(0);

			expect((await request(them, 'POST', `/personal-chats/${chatId}/read`)).status).toBe(200);
			expect((await request(them, 'GET', '/personal-chats')).body.chats[0].unreadCount).toBe(0);
		});

		it('pins a message for both sides and unpins again', async () => {
			const { me, them, chatId } = await pair();
			const message = await send(me, chatId, 'important');

			expect((await request(me, 'POST', `/personal-chats/messages/${message.id}/pin`)).status)
				.toBe(200);

			// Pinning is a property of the chat, so the other person sees it too.
			const pinned = await request(them, 'GET', `/personal-chats/${chatId}/pinned`);
			expect(pinned.body.messages).toHaveLength(1);
			expect(pinned.body.messages[0].content).toBe('important');

			expect((await request(them, 'DELETE', `/personal-chats/messages/${message.id}/pin`)).status)
				.toBe(200);
			expect((await request(me, 'GET', `/personal-chats/${chatId}/pinned`)).body.messages)
				.toHaveLength(0);
		});
	});

	describe('search', () => {
		it('finds a message by a word in it, and only inside that chat', async () => {
			const { me, chatId } = await pair();
			const other = await pair();
			await send(me, chatId, 'the quick brown fox');
			await send(other.me, other.chatId, 'the quick brown fox');

			const res = await request(me, 'GET', `/personal-chats/${chatId}/search?q=brown`);
			expect(res.status).toBe(200);
			expect(res.body.messages).toHaveLength(1);
			expect(res.body.messages[0].content).toBe('the quick brown fox');
		});

		it('follows an edit, because the search column is rewritten with it', async () => {
			const { me, chatId } = await pair();
			const message = await send(me, chatId, 'aardvark');

			await request(me, 'PATCH', `/personal-chats/messages/${message.id}`, { content: 'buffalo' });

			expect((await request(me, 'GET', `/personal-chats/${chatId}/search?q=aardvark`)).body.messages)
				.toHaveLength(0);
			expect((await request(me, 'GET', `/personal-chats/${chatId}/search?q=buffalo`)).body.messages)
				.toHaveLength(1);
		});
	});
});
