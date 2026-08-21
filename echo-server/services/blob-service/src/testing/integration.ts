import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createIntegrationHarness } from '@echo/test-support';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Where the local storage driver writes. `storage.ts` resolves `uploads/blobs`
 * against the process's working directory, which under vitest is the workspace
 * root — so the suite cleans this up after itself rather than leaving blobs in
 * the repo.
 */
export const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads/blobs');

/**
 * The blob-service harness. See `@echo/test-support` for what the options mean
 * and how to run the suite.
 *
 * Assembling the environment is a side effect of this call, so this module must
 * be imported before anything that pulls in `config.ts` — which is every route
 * module. The test file only ever imports this one.
 *
 * No `userTable`: blob-service keeps no users. Its mirrors of chat and group
 * membership carry bare ids, filled in by NATS consumers in production and by
 * the tests directly here.
 */
export const harness = createIntegrationHarness({
	suffix: 'blobs',
	databaseEnvVar: 'BLOB_DATABASE_URL',
	migrationsFolder: path.resolve(here, '../../drizzle'),
	importApp: () => import('../app.js'),
	tables: ['blob_grants', 'raw_blob_map', 'file_blobs', 'dm_chat_members', 'group_members_mirror'],
	env: {
		// Local disk rather than S3: the point of these tests is the authorization
		// and grant bookkeeping around the bytes, and a MinIO container would add
		// a second thing that has to be running for them to mean anything.
		STORAGE_DRIVER: 'local',
	},
});
