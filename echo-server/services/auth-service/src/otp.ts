import { createHash } from 'crypto';
import jwt from 'jsonwebtoken';

/**
 * The parts of the sign-in flow that are pure functions of their input.
 *
 * Lifted out of `routes/auth.ts` so they can be tested without a database: what
 * counts as a phone number, and what the pending token between the code step
 * and the password step is allowed to do, are exactly the decisions worth
 * pinning down.
 */

/** How long a code stays valid. */
export const OTP_TTL_MS = 5 * 60 * 1000;
/** How long before a new code may be requested for the same number. */
export const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
/** How many wrong guesses a single code tolerates before it is burned. */
export const OTP_MAX_ATTEMPTS = 5;
/** How long the caller has to finish the password step. */
export const PENDING_TOKEN_TTL = '10m';

/**
 * Canonical form of a phone number, or null when it is not one.
 *
 * Spaces, dashes, dots and brackets are how people write numbers and mean
 * nothing, so they are stripped before validating. What is left must be 10-15
 * digits — the E.164 range — and comes back with a leading `+` whether or not
 * one was typed, so the same number entered two ways is one row in the database
 * and one bucket for the resend cooldown.
 */
export function normalizePhone(raw: unknown): string | null {
	if (typeof raw !== 'string') return null;
	const digits = raw.replace(/[\s\-().]/g, '');
	if (!/^\+?\d{10,15}$/.test(digits)) return null;
	return digits.startsWith('+') ? digits : `+${digits}`;
}

/**
 * What is stored instead of the code itself, so a leaked database dump does not
 * hand out live sign-in codes.
 */
export function hashCode(code: string): string {
	return createHash('sha256').update(code).digest('hex');
}

/**
 * Pending tokens are signed with a *derived* secret so they can never pass the
 * regular authMiddleware as a session token: a caller who is halfway through
 * sign-in has proved they hold the phone, not that they know the password.
 */
export function pendingSecretFrom(jwtSecret: string): string {
	return `${jwtSecret}:otp-pending`;
}

export function signPendingToken(userId: string, jwtSecret: string): string {
	return jwt.sign({ userId, scope: 'otp-password' }, pendingSecretFrom(jwtSecret), {
		expiresIn: PENDING_TOKEN_TTL,
	});
}

/**
 * The user id a pending token stands for, or null for anything else — expired,
 * forged, signed with the session secret, or carrying a different scope.
 */
export function verifyPendingToken(token: string, jwtSecret: string): string | null {
	try {
		const payload = jwt.verify(token, pendingSecretFrom(jwtSecret)) as {
			userId?: string;
			scope?: string;
		};
		return payload.scope === 'otp-password' && payload.userId ? payload.userId : null;
	} catch {
		return null;
	}
}
