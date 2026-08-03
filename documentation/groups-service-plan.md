# Plan: Group Chats for Echo

## 1. Architecture decision

Create a new microservice `groups-service` (port `:3005`) following the same pattern as `pers-chats-service`. Don't fork `pers-chats-service` — group semantics (members, roles, invites, channels) diverge enough that mixing them will produce a tangled god-service.

**Why a separate service:** Echo is mid-migration to DB-per-service + NATS. Groups have their own bounded context (membership, roles, invites). It deserves `echo_groups` DB and its own NATS consumer.

**Trade-off:** more wiring (gateway proxy, ws-gateway events, user_cache & friendship_cache duplicated). But matches the architecture committed to on 2026-03-30.

---

## 2. Backend — `services/groups-service/`

### 2.1 Database schema (`src/db/schema.ts`)

| Table | Purpose |
|---|---|
| `user_cache` | Hydrated from NATS `USER_*` events (same shape as pers-chats). |
| `groups` | `id`, `name`, `description`, `avatar_url`, `owner_id`, `is_public boolean`, `invite_code text unique nullable`, `created_at`. |
| `group_members` | `id`, `group_id`, `user_id`, `role varchar(16)` (`owner` / `admin` / `member`), `joined_at`, `nickname nullable`. UNIQUE `(group_id, user_id)`. |
| `group_invites` | `id`, `group_id`, `inviter_id`, `invitee_id`, `status varchar(16)` (`pending` / `accepted` / `declined` / `revoked`), `created_at`, `responded_at nullable`. |
| `group_messages` | mirrors `personal_messages` but `group_id` instead of `chat_id`, plus `system_kind nullable` (for `member_joined`, `member_left`, `role_changed` etc.). |
| `group_message_reactions`, `group_message_links`, `group_message_deletions`, `group_chat_reads` | Same shape as personal equivalents, keyed on `group_id` / `group_messages`. |

Reuse the `bytea` custom type and encryption columns from `pers-chats-service` for parity with E2E plans.

### 2.2 Roles & permissions

Define one `permissions.ts` module with a single `can(role, action)` function:

| Action | owner | admin | member |
|---|:-:|:-:|:-:|
| send message | ✓ | ✓ | ✓ |
| edit/delete own message | ✓ | ✓ | ✓ |
| delete others' messages | ✓ | ✓ | ✗ |
| pin / unpin | ✓ | ✓ | ✗ |
| invite users | ✓ | ✓ | ✓ (configurable later) |
| kick member | ✓ | ✓ | ✗ |
| change roles (member ↔ admin) | ✓ | ✗ | ✗ |
| edit group name/avatar | ✓ | ✓ | ✗ |
| delete group | ✓ | ✗ | ✗ |
| transfer ownership | ✓ | ✗ | ✗ |

`owner` is a single user, demote-to-admin on transfer. There can be multiple admins.

### 2.3 HTTP routes (prefix `/groups`)

| Method | Path | Permission |
|---|---|---|
| `GET /` | list groups for current user | member |
| `POST /` | create group `{name, description?, isPublic?}` — creator becomes owner | any |
| `GET /:id` | group details (members, your role) | member |
| `PATCH /:id` | edit name/description/avatar/isPublic | admin+ |
| `DELETE /:id` | delete group | owner |
| `POST /:id/transfer` | `{newOwnerId}` | owner |
| **Members** | | |
| `GET /:id/members` | paginated | member |
| `PATCH /:id/members/:userId` | `{role, nickname?}` | owner (for role) |
| `DELETE /:id/members/:userId` | kick or self-leave | admin+ or self |
| **Invites** | | |
| `POST /:id/invites` | `{userId}` invite specific user | per perms |
| `GET /invites/incoming` | invites *for me* | self |
| `POST /invites/:inviteId/accept` | | invitee |
| `POST /invites/:inviteId/decline` | | invitee |
| `DELETE /invites/:inviteId` | revoke | inviter / admin+ |
| `POST /:id/invite-link/regenerate` | rotates `invite_code` | admin+ |
| `POST /join/:code` | join via invite link | any (if public or has code) |
| **Messages / pins / media / reactions / read receipts / forward / upload** | | mirror pers-chats endpoints, key on `group_id` |

Reuse `crypto.ts`, `media.ts`, `file_blobs`/`raw_blob_map` patterns from pers-chats verbatim — content-addressed dedup is identical.

### 2.4 NATS

**Publish:**
- `GROUP_CREATED`, `GROUP_UPDATED`, `GROUP_DELETED`
- `GROUP_MEMBER_JOINED`, `GROUP_MEMBER_LEFT`, `GROUP_MEMBER_ROLE_CHANGED`
- `GROUP_INVITE_CREATED`, `GROUP_INVITE_RESPONDED`
- `GROUP_MESSAGE`, `GROUP_MESSAGE_EDITED`, `GROUP_MESSAGE_DELETED`, `GROUP_MESSAGE_PINNED`, `GROUP_MESSAGE_UNPINNED`
- `GROUP_READ`

**Consume (durable `groups-service`):** `USER_CREATED`, `USER_UPDATED` → `user_cache`. (Friendship cache only needed if "invite by friend only" is gated — skip for v1.)

### 2.5 Wiring

- `gateway/src/app.ts`: add `/groups/*` proxy → `GROUPS_SERVICE_URL`.
- `ws-gateway/src/subscriber.ts`: subscribe to all `GROUP_*` subjects; deliver to `targetUserIds: string[]` (group fanout — list of member IDs the publisher includes in the event).
- `shared/types`: add `GroupMessagePayload`, `GroupMemberEventPayload`, `WsEvent` variants `group_message`, `group_member_changed`, `group_read`, etc.
- `pnpm-workspace.yaml` already globs `services/*` — auto-discovered. Add `pnpm dev:groups` script.
- `.env`: `PORT=3005`, `DATABASE_URL=...echo_groups`, `JWT_SECRET`, `NATS_URL`.

---

## 3. Frontend

### 3.1 Routes (`src/routes/chats/groups/`)

```
groups/
├── +page.svelte              landing: "Select a group or create one"
├── new/+page.svelte          create-group flow
├── invites/+page.svelte      incoming invites list
└── [id]/
    ├── +page.svelte          group chat view (mirrors perschat/[id])
    ├── info/+page.svelte     name, description, members list, your role
    ├── members/+page.svelte  full members management (kick, role change)
    ├── invites/+page.svelte  manage outgoing invites + invite link
    └── media/+page.svelte    media gallery
```

Update `src/lib/routes.ts`:
```ts
groups: {
  root: '/chats/groups',
  new: '/chats/groups/new',
  invites: '/chats/groups/invites',
  group: (id: string) => `/chats/groups/${id}`,
  groupInfo: (id: string) => `/chats/groups/${id}/info`,
  groupMembers: (id: string) => `/chats/groups/${id}/members`,
  groupInviteMgmt: (id: string) => `/chats/groups/${id}/invites`,
  groupMedia: (id: string, kind: ...) => `/chats/groups/${id}/media?kind=${kind}`,
}
```

### 3.2 Sidebar

The sidebar tab `gr` already exists in `Sidebar.svelte:14`. Wire it up:

1. Create `src/lib/components/GroupsSidebar.svelte` (clone `ChannelSidebar.svelte` shape).
   - Top: search box + "Create group" button + "Invites (n)" link (badge from incoming invites count).
   - List of groups with last-message preview, unread count, typing.
2. In `src/routes/+layout.svelte`, add branch `{:else if activeSidebar === 'gr'}<GroupsSidebar />`.

### 3.3 New components

- `CreateGroupModal.svelte` — name, optional description, avatar upload, "Invite friends now?" multi-select.
- `GroupMemberList.svelte` — list with role badge, owner crown, admin shield. Click → context menu (role change / kick / make owner).
- `InviteFriendsModal.svelte` — picks from friends list (+ search by username), shows already-members as disabled.
- `InviteLinkPanel.svelte` — display `invite_code`, copy, regenerate button.
- `GroupSystemMessage.svelte` — renders `system_kind` events ("Alice joined", "Bob promoted Carol to admin").

Reuse `ChatBubble`, `MessageTime`, `ReplyPreview`, `PinnedMessagesBar`, `MediaViewer`, `FilePreviewModal`, `EmojiPicker`, `Avatar`, `Input`, `Button` — all already exist.

### 3.4 API client & store

- `src/lib/api/groupsService.ts` — typed wrappers around `/groups/*`.
- `src/lib/stores/groups.svelte.ts` — `groupsStore` with `list`, `byId`, unread counts, member maps. Mirror the structure of `personalChats.svelte.ts`.
- `src/lib/hooks/useGroups.svelte.ts`, `useGroup.svelte.ts`, `useGroupMembers.svelte.ts`.
- Extend `src/lib/stores/ws.svelte.ts` to handle `group_message`, `group_member_changed`, `group_read` events → update `groupsStore`.

### 3.5 Invite flow UX

Two paths:
1. **Direct invite** — admin picks user → server creates `group_invites` row, NATS pings invitee → invitee sees badge in `Invites` page → accept inserts member + emits `GROUP_MEMBER_JOINED`.
2. **Invite link** — `https://echo.app/invite/<code>` (or in-app `/join/<code>`). For Tauri, deep-link via `tauri://invoke`. v1 can be "copy code, paste in join box."

---

## 4. Build order (recommended sequence)

1. **Schema + migrations** — `groups-service/src/db/schema.ts`, generate migration, create `echo_groups` DB.
2. **Bootstrap service** — copy pers-chats `app.ts`/`bootstrap.ts`/`config.ts`/`nats.ts`/`crypto.ts` skeleton.
3. **CRUD groups + members** (no messages yet) — create / list / get / leave / kick / role change. Add to gateway proxy. Test via curl.
4. **Invites** — direct invite + accept/decline. Wire NATS `GROUP_INVITE_*` events.
5. **Messages** — port pers-chats messages routes, but keyed on `group_id` and gated on membership. NATS fanout to all members.
6. **ws-gateway** — subscribe to `GROUP_*`, deliver to target lists.
7. **Frontend store + API client** — `groupsStore`, `groupsService.ts`, ws handlers.
8. **Frontend UI** — `GroupsSidebar`, `CreateGroupModal`, group list, group chat page (clone perschat page), info/members pages.
9. **Polish** — system messages, invite link, role badges in chat, unread/typing.

Each step is shippable on its own — groups (without messages) can be tested end-to-end before the heavy chat-view porting.

---

## 5. Open questions to decide before coding

1. **Group size limit?** Suggest soft cap (e.g. 200 members) — affects fanout strategy in NATS/ws-gateway.
2. **Invite by friend only, or any user?** Affects whether `groups-service` needs `friendship_cache`.
3. **Public groups & discovery?** v1 = invite-only, defer public directory.
4. **Encryption?** Pers-chats has E2E columns ready but seemingly inactive. Group E2E is much harder (sender keys / MLS) — recommend v1 plaintext, columns reserved, document as TODO.
5. **Single owner vs. multi-owner?** Plan above is single-owner + transfer. Confirm.