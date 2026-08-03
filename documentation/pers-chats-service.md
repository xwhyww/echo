# Personal Chats Service

## Purpose

Owns 1-to-1 direct messaging: chat creation, message CRUD, attachments with content-addressable dedup, pins, read receipts, media galleries, link extraction, and message forwarding.

## Tech Stack

- **Runtime:** Node.js (TypeScript via tsx)
- **Framework:** Hono 4.12.9
- **Database:** PostgreSQL (Drizzle ORM 0.45.2)
- **Auth:** JWT via shared authMiddleware
- **Messaging:** NATS JetStream (publish + consume)
- **File Storage:** Local disk (`uploads/` directory)

## Database Schema

### `user_cache`
Local cache of user profiles, hydrated via NATS events from auth-service.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| username | TEXT | UNIQUE |
| displayName | TEXT | nullable |
| avatarUrl | TEXT | nullable |
| isOnline | BOOLEAN | default false |
| privacyOnlineStatus | VARCHAR(16) | default `'all'` |
| privacyMessaging | VARCHAR(16) | default `'all'` |
| privacyPhoto | VARCHAR(16) | default `'all'` |
| updatedAt | TIMESTAMP | |

### `personal_chats`

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| user1_id | UUID | FK -> user_cache |
| user2_id | UUID | FK -> user_cache |
| created_at | TIMESTAMP | |

### `personal_messages`

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| chat_id | UUID | FK -> personal_chats |
| author_id | UUID | FK -> user_cache |
| content | TEXT | message body |
| attachments | JSONB | array of Attachment objects |
| is_edited | BOOLEAN | default false |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |
| pinned_at | TIMESTAMP | nullable |
| pinned_by | UUID | nullable, FK -> user_cache |
| reply_to_id | UUID | nullable |
| reply_to_snapshot | JSONB | nullable, snapshot of replied message |
| forwarded_from | JSONB | nullable, original sender info |

### `personal_chat_reads`

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| chat_id | UUID | FK -> personal_chats |
| user_id | UUID | FK -> user_cache |
| last_read_at | TIMESTAMP | |

UNIQUE: `(user_id, chat_id)`.

### `personal_message_links`
URLs extracted from message content, used for the links gallery.

| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL | PK |
| message_id | UUID | FK -> personal_messages (CASCADE) |
| chat_id | UUID | FK -> personal_chats |
| url | TEXT | |
| created_at | TIMESTAMP | |

### `file_blobs`
Content-addressed storage for attachment files.

| Column | Type | Notes |
|--------|------|-------|
| hash | TEXT | PK, SHA-256 hex of stored bytes |
| stored_name | TEXT | `<hash>.<ext>` on disk |
| mime_type | TEXT | |
| size | INTEGER | bytes |
| ref_count | INTEGER | default 1, incremented on reuse |
| created_at | TIMESTAMP | |

### `raw_blob_map`
Maps client-computed hash (pre-compression on client) to stored blob hash. Enables skip-upload on cache hit.

| Column | Type | Notes |
|--------|------|-------|
| raw_hash | TEXT | PK, SHA-256 of raw client bytes |
| file_hash | TEXT | FK -> file_blobs(hash), CASCADE |
| created_at | TIMESTAMP | |

### `friendship_cache`
Local cache of friendships, hydrated via NATS events from friends-service.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| user1_id | UUID | |
| user2_id | UUID | |
| status | VARCHAR(16) | `'pending'` / `'accepted'` |
| requester_id | UUID | |
| updated_at | TIMESTAMP | |

## HTTP API

All routes prefixed with `/personal-chats`. All require Bearer token.

### Chats

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List all chats for current user. Query: `cursor?`, `search?`. Returns `{chats, hasMore, nextCursor}`. |
| POST | `/` | Create chat with another user. Body: `{username}`. Returns `{chat}`. |
| GET | `/by-user/:userId` | Get chat by companion user ID. Returns `{chat, user?}`. |

### Messages

| Method | Path | Description |
|--------|------|-------------|
| GET | `/:chatId/messages` | Paginated messages. Query: `cursor?`, `after?`, `around?`, `limit?`. Returns `{messages, otherLastReadAt, hasMore, hasOlder, hasNewer, nextCursor, newerCursor}`. |
| POST | `/:chatId/messages` | Send message in existing chat. Body: `{content, attachments?, replyToId?}`. Returns `{message}`. |
| POST | `/send` | Send to user (auto-creates chat). Body: `{userId, content, attachments?, replyToId?}`. Returns `{message, chatId}`. |
| PATCH | `/messages/:messageId` | Edit message. Body: `{content, attachments?}`. Returns `{message}`. |
| DELETE | `/messages/:messageId` | Delete single message. Returns `{success}`. |
| POST | `/messages/batch-delete` | Bulk delete. Body: `{messageIds: string[]}`. Returns `{success, deleted}`. |
| POST | `/forward` | Forward messages. Body: `{messageIds, targetUserId}`. Returns `{messages, chatId}`. |

### Read Receipts

| Method | Path | Description |
|--------|------|-------------|
| POST | `/:chatId/read` | Mark chat as read. Returns `{success}`. |

### Pins

| Method | Path | Description |
|--------|------|-------------|
| GET | `/:chatId/pinned` | List pinned messages. Returns `{messages}`. |
| POST | `/messages/:messageId/pin` | Pin a message. Returns `{success, pinnedAt, pinnedBy}`. |
| DELETE | `/messages/:messageId/pin` | Unpin a message. Returns `{success}`. |

### Media & Stats

| Method | Path | Description |
|--------|------|-------------|
| GET | `/:chatId/stats` | Chat statistics. Returns `{messages, links, photos, videos, files, gifs}`. |
| GET | `/:chatId/media?kind=` | Paginated media gallery. `kind`: `photos`, `videos`, `gifs`, `files`, `links`. Returns `{items, hasMore, nextCursor}`. |

### File Upload & Dedup

| Method | Path | Description |
|--------|------|-------------|
| POST | `/upload` | Upload files. Multipart `files[]`. Server hashes, deduplicates, stores. Returns `{attachments: [{id, url, filename, mimeType, size, hash}]}`. |
| POST | `/upload/check` | Client pre-upload dedup check. Body: `{files: [{rawHash, filename}]}`. Returns `{results: [Attachment | null]}`. A hit bumps refcount atomically. |

## File Dedup Flow

1. **Client** compresses images (WebP), computes SHA-256 of each file
2. **Client** calls `POST /upload/check` with raw hashes
3. **Server** looks up `raw_blob_map` -> `file_blobs`. Hits return the existing attachment and bump `ref_count`
4. **Client** uploads only misses via `POST /upload`
5. **Server** hashes uploaded bytes, `INSERT ... ON CONFLICT DO UPDATE SET ref_count = ref_count + 1`, writes file only on miss
6. **Forward** (`POST /forward`) bumps `ref_count` for each attachment hash
7. **Delete** decrements `ref_count`. When `ref_count <= 0`, deletes row and unlinks file from disk

## Events Published

All via NATS JetStream:

| Subject | When |
|---------|------|
| `DM_MESSAGE` | Message sent, forwarded |
| `DM_MESSAGE_EDITED` | Message edited |
| `DM_MESSAGE_DELETED` | Message deleted |
| `DM_MESSAGE_PINNED` | Message pinned |
| `DM_MESSAGE_UNPINNED` | Message unpinned |
| `DM_READ` | Chat marked as read |

## Events Consumed

**JetStream (durable consumer `pers-chats-service`):**
- `USER_CREATED` — insert into `user_cache`
- `USER_UPDATED` — update `user_cache` (username, displayName, avatarUrl, privacy fields)

**Plain NATS (ephemeral):**
- `echo.presence.*` — update `user_cache.isOnline`

## External Dependencies

- **Friends Service** (via local `friendship_cache` table, not HTTP) — used for photo privacy checks
