# Gateway (HTTP Reverse Proxy)

## Purpose

HTTP reverse proxy that routes client requests to backend microservices. Abstracts upstream URLs and handles CORS for frontend clients (Tauri app, localhost:5173 dev server).

## Tech Stack

- **Runtime:** Node.js (TypeScript)
- **Framework:** Hono 4.12.9
- **Port:** 3000 (the single entry point for all client HTTP requests)

## Routing Rules

| Path Prefix | Upstream Service | Default URL |
|-------------|-----------------|-------------|
| `/auth/*` | Auth Service | `localhost:3001` |
| `/users/*` | User Service | `localhost:3002` |
| `/personal-chats/*` | Personal Chats Service | `localhost:3003` |
| `/friends/*` | Friends Service | `localhost:3005` |

All HTTP methods (GET, POST, PUT, PATCH, DELETE) are proxied transparently. The gateway strips upstream CORS headers and applies its own via Hono middleware.

## Additional Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check. Returns `{status: 'ok'}`. |
| GET | `/ws-info` | Returns WebSocket gateway URL for client connection. |

## No NATS / No Database

The gateway is stateless — no DB, no NATS. Pure HTTP proxy.

---

# WebSocket Gateway

## Purpose

Bi-directional WebSocket server that fans out real-time NATS events to connected clients, broadcasts online presence with privacy rules, and relays typing indicators.

## Tech Stack

- **Runtime:** Node.js (TypeScript)
- **Framework:** Hono 4.12.9 + @hono/node-ws
- **Messaging:** NATS JetStream (consume)
- **Port:** 3004

## Authentication Handshake

1. Client connects: `ws://localhost:3004/ws?token=<JWT>`
2. Server verifies token via `verifyToken()` from `@echo/shared`
3. Invalid: sends `{type: 'error', message: 'Unauthorized'}`, closes with code 1008
4. Valid: sends `{type: 'connected', userId}`, stores connection in `userId -> Set<WebSocket>` map
5. Fetches user's privacy settings and friend list for presence filtering

## Client -> Server Messages

| Type | Payload | Behavior |
|------|---------|----------|
| `typing` | `{chatId}` | Broadcasts `{type: 'typing', chatId, userId, username}` to other users |
| `typing_channel` | `{channelId}` | Broadcasts `{type: 'typing_channel', channelId, userId, username}` to other users |

## Server -> Client Events

Forwarded from NATS to the target user's WebSocket connections:

| Event Type | Fields | Source |
|------------|--------|--------|
| `dm` | chatId, message, unreadCount | New DM message |
| `dm_edited` | chatId, messageId, content, attachments, updatedAt | Message edit |
| `dm_deleted` | chatId, messageId | Message deletion |
| `dm_pinned` | chatId, messageId, pinnedAt, pinnedBy | Pin |
| `dm_unpinned` | chatId, messageId | Unpin |
| `chat_read` | chatId, userId, lastReadAt | Read receipt |
| `presence` | userId, online | Online/offline status |
| `friend_accepted` | fromUserId | Friend accepted |
| `friend_removed` | fromUserId | Friend removed |

## NATS Subscriptions

Three JetStream consumers:

| Consumer | Stream | Subjects |
|----------|--------|----------|
| `ws-gateway` | DM_EVENTS | `DM_MESSAGE`, `DM_MESSAGE_EDITED`, `DM_MESSAGE_DELETED`, `DM_MESSAGE_PINNED`, `DM_MESSAGE_UNPINNED`, `DM_READ` |
| `ws-gateway-friends` | FRIEND_EVENTS | `FRIEND_EVENT` |
| `ws-gateway-users` | USERS | `USER_UPDATED` (privacy changes) |

## Presence & Privacy

- On connect: broadcasts `{type: 'presence', userId, online: true}` respecting `privacyOnlineStatus`
- `'all'`: broadcast to everyone connected
- `'friends'`: broadcast only to user's friends
- `'nobody'`: no broadcast
- On disconnect: same logic with `online: false`
- When privacy changes via `USER_UPDATED` event: recalculates who sees presence, sends corrective messages
- Presence also published to NATS (`echo.presence.*`) for DB sync in other services

## Multi-device Support

The `userId -> Set<WebSocket>` map supports multiple simultaneous connections per user. All events are sent to every socket for that user.
