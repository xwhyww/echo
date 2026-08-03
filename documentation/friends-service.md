# Friends Service

## Purpose

Manages friend request workflows and friendships. Owns the full lifecycle: sending requests, accepting/declining, removing friends, and querying friendship status.

## Tech Stack

- **Runtime:** Node.js (TypeScript)
- **Framework:** Hono 4.12.9
- **Database:** PostgreSQL (Drizzle ORM 0.45.2)
- **Auth:** JWT via shared authMiddleware
- **Messaging:** NATS (publish only)

## Database Schema

### `friendships`

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| requester_id | UUID | FK -> users, who sent the request |
| addressee_id | UUID | FK -> users, who received it |
| status | TEXT | `'pending'` / `'accepted'` / `'declined'` |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

**Constraints:** UNIQUE `(requester_id, addressee_id)`, CHECK `requester_id != addressee_id`.

## HTTP API

All routes prefixed with `/friends`. All require Bearer token auth.

| Method | Path | Description |
|--------|------|-------------|
| POST | `/friends/request/:userId` | Send friend request. Auto-accepts if target already sent a request to you. |
| POST | `/friends/accept/:userId` | Accept incoming pending request. |
| POST | `/friends/decline/:userId` | Decline incoming pending request. |
| DELETE | `/friends/:userId` | Remove friend (bilateral). |
| DELETE | `/friends/request/:userId` | Cancel outgoing pending request. |
| POST | `/friends/status/bulk` | Bulk check status. Body: `{userIds: string[]}`. Returns `{statuses: Record<id, {status, direction?}>}`. |
| GET | `/friends/status/all` | All friendships and pending requests for current user. |
| GET | `/friends/status/:userId` | Friendship status with single user. Returns `{status, direction?}`. |
| GET | `/friends/` | List all confirmed friend IDs. Returns `{friendIds: string[]}`. |
| GET | `/friends/requests/incoming` | Pending incoming requests. |
| GET | `/friends/requests/outgoing` | Pending outgoing requests. |

**Health:** `GET /health` -> `{status: 'ok'}` (no auth).

## Events Published

NATS subject: `SUBJECTS.FRIEND_EVENT`

| Event Type | Trigger |
|------------|---------|
| `friend_request` | New/resent request |
| `friend_accepted` | Request accepted |
| `friend_declined` | Request declined |
| `friend_removed` | Friendship deleted |
| `friend_cancelled` | Outgoing request cancelled |

Payload: `{type, fromUserId, toUserId}`.

## Events Consumed

None.

## External Dependencies

None.

## Example Flows

**Send and accept:**
1. User A: `POST /friends/request/{B}` -> pending
2. User B: `POST /friends/accept/{A}` -> accepted

**Mutual request (auto-accept):**
1. User A: `POST /friends/request/{B}` -> pending
2. User B: `POST /friends/request/{A}` -> auto-accepts, publishes `friend_accepted`

**Remove:**
1. `DELETE /friends/{B}` -> bilateral removal, publishes `friend_removed`
