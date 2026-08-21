import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { TestUser } from '@echo/test-support';
import { harness } from '../testing/integration.js';

const { createUser, request } = harness;

/**
 * Routes against a real Postgres. See `src/testing/integration.ts` for how to
 * run these and why they skip when no database is configured.
 *
 * What is worth a test here is the behaviour that only appears once SQL is
 * involved: permission checks that read a row before deciding, unique indexes,
 * cascades, and the encrypted round trip of a message. The permission *table*
 * itself is already covered by `permissions.test.ts` and is not re-tested here.
 */
describe.skipIf(!harness.enabled)('groups-service routes', () => {
	beforeAll(() => harness.setup());
	beforeEach(() => harness.reset());

	/** Owner plus a plain member, which is what most of these tests need. */
	async function groupWithMember(): Promise<{
		owner: TestUser;
		member: TestUser;
		groupId: string;
	}> {
		const owner = await createUser(`owner_${Date.now()}_${Math.random()}`);
		const member = await createUser(`member_${Date.now()}_${Math.random()}`);
		const created = await request(owner, 'POST', '/groups', { name: 'Test group' });
		const groupId = created.body.group.id as string;

		// Joining goes through an invite, which is also the only way to get a
		// second member in without writing to the database behind the routes.
		const invited = await request(owner, 'POST', `/groups/${groupId}/invites`, {
			userId: member.id,
		});
		expect(invited.status).toBe(201);
		const inviteId = invited.body.invite.id as string;
		const accepted = await request(member, 'POST', `/groups/invites/${inviteId}/accept`);
		expect(accepted.status).toBe(200);

		return { owner, member, groupId };
	}

	describe('auth', () => {
		it('rejects a request with no token', async () => {
			const res = await request(null, 'GET', '/groups');
			expect(res.status).toBe(401);
		});

		it('rejects a token signed with a different secret', async () => {
			const bogus: TestUser = { id: 'x', username: 'x', token: 'not.a.jwt' };
			const res = await request(bogus, 'GET', '/groups');
			expect(res.status).toBe(401);
		});
	});

	describe('POST /groups', () => {
		it('creates the group and makes the creator its owner', async () => {
			const owner = await createUser('creator');
			const res = await request(owner, 'POST', '/groups', { name: '  Trimmed  ' });

			expect(res.status).toBe(201);
			expect(res.body.group).toMatchObject({ name: 'Trimmed', ownerId: owner.id, role: 'owner' });

			// The owner row in group_members is a second insert, not a column, so
			// it is worth confirming it is really there.
			const members = await request(owner, 'GET', `/groups/${res.body.group.id}/members`);
			expect(members.status).toBe(200);
			expect(members.body.members).toHaveLength(1);
			expect(members.body.members[0]).toMatchObject({ userId: owner.id, role: 'owner' });
		});

		it('rejects an empty name', async () => {
			const owner = await createUser('empty_name');
			const res = await request(owner, 'POST', '/groups', { name: '   ' });
			expect(res.status).toBe(400);
		});

		it('stops the eleventh group by the same owner', async () => {
			const owner = await createUser('prolific');
			for (let i = 0; i < 10; i++) {
				const ok = await request(owner, 'POST', '/groups', { name: `G${i}` });
				expect(ok.status).toBe(201);
			}
			const over = await request(owner, 'POST', '/groups', { name: 'G10' });
			expect(over.status).toBe(409);

			// The cap counts groups *owned*, so joining others must not be affected.
			const list = await request(owner, 'GET', '/groups');
			expect(list.body.groups).toHaveLength(10);
		});
	});

	describe('membership and roles', () => {
		it('hides a group from a non-member', async () => {
			const { groupId } = await groupWithMember();
			const outsider = await createUser('outsider');

			expect((await request(outsider, 'GET', `/groups/${groupId}/members`)).status).toBe(403);
			expect((await request(outsider, 'GET', `/groups/${groupId}/messages`)).status).toBe(403);
		});

		it('lets the owner promote a member to admin', async () => {
			const { owner, member, groupId } = await groupWithMember();

			const res = await request(owner, 'PATCH', `/groups/${groupId}/members/${member.id}`, {
				role: 'admin',
			});
			expect(res.status).toBe(200);

			const members = await request(owner, 'GET', `/groups/${groupId}/members`);
			const row = members.body.members.find((m: { userId: string }) => m.userId === member.id);
			expect(row.role).toBe('admin');
		});

		it('does not let a member promote themselves', async () => {
			const { member, groupId } = await groupWithMember();
			const res = await request(member, 'PATCH', `/groups/${groupId}/members/${member.id}`, {
				role: 'admin',
			});
			expect(res.status).toBe(403);
		});

		it('refuses to demote the owner', async () => {
			const { owner, groupId } = await groupWithMember();
			const res = await request(owner, 'PATCH', `/groups/${groupId}/members/${owner.id}`, {
				role: 'member',
			});
			expect(res.status).toBe(400);
		});

		it('refuses to let the owner leave without transferring first', async () => {
			const { owner, groupId } = await groupWithMember();
			const res = await request(owner, 'DELETE', `/groups/${groupId}/members/${owner.id}`);
			expect(res.status).toBe(400);
		});

		it('lets a member leave, and then treats them as an outsider', async () => {
			const { member, groupId } = await groupWithMember();

			expect((await request(member, 'DELETE', `/groups/${groupId}/members/${member.id}`)).status)
				.toBe(200);
			expect((await request(member, 'GET', `/groups/${groupId}/messages`)).status).toBe(403);
			expect((await request(member, 'GET', '/groups')).body.groups).toHaveLength(0);
		});

		it('does not let a member kick anyone', async () => {
			const { owner, member, groupId } = await groupWithMember();
			const res = await request(member, 'DELETE', `/groups/${groupId}/members/${owner.id}`);
			expect(res.status).toBe(403);
		});
	});

	describe('policies', () => {
		it('only lets the owner change a policy', async () => {
			const { owner, member, groupId } = await groupWithMember();

			expect(
				(await request(member, 'PATCH', `/groups/${groupId}`, { messagePolicy: 'admins' })).status,
			).toBe(403);
			expect(
				(await request(owner, 'PATCH', `/groups/${groupId}`, { messagePolicy: 'admins' })).status,
			).toBe(200);
		});

		it('rejects a policy value that is not one of the three', async () => {
			const { owner, groupId } = await groupWithMember();
			const res = await request(owner, 'PATCH', `/groups/${groupId}`, {
				messagePolicy: 'nobody',
			});
			expect(res.status).toBe(400);
		});

		it('enforces messagePolicy=admins on the write path', async () => {
			const { owner, member, groupId } = await groupWithMember();
			await request(owner, 'PATCH', `/groups/${groupId}`, { messagePolicy: 'admins' });

			expect(
				(await request(member, 'POST', `/groups/${groupId}/messages`, { content: 'hi' })).status,
			).toBe(403);
			expect(
				(await request(owner, 'POST', `/groups/${groupId}/messages`, { content: 'hi' })).status,
			).toBe(201);

			// Muted, not blinded: reading is a separate policy.
			expect((await request(member, 'GET', `/groups/${groupId}/messages`)).status).toBe(200);
		});

		it('follows editInfoPolicy when deciding who may rename the group', async () => {
			const { owner, member, groupId } = await groupWithMember();

			// Default policy is 'admins', so a plain member cannot.
			expect(
				(await request(member, 'PATCH', `/groups/${groupId}`, { name: 'Renamed' })).status,
			).toBe(403);

			await request(owner, 'PATCH', `/groups/${groupId}/members/${member.id}`, { role: 'admin' });
			expect(
				(await request(member, 'PATCH', `/groups/${groupId}`, { name: 'Renamed' })).status,
			).toBe(200);
			expect((await request(member, 'GET', `/groups/${groupId}`)).body.group.name).toBe('Renamed');

			// Tightened to owner-only, the same admin is now refused.
			await request(owner, 'PATCH', `/groups/${groupId}`, { editInfoPolicy: 'owner' });
			expect(
				(await request(member, 'PATCH', `/groups/${groupId}`, { name: 'Again' })).status,
			).toBe(403);
			expect(
				(await request(owner, 'PATCH', `/groups/${groupId}`, { name: 'Again' })).status,
			).toBe(200);
		});

		it('rejects an editInfoPolicy of "everyone", which is not one of its two values', async () => {
			const { owner, groupId } = await groupWithMember();
			const res = await request(owner, 'PATCH', `/groups/${groupId}`, {
				editInfoPolicy: 'everyone',
			});
			expect(res.status).toBe(400);
		});

		it('hides pre-join history when historyVisible is off', async () => {
			const owner = await createUser('historian');
			const created = await request(owner, 'POST', '/groups', { name: 'History' });
			const groupId = created.body.group.id as string;

			await request(owner, 'POST', `/groups/${groupId}/messages`, { content: 'before' });
			await request(owner, 'PATCH', `/groups/${groupId}`, { historyVisible: false });

			const latecomer = await createUser('latecomer');
			const invited = await request(owner, 'POST', `/groups/${groupId}/invites`, {
				userId: latecomer.id,
			});
			await request(latecomer, 'POST', `/groups/invites/${invited.body.invite.id}/accept`);
			await request(owner, 'POST', `/groups/${groupId}/messages`, { content: 'after' });

			const theirs = await request(latecomer, 'GET', `/groups/${groupId}/messages`);
			const contents = theirs.body.messages.map((m: { content: string }) => m.content);
			expect(contents).toContain('after');
			expect(contents).not.toContain('before');

			// The owner still sees everything, which is what the route's
			// `detail.role !== 'owner'` clause is for.
			const mine = await request(owner, 'GET', `/groups/${groupId}/messages`);
			expect(mine.body.messages.map((m: { content: string }) => m.content)).toContain('before');
		});
	});

	describe('messages', () => {
		it('round-trips content through the at-rest encryption', async () => {
			const { owner, groupId } = await groupWithMember();
			const content = 'привет — ciphertext round trip';

			const posted = await request(owner, 'POST', `/groups/${groupId}/messages`, { content });
			expect(posted.status).toBe(201);
			expect(posted.body.message.content).toBe(content);

			const listed = await request(owner, 'GET', `/groups/${groupId}/messages`);
			expect(listed.body.messages.at(-1).content).toBe(content);
		});

		it('rejects a message that is neither text nor attachment', async () => {
			const { owner, groupId } = await groupWithMember();
			const res = await request(owner, 'POST', `/groups/${groupId}/messages`, { content: '   ' });
			expect(res.status).toBe(400);
		});

		it('only lets the author edit their own message', async () => {
			const { owner, member, groupId } = await groupWithMember();
			const posted = await request(owner, 'POST', `/groups/${groupId}/messages`, {
				content: 'mine',
			});
			const messageId = posted.body.message.id as string;

			expect(
				(await request(member, 'PATCH', `/groups/messages/${messageId}`, { content: 'yours' }))
					.status,
			).toBe(403);

			const edited = await request(owner, 'PATCH', `/groups/messages/${messageId}`, {
				content: 'edited',
			});
			expect(edited.status).toBe(200);
			expect(edited.body.message).toMatchObject({ content: 'edited', isEdited: true });
		});

		it('returns messages oldest-last and pages backwards with a cursor', async () => {
			const { owner, groupId } = await groupWithMember();
			for (let i = 0; i < 5; i++) {
				await request(owner, 'POST', `/groups/${groupId}/messages`, { content: `m${i}` });
			}

			const firstPage = await request(owner, 'GET', `/groups/${groupId}/messages?limit=2`);
			expect(firstPage.body.messages.map((m: { content: string }) => m.content)).toEqual([
				'm3',
				'm4',
			]);
			expect(firstPage.body.hasMore).toBe(true);

			const second = await request(
				owner,
				'GET',
				`/groups/${groupId}/messages?limit=2&cursor=${encodeURIComponent(firstPage.body.nextCursor)}`,
			);
			expect(second.body.messages.map((m: { content: string }) => m.content)).toEqual(['m1', 'm2']);
		});

		it('keeps one reaction per user per message and toggles it off', async () => {
			const { owner, member, groupId } = await groupWithMember();
			const posted = await request(owner, 'POST', `/groups/${groupId}/messages`, {
				content: 'react to me',
			});
			const messageId = posted.body.message.id as string;

			const added = await request(member, 'POST', `/groups/messages/${messageId}/reactions`, {
				emoji: '👍',
			});
			expect(added.body.reactions).toEqual([
				expect.objectContaining({ emoji: '👍', count: 1, userIds: [member.id] }),
			]);

			// Same user, different emoji: the row is unique per (user, message), so
			// this has to replace the first rather than add a second.
			const swapped = await request(member, 'POST', `/groups/messages/${messageId}/reactions`, {
				emoji: '🔥',
			});
			expect(swapped.body.reactions).toEqual([
				expect.objectContaining({ emoji: '🔥', count: 1 }),
			]);

			// Same emoji again is the toggle-off.
			const toggled = await request(member, 'POST', `/groups/messages/${messageId}/reactions`, {
				emoji: '🔥',
			});
			expect(toggled.body.reactions).toEqual([]);

			// And the list endpoint agrees, which is the part that reads the rows
			// back rather than reporting what it just wrote.
			const listed = await request(owner, 'GET', `/groups/${groupId}/messages`);
			expect(listed.body.messages.at(-1).reactions).toEqual([]);
		});
	});

	describe('invites', () => {
		it('does not create a second pending invite for the same person', async () => {
			const owner = await createUser('inviter');
			const invitee = await createUser('invitee');
			const groupId = (await request(owner, 'POST', '/groups', { name: 'Invites' })).body.group.id;

			const first = await request(owner, 'POST', `/groups/${groupId}/invites`, {
				userId: invitee.id,
			});
			expect(first.status).toBe(201);

			// The partial unique index on (group_id, invitee_id) WHERE
			// status='pending' is the thing under test: the route catches 23505 and
			// turns it into a 409 rather than letting the insert throw a 500.
			const second = await request(owner, 'POST', `/groups/${groupId}/invites`, {
				userId: invitee.id,
			});
			expect(second.status).toBe(409);

			const incoming = await request(invitee, 'GET', '/groups/invites/incoming');
			expect(incoming.body.invites).toHaveLength(1);
		});

		it('will not let a member accept someone else\'s invite', async () => {
			const owner = await createUser('inviter2');
			const invitee = await createUser('invitee2');
			const bystander = await createUser('bystander');
			const groupId = (await request(owner, 'POST', '/groups', { name: 'Invites2' })).body.group.id;

			const invited = await request(owner, 'POST', `/groups/${groupId}/invites`, {
				userId: invitee.id,
			});
			const inviteId = invited.body.invite.id as string;

			const stolen = await request(bystander, 'POST', `/groups/invites/${inviteId}/accept`);
			expect(stolen.status).toBe(403);
			expect((await request(bystander, 'GET', '/groups')).body.groups).toHaveLength(0);
		});

		it('does not let a plain member invite while invitePolicy is admins', async () => {
			const { member, groupId } = await groupWithMember();
			const stranger = await createUser('stranger');

			const res = await request(member, 'POST', `/groups/${groupId}/invites`, {
				userId: stranger.id,
			});
			expect(res.status).toBe(403);
		});
	});

	describe('deletion', () => {
		it('cascades a deleted group to its members and messages', async () => {
			const { owner, member, groupId } = await groupWithMember();
			await request(owner, 'POST', `/groups/${groupId}/messages`, { content: 'doomed' });

			expect((await request(member, 'DELETE', `/groups/${groupId}`)).status).toBe(403);
			expect((await request(owner, 'DELETE', `/groups/${groupId}`)).status).toBe(200);

			// A row left behind in group_members would still list the group for its
			// members, which is exactly what `onDelete: cascade` is there to stop.
			expect((await request(owner, 'GET', '/groups')).body.groups).toHaveLength(0);
			expect((await request(member, 'GET', '/groups')).body.groups).toHaveLength(0);
			// 403, not 404: the route checks membership before it looks for the
			// group, and the cascade took the membership row with it.
			expect((await request(owner, 'GET', `/groups/${groupId}`)).status).toBe(403);
		});
	});
});
