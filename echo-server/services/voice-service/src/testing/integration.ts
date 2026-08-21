import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createIntegrationHarness } from '@echo/test-support';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * The voice-service harness. See `@echo/test-support` for what the options
 * mean and how to run the suite.
 *
 * Assembling the environment is a side effect of this call, so this module must
 * be imported before anything that pulls in `config.ts` — which is every route
 * module. The test file only ever imports this one.
 */
export const harness = createIntegrationHarness({
	suffix: 'voice',
	databaseEnvVar: 'VOICE_DATABASE_URL',
	migrationsFolder: path.resolve(here, '../../drizzle'),
	importApp: () => import('../app.js'),
	tables: [
		'voice_channel_message_reactions',
		'voice_channel_chat_reads',
		'voice_channel_messages',
		'voice_channel_role_access',
		'voice_role_members',
		'voice_roles',
		'voice_channels',
		'voice_channel_categories',
		'group_members_mirror',
		'user_cache',
	],
	// In production this row arrives over NATS from user-service. `created_by`
	// on channels and categories has a foreign key onto it.
	userTable: { name: 'user_cache' },
	env: {
		// LiveKit is not running. `listActiveParticipants` already degrades to
		// "nobody is connected" when it cannot reach the server; pointing at a
		// closed port makes that failure instant instead of a connect timeout.
		LIVEKIT_URL: 'ws://127.0.0.1:1',
		LIVEKIT_PUBLIC_URL: 'wss://livekit.test.invalid',
		// Real-looking values so `createJoinToken` produces a token the test can
		// decode. The secret is never checked against anything here.
		LIVEKIT_API_KEY: 'devkey',
		LIVEKIT_API_SECRET: 'devsecretdevsecretdevsecretdevsecret',
	},
});
