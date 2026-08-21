import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { harness } from '../testing/integration.js';

const { createUser, request, exec } = harness;

/**
 * Two things here only exist in the schema. The device token is a natural key
 * with a unique constraint on it, so re-registering the same phone has to move
 * the row rather than add one — and when a phone changes hands, move it to its
 * new owner instead of notifying the previous one. And a settings row is
 * created lazily, so "never opened the settings screen" and "turned everything
 * on" have to read the same without the table holding a row either way.
 */
describe.skipIf(!harness.enabled)('push-service routes', () => {
	beforeAll(() => harness.setup());
	beforeEach(() => harness.reset());

	const DEFAULTS = {
		enabled: true,
		directMessages: true,
		groupMessages: true,
		friendRequests: true,
		groupInvites: true,
		showPreview: null,
		mutedChats: [],
		mutedGroups: [],
	};

	describe('auth', () => {
		it('rejects an unauthenticated request', async () => {
			expect((await request(null, 'GET', '/push/settings')).status).toBe(401);
			expect((await request(null, 'POST', '/push/devices', { token: 't', platform: 'ios' })).status)
				.toBe(401);
		});

		it('reports which providers are configured without sending anything', async () => {
			const res = await request(null, 'GET', '/health');
			expect(res.status).toBe(200);
			// Neither is set up in this environment, and that is a supported state.
			expect(res.body).toEqual({ status: 'ok', apns: 'disabled', fcm: 'disabled' });
		});
	});

	describe('POST /push/devices', () => {
		it('registers a device', async () => {
			const me = await createUser();
			const res = await request(me, 'POST', '/push/devices', {
				token: 'apns-token-1',
				platform: 'ios',
				environment: 'production',
			});
			expect(res.status).toBe(200);

			const rows = await exec`SELECT * FROM device_tokens`;
			expect(rows).toHaveLength(1);
			expect(rows[0]).toMatchObject({
				user_id: me.id,
				token: 'apns-token-1',
				platform: 'ios',
				environment: 'production',
			});
		});

		it('defaults the environment to sandbox, never to production', async () => {
			const me = await createUser();
			await request(me, 'POST', '/push/devices', { token: 't', platform: 'ios' });

			// A production token sent to the sandbox host simply fails; a sandbox
			// token sent to production returns BadDeviceToken and burns the row.
			// Sandbox is the safe guess.
			const rows = await exec`SELECT environment FROM device_tokens`;
			expect(rows[0].environment).toBe('sandbox');
		});

		it('is idempotent — re-registering moves the row rather than adding one', async () => {
			const me = await createUser();
			await request(me, 'POST', '/push/devices', { token: 'same', platform: 'ios' });
			const [before] = await exec`SELECT id, last_seen_at FROM device_tokens`;

			await request(me, 'POST', '/push/devices', {
				token: 'same',
				platform: 'ios',
				environment: 'production',
			});

			const rows = await exec`SELECT id, environment, last_seen_at FROM device_tokens`;
			expect(rows).toHaveLength(1);
			expect(rows[0].id).toBe(before.id);
			expect(rows[0].environment).toBe('production');
			// postgres-js hands timestamps back as strings here; comparing them as
			// dates is what the assertion is about.
			expect(new Date(rows[0].last_seen_at).getTime()).toBeGreaterThanOrEqual(
				new Date(before.last_seen_at).getTime(),
			);
		});

		it('hands the device to whoever signed in last', async () => {
			const first = await createUser();
			const second = await createUser();

			await request(first, 'POST', '/push/devices', { token: 'shared-phone', platform: 'android' });
			await request(second, 'POST', '/push/devices', { token: 'shared-phone', platform: 'android' });

			// One physical phone, one row, and it belongs to the person actually
			// signed in — otherwise the previous user keeps getting the banners.
			const rows = await exec`SELECT user_id FROM device_tokens`;
			expect(rows).toHaveLength(1);
			expect(rows[0].user_id).toBe(second.id);
		});

		it('rejects a missing token or an unknown platform', async () => {
			const me = await createUser();
			for (const body of [
				{ platform: 'ios' },
				{ token: '   ', platform: 'ios' },
				{ token: 't', platform: 'blackberry' },
				{ token: 't' },
				{},
			]) {
				expect((await request(me, 'POST', '/push/devices', body)).status, JSON.stringify(body))
					.toBe(400);
			}
			expect(await exec`SELECT id FROM device_tokens`).toHaveLength(0);
		});
	});

	describe('DELETE /push/devices/:token', () => {
		it('unregisters your own device', async () => {
			const me = await createUser();
			await request(me, 'POST', '/push/devices', { token: 'mine', platform: 'ios' });

			expect((await request(me, 'DELETE', '/push/devices/mine')).status).toBe(200);
			expect(await exec`SELECT id FROM device_tokens`).toHaveLength(0);
		});

		it('will not let one account silence another’s phone', async () => {
			const owner = await createUser();
			const attacker = await createUser();
			await request(owner, 'POST', '/push/devices', { token: 'victim-token', platform: 'ios' });

			// Answers 200 either way — telling the caller whether the token exists
			// would confirm that someone else registered it.
			expect((await request(attacker, 'DELETE', '/push/devices/victim-token')).status).toBe(200);

			const rows = await exec`SELECT user_id FROM device_tokens`;
			expect(rows).toHaveLength(1);
			expect(rows[0].user_id).toBe(owner.id);
		});
	});

	describe('notification settings', () => {
		it('answers with the defaults before anything has been written', async () => {
			const me = await createUser();
			const res = await request(me, 'GET', '/push/settings');

			expect(res.body.settings).toEqual(DEFAULTS);
			// And reading did not create a row — the table stays empty for the
			// people who never open the screen.
			expect(await exec`SELECT user_id FROM notification_settings`).toHaveLength(0);
		});

		it('creates the row on first write and keeps the rest at their defaults', async () => {
			const me = await createUser();
			const res = await request(me, 'PATCH', '/push/settings', { groupMessages: false });

			expect(res.status).toBe(200);
			expect(res.body.settings).toEqual({ ...DEFAULTS, groupMessages: false });
			expect((await request(me, 'GET', '/push/settings')).body.settings)
				.toEqual({ ...DEFAULTS, groupMessages: false });
		});

		it('patches one key without clobbering the others', async () => {
			const me = await createUser();
			await request(me, 'PATCH', '/push/settings', { directMessages: false, showPreview: true });
			await request(me, 'PATCH', '/push/settings', { friendRequests: false });

			expect((await request(me, 'GET', '/push/settings')).body.settings).toEqual({
				...DEFAULTS,
				directMessages: false,
				showPreview: true,
				friendRequests: false,
			});
		});

		it('keeps showPreview tri-state', async () => {
			const me = await createUser();

			await request(me, 'PATCH', '/push/settings', { showPreview: false });
			expect((await request(me, 'GET', '/push/settings')).body.settings.showPreview).toBe(false);

			// null is a real value here — "follow the server default" — and must be
			// distinguishable from false rather than dropped as absent.
			await request(me, 'PATCH', '/push/settings', { showPreview: null });
			expect((await request(me, 'GET', '/push/settings')).body.settings.showPreview).toBeNull();
		});

		it('deduplicates and caps a mute list', async () => {
			const me = await createUser();
			const chat = '11111111-1111-1111-1111-111111111111';

			await request(me, 'PATCH', '/push/settings', { mutedChats: [chat, chat, chat] });
			expect((await request(me, 'GET', '/push/settings')).body.settings.mutedChats).toEqual([chat]);

			const many = Array.from({ length: 600 }, (_, i) => `chat-${i}`);
			await request(me, 'PATCH', '/push/settings', { mutedChats: many });
			expect((await request(me, 'GET', '/push/settings')).body.settings.mutedChats)
				.toHaveLength(500);
		});

		it('ignores keys it does not know and values of the wrong type', async () => {
			const me = await createUser();

			// Nothing recognisable in the body, so there is nothing to update.
			expect((await request(me, 'PATCH', '/push/settings', { nonsense: true })).status).toBe(400);
			expect((await request(me, 'PATCH', '/push/settings', { enabled: 'yes' })).status).toBe(400);
			expect((await request(me, 'PATCH', '/push/settings', { mutedChats: [1, 2] })).status)
				.toBe(400);
			expect((await request(me, 'PATCH', '/push/settings', {})).status).toBe(400);

			expect(await exec`SELECT user_id FROM notification_settings`).toHaveLength(0);
		});

		it('keeps one row per user, however many patches arrive', async () => {
			const me = await createUser();
			for (let i = 0; i < 3; i++) {
				await request(me, 'PATCH', '/push/settings', { enabled: i % 2 === 0 });
			}
			expect(await exec`SELECT user_id FROM notification_settings`).toHaveLength(1);
		});

		it('keeps two users’ settings apart', async () => {
			const a = await createUser();
			const b = await createUser();

			await request(a, 'PATCH', '/push/settings', { enabled: false });
			expect((await request(b, 'GET', '/push/settings')).body.settings.enabled).toBe(true);
		});
	});
});
