# Echo Server — Microservices Architecture

## Overview

The Echo backend is a **pnpm monorepo**: ten independent services and one shared
package.

```
echo-server/
├── packages/
│   └── shared/                  @echo/shared — JWT, NATS, logging, crypto, rate limiting, types
├── services/
│   ├── gateway/                 :3000 — API gateway: CORS, rate limiting, proxying
│   ├── auth-service/            :3001 — Phone OTP sign-in, profiles, avatars, privacy
│   ├── user-service/            :3002 — Search, profile read model, online status
│   ├── pers-chats-service/      :3003 — Personal chats and messages
│   ├── ws-gateway/              :3004 — WebSocket connections, presence, typing
│   ├── friends-service/         :3005 — Friend requests and friendships
│   ├── blob-service/            :3006 — Uploads, thumbnails, transcoding, grants, GC
│   ├── groups-service/          :3007 — Groups, members, invites, group messages
│   ├── voice-service/           :3008 — Voice channels, roles, LiveKit tokens, 1:1 calls
│   └── push-service/            :3009 — APNs and FCM notifications
├── deploy/                      Production stack (Caddy, compose, backup/health scripts)
├── scripts/                     init-dbs.sql, seeds
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── package.json                 Workspace scripts: dev, test, typecheck, db:*
```

Each service owns its own database and its own drizzle migrations. Data another
service needs is mirrored locally and kept current over NATS — there are no
cross-service joins and no shared tables.

## Services

### Gateway (`:3000`)

Single public entry point for all HTTP requests. The client only knows this URL.

- **CORS** — exact origins from `ALLOWED_ORIGINS`, plus the two Tauri origins
  (`tauri://localhost`, `http://tauri.localhost`) unconditionally. The
  localhost/LAN allowances are development-only and go away under
  `NODE_ENV=production`.
- **Rate limiting** — per client address, before proxying. Strictest on
  `POST /auth/otp/request`, which puts a paid SMS on the wire. See
  `src/rateLimit.ts`; backed by Redis, degrading to in-process counters.
- **Proxies** by path prefix to `/auth`, `/users`, `/personal-chats`,
  `/friends`, `/blobs`, `/groups`, `/voice`, `/push`.
- **`GET /ws-info`** returns the WebSocket gateway URL for the client.
- **No database** — routing, CORS and limits, nothing else.

### Auth Service (`:3001`)

Handles user registration and authentication.

| Endpoint | Description |
|---|---|
| `POST /auth/register` | Create account (email, username, password) |
| `POST /auth/login` | Login, returns JWT |
| `GET /auth/me` | Get current user profile by token |

- Uses `bcryptjs` for password hashing
- Issues JWT tokens (7-day expiry) via `@echo/shared` `signToken()`
- Validates input with `zod` schemas

### User Service (`:3002`)

User discovery and profile management.

| Endpoint | Description |
|---|---|
| `GET /users/search?q=` | Search users by email or username |
| `PATCH /users/:id/online` | Internal: update online status (called by ws-gateway) |

- All public routes require JWT auth via `authMiddleware`

### Personal Chats Service (`:3003`)

One-on-one messaging.

| Endpoint | Description |
|---|---|
| `GET /personal-chats/` | List all DM chats for current user |
| `POST /personal-chats/` | Create or get existing chat by username |
| `GET /personal-chats/:chatId/messages` | Get message history + read receipts |
| `POST /personal-chats/:chatId/messages` | Send message in a chat |
| `POST /personal-chats/:chatId/read` | Mark chat as read |
| `POST /personal-chats/send` | Send message by username (auto-creates chat) |

- **Redis pub/sub** for real-time: when a message is sent or a chat is read, publishes an event to the `ws:events` Redis channel instead of calling WebSocket directly
- ws-gateway picks up these events and delivers them to connected clients

### WebSocket Gateway (`:3004`)

Manages all real-time WebSocket connections.

- **Client connects** directly to `ws://localhost:3004/ws?token=...`
- **On connect**: authenticates via JWT, tracks connection, sets user online, broadcasts presence
- **On disconnect**: removes connection, sets offline if last device, broadcasts presence
- **Incoming messages**: handles `typing` and `typing_channel` events (broadcast to other users)
- **Redis subscriber**: listens to `ws:events` channel and delivers events (`dm`, `chat_read`) to the target user's WebSocket connections
- Supports multiple connections per user (tabs/devices)
- **`GET /internal/presence/:userId`** (internal key): whether the user has a live
  socket. push-service asks before turning an event into a phone notification.

### Friends Service (`:3005`)

One table, `friendships`, holding a requester, an addressee and a state
(`pending` / `accepted` / `declined`), with a unique pair constraint and a
no-self-friend check.

Request, accept, decline, cancel, remove, plus a cursor-paginated list and a
bulk status lookup for rendering a screenful of people at once. Publishes
`FRIEND_EVENTS`, which ws-gateway turns into live updates and push-service into
notifications.

### Blob Service (`:3006`)

Every uploaded file in the system. Deduplicates by content hash, generates WebP
thumbnails for images, transcodes video, and streams downloads with range
support, `ETag` and a `private, immutable` cache header.

Access is by **grant**, not by ownership: a row in `blob_grants` binds a blob to
a scope (`chat`, `group`, `avatar`, or `pending` while an upload has nowhere to
belong yet). `src/gc.ts` sweeps blobs nothing grants any more, and expires
`pending` grants after 24 hours. Membership is mirrored from `CHATS` and
`GROUP_EVENTS` so the check needs no cross-service call.

Storage is `local` or `s3` behind one interface — MinIO in development, Yandex
Object Storage in production.

### Groups Service (`:3007`)

Groups, membership, invites and group messages. Four route files: `groups.ts`,
`invites.ts`, `messages.ts`, `internal.ts`.

Roles are `owner` / `admin` / `member`, and what each may do is decided by
`src/permissions.ts` together with the group's own policy columns
(`invitePolicy`, `messagePolicy`, `pinPolicy`, `editInfoPolicy`,
`historyVisible`). Messages support edit, delete-for-me and for-all, reply,
forward, pin and reactions, and are **encrypted at rest**.

### Voice Service (`:3008`)

Voice channels and everything around them. Mints LiveKit access tokens; no media
passes through it.

- `channels.ts` — channels and categories, join (the token), presence
- `roles.ts` — voice roles, their permission bitfield, and per-channel access
  allowlists
- `messages.ts` — the text chat inside a voice channel, encrypted at rest like
  any other conversation
- `calls.ts` — 1:1 DM calls: ring, accept, decline, cancel, end
- `webhooks.ts` — LiveKit's participant-left webhook, so someone whose network
  died does not stay shown as "in call"

Visibility is the thing to know here: a channel restricted to a role is
restricted for its chat and its presence too. `channelAudience()` in
`permissions.ts` answers "who may see this channel", and every fan-out goes
through it rather than through group membership.

### Push Service (`:3009`)

Turns NATS events into notifications for users whose app is not connected.

| Endpoint | Description |
|---|---|
| `POST /push/devices` | Register a device token for the authenticated user |
| `DELETE /push/devices/:token` | Unregister — called on sign-out |
| `GET /push/settings` | What this user wants to be woken for |
| `PATCH /push/settings` | Partial update of the same |

- A **second reader** of `DM_EVENTS`, `FRIEND_EVENTS` and `GROUP_EVENTS`, under
  its own durable consumers — ws-gateway is unchanged, and neither path can
  drift from the other
- Three gates before anything is sent: the app is not connected (ws-gateway is
  asked), the user has a device registered, and their own settings allow it
- **APNs and FCM are configured independently.** Android can be live while iOS
  waits on an Apple Developer membership, or the reverse
- Runs fine with neither: registration works and the notification is logged
- Whether a banner may quote the message is per user, defaulting to
  `PUSH_MESSAGE_PREVIEW` — messages are encrypted at rest, and a preview hands
  their plaintext to Apple and Google

## Shared Package (`@echo/shared`)

Common utilities — **no config and no env vars of its own**; everything is
passed in as a parameter, so a service decides its own configuration.

| Export | Description |
|---|---|
| `signToken` / `verifyToken` / `authMiddleware` | JWT signing and the Hono middleware that sets `c.get('user')`. Reads a Bearer header, the `echo_auth` cookie, or `?t=` for Tauri blob URLs |
| `createLogger` / `requestLogger` / `logContext` | pino wiring, request-id context, field redaction |
| `createNatsConnection` / `setupStreams` / `ensureConsumer` / `SUBJECTS` | JetStream connection, stream setup, durable consumers, the subject map |
| `parseKey` / `encryptString` / `decryptString` / `encryptJSON` / `decryptJSON` | AES-256-GCM primitives |
| `loadEncryptionKeys` / `createRowCipher` / `attachmentHashesFromRow` / `resolveAttachment` | At-rest message encryption at the row level — used by pers-chats, groups and voice alike |
| `createRateLimiter` / `clientAddress` | Fixed-window limiter and the behind-a-proxy address of the caller |
| `VOICE_PERMS` | Voice permission bitfield |
| `WsEvent`, `DmMessagePayload`, … | Event and WebSocket payload types |

Note there is no `createDb` here and no shared schema: each service defines its
own tables in its own `db/schema.ts`. Data that crosses a boundary is mirrored
over NATS, not shared.

## Communication

```
┌────────┐  HTTPS  ┌─────────┐  HTTP   ┌──────────────────────────┐
│ Client │────────▶│ Gateway │────────▶│ auth / users / chats /   │
│        │         │  :3000  │         │ friends / blobs / groups │
└────────┘         └─────────┘         │ / voice / push           │
     │                                 └──────────────────────────┘
     │ WebSocket                                    │
     │                                              │ NATS JetStream
     ▼                                              ▼
┌─────────────┐                            ┌─────────────────┐
│ ws-gateway  │◀───────────────────────────│      NATS       │
│    :3004    │                            └─────────────────┘
└─────────────┘                                     ▲
                                                    │
                                            ┌───────────────┐
                                            │ push-service  │
                                            │     :3009     │
                                            └───────────────┘
```

- **HTTP** — client → gateway → services. The gateway is the only public entry
  point; the services have no published ports.
- **WebSocket** — client → ws-gateway directly, on its own subdomain.
- **Async events** — **NATS JetStream**, not Redis pub/sub. Streams `USERS`,
  `DM_EVENTS`, `FRIEND_EVENTS`, `CHATS`, `GROUP_EVENTS` and `VOICE_EVENTS`, with
  the subject map in `@echo/shared/nats`. Durable consumers mean a service that
  was down catches up rather than missing what happened.
- **Two readers, independently** — ws-gateway turns events into WebSocket
  messages for connected clients; push-service turns the same events into
  notifications for the ones that are not. Neither knows about the other, and
  they cannot drift because they read the same messages.
- **Redis** — in the stack for the gateway's rate limiter. Nothing else uses it.

## Configuration

Every service reads the repo-root `.env` through its own `config.ts`; real
environment variables (docker compose) win over the file. Only what a service
actually needs is listed for it — see `deploy/.env.prod.example` for the
production set with an explanation of each.

Shared by all of them: `JWT_SECRET`, `INTERNAL_API_KEY`, `NATS_URL`,
`LOG_LEVEL`, `NODE_ENV`.

| Service | Notable extras |
|---|---|
| gateway | `ALLOWED_ORIGINS`, `*_SERVICE_URL`, `REDIS_URL`, `RATE_LIMIT_*` |
| auth-service | `AUTH_DATABASE_URL`, `SMS_DRIVER` and its provider keys, `AUTH_TEST_*` |
| user-service | `DATABASE_URL` |
| pers-chats-service | `CHATS_DATABASE_URL`, `MESSAGE_ENCRYPTION_KEY`, `BLOB_SERVICE_URL` |
| ws-gateway | `REDIS_URL` |
| friends-service | `DATABASE_URL` |
| blob-service | `S3_*` (or local storage), `DATABASE_URL` |
| groups-service | `GROUPS_DATABASE_URL`, `MESSAGE_ENCRYPTION_KEY`, `BLOB_SERVICE_URL` |
| voice-service | `DATABASE_URL`, `MESSAGE_ENCRYPTION_KEY`, `LIVEKIT_*`, `REDIS_URL` |
| push-service | `PUSH_DATABASE_URL`, `APNS_*`, `FCM_SERVICE_ACCOUNT_PATH`, `PUSH_MESSAGE_PREVIEW` |

**`MESSAGE_ENCRYPTION_KEY` is one key for three services.** Personal chats,
group messages and voice-channel chats are all encrypted at rest under it.
Losing it loses every conversation in the system — see `documentation/encryption.md`.

## Logging

Every service logs structured JSON through `pino`, wired up in
`@echo/shared/logger`:

- `createLogger(service)` — one logger per service; `name` identifies it in the
  merged compose output. Level from `LOG_LEVEL`, defaulting to `debug` in
  development and `info` under `NODE_ENV=production`.
- `requestLogger(log)` — replaces `hono/logger` in each `app.ts`. Logs one line
  per request with `method`, `path`, `status`, `durationMs`, skipping `/health`.
- **Request id** — taken from an inbound `x-request-id` or minted at the edge,
  echoed back on the response, and forwarded by the gateway's proxy. One user
  action therefore carries a single id across every service it touches.
- **Context** — the id lives in an `AsyncLocalStorage`, which pino's `mixin`
  reads on every call, so any log line emitted during a request is stamped with
  `requestId` and (after `authMiddleware`) `userId` without being passed one.
- **Redaction** — `password`, `token`, `authorization`, `apiKey`, `smsCode` and
  friends are censored wherever they appear in a logged object.

In development `pino-pretty` renders it human-readably; in production stdout is
pure JSON for a log shipper to parse.

## Databases

Eight databases, created by `scripts/init-dbs.sql`. Each service owns exactly
one and migrates it itself, on boot, with its own `drizzle/` folder.

| Service | Database |
|---|---|
| auth-service | `echo_auth` |
| user-service | `echo_users` |
| pers-chats-service | `echo_chats` |
| friends-service | `echo_friends` |
| blob-service | `echo_blobs` |
| groups-service | `echo_groups` |
| voice-service | `echo_voice` |
| push-service | `echo_push` |

ws-gateway and the gateway have no database at all.

There is **no shared schema**. What a service needs about users, group
membership or friendships it keeps in its own `user_cache` /
`group_members_mirror` / `friendship_cache` table, filled from NATS and
reconciled against a snapshot endpoint on boot (`src/bootstrap.ts`).

```bash
pnpm db:migrate:all      # every service, in order
pnpm db:generate:all     # after a schema change
```

**Adding a service means adding its database to `scripts/init-dbs.sql` by
hand.** The migration runs on boot and fails against a database that does not
exist yet.

## Running

### Prerequisites

Postgres, NATS, Redis, MinIO and LiveKit — all five come up together:

```bash
pnpm infra:up            # docker compose up -d, infrastructure only
pnpm db:migrate:all
pnpm dev                 # all ten services, natively, with tsx watch
```

`pnpm dev:full` is the three of them in one command. To run the services in
containers too: `pnpm docker:full`.

### Development

```bash
pnpm dev                 # every service at once, colour-coded per service
pnpm dev:gateway         # or one at a time
pnpm dev:auth
pnpm dev:user
pnpm dev:pers-chats
pnpm dev:ws
pnpm dev:blobs
pnpm dev:groups
pnpm dev:push
```

### Checks

```bash
pnpm typecheck           # every project explicitly — see the note below
pnpm test                # vitest
```

`tsc -p tsconfig.json` at the root checks **nothing**: it is a solution file
with `include: []`, and without `--build` that reports success having compiled
nothing. `pnpm typecheck` walks the eleven projects one by one, which is what CI
runs.

### Database

```bash
pnpm db:generate:all     # after a schema change
pnpm db:migrate:all      # apply, per service
```

Migrations also run automatically when a container boots, so a deploy needs no
separate step. That is also why a migration proposing a column that already
exists takes the service down — see the note at the top of
`services/groups-service/drizzle/0004_encrypt_group_messages.sql`.

### Production

`deploy/` holds a standalone stack — Caddy terminating TLS for `api.`, `ws.` and
`live.` subdomains in front of the same services, with Postgres, Redis, NATS and
LiveKit unpublished on the internal network. See `deploy/README.md`.

Do not combine `deploy/docker-compose.prod.yml` with the dev `docker-compose.yml`:
the dev file publishes the datastores to the host, and compose merges `ports` by
appending, so an override cannot take them back off.

## Client Configuration

Endpoints are **baked in at build time** — Vite inlines them, so they are not
run-time configuration:

```bash
VITE_API_URL=https://api.example.com VITE_WS_URL=wss://ws.example.com/ws npm run build
```

Unset, the client works the host out from the URL it was served over, which is
right for the browser and for `npm run desktop`. A bundled mobile build has no
such URL — `localhost` there means the phone — so those two must be set for
`ios:build` and `android:build`.

- `echo-client/src/lib/api/client.ts` — resolves `VITE_API_URL` > `VITE_API_HOST`
  > the serving host > localhost
- `echo-client/src/lib/stores/ws.svelte.ts` — the same for the WebSocket URL

## Events

Subjects, stream names and payload types live in `@echo/shared/nats` and
`@echo/shared/types/events`. The shape every event shares:

```typescript
interface SomeEvent {
  targetUserIds: string[];   // who ws-gateway should deliver this to
  // ...the payload
}
```

`targetUserIds` is computed by the publishing service, because only it knows who
is allowed to see the thing that happened — group membership for a group
message, and for a restricted voice channel the narrower set returned by
`channelAudience()`. ws-gateway does not re-check; it delivers.
