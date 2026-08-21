import type { MiddlewareHandler } from 'hono';
import { createRateLimiter, clientAddress, type RateLimitRule } from '@echo/shared/ratelimit';
import { log } from './log.js';
import { config } from './config.js';

// Per-caller limits, applied at the edge because this is the only place that
// sees every request. Buckets are keyed by client address; a request that
// carries a valid session is *not* keyed by user id, because the endpoints
// worth protecting most are the ones reached before anyone has a session.

const limiter = createRateLimiter({ redisUrl: config.redisUrl, log });

interface Rule extends RateLimitRule {
	/** Bucket name, so two paths sharing a rule don't share a counter. */
	bucket: string;
	match(method: string, path: string): boolean;
}

// First match wins, so the specific paths come before the catch-all.
const RULES: Rule[] = [
	{
		// The one that costs money. Every call here can put a paid SMS on the
		// wire, and auth-service's own cooldown is keyed by *phone* — it stops a
		// caller hammering one number and does nothing about a caller walking
		// through ten thousand of them.
		//
		// The ceiling is deliberately not tight: Russian mobile carriers put many
		// subscribers behind one CGNAT address, so a strict per-IP rule would
		// lock out real people. Tunable without a redeploy — see config.
		bucket: 'otp-request',
		limit: config.rateLimits.otpRequestsPerWindow,
		windowSec: 15 * 60,
		match: (method, path) => method === 'POST' && path === '/auth/otp/request',
	},
	{
		// Code guessing is already capped at five tries per code by auth-service,
		// so this only exists to stop someone cycling request→guess→request.
		bucket: 'otp-verify',
		limit: 40,
		windowSec: 15 * 60,
		match: (method, path) =>
			method === 'POST' && (path === '/auth/otp/verify' || path === '/auth/otp/password'),
	},
	{
		// Uploads accept up to 100 MB each. Bandwidth and disk, not SMS, but the
		// same idea.
		bucket: 'upload',
		limit: 60,
		windowSec: 5 * 60,
		match: (method, path) =>
			method === 'POST' &&
			(path.startsWith('/blobs/upload') || path.startsWith('/personal-chats/upload')),
	},
	{
		bucket: 'auth',
		limit: 120,
		windowSec: 5 * 60,
		match: (_method, path) => path.startsWith('/auth/'),
	},
	{
		// Catch-all. High enough that normal use never sees it — an open client
		// polls, uploads and pages through history — and low enough to blunt a
		// scraper.
		bucket: 'global',
		limit: config.rateLimits.globalPerMinute,
		windowSec: 60,
		match: () => true,
	},
];

export function rateLimit(): MiddlewareHandler {
	return async (c, next) => {
		// Preflight never reaches here (cors() answers it first), and /health is
		// what the container healthcheck polls every few seconds.
		if (c.req.path === '/health') return next();

		const path = c.req.path;
		const rule = RULES.find((r) => r.match(c.req.method, path));
		if (!rule) return next();

		const address = clientAddress(c.req.raw.headers);
		const result = await limiter.consume(`${rule.bucket}:${address}`, rule);

		if (!result.allowed) {
			log.warn(
				{ bucket: rule.bucket, address, path, method: c.req.method },
				'rate limit exceeded'
			);
			return c.json(
				{ error: 'Too many requests. Try again later.', retryAfter: result.retryAfter },
				429,
				{ 'Retry-After': String(result.retryAfter) }
			);
		}

		c.header('X-RateLimit-Remaining', String(result.remaining));
		return next();
	};
}

export function closeRateLimiter(): Promise<void> {
	return limiter.close();
}
