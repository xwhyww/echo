# Echo Server — Microservices Architecture

## Overview

The Echo backend is structured as a **pnpm monorepo** with 5 independent services and 1 shared package.

```
echo-server/
├── packages/
│   └── shared/                  @echo/shared — DB schema, JWT, Redis, types
├── services/
│   ├── gateway/                 :3000 — API gateway, CORS, proxying
│   ├── auth-service/            :3001 — Registration, login, token validation
│   ├── user-service/            :3002 — User search, profiles, online status
│   ├── pers-chats-service/      :3003 — Personal chats, messages, read receipts
���   └── ws-gateway/              :3004 ��� WebSocket connections, presence, typing
├── drizzle/                     Migrations (shared schema)
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── package.json                 Root workspace scripts
```

## Services

### Gateway (`:3000`)

Single public entry point for all HTTP requests. The client only knows about this URL.

- **CORS** for `http://localhost:5173` and `tauri://localhost`
- **Proxies** requests to internal services by path prefix:
  - `/auth/*` → auth-service
  - `/users/*` → user-service
  - `/personal-chats/*` → pers-chats-service
- **`GET /ws-info`** returns the WebSocket gateway URL for the client
- **No database** — pure routing layer

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

### Push Service (`:3009`)

Turns NATS events into APNs notifications for users whose app isn't connected.

| Endpoint | Description |
|---|---|
| `POST /push/devices` | Register a device token for the authenticated user |
| `DELETE /push/devices/:token` | Unregister — called on sign-out |

- A **second reader** of `DM_EVENTS`, `FRIEND_EVENTS` and `GROUP_EVENTS`, under its
  own durable consumers — ws-gateway is unchanged, and neither path can drift
- Skips anyone ws-gateway reports as connected (the open app already showed it),
  and skips the author of a group message
- Runs fine without Apple credentials: registration works, notifications are logged
- See `services/push-service/README.md` for APNs setup and what is still missing
  (the native client plugin, Android/FCM, localisation)

## Shared Package (`@echo/shared`)

Provides common utilities — **no config or env vars**, everything is passed as parameters.

| Export | Description |
|---|---|
| `createDb(url)` | Creates a Drizzle ORM database instance |
| `users`, `personalChats`, etc. | Full database schema + relations |
| `signToken(payload, secret)` | Signs a JWT |
| `verifyToken(token, secret)` | Verifies a JWT, returns payload or null |
| `authMiddleware(secret)` | Hono middleware that validates Bearer token and sets `c.get('user')` |
| `createRedisPublisher(url)` | Creates a Redis client for publishing |
| `createRedisSubscriber(url)` | Creates a Redis client for subscribing |
| `CHANNELS` | Redis channel names (`ws:events`) |
| `WsEvent`, `DmMessagePayload`, etc. | TypeScript types for WebSocket events |

## Communication

```
┌─────────┐  HTTP   ┌─────────┐  HTTP   ┌──────────────────┐
│  Client  │───────▶│ Gateway  │───────▶│  auth / user /   │
│          │        │  :3000   │        │  pers-chats      │
└─────────┘        └─────────┘        └──────────────────┘
     │                                         │
     │  WebSocket                              │ Redis pub/sub
     │                                         ▼
     │              ┌─────────────┐     ┌─────────────┐
     └─────────────▶│ ws-gateway  │◀────│    Redis     │
                    │   :3004     │     │             │
                    └─────────────┘     └─────────────┘
```

- **HTTP**: Client → Gateway → Services (proxy)
- **WebSocket**: Client → ws-gateway (direct connection)
- **Async events**: Services → Redis `ws:events` channel → ws-gateway → Client WebSocket

## Configuration

Each service has its own `.env` file with only the variables it needs:

| Service | Env vars |
|---|---|
| gateway | `PORT`, `JWT_SECRET`, `AUTH_SERVICE_URL`, `USER_SERVICE_URL`, `PERS_CHATS_SERVICE_URL`, `WS_GATEWAY_URL` |
| auth-service | `PORT`, `DATABASE_URL`, `JWT_SECRET` |
| user-service | `PORT`, `DATABASE_URL`, `JWT_SECRET` |
| pers-chats-service | `PORT`, `DATABASE_URL`, `JWT_SECRET`, `REDIS_URL` |
| ws-gateway | `PORT`, `DATABASE_URL`, `JWT_SECRET`, `REDIS_URL` |

Each service loads its own `dotenv/config` in its local `config.ts`.

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

Each service can point to its own database:

| Service | Default DB |
|---|---|
| auth-service | `echo_auth` |
| user-service | `echo_users` |
| pers-chats-service | `echo_chats` |
| ws-gateway | `echo_users` (reads user data for presence) |

Schema is shared via `@echo/shared/db/schema`. Run migrations per database:

```bash
DATABASE_URL=postgresql://postgres:root@localhost:5432/echo_auth pnpm db:migrate
DATABASE_URL=postgresql://postgres:root@localhost:5432/echo_users pnpm db:migrate
DATABASE_URL=postgresql://postgres:root@localhost:5432/echo_chats pnpm db:migrate
```

**Note:** `pers-chats-service` currently joins with the `users` table for author info (names, avatars). If using separate databases, either:
- Point `echo_chats` to the same DB as `echo_users`
- Replace joins with HTTP calls to user-service (proper microservice approach)

## Running

### Prerequisites

- **PostgreSQL** running with the required databases created
- **Redis** running on `localhost:6379`

```bash
# Start Redis (Docker)
docker run -d --name redis -p 6379:6379 redis
```

### Development

```bash
# Start all 5 services at once
pnpm dev

# Or individually
pnpm dev:gateway
pnpm dev:auth
pnpm dev:user
pnpm dev:pers-chats
pnpm dev:ws
```

### Database

```bash
pnpm db:generate   # Generate migrations from schema changes
pnpm db:migrate    # Apply migrations (set DATABASE_URL)
pnpm db:studio     # Open Drizzle Studio
```

### Production

`deploy/` holds a standalone stack — Caddy terminating TLS for `api.`, `ws.` and
`live.` subdomains in front of the same services, with Postgres, Redis, NATS and
LiveKit unpublished on the internal network. See `deploy/README.md`.

Do not combine `deploy/docker-compose.prod.yml` with the dev `docker-compose.yml`:
the dev file publishes the datastores to the host, and compose merges `ports` by
appending, so an override cannot take them back off.

## Client Configuration

The client (`echo-client`) connects to:
- **HTTP API**: `http://localhost:3000` (gateway)
- **WebSocket**: `ws://localhost:3004/ws` (ws-gateway directly)

Relevant client files:
- `echo-client/src/lib/api/client.ts` — `API_URL = 'http://localhost:3000'`
- `echo-client/src/lib/stores/ws.svelte.ts` — `WS_URL = 'ws://localhost:3004/ws'`

## Redis Pub/Sub Protocol

Messages on the `ws:events` channel follow this structure:

```typescript
interface RedisWsMessage {
  targetUserId?: string;    // Deliver to a specific user
  broadcast?: boolean;      // Broadcast to all connected users
  excludeUserId?: string;   // Exclude this user from broadcast
  event: WsEvent;           // The actual event payload
}
```

Published by:
- **pers-chats-service**: `{ targetUserId, event: { type: 'dm', ... } }` on message send
- **pers-chats-service**: `{ targetUserId, event: { type: 'chat_read', ... } }` on mark-as-read

Consumed by:
- **ws-gateway**: delivers to target user's WebSocket connections
