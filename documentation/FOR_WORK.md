## Missing Features

- **Group chats** — blob-service is ready (just add `scope_type='group'` and a `group_members` mirror) but no code path uses them yet.
## Code Quality

- **Split `personalChats.ts`** — the route file is ~1600 lines. Split into `messages.ts`, `media.ts`, `pins.ts`, `upload.ts` for maintainability.
- **Pre-existing TS errors** — `auth.ts` and `usePersonalChat.svelte.ts` have TypeScript errors that have been ignored. Should be fixed.
- **Dead imports** — some components still import `resolveUrl` after the Avatar refactor. Clean up unused imports.
- **No rate limiting** — no rate limiting on any endpoint. Login brute-force, upload spam, and API abuse are all unprotected.
- **No CDN/nginx for static files** — Hono serves files directly from disk. Fine for MVP, but add a reverse proxy with caching headers (Cache-Control, ETag) before any real user load.


