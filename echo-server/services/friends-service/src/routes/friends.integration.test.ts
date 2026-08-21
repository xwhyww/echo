import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { TEST_INTERNAL_KEY } from '@echo/test-support';
import { harness } from '../testing/integration.js';

const { createUser, request } = harness;

/**
 * Friendship is one row shared by two people, which is where every interesting
 * case in this service comes from: the same pair must not produce two rows,
 * crossing requests have to collapse into an acceptance rather than a
 * duplicate, and every read has to work from either side of the row. None of
 * that is visible without a database — a unique constraint and a check
 * constraint are doing half the work.
 */
describe.skipIf(!harness.enabled)('friends-service routes', () => {
	beforeAll(() => harness.setup());
	beforeEach(() => harness.reset());

	describe('auth', () => {
		it('rejects an unauthenticated request', async () => {
			expect((await request(null, 'GET', '/friends')).status).toBe(401);
		});

		it('keeps /internal behind the internal key', async () => {
			const anon = await request(null, 'GET', '/internal/friendships-snapshot');
			expect(anon.status).toBe(401);

			// A user token is not an internal key, however valid it is.
			const user = await createUser();
			expect((await request(user, 'GET', '/internal/friendships-snapshot')).status).toBe(401);

			const withKey = await request(null, 'GET', '/internal/friendships-snapshot', undefined, {
				'X-Internal-Key': TEST_INTERNAL_KEY,
			});
			expect(withKey.status).toBe(200);
			expect(withKey.body.friendships).toEqual([]);
		});
	});

	describe('requesting', () => {
		it('creates a pending request visible from both sides', async () => {
			const a = await createUser();
			const b = await createUser();

			const sent = await request(a, 'POST', `/friends/request/${b.id}`);
			expect(sent.status).toBe(201);
			expect(sent.body.status).toBe('pending');

			expect((await request(a, 'GET', `/friends/status/${b.id}`)).body).toEqual({
				status: 'pending',
				direction: 'outgoing',
			});
			expect((await request(b, 'GET', `/friends/status/${a.id}`)).body).toEqual({
				status: 'pending',
				direction: 'incoming',
			});

			expect((await request(b, 'GET', '/friends/requests/incoming')).body.items).toEqual([
				expect.objectContaining({ userId: a.id }),
			]);
			expect((await request(a, 'GET', '/friends/requests/outgoing')).body.items).toEqual([
				expect.objectContaining({ userId: b.id }),
			]);
			expect((await request(b, 'GET', '/friends/requests/incoming/count')).body.count).toBe(1);
		});

		it('refuses a request to yourself', async () => {
			const a = await createUser();
			expect((await request(a, 'POST', `/friends/request/${a.id}`)).status).toBe(400);
		});

		it('refuses a second request to the same person', async () => {
			const a = await createUser();
			const b = await createUser();
			await request(a, 'POST', `/friends/request/${b.id}`);
			expect((await request(a, 'POST', `/friends/request/${b.id}`)).status).toBe(409);
		});

		it('auto-accepts when the two requests cross', async () => {
			const a = await createUser();
			const b = await createUser();

			await request(a, 'POST', `/friends/request/${b.id}`);
			// B has not seen A's request yet and sends their own. One row exists
			// already, so this cannot insert a second — it accepts instead.
			const crossed = await request(b, 'POST', `/friends/request/${a.id}`);
			expect(crossed.status).toBe(200);
			expect(crossed.body.status).toBe('accepted');

			expect((await request(a, 'GET', `/friends/status/${b.id}`)).body).toEqual({
				status: 'friends',
			});
			expect((await request(a, 'GET', '/friends')).body.items).toHaveLength(1);
			expect((await request(b, 'GET', '/friends')).body.items).toHaveLength(1);
		});

		it('refuses a request to someone who is already a friend', async () => {
			const a = await createUser();
			const b = await createUser();
			await request(a, 'POST', `/friends/request/${b.id}`);
			await request(b, 'POST', `/friends/accept/${a.id}`);

			expect((await request(a, 'POST', `/friends/request/${b.id}`)).status).toBe(409);
			expect((await request(b, 'POST', `/friends/request/${a.id}`)).status).toBe(409);
		});

		it('reuses the declined row when the other side asks again', async () => {
			const a = await createUser();
			const b = await createUser();
			await request(a, 'POST', `/friends/request/${b.id}`);
			await request(b, 'POST', `/friends/decline/${a.id}`);

			// B now asks A. The pair already has a row and `unique_friendship` is on
			// (requester, addressee), so this has to flip the existing one round
			// rather than insert — otherwise the second attempt would 500.
			const again = await request(b, 'POST', `/friends/request/${a.id}`);
			expect(again.status).toBe(201);
			expect(again.body.status).toBe('pending');

			expect((await request(a, 'GET', `/friends/status/${b.id}`)).body).toEqual({
				status: 'pending',
				direction: 'incoming',
			});

			const snapshot = await request(null, 'GET', '/internal/friendships-snapshot', undefined, {
				'X-Internal-Key': TEST_INTERNAL_KEY,
			});
			expect(snapshot.body.friendships).toHaveLength(1);
		});
	});

	describe('answering', () => {
		it('accepts a pending request', async () => {
			const a = await createUser();
			const b = await createUser();
			await request(a, 'POST', `/friends/request/${b.id}`);

			expect((await request(b, 'POST', `/friends/accept/${a.id}`)).status).toBe(200);
			expect((await request(b, 'GET', '/friends/requests/incoming/count')).body.count).toBe(0);
			expect((await request(a, 'GET', '/friends')).body.items).toEqual([
				expect.objectContaining({ userId: b.id }),
			]);
		});

		it('does not let the requester accept their own request', async () => {
			const a = await createUser();
			const b = await createUser();
			await request(a, 'POST', `/friends/request/${b.id}`);

			// The lookup is by (requester=:userId, addressee=me), so A asking to
			// accept B finds nothing.
			expect((await request(a, 'POST', `/friends/accept/${b.id}`)).status).toBe(404);
		});

		it('reads a declined request as no relationship at all', async () => {
			const a = await createUser();
			const b = await createUser();
			await request(a, 'POST', `/friends/request/${b.id}`);
			await request(b, 'POST', `/friends/decline/${a.id}`);

			expect((await request(a, 'GET', `/friends/status/${b.id}`)).body).toEqual({
				status: 'none',
			});
			expect((await request(b, 'GET', '/friends/requests/incoming')).body.items).toEqual([]);

			// The row is still there, though — declining is not deleting.
			const snapshot = await request(null, 'GET', '/internal/friendships-snapshot', undefined, {
				'X-Internal-Key': TEST_INTERNAL_KEY,
			});
			expect(snapshot.body.friendships).toEqual([
				expect.objectContaining({ status: 'declined' }),
			]);
		});

		it('404s on accepting a request that was never sent', async () => {
			const a = await createUser();
			const b = await createUser();
			expect((await request(b, 'POST', `/friends/accept/${a.id}`)).status).toBe(404);
			expect((await request(b, 'POST', `/friends/decline/${a.id}`)).status).toBe(404);
		});
	});

	describe('withdrawing', () => {
		it('cancels an outgoing request and leaves no row', async () => {
			const a = await createUser();
			const b = await createUser();
			await request(a, 'POST', `/friends/request/${b.id}`);

			expect((await request(a, 'DELETE', `/friends/request/${b.id}`)).status).toBe(200);
			expect((await request(b, 'GET', '/friends/requests/incoming/count')).body.count).toBe(0);

			// Deleted, not declined — so the pair can start over cleanly.
			expect((await request(a, 'POST', `/friends/request/${b.id}`)).status).toBe(201);
		});

		it('removes a friendship from either side', async () => {
			const a = await createUser();
			const b = await createUser();
			await request(a, 'POST', `/friends/request/${b.id}`);
			await request(b, 'POST', `/friends/accept/${a.id}`);

			// The addressee removing works as well as the requester, because the
			// lookup matches the pair in either order.
			expect((await request(b, 'DELETE', `/friends/${a.id}`)).status).toBe(200);
			expect((await request(a, 'GET', '/friends')).body.items).toEqual([]);
			expect((await request(a, 'GET', `/friends/status/${b.id}`)).body).toEqual({
				status: 'none',
			});
		});

		it('404s on removing someone who is not a friend', async () => {
			const a = await createUser();
			const b = await createUser();
			await request(a, 'POST', `/friends/request/${b.id}`);

			// Pending is not accepted, so this is not the route to cancel with.
			expect((await request(a, 'DELETE', `/friends/${b.id}`)).status).toBe(404);
		});
	});

	describe('bulk status', () => {
		it('classifies each id in one call', async () => {
			const me = await createUser();
			const friend = await createUser();
			const incoming = await createUser();
			const outgoing = await createUser();
			const stranger = await createUser();

			await request(me, 'POST', `/friends/request/${friend.id}`);
			await request(friend, 'POST', `/friends/accept/${me.id}`);
			await request(incoming, 'POST', `/friends/request/${me.id}`);
			await request(me, 'POST', `/friends/request/${outgoing.id}`);

			const res = await request(me, 'POST', '/friends/status/bulk', {
				userIds: [friend.id, incoming.id, outgoing.id, stranger.id, me.id],
			});

			expect(res.body.statuses).toEqual({
				[friend.id]: { status: 'friends' },
				[incoming.id]: { status: 'pending', direction: 'incoming' },
				[outgoing.id]: { status: 'pending', direction: 'outgoing' },
				[stranger.id]: { status: 'none' },
				[me.id]: { status: 'self' },
			});
		});

		it('answers an empty list without touching the database', async () => {
			const me = await createUser();
			expect((await request(me, 'POST', '/friends/status/bulk', { userIds: [] })).body).toEqual({
				statuses: {},
			});
		});
	});

	describe('paging', () => {
		it('pages the friend list newest-first with a cursor', async () => {
			const me = await createUser();
			const others = [];
			for (let i = 0; i < 5; i++) {
				const other = await createUser();
				await request(me, 'POST', `/friends/request/${other.id}`);
				await request(other, 'POST', `/friends/accept/${me.id}`);
				others.push(other);
			}

			const first = await request(me, 'GET', '/friends?limit=2');
			expect(first.body.items).toHaveLength(2);
			expect(first.body.nextCursor).toBeTruthy();
			// Ordered by acceptance time descending, so the last one accepted leads.
			expect(first.body.items[0].userId).toBe(others[4].id);

			const second = await request(
				me,
				'GET',
				`/friends?limit=2&cursor=${encodeURIComponent(first.body.nextCursor)}`,
			);
			expect(second.body.items.map((i: { userId: string }) => i.userId)).toEqual([
				others[2].id,
				others[1].id,
			]);

			const last = await request(me, 'GET', '/friends?limit=10');
			expect(last.body.items).toHaveLength(5);
			expect(last.body.nextCursor).toBeNull();
		});
	});
});
