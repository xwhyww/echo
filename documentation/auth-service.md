# Auth Service

## Purpose

Owns user authentication, profile management, and avatar storage. Handles registration, login (JWT-based), profile updates (display name, phone, status), privacy controls across six dimensions, and avatar uploads with per-user history.

## Tech Stack

- **Runtime:** Node.js (TypeScript via tsx)
- **Framework:** Hono 4.12.9
- **Database:** PostgreSQL (Drizzle ORM 0.45.2)
- **Auth:** JWT (HS256) + bcryptjs for password hashing
- **Messaging:** NATS (publish only)
- **Validation:** Zod 4.3.6

## Database Schema

### `users`

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| email | TEXT | UNIQUE |
| username | TEXT | UNIQUE |
| passwordHash | TEXT | bcrypt |
| displayName | TEXT | nullable |
| avatarUrl | TEXT | nullable, active avatar URL |
| phone | TEXT | UNIQUE, nullable |
| status | TEXT | nullable |
| privacyOnlineStatus | VARCHAR(16) | default `'all'` |
| privacyPhone | VARCHAR(16) | default `'friends'` |
| privacyEmail | VARCHAR(16) | default `'friends'` |
| privacyMessaging | VARCHAR(16) | default `'all'` |
| privacyProfile | VARCHAR(16) | default `'all'` |
| privacyPhoto | VARCHAR(16) | default `'all'` |
| createdAt | TIMESTAMP | |

### `user_avatars`

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| userId | UUID | FK -> users |
| url | TEXT | path to stored file |
| createdAt | TIMESTAMP | |

## HTTP API

All routes prefixed with `/auth`. Routes marked with **Auth** require `Bearer` token.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/register` | No | Create account. Body: `{email, username, password, displayName?, phone?}`. Returns `{user, token}`. |
| POST | `/auth/login` | No | Login. Body: `{email, password}`. Returns `{user, token}`. |
| GET | `/auth/me` | Yes | Fetch current user profile. Returns `{user}`. |
| PATCH | `/auth/me` | Yes | Update display name, phone, status. Body: `{displayName?, phone?, status?}`. Returns `{user}`. |
| GET | `/auth/me/privacy` | Yes | Fetch privacy settings. Returns `{privacy: {onlineStatus, phone, email, messaging, profile, photo}}`. |
| PATCH | `/auth/me/privacy` | Yes | Update privacy settings. Body: any subset of privacy fields. Returns `{privacy}`. |
| GET | `/auth/users/:id/avatars` | No | List avatars for any user. Returns `{avatars: [{id, url, createdAt}]}`. |
| GET | `/auth/me/avatars` | Yes | List all avatars for current user. Returns `{avatars}`. |
| POST | `/auth/me/avatar` | Yes | Upload new avatar (becomes active). Multipart `avatar` field (JPEG/PNG/WebP/GIF, max 5MB). Returns `{user, avatar}`. |
| PATCH | `/auth/me/avatar` | Yes | Set active avatar. Body: `{avatarId}` or `{avatarId: null}` to clear. Returns `{user}`. |
| DELETE | `/auth/me/avatars/:id` | Yes | Delete avatar. If active, auto-reassigns to most recent. Returns `{user}`. |

## Events Published

- **`user.created`** — on register. Payload: `{id, email, username, displayName, avatarUrl, phone}`.
- **`user.updated`** — on profile/privacy/avatar changes. Payload: `{id, ...changedFields}`.

## Events Consumed

None.

## External Dependencies

None. Publishes to NATS only.

## Example Flows

**Register and login:**
1. `POST /auth/register` -> `{user, token}`
2. `POST /auth/login` -> `{user, token}`
3. `GET /auth/me` -> `{user}`

**Upload and manage avatars:**
1. `POST /auth/me/avatar` (multipart) -> `{user, avatar}`
2. `GET /auth/me/avatars` -> list
3. `PATCH /auth/me/avatar {avatarId}` -> set active
4. `DELETE /auth/me/avatars/:id` -> remove

**Configure privacy:**
1. `GET /auth/me/privacy`
2. `PATCH /auth/me/privacy {photo: "friends", messaging: "existing"}`
