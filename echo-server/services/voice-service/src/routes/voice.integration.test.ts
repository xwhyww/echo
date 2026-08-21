import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { VOICE_PERMS } from '@echo/shared';
import type { TestUser } from '@echo/test-support';
import { harness } from '../testing/integration.js';

const { createUser, request, exec } = harness;

/**
 * Voice access is decided by three tables at once — the group mirror, the role
 * allowlist on a channel, and role membership — and the answer changes shape
 * depending on which of them have rows. `voiceRoles.ts` on the client tests the
 * bit arithmetic; what needs a database is everything around it: an empty
 * allowlist meaning "open to the whole group" rather than "closed", a role that
 * cannot be attached across group boundaries, and the join token carrying only
 * the sources the caller was actually granted.
 *
 * LiveKit is not running. It is only consulted for who is currently connected,
 * which already degrades to "nobody", so every route below is exercised for
 * real except the capacity check.
 */
describe.skipIf(!harness.enabled)('voice-service routes', () => {
	beforeAll(() => harness.setup());
	beforeEach(() => harness.reset());

	const GROUP = '11111111-1111-1111-1111-111111111111';
	const OTHER_GROUP = '22222222-2222-2222-2222-222222222222';

	/** Put a user in the group mirror, the way the NATS consumer would. */
	async function join(user: TestUser, role: 'owner' | 'admin' | 'member', groupId = GROUP) {
		await exec`
			INSERT INTO group_members_mirror (group_id, user_id, role)
			VALUES (${groupId}, ${user.id}, ${role})`;
	}

	async function member(role: 'owner' | 'admin' | 'member', groupId = GROUP): Promise<TestUser> {
		const user = await createUser();
		await join(user, role, groupId);
		return user;
	}

	async function makeChannel(owner: TestUser, name = 'General', groupId = GROUP): Promise<string> {
		const res = await request(owner, 'POST', '/voice/channels', { groupId, name });
		expect(res.status).toBe(201);
		return res.body.channel.id as string;
	}

	async function makeRole(owner: TestUser, name: string, permissions: number): Promise<string> {
		const res = await request(owner, 'POST', '/voice/roles', {
			groupId: GROUP,
			name,
			permissions,
		});
		expect(res.status).toBe(201);
		return res.body.role.id as string;
	}

	/** The `video` grant inside a LiveKit access token, without verifying it. */
	function tokenGrant(token: string): Record<string, any> {
		const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
		return payload.video ?? {};
	}

	describe('membership gates', () => {
		it('refuses every read to someone outside the group', async () => {
			const owner = await member('owner');
			const channelId = await makeChannel(owner);
			const outsider = await createUser();

			expect((await request(outsider, 'GET', `/voice/channels?groupId=${GROUP}`)).status).toBe(403);
			expect((await request(outsider, 'GET', '/voice/roles?groupId=' + GROUP)).status).toBe(403);
			expect((await request(outsider, 'GET', `/voice/channels/${channelId}/access`)).status)
				.toBe(403);
			expect((await request(outsider, 'POST', `/voice/channels/${channelId}/join`)).status)
				.toBe(403);
		});

		it('rejects an unauthenticated request', async () => {
			expect((await request(null, 'GET', `/voice/channels?groupId=${GROUP}`)).status).toBe(401);
		});

		it('counts only the channels the caller can see', async () => {
			const owner = await member('owner');
			const plain = await member('member');
			const open = await makeChannel(owner, 'Open');
			const locked = await makeChannel(owner, 'Locked');

			const roleId = await makeRole(owner, 'Staff', VOICE_PERMS.CONNECT);
			await request(owner, 'PUT', `/voice/channels/${locked}/access`, { roleIds: [roleId] });

			expect((await request(owner, 'GET', `/voice/channels/count?groupIds=${GROUP}`)).body.count)
				.toBe(2);
			expect((await request(plain, 'GET', `/voice/channels/count?groupIds=${GROUP}`)).body.count)
				.toBe(1);

			// A group the caller is not in contributes nothing rather than 403 —
			// the id list comes from another service and may lag.
			const mixed = await request(plain, 'GET', `/voice/channels/count?groupIds=${GROUP},${OTHER_GROUP}`);
			expect(mixed.status).toBe(200);
			expect(mixed.body.count).toBe(1);
			expect((await request(plain, 'GET', '/voice/channels/count')).body.count).toBe(0);

			expect(open).toBeTruthy();
		});
	});

	describe('managing channels', () => {
		it('lets an admin create one and a plain member not', async () => {
			const admin = await member('admin');
			const plain = await member('member');

			expect((await request(admin, 'POST', '/voice/channels', { groupId: GROUP, name: 'A' })).status)
				.toBe(201);
			expect((await request(plain, 'POST', '/voice/channels', { groupId: GROUP, name: 'B' })).status)
				.toBe(403);
		});

		it('grants a plain member the same power through MANAGE_CHANNELS', async () => {
			const owner = await member('owner');
			const plain = await member('member');
			const roleId = await makeRole(owner, 'Moderators', VOICE_PERMS.MANAGE_CHANNELS);

			expect((await request(plain, 'POST', '/voice/channels', { groupId: GROUP, name: 'B' })).status)
				.toBe(403);
			await request(owner, 'POST', `/voice/roles/${roleId}/members`, { userId: plain.id });
			expect((await request(plain, 'POST', '/voice/channels', { groupId: GROUP, name: 'B' })).status)
				.toBe(201);
		});

		it('refuses a duplicate name in the same group but allows it in another', async () => {
			const owner = await member('owner');
			const elsewhere = await member('owner', OTHER_GROUP);
			await makeChannel(owner, 'General');

			const clash = await request(owner, 'POST', '/voice/channels', {
				groupId: GROUP,
				name: 'General',
			});
			expect(clash.status).toBe(409);

			// The unique index is on (group, name), so the same word is free here.
			expect(
				(await request(elsewhere, 'POST', '/voice/channels', {
					groupId: OTHER_GROUP,
					name: 'General',
				})).status,
			).toBe(201);
		});

		it('stops at the per-group channel cap', async () => {
			const owner = await member('owner');
			for (let i = 0; i < 10; i++) await makeChannel(owner, `C${i}`);
			expect(
				(await request(owner, 'POST', '/voice/channels', { groupId: GROUP, name: 'C10' })).status,
			).toBe(409);
		});

		it('will not attach a category that belongs to another group', async () => {
			const owner = await member('owner');
			const elsewhere = await member('owner', OTHER_GROUP);
			const foreign = await request(elsewhere, 'POST', '/voice/categories', {
				groupId: OTHER_GROUP,
				name: 'Theirs',
			});
			expect(foreign.status).toBe(201);

			const res = await request(owner, 'POST', '/voice/channels', {
				groupId: GROUP,
				name: 'X',
				categoryId: foreign.body.category.id,
			});
			expect(res.status).toBe(400);
		});

		it('orphans a category’s channels instead of deleting them', async () => {
			const owner = await member('owner');
			const category = await request(owner, 'POST', '/voice/categories', {
				groupId: GROUP,
				name: 'Rooms',
			});
			const categoryId = category.body.category.id;
			const channelId = await makeChannel(owner, 'Inside');
			await request(owner, 'PATCH', `/voice/channels/${channelId}`, { categoryId });

			expect((await request(owner, 'DELETE', `/voice/categories/${categoryId}`)).status).toBe(200);

			const list = await request(owner, 'GET', `/voice/channels?groupId=${GROUP}`);
			const still = list.body.channels.find((ch: { id: string }) => ch.id === channelId);
			expect(still).toBeTruthy();
			expect(still.categoryId).toBeNull();
		});

		it('rejects an empty patch and an over-long name', async () => {
			const owner = await member('owner');
			const channelId = await makeChannel(owner);

			expect((await request(owner, 'PATCH', `/voice/channels/${channelId}`, {})).status).toBe(400);
			expect(
				(await request(owner, 'PATCH', `/voice/channels/${channelId}`, { name: '  ' })).status,
			).toBe(400);
			expect(
				(await request(owner, 'PATCH', `/voice/channels/${channelId}`, { name: 'x'.repeat(65) }))
					.status,
			).toBe(400);
		});
	});

	describe('channel access', () => {
		it('treats an empty allowlist as open to the whole group', async () => {
			const owner = await member('owner');
			const plain = await member('member');
			const channelId = await makeChannel(owner);

			expect((await request(owner, 'GET', `/voice/channels/${channelId}/access`)).body.roleIds)
				.toEqual([]);

			const join = await request(plain, 'POST', `/voice/channels/${channelId}/join`);
			expect(join.status).toBe(200);
			// Open means the baseline, which includes speaking and sharing.
			expect(join.body.canShare).toBe(true);
		});

		it('closes the channel to everyone without an allowed role', async () => {
			const owner = await member('owner');
			const plain = await member('member');
			const holder = await member('member');
			const channelId = await makeChannel(owner);
			const roleId = await makeRole(owner, 'Staff', VOICE_PERMS.CONNECT | VOICE_PERMS.SPEAK);

			await request(owner, 'PUT', `/voice/channels/${channelId}/access`, { roleIds: [roleId] });
			await request(owner, 'POST', `/voice/roles/${roleId}/members`, { userId: holder.id });

			expect((await request(plain, 'POST', `/voice/channels/${channelId}/join`)).status).toBe(403);
			expect((await request(holder, 'POST', `/voice/channels/${channelId}/join`)).status).toBe(200);
			// Owners and admins bypass the allowlist entirely.
			expect((await request(owner, 'POST', `/voice/channels/${channelId}/join`)).status).toBe(200);

			const visible = await request(plain, 'GET', `/voice/channels?groupId=${GROUP}`);
			expect(visible.body.channels).toEqual([]);
		});

		it('separates seeing a channel from being able to join it', async () => {
			const owner = await member('owner');
			const holder = await member('member');
			const channelId = await makeChannel(owner);
			// On the allowlist, but with no CONNECT bit.
			const roleId = await makeRole(owner, 'Watchers', VOICE_PERMS.SPEAK);

			await request(owner, 'PUT', `/voice/channels/${channelId}/access`, { roleIds: [roleId] });
			await request(owner, 'POST', `/voice/roles/${roleId}/members`, { userId: holder.id });

			const list = await request(holder, 'GET', `/voice/channels?groupId=${GROUP}`);
			expect(list.body.channels).toHaveLength(1);
			expect((await request(holder, 'POST', `/voice/channels/${channelId}/join`)).status).toBe(403);
		});

		it('refuses to attach a role from another group', async () => {
			const owner = await member('owner');
			const elsewhere = await member('owner', OTHER_GROUP);
			const channelId = await makeChannel(owner);

			const foreign = await request(elsewhere, 'POST', '/voice/roles', {
				groupId: OTHER_GROUP,
				name: 'Theirs',
				permissions: VOICE_PERMS.CONNECT,
			});
			const res = await request(owner, 'PUT', `/voice/channels/${channelId}/access`, {
				roleIds: [foreign.body.role.id],
			});
			expect(res.status).toBe(400);
			expect((await request(owner, 'GET', `/voice/channels/${channelId}/access`)).body.roleIds)
				.toEqual([]);
		});

		it('replaces the allowlist wholesale', async () => {
			const owner = await member('owner');
			const channelId = await makeChannel(owner);
			const a = await makeRole(owner, 'A', VOICE_PERMS.CONNECT);
			const b = await makeRole(owner, 'B', VOICE_PERMS.CONNECT);

			await request(owner, 'PUT', `/voice/channels/${channelId}/access`, { roleIds: [a, b] });
			expect(
				(await request(owner, 'GET', `/voice/channels/${channelId}/access`)).body.roleIds.sort(),
			).toEqual([a, b].sort());

			await request(owner, 'PUT', `/voice/channels/${channelId}/access`, { roleIds: [b] });
			expect((await request(owner, 'GET', `/voice/channels/${channelId}/access`)).body.roleIds)
				.toEqual([b]);

			// Back to empty, which reopens the channel to the group.
			await request(owner, 'PUT', `/voice/channels/${channelId}/access`, { roleIds: [] });
			expect((await request(owner, 'GET', `/voice/channels/${channelId}/access`)).body.roleIds)
				.toEqual([]);
		});

		it('ORs the permissions of every role the caller holds', async () => {
			const owner = await member('owner');
			const holder = await member('member');
			const channelId = await makeChannel(owner);
			const connect = await makeRole(owner, 'Connect', VOICE_PERMS.CONNECT);
			const share = await makeRole(owner, 'Share', VOICE_PERMS.CAN_SHARE);

			await request(owner, 'PUT', `/voice/channels/${channelId}/access`, {
				roleIds: [connect, share],
			});
			await request(owner, 'POST', `/voice/roles/${connect}/members`, { userId: holder.id });

			// CONNECT alone: in, but not allowed to present.
			const first = await request(holder, 'POST', `/voice/channels/${channelId}/join`);
			expect(first.status).toBe(200);
			expect(first.body.canShare).toBe(false);
			expect((await request(holder, 'POST', `/voice/channels/${channelId}/screen-token`)).status)
				.toBe(403);

			await request(owner, 'POST', `/voice/roles/${share}/members`, { userId: holder.id });
			const second = await request(holder, 'POST', `/voice/channels/${channelId}/join`);
			expect(second.body.canShare).toBe(true);
			expect((await request(holder, 'POST', `/voice/channels/${channelId}/screen-token`)).status)
				.toBe(200);
		});
	});

	describe('the join token', () => {
		it('carries only the sources the caller was granted', async () => {
			const owner = await member('owner');
			const holder = await member('member');
			const channelId = await makeChannel(owner);
			const roleId = await makeRole(owner, 'Listeners', VOICE_PERMS.CONNECT);

			await request(owner, 'PUT', `/voice/channels/${channelId}/access`, { roleIds: [roleId] });
			await request(owner, 'POST', `/voice/roles/${roleId}/members`, { userId: holder.id });

			const listener = tokenGrant(
				(await request(holder, 'POST', `/voice/channels/${channelId}/join`)).body.token,
			);
			// CONNECT without SPEAK: the token itself must not allow publishing, so
			// a tampered client gains nothing.
			expect(listener.canSubscribe).toBe(true);
			expect(listener.canPublishSources ?? []).toEqual([]);

			const speaker = tokenGrant(
				(await request(owner, 'POST', `/voice/channels/${channelId}/join`)).body.token,
			);
			expect(speaker.canPublishSources).toContain('microphone');
		});

		it('names the room after the channel and the caller after their id', async () => {
			const owner = await member('owner');
			const channelId = await makeChannel(owner);

			const res = await request(owner, 'POST', `/voice/channels/${channelId}/join`);
			expect(res.body.url).toBe('wss://livekit.test.invalid');
			const grant = tokenGrant(res.body.token);
			expect(grant.room).toContain(channelId);
		});

		it('404s for a channel that does not exist', async () => {
			const owner = await member('owner');
			expect(
				(await request(owner, 'POST', '/voice/channels/33333333-3333-3333-3333-333333333333/join'))
					.status,
			).toBe(404);
		});
	});

	describe('roles', () => {
		it('only lets a manager create, edit and delete', async () => {
			const owner = await member('owner');
			const plain = await member('member');

			expect(
				(await request(plain, 'POST', '/voice/roles', { groupId: GROUP, name: 'X' })).status,
			).toBe(403);

			const roleId = await makeRole(owner, 'Staff', VOICE_PERMS.CONNECT);
			expect((await request(plain, 'PATCH', `/voice/roles/${roleId}`, { name: 'Y' })).status)
				.toBe(403);
			expect((await request(plain, 'DELETE', `/voice/roles/${roleId}`)).status).toBe(403);
			expect((await request(owner, 'PATCH', `/voice/roles/${roleId}`, { name: 'Y' })).status)
				.toBe(200);
		});

		it('masks off permission bits that do not exist', async () => {
			const owner = await member('owner');
			const res = await request(owner, 'POST', '/voice/roles', {
				groupId: GROUP,
				name: 'Greedy',
				// 1024 is not a defined permission; it must not survive.
				permissions: VOICE_PERMS.CONNECT | 1024,
			});
			expect(res.status).toBe(201);
			expect(res.body.role.permissions).toBe(VOICE_PERMS.CONNECT);
		});

		it('appends each new role below the last', async () => {
			const owner = await member('owner');
			await makeRole(owner, 'First', 0);
			await makeRole(owner, 'Second', 0);

			const list = await request(owner, 'GET', `/voice/roles?groupId=${GROUP}`);
			const positions = list.body.roles.map((r: { position: number }) => r.position);
			expect(positions).toEqual([...positions].sort((a, b) => a - b));
			expect(new Set(positions).size).toBe(positions.length);
		});

		it('refuses to put someone in a role of a group they are not in', async () => {
			const owner = await member('owner');
			const outsider = await createUser();
			const roleId = await makeRole(owner, 'Staff', VOICE_PERMS.CONNECT);

			const res = await request(owner, 'POST', `/voice/roles/${roleId}/members`, {
				userId: outsider.id,
			});
			expect(res.status).toBe(400);
		});

		it('takes adding the same member twice without complaint', async () => {
			const owner = await member('owner');
			const plain = await member('member');
			const roleId = await makeRole(owner, 'Staff', VOICE_PERMS.CONNECT);

			expect(
				(await request(owner, 'POST', `/voice/roles/${roleId}/members`, { userId: plain.id }))
					.status,
			).toBe(200);
			expect(
				(await request(owner, 'POST', `/voice/roles/${roleId}/members`, { userId: plain.id }))
					.status,
			).toBe(200);

			const rows = await exec`SELECT user_id FROM voice_role_members WHERE role_id = ${roleId}`;
			expect(rows).toHaveLength(1);
		});

		it('reopens a channel when the last role on its allowlist is deleted', async () => {
			const owner = await member('owner');
			const plain = await member('member');
			const channelId = await makeChannel(owner);
			const roleId = await makeRole(owner, 'Staff', VOICE_PERMS.CONNECT);
			await request(owner, 'PUT', `/voice/channels/${channelId}/access`, { roleIds: [roleId] });

			expect((await request(plain, 'POST', `/voice/channels/${channelId}/join`)).status).toBe(403);

			// Deleting the role cascades its allowlist row away, and an empty
			// allowlist means open — worth pinning down, because the alternative
			// reading ("no roles allowed, so nobody") would lock everyone out.
			expect((await request(owner, 'DELETE', `/voice/roles/${roleId}`)).status).toBe(200);
			expect((await request(plain, 'POST', `/voice/channels/${channelId}/join`)).status).toBe(200);
		});
	});

	describe('channel chat', () => {
		it('round-trips a message through the at-rest encryption', async () => {
			const owner = await member('owner');
			const channelId = await makeChannel(owner);
			const content = 'привет — voice channel chat';

			const posted = await request(owner, 'POST', `/voice/channels/${channelId}/messages`, {
				content,
			});
			expect(posted.status).toBe(201);
			expect(posted.body.message.content).toBe(content);

			const listed = await request(owner, 'GET', `/voice/channels/${channelId}/messages`);
			expect(listed.body.messages.at(-1).content).toBe(content);

			// Stored encrypted: the plaintext column is emptied on write.
			const rows = await exec`SELECT content, content_ciphertext FROM voice_channel_messages WHERE channel_id = ${channelId}`;
			expect(rows[0].content).toBe('');
			expect(rows[0].content_ciphertext).toBeTruthy();
		});

		it('keeps the chat behind the same access as the channel', async () => {
			const owner = await member('owner');
			const plain = await member('member');
			const outsider = await createUser();
			const channelId = await makeChannel(owner);
			const roleId = await makeRole(owner, 'Staff', VOICE_PERMS.CONNECT);
			await request(owner, 'PUT', `/voice/channels/${channelId}/access`, { roleIds: [roleId] });

			for (const who of [plain, outsider]) {
				expect((await request(who, 'GET', `/voice/channels/${channelId}/messages`)).status)
					.toBe(403);
				expect(
					(await request(who, 'POST', `/voice/channels/${channelId}/messages`, { content: 'x' }))
						.status,
				).toBe(403);
			}
		});

		it('takes the messages with the channel when it is deleted', async () => {
			const owner = await member('owner');
			const channelId = await makeChannel(owner);
			await request(owner, 'POST', `/voice/channels/${channelId}/messages`, { content: 'doomed' });

			expect((await request(owner, 'DELETE', `/voice/channels/${channelId}`)).status).toBe(200);
			expect(await exec`SELECT id FROM voice_channel_messages`).toHaveLength(0);
		});
	});
});
