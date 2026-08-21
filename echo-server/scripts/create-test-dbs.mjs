/**
 * Create the scratch databases the integration tests run against.
 *
 *   pnpm infra:up
 *   TEST_DATABASE_URL=postgresql://echo:echo_dev@localhost:15432/echo_test \
 *     node scripts/create-test-dbs.mjs
 *
 * `TEST_DATABASE_URL` is a template: each service appends its own suffix, so
 * this creates `echo_test_auth`, `echo_test_users`, and so on — one database
 * per service, matching how they are separated in production. The template
 * database itself is never created or used; only the suffixed ones are.
 *
 * Idempotent: a database that already exists is left alone, rows and all. It
 * does not drop anything, because the argument is a connection string a
 * developer typed and a typo should not cost a real database. To start over,
 * drop them by hand.
 *
 * CI does not need this — its Postgres service container has one database and
 * the workflow creates the rest with the same call.
 */

import postgres from 'postgres';

/** Keep in step with the `suffix` each service's harness passes. */
const SUFFIXES = ['auth', 'users', 'chats', 'friends', 'blobs', 'groups', 'voice', 'push'];

const template = process.env.TEST_DATABASE_URL;
if (!template) {
	console.error(
		'TEST_DATABASE_URL is not set.\n' +
			'  e.g. TEST_DATABASE_URL=postgresql://echo:echo_dev@localhost:15432/echo_test',
	);
	process.exit(1);
}

const url = new URL(template);
const base = url.pathname.replace(/^\/+|\/+$/g, '');
if (!base) {
	console.error('TEST_DATABASE_URL has no database name in its path.');
	process.exit(1);
}

// Connect to `postgres`, the maintenance database: CREATE DATABASE cannot run
// from inside the database being created, and the template one need not exist.
const admin = new URL(template);
admin.pathname = '/postgres';

const sql = postgres(admin.toString(), { max: 1 });

try {
	for (const suffix of SUFFIXES) {
		const name = `${base}_${suffix}`;
		const [existing] = await sql`SELECT 1 FROM pg_database WHERE datname = ${name}`;
		if (existing) {
			console.log(`= ${name} (already there)`);
			continue;
		}
		// Identifiers cannot be parameters, and this one is assembled from a
		// hard-coded list plus the path of a URL the caller supplied.
		await sql.unsafe(`CREATE DATABASE "${name.replace(/"/g, '""')}"`);
		console.log(`+ ${name}`);
	}
} finally {
	await sql.end();
}
