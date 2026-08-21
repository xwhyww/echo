import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createIntegrationHarness } from '@echo/test-support';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * The groups-service harness. See `@echo/test-support` for what the options
 * mean and how to run the suite.
 *
 * Assembling the environment is a side effect of this call, so this module must
 * be imported before anything that pulls in `config.ts` — which is every route
 * module. The test file only ever imports this one.
 */
export const harness = createIntegrationHarness({
	suffix: 'groups',
	databaseEnvVar: 'GROUPS_DATABASE_URL',
	migrationsFolder: path.resolve(here, '../../drizzle'),
	importApp: () => import('../app.js'),
	tables: [
		'group_message_links',
		'group_message_deletions',
		'group_message_reactions',
		'group_chat_reads',
		'group_messages',
		'group_invites',
		'group_members',
		'groups',
		'user_cache',
	],
	// In production this row arrives over NATS from user-service; nothing in
	// these routes creates it, and every foreign key in the schema points at it.
	userTable: { name: 'user_cache' },
});
