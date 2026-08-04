import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import pino, { type Logger } from 'pino';
import { createMiddleware } from 'hono/factory';

export type { Logger } from 'pino';

export interface LogContext {
	requestId: string;
	userId?: string;
}

// The identity of whatever is currently being handled, carried implicitly so a
// helper five calls deep doesn't need a logger threaded through its signature.
// pino reads this on every log call (see `mixin` below), so any line emitted
// while a request is in flight is stamped with its requestId — including lines
// from code that has no idea a request exists.
const context = new AsyncLocalStorage<LogContext>();

export function logContext(): LogContext | undefined {
	return context.getStore();
}

export function runWithLogContext<T>(ctx: LogContext, fn: () => T): T {
	return context.run(ctx, fn);
}

/** Fill in fields that only become known mid-request (userId after auth). No-op outside one. */
export function setLogContext(patch: Partial<LogContext>): void {
	const store = context.getStore();
	if (store) Object.assign(store, patch);
}

const isDev = process.env.NODE_ENV !== 'production';

// Values that must never reach a log line, wherever in a logged object they
// appear. These are pino redact paths, not substring matches — each name has
// to be listed both bare and one level deep. Deliberately *not* redacting
// `code`: that is almost always an error code (ECONNREFUSED), and the one
// place it means an SMS code is logged as `smsCode`.
const REDACT_PATHS = [
	'password', '*.password',
	'passwordHash', '*.passwordHash',
	'token', '*.token',
	'accessToken', '*.accessToken',
	'refreshToken', '*.refreshToken',
	'jwt', '*.jwt',
	'secret', '*.secret',
	'apiKey', '*.apiKey',
	'smsCode', '*.smsCode',
	'authorization', '*.authorization',
	'headers.authorization',
	'headers["x-internal-key"]',
];

/**
 * One logger per service. `service` becomes the `name` field on every record,
 * which is how you filter a single service out of the merged compose log.
 */
export function createLogger(service: string): Logger {
	return pino({
		name: service,
		// Default to debug in dev and info in prod; LOG_LEVEL overrides both, so
		// a noisy incident can be debugged by restarting one container.
		level: process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
		redact: { paths: REDACT_PATHS, censor: '[redacted]' },
		mixin: () => {
			const ctx = context.getStore();
			return ctx ? { requestId: ctx.requestId, userId: ctx.userId } : {};
		},
		// pino defaults to epoch millis; ISO is what Loki and journalctl readers
		// expect, and it stays readable when someone greps the raw file.
		timestamp: pino.stdTimeFunctions.isoTime,
		// Human-readable colored output in dev only — in prod stdout must stay
		// pure JSON so the log shipper can parse it.
		...(isDev
			? {
					transport: {
						target: 'pino-pretty',
						options: { colorize: true, translateTime: 'HH:MM:ss.l', ignore: 'pid,hostname' },
					},
				}
			: {}),
	});
}

/** Paths that would otherwise flood the log with uptime-check noise. */
const QUIET_PATHS = new Set(['/health']);

/**
 * Replaces `hono/logger`. Opens a log context for the request, logs one line
 * per completed request, and echoes the request id back to the caller.
 *
 * The id is taken from an inbound `x-request-id` when present so a request
 * keeps a single identity across the gateway and every service it fans out to;
 * only the edge mints a new one.
 */
export function requestLogger(log: Logger) {
	return createMiddleware(async (c, next) => {
		const requestId = c.req.header('x-request-id') || randomUUID();
		const start = performance.now();

		await runWithLogContext({ requestId }, async () => {
			try {
				await next();
			} catch (err) {
				log.error({ err, method: c.req.method, path: c.req.path }, 'request threw');
				throw err;
			} finally {
				// Set on c.res rather than via c.header(): handlers that return a
				// raw Response (the gateway proxy) bypass Hono's header merging.
				try {
					c.res.headers.set('x-request-id', requestId);
				} catch {
					// Response already sent/streaming — the id is still in the log.
				}

				if (!QUIET_PATHS.has(c.req.path)) {
					const entry = {
						method: c.req.method,
						path: c.req.path,
						status: c.res.status,
						durationMs: Math.round(performance.now() - start),
					};
					if (c.res.status >= 500) log.error(entry, 'request failed');
					else if (c.res.status >= 400) log.warn(entry, 'request rejected');
					else log.info(entry, 'request');
				}
			}
		});
	});
}