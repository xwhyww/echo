import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createIntegrationHarness } from '@echo/test-support';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Port the stub friends-service listens on during the suite. Fixed rather than
 * ephemeral because `config.friendsServiceUrl` is read when the route module
 * loads, which is before any test body runs — so the URL has to be known here.
 * Suites never run side by side (`fileParallelism: false` in vitest.config.ts),
 * so one reserved port is enough.
 */
export const FRIENDS_STUB_PORT = 39905;

/**
 * The user-service harness. See `@echo/test-support` for what the options mean
 * and how to run the suite.
 *
 * Assembling the environment is a side effect of this call, so this module must
 * be imported before anything that pulls in `config.ts` — which is every route
 * module. The test file only ever imports this one.
 */
export const harness = createIntegrationHarness({
	suffix: 'users',
	databaseEnvVar: 'USERS_DATABASE_URL',
	migrationsFolder: path.resolve(here, '../../drizzle'),
	importApp: () => import('../app.js'),
	tables: ['user_profiles'],
	// Every privacy field defaults in the schema, so a row needs no more than
	// these two. Tests that care about a specific setting write it themselves.
	userTable: { name: 'user_profiles' },
	env: {
		// Pointed at the stub, so the friends-gated half of the privacy rules is
		// reachable. Without it every check would fail closed and only the
		// non-friend branch would ever be tested.
		FRIENDS_SERVICE_URL: `http://127.0.0.1:${FRIENDS_STUB_PORT}`,
	},
});
