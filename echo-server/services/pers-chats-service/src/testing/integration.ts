import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createIntegrationHarness } from '@echo/test-support';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * The pers-chats-service harness. See `@echo/test-support` for what the options
 * mean and how to run the suite.
 *
 * Assembling the environment is a side effect of this call, so this module must
 * be imported before anything that pulls in `config.ts` — which is every route
 * module. The test file only ever imports this one.
 */
export const harness = createIntegrationHarness({
	suffix: 'chats',
	databaseEnvVar: 'CHATS_DATABASE_URL',
	migrationsFolder: path.resolve(here, '../../drizzle'),
	importApp: () => import('../app.js'),
	tables: [
		'personal_message_links',
		'personal_message_deletions',
		'personal_message_reactions',
		'personal_chat_reads',
		'personal_messages',
		'personal_chats',
		'friendship_cache',
		'user_cache',
	],
	// In production this row arrives over NATS from user-service; every foreign
	// key in the schema points at it.
	userTable: { name: 'user_cache' },
	env: {
		// Both siblings are unreachable, which is the case the routes already
		// handle: a failed blob grant is logged, and a failed friendship check
		// falls back to "not friends" — the safe answer for a privacy gate.
		BLOB_SERVICE_URL: 'http://127.0.0.1:1',
		FRIENDS_SERVICE_URL: 'http://127.0.0.1:1',
	},
});
