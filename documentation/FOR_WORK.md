# Backlog

Everything this file used to list has been done or turned out to be stale. Kept
as a record of what was checked, so the same items are not re-opened from
memory.

## Done

- **Group chats** — groups-service ships them, and blob-service grants them
  under `scope_type='group'` with a `group_members_mirror`.
- **Split `personalChats.ts`** — was 2100 lines, now an index plus
  `personalChats/{shared,upload,chats,messages,pins,media,reactions}.ts`. Mount
  order in the index is load-bearing and commented there.
- **Rate limiting** — per client address at the gateway
  (`services/gateway/src/rateLimit.ts`), strictest on `POST /auth/otp/request`.
  Redis-backed, degrading to in-process counters.
- **Unused imports** — a `--noUnusedLocals` sweep found seventeen and they are
  gone. The flag is now on in `tsconfig.base.json`, so they cannot come back
  unnoticed.

- **`groups-service` drizzle snapshots are recorded.** Migrations 0001-0003
  were hand-written and their `meta/*_snapshot.json` never captured, so
  `db:generate` re-proposed columns that already exist — and migrations run on
  container boot, so that would have taken the service down. The three missing
  snapshots were reconstructed from 0004's full-schema one by removing the
  columns each migration added, and 0004's `prevId` now points at 0003 instead
  of 0000. `drizzle-kit generate` answers "No schema changes, nothing to
  migrate". The comment in `0004_encrypt_group_messages.sql` still describes
  the drift; it is left alone deliberately, because drizzle stores a hash of
  each applied migration file and editing one would make it look new.

- **Integration tests cover every service that has a database.** The harness is
  `packages/test-support`: it migrates a real Postgres, truncates between
  tests and drives `app.fetch`. Seven suites, 190 tests — auth (the OTP flow,
  attempt counting, the password second factor), users (the privacy matrix, with
  friends-service stubbed so both branches run), friends (the shared row and its
  unique constraint), pers-chats and groups and voice (membership, policies, the
  encrypted round trip), blobs (grant-based reads and blob lifetime), push
  (device tokens and lazily-created settings).

  They skip themselves unless `TEST_DATABASE_URL` is set — it is a template and
  each service appends its own suffix, one database per service. CI provides a
  `postgres:17-alpine` service and runs `pnpm test:integration:setup` to create
  them, so the suites are not quietly skipped there.

  gateway and ws-gateway have none, and not by oversight: neither owns a
  database. The gateway's rate limiter would need a real Redis and ws-gateway a
  real NATS, which is a different kind of test from these.

- **Log shipping is available.** `deploy/docker-compose.logging.yml` adds Loki
  and Promtail beside the prod stack; Promtail reads the same json-file logs
  through the Docker API, so `docker compose logs` is unaffected and a Loki
  outage costs nothing. Loki is published on loopback only and retention is
  `LOKI_RETENTION_PERIOD` (30 days by default). The overlay is opt-in: without
  it, retention is still 3x50MB per container.

## Was not true any more

- **Pre-existing TS errors in `auth.ts` and `usePersonalChat.svelte.ts`** —
  there are none. No `@ts-ignore` or `@ts-expect-error` anywhere in either, and
  `pnpm typecheck` is clean across all eleven projects.
- **Dead `resolveUrl` imports** — every file that imports it uses it.
- **No CDN/caching for static files** — blob-service already sends `ETag`,
  `Cache-Control: private, max-age=31536000, immutable`, answers `If-None-Match`
  with 304 and supports range requests. Caddy caches the client's hashed assets
  as `immutable` and everything else as `no-cache`.

## Still open

- **`echo-server/tsconfig.json` is a solution file with `include: []`.** Fixed
  to list all eleven projects, but it still checks nothing without `--build`.
  `pnpm typecheck` is the command that actually checks; CI uses it. Converting
  the projects to `composite` so `tsc --build` works would be the tidier answer.
