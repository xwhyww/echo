import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createIntegrationHarness } from '@echo/test-support';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * The push-service harness. See `@echo/test-support` for what the options mean
 * and how to run the suite.
 *
 * Assembling the environment is a side effect of this call, so this module must
 * be imported before anything that pulls in `config.ts` — which is every route
 * module. The test file only ever imports this one.
 *
 * No `userTable`: device rows carry a bare `user_id` with no foreign key, since
 * accounts live in auth-service's database.
 *
 * APNs and FCM credentials are deliberately left unset, which is the state the
 * service is designed to run in — it registers devices and logs what it would
 * have sent. The routes under test never reach a provider anyway.
 */
export const harness = createIntegrationHarness({
	suffix: 'push',
	databaseEnvVar: 'PUSH_DATABASE_URL',
	migrationsFolder: path.resolve(here, '../../drizzle'),
	importApp: () => import('../app.js'),
	tables: ['notification_settings', 'device_tokens'],
});
