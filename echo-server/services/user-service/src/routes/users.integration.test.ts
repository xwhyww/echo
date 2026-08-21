import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { TEST_INTERNAL_KEY } from '@echo/test-support';
import { FRIENDS_STUB_PORT, harness } from '../testing/integration.js';

const { createUser, request, exec } = harness;

/**
 * The interesting behaviour in user-service is privacy: which of a profile's
 * fields a given caller is allowed to see. Every rule reads a column and, for
 * the `friends` setting, an answer from friends-service — so the tests need a
 * real row and a real answer, not a mock of the function under test.
 *
 * friends-service is stubbed rather than run: the boundary is a small HTTP
 * contract, and what is worth testing here is *our* side of it — including the
 * branch where the sibling is unreachable, which must fail closed.
 */

/** Pairs, unordered, that the stub reports as friends. Set per test. */
let friendPairs: Set<string> = new Set();
/** When false the stub refuses to answer at all, standing in for an outage. */
let stubUp = true;
let stub: Server;

const pairKey = (a: string, b: string) => [a, b].sort().join('|');

describe.skipIf(!harness.enabled)('user-service routes', () => {
	beforeAll(async () => {
		await harness.setup();
		stub = createServer((req, res) => {
			if (!stubUp) {
				res.statusCode = 503;
				res.end('{}');
				return;
			}
			// The caller's identity is in the token; the stub does not verify it,
			// it only needs the subject, so it reads the unverified payload.
			const token = (req.headers.authorization ?? '').slice(7);
			const me = decodeSubject(token);

			if (req.url?.startsWith('/friends/status/bulk')) {
				let body = '';
				req.on('data', (chunk) => (body += chunk));
				req.on('end', () => {
					const ids: string[] = JSON.parse(body || '{}').userIds ?? [];
					const statuses = Object.fromEntries(
						ids.map((id) => [
							id,
							{ status: friendPairs.has(pairKey(me, id)) ? 'friends' : 'none' },
						]),
					);
					res.setHeader('content-type', 'application/json');
					res.end(JSON.stringify({ statuses }));
				});
				return;
			}

			const target = req.url?.split('/').pop() ?? '';
			res.setHeader('content-type', 'application/json');
			res.end(
				JSON.stringify({ status: friendPairs.has(pairKey(me, target)) ? 'friends' : 'none' }),
			);
		});
		await new Promise<void>((resolve) => stub.listen(FRIENDS_STUB_PORT, '127.0.0.1', resolve));
	});

	afterAll(async () => {
		await new Promise<void>((resolve) => stub.close(() => resolve()));
	});

	beforeEach(async () => {
		await harness.reset();
		friendPairs = new Set();
		stubUp = true;
	});

	function decodeSubject(token: string): string {
		try {
			const payload = token.split('.')[1];
			return JSON.parse(Buffer.from(payload, 'base64url').toString()).userId ?? '';
		} catch {
			return '';
		}
	}

	describe('auth', () => {
		it('rejects an unauthenticated request', async () => {
			const me = await createUser();
			expect((await request(null, 'GET', `/users/${me.id}`)).status).toBe(401);
		});

		it('keeps /internal behind the internal key', async () => {
			const me = await createUser();
			expect((await request(me, 'GET', '/internal/users-snapshot')).status).toBe(401);

			const withKey = await request(null, 'GET', '/internal/users-snapshot', undefined, {
				'X-Internal-Key': TEST_INTERNAL_KEY,
			});
			expect(withKey.status).toBe(200);
			expect(withKey.body.users).toHaveLength(1);
		});
	});

	describe('PATCH /users/me', () => {
		it('updates only the fields sent', async () => {
			const me = await createUser('me_patch');
			const res = await request(me, 'PATCH', '/users/me', { displayName: 'New Name' });

			expect(res.status).toBe(200);
			expect(res.body.user).toMatchObject({ id: me.id, displayName: 'New Name' });
			// username was not in the patch and must be untouched.
			expect(res.body.user.username).toBe('me_patch');
		});

		it('rejects an empty patch and an over-long name', async () => {
			const me = await createUser();
			expect((await request(me, 'PATCH', '/users/me', {})).status).toBe(400);
			expect(
				(await request(me, 'PATCH', '/users/me', { displayName: 'x'.repeat(65) })).status,
			).toBe(400);
			expect((await request(me, 'PATCH', '/users/me', { displayName: '' })).status).toBe(400);
		});

		it('lets a nullable field be cleared', async () => {
			const me = await createUser();
			await request(me, 'PATCH', '/users/me', { status: 'busy' });
			const cleared = await request(me, 'PATCH', '/users/me', { status: null });
			expect(cleared.body.user.status).toBeNull();
		});

		it('404s when the token names a user with no profile row', async () => {
			// A perfectly valid token for someone who is not in this database —
			// which is what a stale token after a wipe looks like.
			const ghost = await createUser();
			await exec`DELETE FROM user_profiles WHERE id = ${ghost.id}`;
			expect((await request(ghost, 'PATCH', '/users/me', { status: 'x' })).status).toBe(404);
		});
	});

	describe('GET /users/:id privacy', () => {
		it('returns your own profile with its privacy settings intact', async () => {
			const me = await createUser();
			await exec`UPDATE user_profiles SET privacy_profile = 'nobody', phone = '+70000000000' WHERE id = ${me.id}`;

			const res = await request(me, 'GET', `/users/${me.id}`);
			expect(res.body.user.phone).toBe('+70000000000');
			expect(res.body.user.privacyProfile).toBe('nobody');
			expect(res.body.user.profileRestricted).toBeUndefined();
		});

		it('restricts the whole profile when privacyProfile is nobody', async () => {
			const me = await createUser();
			const them = await createUser('private_person');
			await exec`UPDATE user_profiles SET privacy_profile = 'nobody', avatar_url = 'https://x/a.png', is_online = true WHERE id = ${them.id}`;

			const res = await request(me, 'GET', `/users/${them.id}`);
			expect(res.body.user).toEqual({
				id: them.id,
				username: 'private_person',
				displayName: null,
				avatarUrl: null,
				isOnline: false,
				profileRestricted: true,
			});
		});

		it('opens a friends-only profile to a friend and not to a stranger', async () => {
			const me = await createUser();
			const them = await createUser();
			await exec`UPDATE user_profiles SET privacy_profile = 'friends', phone = '+7999', privacy_phone = 'friends' WHERE id = ${them.id}`;

			const asStranger = await request(me, 'GET', `/users/${them.id}`);
			expect(asStranger.body.user.profileRestricted).toBe(true);

			friendPairs.add(pairKey(me.id, them.id));
			const asFriend = await request(me, 'GET', `/users/${them.id}`);
			expect(asFriend.body.user.profileRestricted).toBeUndefined();
			expect(asFriend.body.user.phone).toBe('+7999');
		});

		it('hides individual fields without hiding the profile', async () => {
			const me = await createUser();
			const them = await createUser();
			await exec`
				UPDATE user_profiles
				SET phone = '+7111', email = 'a@b.c', avatar_url = 'https://x/a.png', is_online = true,
				    privacy_phone = 'nobody', privacy_email = 'friends',
				    privacy_photo = 'friends', privacy_online_status = 'nobody'
				WHERE id = ${them.id}`;

			const asStranger = await request(me, 'GET', `/users/${them.id}`);
			expect(asStranger.body.user).toMatchObject({
				phone: null,
				email: null,
				avatarUrl: null,
				isOnline: false,
			});

			friendPairs.add(pairKey(me.id, them.id));
			const asFriend = await request(me, 'GET', `/users/${them.id}`);
			expect(asFriend.body.user).toMatchObject({
				// 'nobody' means nobody, friend or not.
				phone: null,
				isOnline: false,
				// 'friends' opens up.
				email: 'a@b.c',
				avatarUrl: 'https://x/a.png',
			});
		});

		it('fails closed when friends-service is unreachable', async () => {
			const me = await createUser();
			const them = await createUser();
			friendPairs.add(pairKey(me.id, them.id));
			await exec`UPDATE user_profiles SET phone = '+7111', privacy_phone = 'friends' WHERE id = ${them.id}`;

			stubUp = false;
			const res = await request(me, 'GET', `/users/${them.id}`);
			// They really are friends, but nothing here can prove it — so the
			// gated field stays hidden rather than leaking on an outage.
			expect(res.status).toBe(200);
			expect(res.body.user.phone).toBeNull();
		});

		it('404s on a user who does not exist', async () => {
			const me = await createUser();
			expect(
				(await request(me, 'GET', '/users/00000000-0000-0000-0000-000000000000')).status,
			).toBe(404);
		});

		it('strips the privacy settings it enforces, and keeps the one the client needs', async () => {
			const me = await createUser();
			const them = await createUser();

			const res = await request(me, 'GET', `/users/${them.id}`);
			// These five are enforced server-side, so telling a third party how a
			// profile is configured would only describe what they cannot see.
			for (const key of [
				'privacyOnlineStatus',
				'privacyPhone',
				'privacyEmail',
				'privacyProfile',
				'privacyPhoto',
			]) {
				expect(res.body.user, key).not.toHaveProperty(key);
			}
			// privacyMessaging is deliberately not one of them: the chat screen
			// reads it to decide whether the composer is open
			// (echo-client usePerschatPage.svelte.ts). It says who *may* write,
			// not what has been written, so it is not a leak.
			expect(res.body.user).toHaveProperty('privacyMessaging');
		});
	});

	describe('GET /users/search', () => {
		it('needs at least two characters', async () => {
			const me = await createUser();
			expect((await request(me, 'GET', '/users/search?q=a')).status).toBe(400);
			expect((await request(me, 'GET', '/users/search')).status).toBe(400);
		});

		it('matches an exact username and never returns the caller', async () => {
			const me = await createUser('searcher');
			const them = await createUser('findme');

			const hit = await request(me, 'GET', '/users/search?q=findme');
			expect(hit.body.users).toEqual([expect.objectContaining({ id: them.id })]);

			// Exact match only — a prefix is not a hit.
			expect((await request(me, 'GET', '/users/search?q=find')).body.users).toEqual([]);
			// And searching for yourself finds nothing.
			expect((await request(me, 'GET', '/users/search?q=searcher')).body.users).toEqual([]);
		});

		it('finds a phone by its last ten digits, however it was typed', async () => {
			const me = await createUser();
			const them = await createUser();
			await exec`UPDATE user_profiles SET phone = '+7 (999) 123-45-67' WHERE id = ${them.id}`;

			for (const q of ['+79991234567', '89991234567', '9991234567']) {
				const res = await request(me, 'GET', `/users/search?q=${encodeURIComponent(q)}`);
				expect(res.body.users, `searching ${q}`).toEqual([
					expect.objectContaining({ id: them.id }),
				]);
			}
		});

		it('applies privacy to search results too', async () => {
			const me = await createUser();
			const them = await createUser('hidden_photo');
			await exec`UPDATE user_profiles SET avatar_url = 'https://x/a.png', privacy_photo = 'friends' WHERE id = ${them.id}`;

			expect((await request(me, 'GET', '/users/search?q=hidden_photo')).body.users[0].avatarUrl)
				.toBeNull();

			friendPairs.add(pairKey(me.id, them.id));
			expect((await request(me, 'GET', '/users/search?q=hidden_photo')).body.users[0].avatarUrl)
				.toBe('https://x/a.png');
		});
	});

	describe('POST /users/bulk', () => {
		it('deduplicates ids and skips ones that do not exist', async () => {
			const me = await createUser();
			const a = await createUser();

			const res = await request(me, 'POST', '/users/bulk', {
				userIds: [a.id, a.id, '00000000-0000-0000-0000-000000000000'],
			});
			expect(res.body.users).toHaveLength(1);
			expect(res.body.users[0].id).toBe(a.id);
		});

		it('does not apply privacy to the caller’s own row', async () => {
			const me = await createUser();
			await exec`UPDATE user_profiles SET avatar_url = 'https://x/me.png', privacy_photo = 'nobody' WHERE id = ${me.id}`;

			const res = await request(me, 'POST', '/users/bulk', { userIds: [me.id] });
			expect(res.body.users[0].avatarUrl).toBe('https://x/me.png');
		});

		it('answers an empty list without a query', async () => {
			const me = await createUser();
			expect((await request(me, 'POST', '/users/bulk', { userIds: [] })).body).toEqual({
				users: [],
			});
		});
	});

	describe('PATCH /users/:id/online', () => {
		it('writes the flag through to the snapshot', async () => {
			const me = await createUser();
			expect((await request(me, 'PATCH', `/users/${me.id}/online`, { isOnline: true })).status)
				.toBe(200);

			const snapshot = await request(null, 'GET', '/internal/users-snapshot', undefined, {
				'X-Internal-Key': TEST_INTERNAL_KEY,
			});
			expect(snapshot.body.users[0].isOnline).toBe(true);
		});
	});
});
