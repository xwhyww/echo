import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createIntegrationHarness } from '@echo/test-support';

const here = path.dirname(fileURLToPath(import.meta.url));

/** The one test number this suite drives, and the code it accepts. */
export const TEST_PHONE = '+71111111111';
export const TEST_PHONE_CODE = '424242';

/**
 * The auth-service harness. See `@echo/test-support` for what the options mean
 * and how to run the suite.
 *
 * Assembling the environment is a side effect of this call, so this module must
 * be imported before anything that pulls in `config.ts` — which is every route
 * module. The test file only ever imports this one.
 */
export const harness = createIntegrationHarness({
	suffix: 'auth',
	databaseEnvVar: 'AUTH_DATABASE_URL',
	migrationsFolder: path.resolve(here, '../../drizzle'),
	importApp: () => import('../app.js'),
	tables: ['user_avatars', 'phone_otps', 'users'],
	// No `userTable`: an account here is created by the OTP flow, which is what
	// most of these tests are about. Making one behind the routes' back would
	// skip the part worth testing.
	env: {
		// `log` never reaches a provider. It is also the default, named here so
		// the suite does not change meaning if someone puts SMS_DRIVER in .env.
		SMS_DRIVER: 'log',
		AUTH_TEST_ENABLED: 'true',
		AUTH_TEST_PHONES: TEST_PHONE,
		// Not the 000000 default, so a test that passes here is testing the
		// configured value rather than a fallback that happens to agree.
		AUTH_TEST_CODE: TEST_PHONE_CODE,
	},
});
