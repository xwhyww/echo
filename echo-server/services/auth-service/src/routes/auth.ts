import { Hono } from 'hono';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createHash, randomBytes, randomInt } from 'crypto';
import { and, desc, eq, ne } from 'drizzle-orm';
import { signToken, verifyToken, SUBJECTS, type UserCreatedEvent, type UserUpdatedEvent } from '@echo/shared';
import { createDb } from '../db/index.js';
import { users, userAvatars, phoneOtps } from '../db/schema.js';
import { config } from '../config.js';
import { getNatsConnection } from '../nats.js';
import { sendSms } from '../sms.js';

const db = createDb(config.databaseUrl);

export const authRoutes = new Hono();

// Browser clients can't read HttpOnly cookies but <img>/<video> will send them,
// so `/blobs/files/...` authenticates via cookie without leaking the JWT into
// URLs, logs, or the DOM. Tauri stays on `?t=` and doesn't get the cookie.
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7;
function setAuthCookie(c: { header: (name: string, value: string, options?: { append?: boolean }) => void; req: { header: (name: string) => string | undefined } }, token: string) {
	if (c.req.header('x-client') !== 'browser') return;
	const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
	c.header(
		'Set-Cookie',
		`echo_auth=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${COOKIE_MAX_AGE}${secure}`,
		{ append: true }
	);
}
function clearAuthCookie(c: { header: (name: string, value: string, options?: { append?: boolean }) => void }) {
	c.header('Set-Cookie', 'echo_auth=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0', { append: true });
}

// --- Phone OTP auth ---
//
// Sign-in and sign-up are the same flow: request a code, verify it. A new
// phone creates an account (random username); a known phone logs in. When the
// account has a password set, the OTP step returns a short-lived pending
// token that must be exchanged together with the password.

const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
// Never echo the code back in production — dev has no real SMS provider.
const DEV_ECHO_CODE = process.env.NODE_ENV !== 'production';

function normalizePhone(raw: unknown): string | null {
	if (typeof raw !== 'string') return null;
	const digits = raw.replace(/[\s\-().]/g, '');
	if (!/^\+?\d{10,15}$/.test(digits)) return null;
	return digits.startsWith('+') ? digits : `+${digits}`;
}

function hashCode(code: string): string {
	return createHash('sha256').update(code).digest('hex');
}

// Pending tokens are deliberately signed with a derived secret so they can
// never pass the regular authMiddleware as a session token.
const pendingSecret = `${config.jwtSecret}:otp-pending`;

function signPendingToken(userId: string): string {
	return jwt.sign({ userId, scope: 'otp-password' }, pendingSecret, { expiresIn: '10m' });
}

function verifyPendingToken(token: string): string | null {
	try {
		const payload = jwt.verify(token, pendingSecret) as { userId?: string; scope?: string };
		return payload.scope === 'otp-password' && payload.userId ? payload.userId : null;
	} catch {
		return null;
	}
}

type DbUser = typeof users.$inferSelect;

// The wire shape of the account: everything the client may see about itself.
// hasPassword lets the UI offer "set" vs "change" without exposing the hash.
function publicUser(user: DbUser) {
	return {
		id: user.id,
		email: user.email,
		username: user.username,
		displayName: user.displayName,
		avatarUrl: user.avatarUrl,
		phone: user.phone,
		status: user.status,
		hasPassword: user.passwordHash !== null,
	};
}

function issueToken(c: Parameters<typeof setAuthCookie>[0], user: DbUser): string {
	const token = signToken({ userId: user.id, email: user.email, username: user.username }, config.jwtSecret);
	setAuthCookie(c, token);
	return token;
}

async function createUserForPhone(phone: string): Promise<DbUser> {
	// user_ + 8 hex chars; retry a few times on the (unlikely) unique clash.
	for (let i = 0; ; i++) {
		const username = `user_${randomBytes(4).toString('hex')}`;
		try {
			const [user] = await db
				.insert(users)
				.values({ phone, username, displayName: username })
				.returning();
			return user;
		} catch (err) {
			if (i >= 4) throw err;
		}
	}
}

authRoutes.post('/otp/request', async (c) => {
	const body = await c.req.json().catch(() => ({}));
	const phone = normalizePhone(body.phone);
	if (!phone) {
		return c.json({ error: 'Invalid phone number' }, 400);
	}

	const existing = await db.query.phoneOtps.findFirst({ where: eq(phoneOtps.phone, phone) });
	if (existing) {
		const sinceLast = Date.now() - existing.lastSentAt.getTime();
		if (sinceLast < OTP_RESEND_COOLDOWN_MS) {
			const retryAfter = Math.ceil((OTP_RESEND_COOLDOWN_MS - sinceLast) / 1000);
			return c.json({ error: 'Code already sent. Try again later.', retryAfter }, 429);
		}
	}

	const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
	const row = {
		codeHash: hashCode(code),
		attempts: 0,
		expiresAt: new Date(Date.now() + OTP_TTL_MS),
		lastSentAt: new Date(),
	};
	await db
		.insert(phoneOtps)
		.values({ phone, ...row })
		.onConflictDoUpdate({ target: phoneOtps.phone, set: row });

	await sendSms(phone, `Echo code: ${code}`);

	return c.json({
		ok: true,
		expiresIn: OTP_TTL_MS / 1000,
		resendIn: OTP_RESEND_COOLDOWN_MS / 1000,
		...(DEV_ECHO_CODE ? { devCode: code } : {}),
	});
});

authRoutes.post('/otp/verify', async (c) => {
	const body = await c.req.json().catch(() => ({}));
	const phone = normalizePhone(body.phone);
	const code = typeof body.code === 'string' ? body.code.trim() : '';
	if (!phone || !/^\d{6}$/.test(code)) {
		return c.json({ error: 'Invalid phone or code' }, 400);
	}

	const otp = await db.query.phoneOtps.findFirst({ where: eq(phoneOtps.phone, phone) });
	if (!otp || otp.expiresAt.getTime() < Date.now()) {
		return c.json({ error: 'Code expired. Request a new one.' }, 400);
	}
	if (otp.attempts >= OTP_MAX_ATTEMPTS) {
		await db.delete(phoneOtps).where(eq(phoneOtps.phone, phone));
		return c.json({ error: 'Too many attempts. Request a new code.' }, 429);
	}
	if (otp.codeHash !== hashCode(code)) {
		await db
			.update(phoneOtps)
			.set({ attempts: otp.attempts + 1 })
			.where(eq(phoneOtps.phone, phone));
		return c.json({ error: 'Wrong code' }, 400);
	}

	await db.delete(phoneOtps).where(eq(phoneOtps.phone, phone));

	let user = await db.query.users.findFirst({ where: eq(users.phone, phone) });
	const isNewUser = !user;

	if (!user) {
		user = await createUserForPhone(phone);

		const nc = getNatsConnection();
		if (nc) {
			const event: UserCreatedEvent = {
				id: user.id,
				email: user.email,
				username: user.username,
				displayName: user.displayName,
				avatarUrl: null,
				phone: user.phone,
			};
			nc.publish(SUBJECTS.USER_CREATED, JSON.stringify(event));
		}
	} else if (user.passwordHash) {
		// Second factor: the phone is confirmed, now the password.
		return c.json({ passwordRequired: true, pendingToken: signPendingToken(user.id) });
	}

	const token = issueToken(c, user);
	return c.json({ user: publicUser(user), token, isNewUser }, isNewUser ? 201 : 200);
});

authRoutes.post('/otp/password', async (c) => {
	const body = await c.req.json().catch(() => ({}));
	const pendingToken = typeof body.pendingToken === 'string' ? body.pendingToken : '';
	const password = typeof body.password === 'string' ? body.password : '';

	const userId = verifyPendingToken(pendingToken);
	if (!userId) {
		return c.json({ error: 'Session expired. Start over.' }, 401);
	}

	const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
	if (!user || !user.passwordHash) {
		return c.json({ error: 'Session expired. Start over.' }, 401);
	}

	const valid = await bcrypt.compare(password, user.passwordHash);
	if (!valid) {
		return c.json({ error: 'Wrong password' }, 401);
	}

	const token = issueToken(c, user);
	return c.json({ user: publicUser(user), token, isNewUser: false });
});

// --- Logout (clears browser cookie; Tauri just drops its token) ---

authRoutes.post('/logout', async (c) => {
	clearAuthCookie(c);
	return c.json({ ok: true });
});

// --- Get current user ---

authRoutes.get('/me', async (c) => {
	const header = c.req.header('Authorization');
	if (!header?.startsWith('Bearer ')) {
		return c.json({ error: 'Unauthorized' }, 401);
	}

	const payload = verifyToken(header.slice(7), config.jwtSecret);
	if (!payload) {
		return c.json({ error: 'Invalid token' }, 401);
	}

	const user = await db.query.users.findFirst({
		where: eq(users.id, payload.userId),
	});

	if (!user) {
		return c.json({ error: 'User not found' }, 404);
	}

	// Refresh cookie on every /me so browser users who updated client-side
	// before the cookie migration pick it up silently on next load.
	setAuthCookie(c, header.slice(7));
	return c.json({ user: publicUser(user) });
});

// --- Update current user ---

// phone is intentionally absent: it's the login identity and changing it
// should go through its own OTP confirmation, not a profile PATCH.
const updateMeSchema = z.object({
	displayName: z.string().min(1).max(64).optional(),
	username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_]+$/).optional(),
	email: z.string().email().optional().nullable(),
	status: z.string().max(128).optional().nullable(),
});

authRoutes.patch('/me', async (c) => {
	const header = c.req.header('Authorization');
	if (!header?.startsWith('Bearer ')) {
		return c.json({ error: 'Unauthorized' }, 401);
	}

	const payload = verifyToken(header.slice(7), config.jwtSecret);
	if (!payload) {
		return c.json({ error: 'Invalid token' }, 401);
	}

	const body = await c.req.json();
	const parsed = updateMeSchema.safeParse(body);

	if (!parsed.success) {
		return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400);
	}

	const updates: Record<string, unknown> = {};
	if (parsed.data.displayName !== undefined) updates.displayName = parsed.data.displayName;
	if (parsed.data.username !== undefined) updates.username = parsed.data.username;
	if (parsed.data.email !== undefined) updates.email = parsed.data.email;
	if (parsed.data.status !== undefined) updates.status = parsed.data.status;

	if (Object.keys(updates).length === 0) {
		return c.json({ error: 'No fields to update' }, 400);
	}

	if (parsed.data.username !== undefined) {
		const existingUsername = await db.query.users.findFirst({
			where: and(eq(users.username, parsed.data.username), ne(users.id, payload.userId)),
		});
		if (existingUsername) {
			return c.json({ error: 'Username already taken' }, 409);
		}
	}

	if (parsed.data.email) {
		const existingEmail = await db.query.users.findFirst({
			where: and(eq(users.email, parsed.data.email), ne(users.id, payload.userId)),
		});
		if (existingEmail) {
			return c.json({ error: 'Email already in use' }, 409);
		}
	}

	const [user] = await db
		.update(users)
		.set(updates)
		.where(eq(users.id, payload.userId))
		.returning();

	if (!user) {
		return c.json({ error: 'User not found' }, 404);
	}

	const nc = getNatsConnection();
	if (nc) {
		const event: UserUpdatedEvent = {
			id: user.id,
			displayName: parsed.data.displayName,
			username: parsed.data.username,
			email: parsed.data.email,
			status: parsed.data.status,
		};
		nc.publish(SUBJECTS.USER_UPDATED, JSON.stringify(event));
	}

	return c.json({ user: publicUser(user) });
});

// --- Password (optional second factor) ---
//
// Setting a password does not replace SMS login — it adds a step after the
// OTP. Changing or removing it requires the current password.

const updatePasswordSchema = z.object({
	currentPassword: z.string().optional(),
	newPassword: z.string().min(6).max(128).nullable(),
});

authRoutes.put('/me/password', async (c) => {
	const header = c.req.header('Authorization');
	if (!header?.startsWith('Bearer ')) {
		return c.json({ error: 'Unauthorized' }, 401);
	}

	const payload = verifyToken(header.slice(7), config.jwtSecret);
	if (!payload) {
		return c.json({ error: 'Invalid token' }, 401);
	}

	const body = await c.req.json().catch(() => ({}));
	const parsed = updatePasswordSchema.safeParse(body);
	if (!parsed.success) {
		return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400);
	}

	const user = await db.query.users.findFirst({ where: eq(users.id, payload.userId) });
	if (!user) {
		return c.json({ error: 'User not found' }, 404);
	}

	if (user.passwordHash) {
		const current = parsed.data.currentPassword ?? '';
		const valid = current !== '' && (await bcrypt.compare(current, user.passwordHash));
		if (!valid) {
			return c.json({ error: 'Current password is wrong' }, 403);
		}
	} else if (parsed.data.newPassword === null) {
		return c.json({ error: 'No password is set' }, 400);
	}

	const passwordHash =
		parsed.data.newPassword === null ? null : await bcrypt.hash(parsed.data.newPassword, 12);

	const [updated] = await db
		.update(users)
		.set({ passwordHash })
		.where(eq(users.id, payload.userId))
		.returning();

	return c.json({ user: publicUser(updated) });
});

// --- Privacy settings ---

const PRIVACY_VISIBILITY = ['all', 'friends', 'nobody'] as const;
const PRIVACY_MESSAGING = ['all', 'existing'] as const;

const updatePrivacySchema = z.object({
	onlineStatus: z.enum(PRIVACY_VISIBILITY).optional(),
	phone: z.enum(PRIVACY_VISIBILITY).optional(),
	email: z.enum(PRIVACY_VISIBILITY).optional(),
	messaging: z.enum(PRIVACY_MESSAGING).optional(),
	profile: z.enum(PRIVACY_VISIBILITY).optional(),
	photo: z.enum(PRIVACY_VISIBILITY).optional(),
	groupInvite: z.enum(PRIVACY_VISIBILITY).optional(),
});

authRoutes.get('/me/privacy', async (c) => {
	const header = c.req.header('Authorization');
	if (!header?.startsWith('Bearer ')) {
		return c.json({ error: 'Unauthorized' }, 401);
	}

	const payload = verifyToken(header.slice(7), config.jwtSecret);
	if (!payload) {
		return c.json({ error: 'Invalid token' }, 401);
	}

	const user = await db.query.users.findFirst({
		where: eq(users.id, payload.userId),
		columns: {
			privacyOnlineStatus: true,
			privacyPhone: true,
			privacyEmail: true,
			privacyMessaging: true,
			privacyProfile: true,
			privacyPhoto: true,
			privacyGroupInvite: true,
		},
	});

	if (!user) {
		return c.json({ error: 'User not found' }, 404);
	}

	return c.json({
		privacy: {
			onlineStatus: user.privacyOnlineStatus,
			phone: user.privacyPhone,
			email: user.privacyEmail,
			messaging: user.privacyMessaging,
			profile: user.privacyProfile,
			photo: user.privacyPhoto,
			groupInvite: user.privacyGroupInvite,
		},
	});
});

authRoutes.patch('/me/privacy', async (c) => {
	const header = c.req.header('Authorization');
	if (!header?.startsWith('Bearer ')) {
		return c.json({ error: 'Unauthorized' }, 401);
	}

	const payload = verifyToken(header.slice(7), config.jwtSecret);
	if (!payload) {
		return c.json({ error: 'Invalid token' }, 401);
	}

	const body = await c.req.json();
	const parsed = updatePrivacySchema.safeParse(body);

	if (!parsed.success) {
		return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400);
	}

	const updates: Record<string, unknown> = {};
	if (parsed.data.onlineStatus !== undefined) updates.privacyOnlineStatus = parsed.data.onlineStatus;
	if (parsed.data.phone !== undefined) updates.privacyPhone = parsed.data.phone;
	if (parsed.data.email !== undefined) updates.privacyEmail = parsed.data.email;
	if (parsed.data.messaging !== undefined) updates.privacyMessaging = parsed.data.messaging;
	if (parsed.data.profile !== undefined) updates.privacyProfile = parsed.data.profile;
	if (parsed.data.photo !== undefined) updates.privacyPhoto = parsed.data.photo;
	if (parsed.data.groupInvite !== undefined) updates.privacyGroupInvite = parsed.data.groupInvite;

	if (Object.keys(updates).length === 0) {
		return c.json({ error: 'No fields to update' }, 400);
	}

	await db.update(users).set(updates).where(eq(users.id, payload.userId));

	const nc = getNatsConnection();
	if (nc) {
		const event: UserUpdatedEvent = {
			id: payload.userId,
			privacyOnlineStatus: parsed.data.onlineStatus,
			privacyPhone: parsed.data.phone,
			privacyEmail: parsed.data.email,
			privacyMessaging: parsed.data.messaging,
			privacyProfile: parsed.data.profile,
			privacyPhoto: parsed.data.photo,
			privacyGroupInvite: parsed.data.groupInvite,
		};
		nc.publish(SUBJECTS.USER_UPDATED, JSON.stringify(event));
	}

	return c.json({
		privacy: {
			onlineStatus: parsed.data.onlineStatus,
			phone: parsed.data.phone,
			email: parsed.data.email,
			messaging: parsed.data.messaging,
			profile: parsed.data.profile,
			photo: parsed.data.photo,
			groupInvite: parsed.data.groupInvite,
		},
	});
});

// --- Public: list avatars for any user ---

authRoutes.get('/users/:id/avatars', async (c) => {
	const userId = c.req.param('id');

	const avatars = await db.query.userAvatars.findMany({
		where: eq(userAvatars.userId, userId),
		orderBy: desc(userAvatars.createdAt),
		columns: { id: true, url: true, createdAt: true },
	});

	return c.json({ avatars });
});

// --- Avatars ---

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_AVATARS_PER_USER = 10;

// List all avatars
authRoutes.get('/me/avatars', async (c) => {
	const header = c.req.header('Authorization');
	if (!header?.startsWith('Bearer ')) {
		return c.json({ error: 'Unauthorized' }, 401);
	}

	const payload = verifyToken(header.slice(7), config.jwtSecret);
	if (!payload) {
		return c.json({ error: 'Invalid token' }, 401);
	}

	const avatars = await db.query.userAvatars.findMany({
		where: eq(userAvatars.userId, payload.userId),
		orderBy: desc(userAvatars.createdAt),
		columns: { id: true, url: true, createdAt: true },
	});

	return c.json({ avatars });
});

// Upload avatar (becomes active) — proxies file to blob-service
authRoutes.post('/me/avatar', async (c) => {
	const header = c.req.header('Authorization');
	if (!header?.startsWith('Bearer ')) {
		return c.json({ error: 'Unauthorized' }, 401);
	}

	const payload = verifyToken(header.slice(7), config.jwtSecret);
	if (!payload) {
		return c.json({ error: 'Invalid token' }, 401);
	}

	const formData = await c.req.formData();
	const file = formData.get('avatar');

	if (!file || !(file instanceof File)) {
		return c.json({ error: 'No file provided' }, 400);
	}

	if (!ALLOWED_TYPES.includes(file.type)) {
		return c.json({ error: 'Invalid file type. Allowed: JPEG, PNG, WebP, GIF, AVIF' }, 400);
	}

	if (file.size > MAX_SIZE) {
		return c.json({ error: 'File too large. Max 5MB' }, 400);
	}

	const existingCount = await db.$count(userAvatars, eq(userAvatars.userId, payload.userId));
	if (existingCount >= MAX_AVATARS_PER_USER) {
		return c.json({ error: `You can keep at most ${MAX_AVATARS_PER_USER} avatars. Delete an old one before uploading a new avatar.` }, 400);
	}

	const blobForm = new FormData();
	blobForm.append('files', file);
	blobForm.append('scopeType', 'avatar');
	blobForm.append('scopeId', payload.userId);

	const blobResp = await fetch(`${config.blobServiceUrl}/blobs/upload`, {
		method: 'POST',
		headers: { Authorization: header },
		body: blobForm,
	});

	if (!blobResp.ok) {
		const err = await blobResp.json().catch(() => ({})) as { error?: string };
		return c.json({ error: err.error ?? 'Upload failed' }, blobResp.status as any);
	}

	const blobData = await blobResp.json() as { blobs: { url: string; hash: string }[] };
	const blob = blobData.blobs[0];
	if (!blob) {
		return c.json({ error: 'Upload failed' }, 500);
	}

	const avatarUrl = blob.url;

	const [avatar] = await db
		.insert(userAvatars)
		.values({ userId: payload.userId, url: avatarUrl, hash: blob.hash })
		.returning({ id: userAvatars.id, url: userAvatars.url, createdAt: userAvatars.createdAt });

	const [user] = await db
		.update(users)
		.set({ avatarUrl })
		.where(eq(users.id, payload.userId))
		.returning({
			id: users.id,
			email: users.email,
			username: users.username,
			displayName: users.displayName,
			avatarUrl: users.avatarUrl,
			phone: users.phone,
			status: users.status,
		});

	if (!user) {
		return c.json({ error: 'User not found' }, 404);
	}

	const nc = getNatsConnection();
	if (nc) {
		const event: UserUpdatedEvent = { id: user.id, avatarUrl: user.avatarUrl };
		nc.publish(SUBJECTS.USER_UPDATED, JSON.stringify(event));
	}

	return c.json({ user, avatar });
});

// Set active avatar from existing
authRoutes.patch('/me/avatar', async (c) => {
	const header = c.req.header('Authorization');
	if (!header?.startsWith('Bearer ')) {
		return c.json({ error: 'Unauthorized' }, 401);
	}

	const payload = verifyToken(header.slice(7), config.jwtSecret);
	if (!payload) {
		return c.json({ error: 'Invalid token' }, 401);
	}

	const { avatarId } = await c.req.json();

	let newAvatarUrl: string | null = null;

	if (avatarId) {
		const avatar = await db.query.userAvatars.findFirst({
			where: and(eq(userAvatars.id, avatarId), eq(userAvatars.userId, payload.userId)),
		});

		if (!avatar) {
			return c.json({ error: 'Avatar not found' }, 404);
		}

		newAvatarUrl = avatar.url;
	}

	const [user] = await db
		.update(users)
		.set({ avatarUrl: newAvatarUrl })
		.where(eq(users.id, payload.userId))
		.returning({
			id: users.id,
			email: users.email,
			username: users.username,
			displayName: users.displayName,
			avatarUrl: users.avatarUrl,
			phone: users.phone,
			status: users.status,
		});

	const nc = getNatsConnection();
	if (nc) {
		const event: UserUpdatedEvent = { id: user.id, avatarUrl: user.avatarUrl };
		nc.publish(SUBJECTS.USER_UPDATED, JSON.stringify(event));
	}

	return c.json({ user });
});

// Delete avatar
authRoutes.delete('/me/avatars/:id', async (c) => {
	const header = c.req.header('Authorization');
	if (!header?.startsWith('Bearer ')) {
		return c.json({ error: 'Unauthorized' }, 401);
	}

	const payload = verifyToken(header.slice(7), config.jwtSecret);
	if (!payload) {
		return c.json({ error: 'Invalid token' }, 401);
	}

	const avatarId = c.req.param('id');

	const avatar = await db.query.userAvatars.findFirst({
		where: and(eq(userAvatars.id, avatarId), eq(userAvatars.userId, payload.userId)),
	});

	if (!avatar) {
		return c.json({ error: 'Avatar not found' }, 404);
	}

	await db.delete(userAvatars).where(eq(userAvatars.id, avatarId));

	// Only revoke the grant if no other avatar of the same user still uses
	// this hash — uploading the same image twice produces two rows sharing
	// one (hash, avatar, userId) grant.
	if (avatar.hash) {
		const stillUsed = await db.query.userAvatars.findFirst({
			where: and(eq(userAvatars.userId, payload.userId), eq(userAvatars.hash, avatar.hash)),
		});
		if (!stillUsed) {
			await fetch(`${config.blobServiceUrl}/blobs/grants`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json', Authorization: c.req.header('Authorization')! },
				body: JSON.stringify({
					scopeType: 'avatar',
					scopeId: payload.userId,
					hashes: [avatar.hash],
				}),
			}).catch(() => {});
		}
	}

	// If this was the active avatar, pick the most recent or null
	const currentUser = await db.query.users.findFirst({
		where: eq(users.id, payload.userId),
		columns: { avatarUrl: true },
	});

	let user;
	if (currentUser?.avatarUrl === avatar.url) {
		const next = await db.query.userAvatars.findFirst({
			where: eq(userAvatars.userId, payload.userId),
			orderBy: desc(userAvatars.createdAt),
			columns: { url: true },
		});

		[user] = await db
			.update(users)
			.set({ avatarUrl: next?.url ?? null })
			.where(eq(users.id, payload.userId))
			.returning({
				id: users.id,
				email: users.email,
				username: users.username,
				displayName: users.displayName,
				avatarUrl: users.avatarUrl,
				phone: users.phone,
				status: users.status,
			});

		const nc = getNatsConnection();
		if (nc) {
			const event: UserUpdatedEvent = { id: user.id, avatarUrl: user.avatarUrl };
			nc.publish(SUBJECTS.USER_UPDATED, JSON.stringify(event));
		}
	} else {
		[user] = await db
			.select({
				id: users.id,
				email: users.email,
				username: users.username,
				displayName: users.displayName,
				avatarUrl: users.avatarUrl,
				phone: users.phone,
				status: users.status,
			})
			.from(users)
			.where(eq(users.id, payload.userId));
	}

	return c.json({ user });
});
