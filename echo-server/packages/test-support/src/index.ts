/**
 * Shared harness for the integration tests — the ones that drive a service's
 * Hono app against a real Postgres instead of a mock.
 *
 * The unit tests in this repo cover the pure parts: crypto, permission tables,
 * OTP helpers. What they cannot see is the half of a route that only exists in
 * SQL — a unique index that turns a double insert into a 409, a `where` clause
 * that quietly matches nothing, an `onDelete: cascade` that either fires or
 * leaves orphans. A fake that agrees with the code is no evidence about the
 * schema, which is why these talk to a database.
 *
 * ## Running them
 *
 * Every suite skips itself unless a connection string is set:
 *
 *   pnpm infra:up
 *   pnpm test:integration:setup                      # creates the *_test databases
 *   TEST_DATABASE_URL=postgresql://echo:echo_dev@localhost:15432/echo_test pnpm test
 *
 * `TEST_DATABASE_URL` is a *template*: each service appends its own suffix, so
 * `…/echo_test` becomes `echo_test_auth`, `echo_test_groups` and so on. One
 * database per service, because the services own separate schemas in
 * production and sharing one here would let a stray foreign key pass that could
 * never exist on the real thing.
 *
 * Point it at scratch databases. `resetDatabase()` truncates every table the
 * service owns between tests.
 *
 * ## Why the environment is assembled here
 *
 * Route modules do `createDb(config.databaseUrl)` at import time, and `config`
 * throws on a missing `MESSAGE_ENCRYPTION_KEY` or `JWT_SECRET`. So the process
 * environment has to be complete *before* anything imports the app — which is
 * why `createIntegrationHarness` writes it as a side effect of being called at
 * module scope, and why the app is loaded through `await import()` rather than
 * a static import.
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import { randomUUID } from 'node:crypto';
import { signToken } from '@echo/shared';
import type { Hono } from 'hono';

/** 32 zero bytes. Valid, and fixed so a failure reproduces. */
export const TEST_ENCRYPTION_KEY = Buffer.alloc(32).toString('base64');
export const TEST_JWT_SECRET = 'integration-test-secret';
export const TEST_INTERNAL_KEY = 'integration-test-internal-key';

const TEMPLATE_URL = process.env.TEST_DATABASE_URL || '';

/** Whether any integration suite can run at all. Drives `describe.skipIf`. */
export const hasTestDatabase = TEMPLATE_URL.length > 0;

/**
 * `postgresql://…/echo_test` + `auth` → `postgresql://…/echo_test_auth`.
 * Query parameters, if any, are preserved.
 */
export function databaseUrlFor(suffix: string): string {
	if (!TEMPLATE_URL) return '';
	const url = new URL(TEMPLATE_URL);
	url.pathname = `${url.pathname.replace(/\/+$/, '')}_${suffix}`;
	return url.toString();
}

export interface TestUser {
	id: string;
	username: string;
	token: string;
}

export interface HarnessOptions {
	/**
	 * Appended to `TEST_DATABASE_URL` to name this service's database, and used
	 * as the value of the env vars below. Keep it short: `auth`, `users`,
	 * `chats`.
	 */
	suffix: string;
	/**
	 * The service's own `*_DATABASE_URL` name. `DATABASE_URL` is always set too,
	 * because several configs fall back to it.
	 */
	databaseEnvVar: string;
	/** Absolute path to the service's `drizzle/` folder. */
	migrationsFolder: string;
	/** Loads the service's Hono app. Always `() => import('../app.js')`. */
	importApp: () => Promise<{ app: unknown }>;
	/**
	 * Tables to empty between tests, listed explicitly so a new table has to be
	 * added here on purpose rather than silently leaking rows. Order is
	 * irrelevant — `TRUNCATE … CASCADE` does not care.
	 */
	tables: string[];
	/**
	 * The table holding this service's user rows, if it has one. Set it and
	 * `createUser()` works; leave it out and `createUser()` only mints a token,
	 * which is what a service that keeps no user table needs.
	 */
	userTable?: {
		name: string;
		/** Extra non-null columns beyond id/username, as literal SQL defaults. */
		columns?: Record<string, string | number | boolean | null>;
	};
	/** Anything else the service's config demands. Applied verbatim. */
	env?: Record<string, string>;
}

export interface Harness {
	/** True when this suite can run. Always `describe.skipIf(!harness.enabled)`. */
	enabled: boolean;
	/** Migrate the database. Call once from `beforeAll`. */
	setup(): Promise<void>;
	/** Empty every table. Call from `beforeEach`. */
	reset(): Promise<void>;
	/**
	 * Raw SQL against the test database, for arranging state no route creates
	 * and for reading back rows no route returns. Column names come out as the
	 * database spells them (`user_id`, not `userId`), and timestamps as strings.
	 */
	exec(query: TemplateStringsArray, ...values: any[]): Promise<any[]>;
	/** Insert a user row (if the service has one) and mint a token for them. */
	createUser(username?: string): Promise<TestUser>;
	/** One request against the app, as `user` (or anonymously when null). */
	request(
		user: TestUser | null,
		method: string,
		url: string,
		body?: unknown,
		extraHeaders?: Record<string, string>,
	): Promise<{ status: number; body: any; headers: Headers }>;
}

/**
 * Build a harness. Call this at module scope in the test file, *above* every
 * other import of service code — assembling the environment is a side effect
 * and route modules read it the moment they load.
 */
export function createIntegrationHarness(opts: HarnessOptions): Harness {
	const databaseUrl = databaseUrlFor(opts.suffix);

	if (hasTestDatabase) {
		// Set, not defaulted: a stray value in the repo-root .env would otherwise
		// point the service at the development database, and `reset()` truncates
		// whatever it is given.
		process.env[opts.databaseEnvVar] = databaseUrl;
		process.env.DATABASE_URL = databaseUrl;
		process.env.JWT_SECRET = TEST_JWT_SECRET;
		process.env.INTERNAL_API_KEY = TEST_INTERNAL_KEY;
		process.env.MESSAGE_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
		process.env.MESSAGE_ENCRYPTION_CURRENT_KEY_ID = '1';
		// Never connected. The publish helpers return early without a connection,
		// so every event call in a route becomes a no-op.
		process.env.NATS_URL = 'nats://127.0.0.1:1';
		// Unroutable on purpose: a route that reaches for a sibling service should
		// fail fast rather than hit something real. Routes that must work without
		// their siblings already catch it; the ones that do not are worth knowing
		// about.
		process.env.REDIS_URL = 'redis://127.0.0.1:1';
		// pino would otherwise print a line per request over the test output.
		process.env.LOG_LEVEL = 'silent';
		for (const [k, v] of Object.entries(opts.env ?? {})) process.env[k] = v;
	}

	let client: ReturnType<typeof postgres> | null = null;
	let db: ReturnType<typeof drizzle> | null = null;
	let appPromise: Promise<Hono> | null = null;

	function connection() {
		if (!db) {
			client = postgres(databaseUrl);
			db = drizzle(client);
		}
		return db;
	}

	return {
		enabled: hasTestDatabase,

		async setup() {
			await migrate(connection(), { migrationsFolder: opts.migrationsFolder });
		},

		async reset() {
			await connection().execute(
				sql.raw(`TRUNCATE TABLE ${opts.tables.join(', ')} RESTART IDENTITY CASCADE`),
			);
		},

		exec(query: TemplateStringsArray, ...values: any[]) {
			// The tagged-template client, not drizzle's, so tests can write plain
			// SQL with interpolation instead of assembling `sql` fragments. The
			// cast is because postgres-js types its parameters against a schema
			// this package deliberately does not know.
			connection();
			return (client as unknown as (
				q: TemplateStringsArray,
				...v: unknown[]
			) => Promise<any[]>)(query, ...values);
		},

		async createUser(username?: string): Promise<TestUser> {
			const id = randomUUID();
			const name = username ?? `u_${id.slice(0, 8)}`;
			const table = opts.userTable;
			if (table) {
				const extra = table.columns ?? {};
				const cols = ['id', 'username', ...Object.keys(extra)];
				const vals = [id, name, ...Object.values(extra)];
				const placeholders = vals.map((_, i) => `$${i + 1}`).join(', ');
				connection();
				await client!.unsafe(
					`INSERT INTO ${table.name} (${cols.join(', ')}) VALUES (${placeholders})`,
					vals as never[],
				);
			}
			return { id, username: name, token: signToken({ userId: id, email: null, username: name }, TEST_JWT_SECRET) };
		},

		async request(user, method, url, body, extraHeaders) {
			appPromise ??= opts.importApp().then((m) => m.app as Hono);
			const app = await appPromise;

			const headers: Record<string, string> = { ...extraHeaders };
			if (user) headers.Authorization = `Bearer ${user.token}`;
			// FormData sets its own content type, boundary and all; naming one here
			// would produce a multipart body the server cannot parse.
			const isForm = body instanceof FormData;
			if (body !== undefined && !isForm && headers['Content-Type'] === undefined) {
				headers['Content-Type'] = 'application/json';
			}

			const res = await app.fetch(
				new Request(`http://localhost${url}`, {
					method,
					headers,
					body:
						body === undefined
							? undefined
							: typeof body === 'string' || body instanceof FormData
								? (body as BodyInit)
								: JSON.stringify(body),
				}),
			);
			const text = await res.text();
			let parsed: unknown = text;
			try {
				parsed = JSON.parse(text);
			} catch {
				// Left as raw text — a non-JSON body is itself the finding.
			}
			return { status: res.status, body: parsed, headers: res.headers };
		},
	};
}
