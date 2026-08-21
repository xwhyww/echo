import type { Logger } from './logger.js';

// Fixed-window rate limiting, shared by every service that needs it.
//
// Fixed rather than sliding: a sliding window costs a sorted set per key and
// buys accuracy nobody here needs. The worst case of a fixed window is that a
// caller lands 2× the limit across a window boundary, which for "how many text
// messages may one IP trigger" is a rounding error.
//
// Redis backs it when it is reachable, so the count survives a gateway restart
// and would still hold if a second instance ever appeared. When it is not, an
// in-process Map takes over: with one instance that is the same guarantee, and
// with several it is a weaker one — still far better than failing open, which
// is what "no limiter at all" means.

export interface RateLimitRule {
	/** How many requests are allowed inside one window. */
	limit: number;
	/** Window length in seconds. */
	windowSec: number;
}

export interface RateLimitResult {
	allowed: boolean;
	/** Requests left in this window; 0 once the limit is reached. */
	remaining: number;
	/** Seconds until the window resets — what goes in `Retry-After`. */
	retryAfter: number;
}

export interface RateLimiter {
	consume(key: string, rule: RateLimitRule): Promise<RateLimitResult>;
	close(): Promise<void>;
}

/** In-process fallback. Also the whole implementation when no URL is given. */
function createMemoryLimiter(): RateLimiter {
	const windows = new Map<string, { count: number; expiresAt: number }>();

	// Without this the map grows one entry per distinct key forever, and the
	// keys are attacker-chosen (one per IP). Cheap because it only walks what
	// has already expired.
	const sweeper = setInterval(() => {
		const now = Date.now();
		for (const [key, w] of windows) {
			if (w.expiresAt <= now) windows.delete(key);
		}
	}, 60_000);
	sweeper.unref?.();

	return {
		async consume(key, rule) {
			const now = Date.now();
			let w = windows.get(key);
			if (!w || w.expiresAt <= now) {
				w = { count: 0, expiresAt: now + rule.windowSec * 1000 };
				windows.set(key, w);
			}
			w.count += 1;
			const retryAfter = Math.max(1, Math.ceil((w.expiresAt - now) / 1000));
			return {
				allowed: w.count <= rule.limit,
				remaining: Math.max(0, rule.limit - w.count),
				retryAfter,
			};
		},
		async close() {
			clearInterval(sweeper);
			windows.clear();
		},
	};
}

/**
 * A limiter backed by Redis, degrading to an in-process one whenever Redis is
 * unavailable — at startup or later. Never throws and never rejects: a broken
 * limiter must not take the API down with it.
 */
export function createRateLimiter(opts: { redisUrl?: string; log?: Logger }): RateLimiter {
	const memory = createMemoryLimiter();
	if (!opts.redisUrl) return memory;

	// Imported lazily so a service that never rate-limits does not pay for the
	// dependency, and so a missing `redis` package degrades instead of crashing.
	let clientPromise: Promise<any> | null = null;
	let degradedSince = 0;
	/** After a failure, stop retrying Redis for a while and just use memory. */
	const RETRY_AFTER_FAILURE_MS = 30_000;

	function degrade(err: unknown): void {
		if (!degradedSince) {
			opts.log?.warn({ err }, 'rate limiter falling back to in-process counters');
		}
		degradedSince = Date.now();
		clientPromise = null;
	}

	async function getClient(): Promise<any | null> {
		if (degradedSince && Date.now() - degradedSince < RETRY_AFTER_FAILURE_MS) return null;
		if (!clientPromise) {
			clientPromise = (async () => {
				const { createClient } = await import('redis');
				const client = createClient({ url: opts.redisUrl });
				// node-redis emits 'error' on every reconnect attempt; an unhandled
				// one would take the process down.
				client.on('error', (err: unknown) => degrade(err));
				await client.connect();
				degradedSince = 0;
				return client;
			})();
			clientPromise.catch(degrade);
		}
		try {
			return await clientPromise;
		} catch {
			return null;
		}
	}

	return {
		async consume(key, rule) {
			const client = await getClient();
			if (!client) return memory.consume(key, rule);
			try {
				// INCR then EXPIRE only on the first hit: setting the TTL every time
				// would slide the window forward and let a steady caller never reset.
				const redisKey = `rl:${key}:${rule.windowSec}`;
				const count = await client.incr(redisKey);
				if (count === 1) await client.expire(redisKey, rule.windowSec);
				let ttl = await client.ttl(redisKey);
				// -1 means the key exists without a TTL, which can only happen if the
				// EXPIRE above was lost. Repair it rather than leaking the key.
				if (ttl < 0) {
					await client.expire(redisKey, rule.windowSec);
					ttl = rule.windowSec;
				}
				return {
					allowed: count <= rule.limit,
					remaining: Math.max(0, rule.limit - count),
					retryAfter: Math.max(1, ttl),
				};
			} catch (err) {
				degrade(err);
				return memory.consume(key, rule);
			}
		},
		async close() {
			const pending = clientPromise;
			clientPromise = null;
			await memory.close();
			if (!pending) return;
			try {
				const client = await pending;
				await client?.quit();
			} catch {
				// Closing a already-broken client is not worth reporting.
			}
		},
	};
}

/**
 * The caller's address as seen from behind a reverse proxy.
 *
 * Takes the **last** entry of `X-Forwarded-For`, not the first. Caddy appends
 * the peer it actually spoke to, so anything a client puts in the header of its
 * own accord ends up to the left of that and cannot be mistaken for the truth.
 * Reading the first entry — the usual way this is written — would let any
 * caller pick its own rate-limit bucket and defeat the whole thing.
 */
export function clientAddress(headers: Headers, fallback = 'unknown'): string {
	const forwarded = headers.get('x-forwarded-for');
	if (forwarded) {
		const parts = forwarded
			.split(',')
			.map((p) => p.trim())
			.filter(Boolean);
		if (parts.length > 0) return parts[parts.length - 1];
	}
	return headers.get('x-real-ip')?.trim() || fallback;
}
