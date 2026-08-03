# User Service

## Purpose

Central authority for user profile queries and privacy enforcement. Manages user identity, contact info, online presence, and granular privacy controls. Other services query it to resolve user profiles with privacy filtering.

## Tech Stack

- **Runtime:** Node.js (TypeScript via tsx)
- **Framework:** Hono 4.12.9
- **Database:** PostgreSQL (Drizzle ORM 0.45.2)
- **Auth:** JWT via shared authMiddleware
- **Messaging:** NATS JetStream (consume only)
- **Validation:** Zod 4.3.6

## Database Schema

### `user_profiles`

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| email | TEXT | UNIQUE, nullable |
| username | TEXT | UNIQUE |
| displayName | TEXT | nullable |
| avatarUrl | TEXT | nullable |
| phone | TEXT | nullable |
| status | TEXT | nullable |
| isOnline | BOOLEAN | default false |
| privacyOnlineStatus | VARCHAR(16) | default `'all'` |
| privacyPhone | VARCHAR(16) | default `'friends'` |
| privacyEmail | VARCHAR(16) | default `'friends'` |
| privacyMessaging | VARCHAR(16) | default `'all'` |
| privacyProfile | VARCHAR(16) | default `'all'` |
| privacyPhoto | VARCHAR(16) | default `'all'` |
| createdAt | TIMESTAMP | |
| updatedAt | TIMESTAMP | |

Privacy values: `'all'`, `'friends'`, `'nobody'`.

## HTTP API

All routes prefixed with `/users`. All require Bearer token.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/users/search?q=` | Search by username, email, or phone (last 10 digits). Min 2 chars. Max 10 results. Excludes current user. Privacy-filtered. |
| PATCH | `/users/me` | Update profile. Body: `{displayName?, phone?, status?}`. Returns `{user}`. |
| GET | `/users/:id` | Fetch user profile by ID. Privacy-filtered. Returns restricted profile if blocked by `privacyProfile`. |
| POST | `/users/bulk` | Bulk fetch up to 100 users. Body: `{userIds: string[]}`. Privacy-filtered. |
| PATCH | `/users/:id/online` | Internal: update online status. Body: `{isOnline: boolean}`. Called by ws-gateway. |

## Privacy Model

Enforced at query time via `applyPrivacy()` helper.

| Privacy Field | Controls | Behavior when restricted |
|---------------|----------|------------------------|
| `privacyOnlineStatus` | `isOnline` | Set to `false` |
| `privacyPhone` | `phone` | Set to `null` |
| `privacyEmail` | `email` | Set to `null` |
| `privacyPhoto` | `avatarUrl` | Set to `null` |
| `privacyProfile` | Entire profile | Returns `{id, username, displayName, avatarUrl: null, isOnline: false, profileRestricted: true}` |
| `privacyMessaging` | Checked upstream | Not enforced in user-service |

Logic: if privacy is `'friends'`, checks friendship via friends-service HTTP call. If not friends or `'nobody'`, field is redacted.

## Events Consumed

**JetStream (durable consumer `user-service`):**
- `USER_CREATED` — insert new user profile from auth-service
- `USER_UPDATED` — update profile fields including privacy settings

**Plain NATS (ephemeral):**
- `echo.presence.*` — update `isOnline` from ws-gateway presence events

## Events Published

None.

## External Dependencies

- **Friends Service:** `GET {FRIENDS_SERVICE_URL}/friends/status/{targetId}` — checks friendship status for privacy filtering. Default: `http://localhost:3005`.

## Example Flows

**Search with privacy:**
1. `GET /users/search?q=alice`
2. For each result, checks friendship if privacy requires it
3. Applies `applyPrivacy()` to redact fields
4. Returns filtered list

**View profile:**
1. `GET /users/:id`
2. If `privacyProfile === 'nobody'` or (`'friends'` + not friends) -> restricted profile
3. Otherwise field-level privacy filtering
