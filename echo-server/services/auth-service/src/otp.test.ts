import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import {
	normalizePhone,
	hashCode,
	pendingSecretFrom,
	signPendingToken,
	verifyPendingToken,
	OTP_TTL_MS,
	OTP_RESEND_COOLDOWN_MS,
	OTP_MAX_ATTEMPTS,
} from './otp.js';

const SECRET = 'test-jwt-secret';
const USER = '9c1f0e2a-0000-4000-8000-000000000001';

describe('normalizePhone', () => {
	it('adds the leading plus', () => {
		expect(normalizePhone('79991234567')).toBe('+79991234567');
	});

	it('keeps one that is already there', () => {
		expect(normalizePhone('+79991234567')).toBe('+79991234567');
	});

	it('strips the punctuation people type', () => {
		// All of these are one number. If they normalised differently they would
		// be separate rows, separate accounts, and separate resend cooldowns.
		for (const written of [
			'+7 (999) 123-45-67',
			'+7 999 123 45 67',
			'+7.999.123.45.67',
			'  +7-999-1234567  '.trim(),
		]) {
			expect(normalizePhone(written)).toBe('+79991234567');
		}
	});

	it('rejects anything that is not a number', () => {
		for (const bad of [null, undefined, 42, {}, [], true]) {
			expect(normalizePhone(bad)).toBeNull();
		}
	});

	it('rejects the wrong number of digits', () => {
		// E.164 is 10-15 digits; outside that it cannot be dialled.
		expect(normalizePhone('123456789')).toBeNull();
		expect(normalizePhone('1234567890')).toBe('+1234567890');
		expect(normalizePhone('123456789012345')).toBe('+123456789012345');
		expect(normalizePhone('1234567890123456')).toBeNull();
	});

	it('rejects letters and stray symbols', () => {
		expect(normalizePhone('+7999123456a')).toBeNull();
		expect(normalizePhone('+7999123456;DROP')).toBeNull();
		expect(normalizePhone('')).toBeNull();
		// A plus anywhere but the front is not a phone number.
		expect(normalizePhone('799+91234567')).toBeNull();
	});
});

describe('hashCode', () => {
	it('is stable, so a stored hash can be compared against a fresh guess', () => {
		expect(hashCode('123456')).toBe(hashCode('123456'));
	});

	it('differs for different codes', () => {
		expect(hashCode('123456')).not.toBe(hashCode('123457'));
	});

	it('does not contain the code', () => {
		// The point of hashing it: a database dump must not hand out live codes.
		expect(hashCode('123456')).not.toContain('123456');
		expect(hashCode('123456')).toMatch(/^[0-9a-f]{64}$/);
	});
});

describe('pending tokens', () => {
	it('round-trips the user id', () => {
		expect(verifyPendingToken(signPendingToken(USER, SECRET), SECRET)).toBe(USER);
	});

	it('is rejected under a different jwt secret', () => {
		expect(verifyPendingToken(signPendingToken(USER, SECRET), 'other-secret')).toBeNull();
	});

	it('cannot be forged with the session secret', () => {
		// The whole reason the secret is derived: a token minted with the plain
		// JWT secret must not be accepted here, and vice versa.
		const forged = jwt.sign({ userId: USER, scope: 'otp-password' }, SECRET);
		expect(verifyPendingToken(forged, SECRET)).toBeNull();
	});

	it('is not a session token', () => {
		// The mirror of the above: a pending token must fail the normal
		// verification, or half-finished sign-in would be a full session.
		const pending = signPendingToken(USER, SECRET);
		expect(() => jwt.verify(pending, SECRET)).toThrow();
	});

	it('rejects a token with the wrong scope', () => {
		const wrongScope = jwt.sign(
			{ userId: USER, scope: 'something-else' },
			pendingSecretFrom(SECRET),
		);
		expect(verifyPendingToken(wrongScope, SECRET)).toBeNull();
	});

	it('rejects a token with no user id', () => {
		const noUser = jwt.sign({ scope: 'otp-password' }, pendingSecretFrom(SECRET));
		expect(verifyPendingToken(noUser, SECRET)).toBeNull();
	});

	it('rejects an expired token', () => {
		const expired = jwt.sign(
			{ userId: USER, scope: 'otp-password' },
			pendingSecretFrom(SECRET),
			{ expiresIn: '-1s' },
		);
		expect(verifyPendingToken(expired, SECRET)).toBeNull();
	});

	it('rejects rubbish without throwing', () => {
		// This value comes straight off the network.
		for (const bad of ['', 'not-a-token', 'a.b.c']) {
			expect(verifyPendingToken(bad, SECRET)).toBeNull();
		}
	});

	it('carries an expiry at all', () => {
		const decoded = jwt.decode(signPendingToken(USER, SECRET)) as { exp?: number };
		expect(decoded.exp).toBeTypeOf('number');
	});
});

describe('flow constants', () => {
	// Not arbitrary: these three are what stop a code being guessed or a number
	// being used to run up an SMS bill, so a change to any of them should be a
	// deliberate one.
	it('expires a code well before it could be brute-forced', () => {
		expect(OTP_TTL_MS).toBe(5 * 60 * 1000);
	});

	it('makes the caller wait between codes for the same number', () => {
		expect(OTP_RESEND_COOLDOWN_MS).toBe(60 * 1000);
	});

	it('burns a code after a handful of wrong guesses', () => {
		expect(OTP_MAX_ATTEMPTS).toBe(5);
	});

	it('allows far fewer guesses than a six-digit code has values', () => {
		// The guard that actually makes a six-digit code safe.
		const codeSpace = 1_000_000;
		const guessesPerHour = OTP_MAX_ATTEMPTS * (60 * 60 * 1000 / OTP_RESEND_COOLDOWN_MS);
		expect(guessesPerHour).toBeLessThan(codeSpace / 1000);
	});
});
