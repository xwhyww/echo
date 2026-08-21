import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createIntegrationHarness } from '@echo/test-support';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * The friends-service harness. See `@echo/test-support` for what the options
 * mean and how to run the suite.
 *
 * Assembling the environment is a side effect of this call, so this module must
 * be imported before anything that pulls in `config.ts` — which is every route
 * module. The test file only ever imports this one.
 *
 * No `userTable`: friendships store bare user ids with no foreign key, because
 * the users live in another service's database. `createUser()` therefore just
 * mints a token, which is all these routes need.
 */
export const harness = createIntegrationHarness({
	suffix: 'friends',
	databaseEnvVar: 'FRIENDS_DATABASE_URL',
	migrationsFolder: path.resolve(here, '../../drizzle'),
	importApp: () => import('../app.js'),
	tables: ['friendships'],
});
