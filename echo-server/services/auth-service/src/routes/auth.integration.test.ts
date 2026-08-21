import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { TEST_PHONE, TEST_PHONE_CODE, harness } from '../testing/integration.js';

const { request, exec } = harness;

/**
 * Sign-in is the one flow in this codebase where a bug is a security hole
 * rather than a broken screen, and almost all of it lives in the database: the
 * OTP row is the rate limiter, the attempt counter and the expiry all at once,
 * and `users.phone` being unique is what stops one number becoming two
 * accounts. `otp.test.ts` covers the pure helpers around it; this covers what
 * they are wired to.
 *
 * `NODE_ENV` is not production here, so `/auth/otp/request` echoes the code
 * back as `devCode` — which is how these tests learn it without reading the
 * hash out of the table.
 */
describe.skipIf(!harness.enabled)('auth-service routes', () => {
	beforeAll(() => harness.setup());
	beforeEach(() => harness.reset());

	/** A fresh, unused real-looking number. Not one of the test numbers. */
	let phoneCounter = 0;
	function nextPhone(): string {
		phoneCounter += 1;
		return `+7900${String(phoneCounter).padStart(7, '0')}`;
	}

	/** Run the whole flow and come back with a usable session. */
	async function signUp(phone = nextPhone()) {
		const requested = await request(null, 'POST', '/auth/otp/request', { phone });
		const verified = await request(null, 'POST', '/auth/otp/verify', {
			phone,
			code: requested.body.devCode,
		});
		return {
			phone,
			token: verified.body.token as string,
			user: verified.body.user,
			status: verified.status,
		};
	}

	/** The shape `harness.request` wants for an authenticated call. */
	const as = (session: { token: string }) => ({ id: '', username: '', token: session.token });

	describe('POST /auth/otp/request', () => {
		it('rejects a phone number that is not one', async () => {
			for (const phone of ['', 'not-a-phone', '12345', undefined]) {
				const res = await request(null, 'POST', '/auth/otp/request', { phone });
				expect(res.status, `phone=${phone}`).toBe(400);
			}
		});

		it('stores a hash, never the code itself', async () => {
			const phone = nextPhone();
			const res = await request(null, 'POST', '/auth/otp/request', { phone });
			expect(res.status).toBe(200);

			const rows = await exec`SELECT * FROM phone_otps WHERE phone = ${phone}`;
			expect(rows).toHaveLength(1);
			expect(rows[0].code_hash).not.toBe(res.body.devCode);
			expect(rows[0].code_hash).toMatch(/^[0-9a-f]{64}$/);
			expect(rows[0].attempts).toBe(0);
		});

		it('holds a resend behind the cooldown', async () => {
			const phone = nextPhone();
			await request(null, 'POST', '/auth/otp/request', { phone });

			const tooSoon = await request(null, 'POST', '/auth/otp/request', { phone });
			expect(tooSoon.status).toBe(429);
			expect(tooSoon.body.retryAfter).toBeGreaterThan(0);
		});

		it('lets a resend through once the cooldown has passed, replacing the row', async () => {
			const phone = nextPhone();
			const first = await request(null, 'POST', '/auth/otp/request', { phone });

			// Age the row past the cooldown rather than waiting a minute for it.
			await exec`UPDATE phone_otps SET last_sent_at = now() - interval '2 minutes' WHERE phone = ${phone}`;

			const second = await request(null, 'POST', '/auth/otp/request', { phone });
			expect(second.status).toBe(200);

			// One row per phone, so the second code replaced the first rather than
			// leaving two valid codes alive at once.
			const rows = await exec`SELECT * FROM phone_otps WHERE phone = ${phone}`;
			expect(rows).toHaveLength(1);
			expect((await request(null, 'POST', '/auth/otp/verify', { phone, code: first.body.devCode }))
				.status).toBe(400);
			expect((await request(null, 'POST', '/auth/otp/verify', { phone, code: second.body.devCode }))
				.status).toBe(201);
		});

		it('normalises the number, so one phone cannot become two accounts', async () => {
			const requested = await request(null, 'POST', '/auth/otp/request', {
				phone: '+7 (900) 555-11-22',
			});
			expect(requested.status).toBe(200);

			// Typed differently, same number: the cooldown proves it hit the same row.
			const again = await request(null, 'POST', '/auth/otp/request', { phone: '79005551122' });
			expect(again.status).toBe(429);

			expect(await exec`SELECT phone FROM phone_otps`).toHaveLength(1);
		});
	});

	describe('test numbers', () => {
		it('signs in with the configured code and never waits out a cooldown', async () => {
			const first = await request(null, 'POST', '/auth/otp/request', { phone: TEST_PHONE });
			expect(first.status).toBe(200);
			// Nothing was sent, so there is nothing to wait for.
			expect(first.body.resendIn).toBe(0);

			// Immediately again — a real number would be 429 here.
			expect((await request(null, 'POST', '/auth/otp/request', { phone: TEST_PHONE })).status)
				.toBe(200);

			const verified = await request(null, 'POST', '/auth/otp/verify', {
				phone: TEST_PHONE,
				code: TEST_PHONE_CODE,
			});
			expect(verified.status).toBe(201);
			expect(verified.body.user.phone).toBe(TEST_PHONE);
		});

		it('still counts attempts and still burns the code — the bypass is only delivery', async () => {
			await request(null, 'POST', '/auth/otp/request', { phone: TEST_PHONE });
			expect((await request(null, 'POST', '/auth/otp/verify', { phone: TEST_PHONE, code: '999999' }))
				.status).toBe(400);

			const rows = await exec`SELECT attempts FROM phone_otps WHERE phone = ${TEST_PHONE}`;
			expect(rows[0].attempts).toBe(1);
		});

		it('does not accept the test code on an ordinary number', async () => {
			const phone = nextPhone();
			await request(null, 'POST', '/auth/otp/request', { phone });
			expect((await request(null, 'POST', '/auth/otp/verify', { phone, code: TEST_PHONE_CODE }))
				.status).toBe(400);
		});
	});

	describe('POST /auth/otp/verify', () => {
		it('creates the account on a first sign-in and reuses it on the next', async () => {
			const phone = nextPhone();
			const first = await signUp(phone);
			expect(first.status).toBe(201);
			expect(first.user.username).toMatch(/^user_[0-9a-f]{8}$/);
			expect(first.user.hasPassword).toBe(false);

			// Second time round is a sign-in, not a sign-up.
			await exec`UPDATE phone_otps SET last_sent_at = now() - interval '2 minutes' WHERE phone = ${phone}`;
			const second = await signUp(phone);
			expect(second.status).toBe(200);
			expect(second.user.id).toBe(first.user.id);
			expect(await exec`SELECT id FROM users`).toHaveLength(1);
		});

		it('burns the code — one sign-in per request', async () => {
			const phone = nextPhone();
			const requested = await request(null, 'POST', '/auth/otp/request', { phone });
			const code = requested.body.devCode;

			expect((await request(null, 'POST', '/auth/otp/verify', { phone, code })).status).toBe(201);
			// Replaying the same code must not sign in again.
			expect((await request(null, 'POST', '/auth/otp/verify', { phone, code })).status).toBe(400);
		});

		it('counts wrong guesses and stops at the limit', async () => {
			const phone = nextPhone();
			const requested = await request(null, 'POST', '/auth/otp/request', { phone });

			for (let i = 0; i < 5; i++) {
				expect((await request(null, 'POST', '/auth/otp/verify', { phone, code: '000001' })).status)
					.toBe(400);
			}
			// Sixth guess: the code is burned, and 429 rather than 400 so the
			// caller can tell "wrong" from "stop".
			const blocked = await request(null, 'POST', '/auth/otp/verify', { phone, code: '000001' });
			expect(blocked.status).toBe(429);

			// Even the right code is gone now — the row was deleted, not just flagged.
			expect(
				(await request(null, 'POST', '/auth/otp/verify', { phone, code: requested.body.devCode }))
					.status,
			).toBe(400);
			expect(await exec`SELECT phone FROM phone_otps WHERE phone = ${phone}`).toHaveLength(0);
		});

		it('refuses an expired code', async () => {
			const phone = nextPhone();
			const requested = await request(null, 'POST', '/auth/otp/request', { phone });
			await exec`UPDATE phone_otps SET expires_at = now() - interval '1 second' WHERE phone = ${phone}`;

			const res = await request(null, 'POST', '/auth/otp/verify', {
				phone,
				code: requested.body.devCode,
			});
			expect(res.status).toBe(400);
			expect(await exec`SELECT id FROM users`).toHaveLength(0);
		});

		it('rejects a malformed code before touching the row', async () => {
			const phone = nextPhone();
			await request(null, 'POST', '/auth/otp/request', { phone });

			for (const code of ['12345', '1234567', 'abcdef', '']) {
				expect((await request(null, 'POST', '/auth/otp/verify', { phone, code })).status).toBe(400);
			}
			// None of those counted as an attempt — they never reached the check.
			const rows = await exec`SELECT attempts FROM phone_otps WHERE phone = ${phone}`;
			expect(rows[0].attempts).toBe(0);
		});

		it('verifying a number that never asked for a code says expired, not wrong', async () => {
			const res = await request(null, 'POST', '/auth/otp/verify', {
				phone: nextPhone(),
				code: '123456',
			});
			// Deliberately the same answer as an expired code: telling the two
			// apart would say whether a number is mid-sign-in.
			expect(res.status).toBe(400);
			expect(res.body.error).toMatch(/expired/i);
		});
	});

	describe('the password second factor', () => {
		async function signUpWithPassword(password = 'hunter2!') {
			const session = await signUp();
			const set = await request(as(session), 'PUT', '/auth/me/password', {
				newPassword: password,
			});
			expect(set.status).toBe(200);
			expect(set.body.user.hasPassword).toBe(true);
			return { ...session, password };
		}

		it('stops after the OTP and asks for the password', async () => {
			const account = await signUpWithPassword();
			await exec`UPDATE phone_otps SET last_sent_at = now() - interval '2 minutes' WHERE phone = ${account.phone}`;

			const requested = await request(null, 'POST', '/auth/otp/request', { phone: account.phone });
			const verified = await request(null, 'POST', '/auth/otp/verify', {
				phone: account.phone,
				code: requested.body.devCode,
			});

			expect(verified.status).toBe(200);
			expect(verified.body.passwordRequired).toBe(true);
			expect(verified.body.pendingToken).toBeTruthy();
			// The half-finished sign-in must not hand out a session.
			expect(verified.body.token).toBeUndefined();

			const wrong = await request(null, 'POST', '/auth/otp/password', {
				pendingToken: verified.body.pendingToken,
				password: 'not-it',
			});
			expect(wrong.status).toBe(401);

			const right = await request(null, 'POST', '/auth/otp/password', {
				pendingToken: verified.body.pendingToken,
				password: account.password,
			});
			expect(right.status).toBe(200);
			expect(right.body.token).toBeTruthy();
		});

		it('will not take a pending token that was not signed for this', async () => {
			const account = await signUpWithPassword();

			// A full session token is not a pending token, however valid it is.
			const res = await request(null, 'POST', '/auth/otp/password', {
				pendingToken: account.token,
				password: account.password,
			});
			expect(res.status).toBe(401);

			expect(
				(await request(null, 'POST', '/auth/otp/password', {
					pendingToken: 'nonsense',
					password: account.password,
				})).status,
			).toBe(401);
		});

		it('needs the current password to change or clear it', async () => {
			const account = await signUpWithPassword();

			expect(
				(await request(as(account), 'PUT', '/auth/me/password', { newPassword: 'another1' }))
					.status,
			).toBe(403);
			expect(
				(await request(as(account), 'PUT', '/auth/me/password', {
					currentPassword: 'wrong',
					newPassword: 'another1',
				})).status,
			).toBe(403);

			const cleared = await request(as(account), 'PUT', '/auth/me/password', {
				currentPassword: account.password,
				newPassword: null,
			});
			expect(cleared.status).toBe(200);
			expect(cleared.body.user.hasPassword).toBe(false);
		});

		it('refuses to clear a password that was never set', async () => {
			const session = await signUp();
			const res = await request(as(session), 'PUT', '/auth/me/password', { newPassword: null });
			expect(res.status).toBe(400);
		});

		it('rejects a password too short to be one', async () => {
			const session = await signUp();
			expect(
				(await request(as(session), 'PUT', '/auth/me/password', { newPassword: 'abc' })).status,
			).toBe(400);
		});

		it('never returns the hash', async () => {
			const account = await signUpWithPassword();
			const me = await request(as(account), 'GET', '/auth/me');
			expect(JSON.stringify(me.body)).not.toContain('$2');
			expect(me.body.user).not.toHaveProperty('passwordHash');
		});
	});

	describe('GET /auth/me', () => {
		it('answers for a valid token and refuses everything else', async () => {
			const session = await signUp();

			const ok = await request(as(session), 'GET', '/auth/me');
			expect(ok.status).toBe(200);
			expect(ok.body.user.phone).toBe(session.phone);

			expect((await request(null, 'GET', '/auth/me')).status).toBe(401);
			expect((await request({ id: '', username: '', token: 'rubbish' }, 'GET', '/auth/me')).status)
				.toBe(401);
		});

		it('404s for a token whose account is gone', async () => {
			const session = await signUp();
			await exec`DELETE FROM users WHERE id = ${session.user.id}`;
			expect((await request(as(session), 'GET', '/auth/me')).status).toBe(404);
		});

		it('sets the cookie only for the browser client', async () => {
			const session = await signUp();

			const tauri = await request(as(session), 'GET', '/auth/me');
			expect(tauri.headers.get('set-cookie')).toBeNull();

			const browser = await request(as(session), 'GET', '/auth/me', undefined, {
				'x-client': 'browser',
			});
			const cookie = browser.headers.get('set-cookie') ?? '';
			expect(cookie).toContain('echo_auth=');
			expect(cookie).toContain('HttpOnly');
		});
	});

	describe('PATCH /auth/me', () => {
		it('renames and rejects a taken username', async () => {
			const a = await signUp();
			const b = await signUp();

			expect((await request(as(a), 'PATCH', '/auth/me', { username: 'takenname' })).status)
				.toBe(200);
			expect((await request(as(b), 'PATCH', '/auth/me', { username: 'takenname' })).status)
				.toBe(409);
			// Setting your own username again is not a clash.
			expect((await request(as(a), 'PATCH', '/auth/me', { username: 'takenname' })).status)
				.toBe(200);
		});

		it('rejects a taken email and validates the shape', async () => {
			const a = await signUp();
			const b = await signUp();

			await request(as(a), 'PATCH', '/auth/me', { email: 'a@example.com' });
			expect((await request(as(b), 'PATCH', '/auth/me', { email: 'a@example.com' })).status)
				.toBe(409);
			expect((await request(as(b), 'PATCH', '/auth/me', { email: 'not-an-email' })).status)
				.toBe(400);
		});

		it('will not change the phone, because that is the login identity', async () => {
			const session = await signUp();
			const other = nextPhone();

			// `phone` is not in the schema, so it is dropped rather than applied —
			// and with nothing else in the body there is nothing to update.
			const res = await request(as(session), 'PATCH', '/auth/me', { phone: other });
			expect(res.status).toBe(400);

			const rows = await exec`SELECT phone FROM users WHERE id = ${session.user.id}`;
			expect(rows[0].phone).toBe(session.phone);
		});

		it('rejects a username with characters the schema forbids', async () => {
			const session = await signUp();
			for (const username of ['ab', 'has space', 'has-dash', 'x'.repeat(33)]) {
				expect(
					(await request(as(session), 'PATCH', '/auth/me', { username })).status,
					username,
				).toBe(400);
			}
		});
	});

	describe('privacy settings', () => {
		it('starts at the documented defaults', async () => {
			const session = await signUp();
			const res = await request(as(session), 'GET', '/auth/me/privacy');
			expect(res.body.privacy).toEqual({
				onlineStatus: 'all',
				phone: 'friends',
				email: 'friends',
				messaging: 'all',
				profile: 'all',
				photo: 'all',
				groupInvite: 'all',
			});
		});

		it('saves a change and rejects a value outside the enum', async () => {
			const session = await signUp();

			expect((await request(as(session), 'PATCH', '/auth/me/privacy', { phone: 'nobody' })).status)
				.toBe(200);
			expect((await request(as(session), 'GET', '/auth/me/privacy')).body.privacy.phone)
				.toBe('nobody');

			// `messaging` has its own two-value enum — 'nobody' is not one of them.
			expect(
				(await request(as(session), 'PATCH', '/auth/me/privacy', { messaging: 'nobody' })).status,
			).toBe(400);
			expect((await request(as(session), 'PATCH', '/auth/me/privacy', {})).status).toBe(400);
		});
	});
});
