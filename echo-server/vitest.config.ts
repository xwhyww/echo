import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		// The integration suites share one Postgres database and truncate every
		// table between tests, so two of them running side by side would delete
		// each other's rows mid-assertion. Vitest parallelises across *files* by
		// default, which is exactly the case that breaks.
		//
		// This is set globally rather than per-suite because the cost is nil: the
		// unit tests are pure functions and finish in milliseconds either way.
		// Should that stop being true, the alternative is a database per worker
		// (`process.env.VITEST_WORKER_ID` in the connection string), not a flag.
		fileParallelism: false,
		// Migrating a fresh database is the slow part, and it happens once per
		// file in `beforeAll`. The default 10s is not enough on a cold container.
		hookTimeout: 60_000,
	},
});
