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
- **`groups-service` drizzle snapshots are behind.** Migrations 0001-0003 were
  hand-written and their `meta/*_snapshot.json` never recorded, so `db:generate`
  re-proposes columns that already exist — and migrations run on container boot,
  so that would take the service down. `0004` carries a correct snapshot, which
  ends the drift going forward, but 0001-0003 remain unrepresented.
- **Integration tests.** The unit tests cover the pure parts — crypto,
  permissions, OTP helpers, the client's role maths. Nothing exercises a route
  against a real database.
- **Log shipping.** Logs are capped at 3×50MB per container, which is also the
  retention. Anything longer needs Loki/Promtail or the provider's log service.
