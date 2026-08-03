# Plan: Voice Channels for Echo

## 1. Architecture decision

**Discord-like group voice = WebRTC, served via an SFU (Selective Forwarding Unit).** The server relays each participant's audio to the others without decoding or mixing — O(n) bandwidth per user, scales cleanly to 30–50 participants per room. Mesh (P2P) is rejected because it falls apart past ~4 people; MCU (server-side mixing) is overkill for chat-style voice.

**SFU pick: LiveKit** (Go, self-host via Docker). LiveKit gives us:
- A turnkey SFU with WebSocket signalling.
- A JS SDK that handles `getUserMedia`, peer connections, track subscriptions, speaker detection, and reconnection.
- Webhooks for participant join/leave events (so we can keep our own session state in sync without polling).

**Trade-off:** adds a Go container to the otherwise-Node stack. The alternative (mediasoup, Node-native) gives more control but doubles the implementation work; we can swap later if LiveKit's abstractions get in our way.

**Scope for v1:** voice channels nested under groups (matches Discord's "server > channels" mental model and the existing data model). Standalone "rooms" not tied to a group are deferred. The `/chats/voice` route in the sidebar becomes a "currently-active voice rooms across my groups" overview later — for v1 it can be empty/redirect.

---

## 2. New service — `services/voice-service/`

Port `:3008`. Same shape as `groups-service`: Hono + Drizzle + Postgres (`echo_voice`), JetStream consumer for `USER_*` events, Redis for ephemeral session state.

### 2.1 Database schema

| Table | Purpose |
|---|---|
| `user_cache` | Hydrated from NATS `USER_*` (same shape as other services). |
| `voice_channels` | `id`, `group_id`, `name`, `created_at`, `created_by`. UNIQUE `(group_id, name)`. |

`voice_sessions` lives in **Redis** (not Postgres) — keyed by `voice:session:<channelId>` as a hash of `userId → { joinedAt, isMuted, isDeafened }`. TTL refreshed by LiveKit webhook events; auto-expires if a process crashes.

### 2.2 HTTP routes (prefix `/voice`)

| Method | Path | Permission |
|---|---|---|
| `GET /channels?groupId=` | list channels in a group | group member |
| `POST /channels` | `{ groupId, name }` | group admin+ |
| `PATCH /channels/:id` | `{ name }` | group admin+ |
| `DELETE /channels/:id` | | group admin+ |
| `POST /channels/:id/join` | returns `{ url, token }` (LiveKit JWT) | group member |
| `POST /channels/:id/leave` | best-effort; LiveKit webhook is the source of truth | participant |
| `GET /channels/:id/participants` | live list from Redis | group member |

The `join` route signs a LiveKit access token with `room: voice:<channelId>`, `identity: <userId>`, `name: <displayName>`, plus `canPublish: true`, `canSubscribe: true`. Token is short-lived (~5 minutes); the LiveKit client only needs it to connect.

Group membership is checked by calling groups-service over HTTP (same pattern other services use), or by reading a NATS-replicated `group_members` cache. Cache is preferable — avoids a synchronous fan-out on every join.

### 2.3 LiveKit webhook receiver

`POST /voice/webhooks/livekit` (HMAC-verified using LiveKit's API secret):
- `participant_joined` / `participant_left` → update Redis hash, publish `voice_user_joined` / `voice_user_left` to NATS so ws-gateway broadcasts to group members.
- `track_published`, `track_unpublished` → mute/unmute state.
- `room_finished` → delete the Redis hash.

### 2.4 NATS events published

| Subject | Payload |
|---|---|
| `voice.user.joined` | `{ groupId, channelId, userId, joinedAt }` |
| `voice.user.left` | `{ groupId, channelId, userId }` |
| `voice.user.muted` | `{ groupId, channelId, userId, isMuted }` |
| `voice.user.speaking` | `{ groupId, channelId, userId, isSpeaking }` — **client-side** event, optional v2 |
| `voice.channel.created/updated/deleted` | for live sidebar updates |

ws-gateway subscribes and fans out to group members.

---

## 3. ws-gateway extensions

Add event types in `packages/shared/src/types/events.ts`:

```ts
| { type: 'voice_channel_created'; channel: VoiceChannel }
| { type: 'voice_channel_deleted'; channelId: string; groupId: string }
| { type: 'voice_user_joined'; channelId: string; groupId: string; user: { id; username; displayName; avatarUrl } }
| { type: 'voice_user_left'; channelId: string; groupId: string; userId: string }
| { type: 'voice_user_muted'; channelId: string; userId: string; isMuted: boolean }
```

---

## 4. Frontend

### 4.1 New module `src/lib/voice/`

- `voiceClient.svelte.ts` — wraps a single LiveKit `Room` instance in module-level state (so audio survives navigation, same pattern as `audioPlayer.svelte.ts`). Exposes:
  - `connect(channelId)` — fetch token, connect, publish mic.
  - `disconnect()`.
  - `setMuted(b)`, `setDeafened(b)`.
  - Reactive `$state` getters: `currentChannelId`, `participants`, `speakingIds`, `isMuted`, `isDeafened`, `connectionState`.
- `voiceChannels.svelte.ts` — store of voice channels per group; updated by ws events.

### 4.2 UI components

| Component | Where | What |
|---|---|---|
| `VoiceChannelList.svelte` | inside `GroupsSidebar` (under each group) or group info page | list channels, "join" button, live participant chips |
| `VoiceChannelView.svelte` | route `/chats/groups/[id]/voice/[channelId]` | participant grid with avatars + speaking pulse, mute/deafen/leave toolbar |
| `VoiceStatusBar.svelte` | top-level layout (sibling of `AudioPlayerBar`) | "Connected to <channel>" with mute/deafen/disconnect; persists across navigation |

### 4.3 Routes

- `/chats/groups/[id]/voice/[channelId]/+page.svelte` — channel join screen.
- `/chats/voice/+page.svelte` — overview (deferred to phase 7).

### 4.4 Tauri capability

`src-tauri/capabilities/main.json` must allow microphone access. macOS bundle config needs `NSMicrophoneUsageDescription`. Test `getUserMedia` once on each platform before going deep.

---

## 5. Phasing

| Phase | Deliverable | Done when |
|---|---|---|
| 1 | LiveKit container + `voice-service` skeleton + `echo_voice` DB | `docker compose up` brings everything healthy; `GET /voice/healthz` returns 200 |
| 2 | Channel CRUD (REST + Drizzle migration) + `VoiceChannelList` UI in group sidebar | can create/list/delete channels per group from the UI |
| 3 | Token issuance + LiveKit JS SDK connect + mic publishing | two browsers can hear each other in the same channel |
| 4 | Webhook receiver + Redis sessions + `voice_user_joined/left` ws events | participant list updates live without refresh |
| 5 | `VoiceStatusBar` (persistent across navigation) + mute/deafen/leave | user can switch chats while in voice; bar stays |
| 6 | Speaking indicator (pulse avatar) + connection-quality icon | active speaker visible in real time |
| 7 | Permissions polish (kick from voice, mute others), `/chats/voice` overview page | parity with Discord basics |

Each phase is its own PR.

---

## 6. Open decisions

- **STUN/TURN:** LiveKit ships with embedded TURN. Sufficient for development; production may want a dedicated coturn for resilience.
- **Recording:** out of scope for v1.
- **Video:** out of scope for v1 (LiveKit supports it; can extend tokens with `canPublishVideo` later).
- **E2E encryption of media:** LiveKit supports SFrame-based E2E. Defer until messaging E2E lands (see `encryption-plan-a.md`).
- **Tauri Linux (WebKitGTK):** verify `getUserMedia` works on the target distros early.
