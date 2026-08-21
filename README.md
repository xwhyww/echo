# Echo

A messenger: personal chats, groups, and voice channels with screen sharing.
SvelteKit 5 + Tauri on the front, ten Node services on the back.

```
echo-client/    SvelteKit 5 (runes) + Tauri 2 — web, desktop, iOS, Android
echo-server/    pnpm monorepo: ten services + @echo/shared
documentation/  Per-service reference and design docs
PLAN.md         Current backlog and what has been done against it
```

## Running it

**Server** — Postgres, NATS, Redis, MinIO and LiveKit come up together, then the
services run natively:

```bash
cd echo-server
pnpm install
pnpm dev:full        # infra + migrations + all ten services
```

`echo-server/ARCHITECTURE.md` is the map: what each service owns, how they talk
(NATS JetStream), and which database belongs to which.

**Client**:

```bash
cd echo-client
npm install
npm run dev          # browser, on :5173
npm run desktop      # Tauri window
npm run android:dev  # emulator or attached device
npm run ios:dev      # macOS only
```

Unset, the client works its backend out from the URL it was served over. A
bundled mobile build has no such URL, so those need `VITE_API_URL` and
`VITE_WS_URL` set at build time — Vite inlines them.

## Checks

```bash
cd echo-server && pnpm typecheck && pnpm test
cd echo-client && npm run check && npm test && npm run build
```

`pnpm typecheck`, not `tsc -p tsconfig.json`: the root config is a solution file
with `include: []` and would report success having checked nothing. CI runs both
halves — see `.github/workflows/ci.yml`.

## Deploying

`echo-server/deploy/` is a standalone stack: Caddy terminating TLS in front of
the services, with Postgres, NATS, Redis and LiveKit unpublished on the internal
network. `deploy/README.md` is the runbook — hardware floor, the firewall table
(voice needs UDP 50000-50200 open, and a half-configured firewall looks fine
until someone joins a call), backups, and the things that will bite you.

**One thing is worth repeating here:** `MESSAGE_ENCRYPTION_KEY` encrypts every
message in the system — personal, group and voice-channel alike — and it is
deliberately not in the database. Lose it and every stored conversation is
permanently unreadable, backups included.

## Conventions

`echo-client/CLAUDE.md` is binding for the frontend: a page is a hook plus a
`PageColumn` and a `LoadState`, logic lives in `hooks/<domain>/`, pure helpers in
`utils/`, type and colour are composed as classes rather than written in
component CSS, and anything over ~250 lines gets split.
