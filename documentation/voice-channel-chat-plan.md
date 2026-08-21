# Voice Channel Chat — Implementation Plan

Each voice channel gets its own chat panel rendered alongside the voice tile
view at `/chats/groups/[id]/voice/[channelId]`. The chat reuses the same
behaviour as the group chat (send / edit / delete / pin / react / forward /
attachments / WebSocket fan-out) but is scoped per voice channel, so deleting
a channel cascades to its chat.

The work is split into three slices:

- **Slice 1 — UI scaffold** (left voice pane + right chat panel stub) — DONE
- **Slice 2a — Backend** (schema, routes, NATS, WS gateway) — DONE
- **Slice 2b — Frontend** (service + WS types + chat component + wire-in) — DONE
- **Slice 3 — Refactor** (extract a shared `<ChatPanel />` once both work) — DONE

Two things changed after this was written and are not described below:

- The chat is **encrypted at rest**, like personal and group messages. See
  `documentation/encryption.md`.
- Every route checks **channel access**, not just group membership. A voice
  channel restricted to a role has a chat restricted to the same role, and the
  WebSocket fan-out is narrowed to `channelAudience()` rather than going to the
  whole group.

---

## Slice 1 — UI scaffold (DONE)

`echo-client/src/routes/chats/groups/[id]/voice/[channelId]/+page.svelte`
was wrapped in a two-pane shell:

- `.vc-shell` — flex row, fills the page
- `.vc-page` — left pane, holds the existing voice tiles + controls (kept its
  720px max-width so the voice tile area looks unchanged)
- `.vc-chat` — right pane stub: header (`Channel chat — #<name>`), centred
  empty-state body, fake "Message…" input bar. Replaced wholesale in 2b.

Also fixed `ConnectionQualityIndicator.svelte` while we were on the page:

- The popover was hardcoded to `bottom: calc(100% + 24px); right: -155px;`,
  ignoring its own `placement` state — popover spilled off the viewport
  near the right or top edges.
- Wired `placement` to `.v-up`/`.v-down`/`.h-left`/`.h-right` classes
  driven by `computePlacement()`.
- Bound the wrapper element via `bind:this={wrapperEl}` (was declared but
  never bound, so `computePlacement` returned early on null and `placement`
  never updated).

---

## Slice 2a — Backend (DONE)

### Files modified

| Path | What changed |
|---|---|
| `echo-server/packages/shared/src/nats.ts` | Added 7 SUBJECTS: `VOICE_CHANNEL_MESSAGE`, `_EDITED`, `_DELETED`, `_PINNED`, `_UNPINNED`, `_REACTION`, `VOICE_CHANNEL_READ`. Subjects are `echo.voice.channel.message.*` so they flow through the existing `VOICE_EVENTS` JetStream stream. |
| `echo-server/packages/shared/src/types/events.ts` | Added `VoiceChannelMessageAttachment`, `VoiceChannelMessagePayload`, and the 7 event interfaces. |
| `echo-server/packages/shared/src/types/ws-events.ts` | Added 7 `WsEvent` variants + `VoiceChannelMessageWsAttachment` + `VoiceChannelMessageWsPayload`. |
| `echo-server/packages/shared/src/index.ts` | Exported the new types. |
| `echo-server/services/voice-service/src/db/schema.ts` | Added three tables (see below). All FK to `voice_channels.id` use `ON DELETE CASCADE` — channel delete drops the chat. |
| `echo-server/services/voice-service/src/config.ts` | Added `blobServiceUrl`. |
| `echo-server/services/voice-service/src/nats.ts` | Added 7 publisher functions and the `publish()` helper. |
| `echo-server/services/voice-service/src/routes/messages.ts` | **New file** (~500 lines), mirrors `groups-service/src/routes/messages.ts`. |
| `echo-server/services/voice-service/src/app.ts` | Mounted `messagesRoutes` at `/voice` (alongside `channelsRoutes` — paths don't collide). |
| `echo-server/services/ws-gateway/src/subscriber.ts` | Extended the existing `VOICE_EVENTS` consumer's switch to fan out the 7 new subjects. The consumer was already created without a `filter_subjects` list, so JetStream will deliver the new subjects without consumer-config changes. |

### New tables (voice-service)

- `voice_channel_messages` — mirror of `group_messages`. Columns: `id`,
  `channel_id` (FK CASCADE), `group_id`, `author_id`, `content`,
  `attachments` (jsonb), `is_edited`, `created_at`, `updated_at`,
  `pinned_at`, `pinned_by`, `reply_to_id`, `reply_to_snapshot` (jsonb),
  `forwarded_from` (jsonb), `content_key_id`. Indexes:
  `(channel_id, created_at)`, `(channel_id, pinned_at)`.
  — `system_kind` is intentionally omitted (no system messages in voice chat
  for now).
  — `group_id` is denormalized so authorization checks don't need a join.
- `voice_channel_message_reactions` — mirror of `group_message_reactions`.
  Unique `(user_id, message_id)`.
- `voice_channel_chat_reads` — mirror of `group_chat_reads`. Unique
  `(user_id, channel_id)`.

### Routes registered (under `/voice`)

| Method | Path | Notes |
|---|---|---|
| POST | `/voice/channels/:id/messages` | send |
| GET | `/voice/channels/:id/messages` | history (cursor / after / limit) |
| PATCH | `/voice/messages/:messageId` | edit own |
| DELETE | `/voice/messages/:messageId` | delete own; admin+ can delete any |
| POST | `/voice/channels/:id/read` | mark read |
| GET | `/voice/channels/:id/pinned` | list pinned |
| POST | `/voice/messages/:messageId/pin` | admin+ |
| DELETE | `/voice/messages/:messageId/pin` | admin+ |
| POST | `/voice/messages/:messageId/reactions` | toggle |

### Permission model

- **canSend** — any group member.
- **canEdit / canDelete-own** — message author.
- **canDelete-any / canPin / canUnpin** — `owner` or `admin`.
- The group's `messagePolicy` / `pinPolicy` / `historyVisible` are **not**
  consulted. Reading them would require a `groupsMirror` table fed via
  GROUP_CREATED / GROUP_UPDATED events. Deferred — see "Open items".

### Blob attachment scope

Voice-channel attachments use the parent group's blob scope
(`scopeType: 'group'`, `scopeId: groupId`). Voice-channel members are always
group members, so the access set is identical and blob-service stays
untouched.

### Migration step (run before 2b)

```
cd echo-server/services/voice-service
pnpm drizzle-kit generate     # creates 0004_*.sql + meta snapshot
pnpm drizzle-kit migrate      # apply (or whatever the project's apply step is)
```

Then restart `voice-service` and `ws-gateway`. Confirm both come up healthy
and the voice page still works (sidebar, join, etc.).

---

## Slice 2b — Frontend (TODO)

Approach: build a fresh `VoiceChannelChat.svelte` component that uses the
same leaf components as the group page (`ChatBubble`, `TextField`,
`PinnedMessagesBar`, `EmojiPicker`, `MediaViewer`, `Toast`, `Avatar`) and
duplicates the orchestration logic from
`echo-client/src/routes/chats/groups/[id]/+page.svelte`. We do NOT refactor
the group chat in this slice — that lands in slice 3 once both surfaces
work and the shared interface is obvious.

### Files to add

1. **`echo-client/src/lib/api/voiceChat.ts`** — TypeScript types matching
   the server payloads:
   - `VoiceChannelMessage`, `VoiceChannelMessageAttachment`
   - `VoiceChannelMessageListResponse` (`{ messages, hasMore, nextCursor }`)
   - `VoiceChannelPinnedResponse`
2. **`echo-client/src/lib/api/voiceChatService.ts`** — methods mirroring
   `groupsService` chat methods, retargeted to `/voice/...`:
   - `getMessages(channelId, opts?)`
   - `sendMessage(channelId, content, attachments?, replyToId?, forwardedFrom?)`
   - `editMessage(messageId, content, attachments?)`
   - `deleteMessage(messageId)`
   - `markRead(channelId)`
   - `getPinned(channelId)`
   - `pin(messageId)` / `unpin(messageId)`
   - `toggleReaction(messageId, emoji)`
3. **`echo-client/src/lib/hooks/useVoiceChannelChatCache.svelte.ts`** —
   per-channel cache (mirror of `useGroupChatCache.svelte.ts`) so switching
   channels is instant and scroll position is preserved.
4. **`echo-client/src/lib/components/VoiceChannelChat.svelte`** — the
   ~500-line component. Owns:
   - load / loadOlder / scroll-to-bottom / pin-to-bottom logic
   - WebSocket handlers for `voice_channel_message` /
     `voice_channel_message_edited` / `_deleted` / `_pinned` / `_unpinned` /
     `_reaction` / `voice_channel_read` / `voice_channel_deleted`
   - drag-select / multi-select / forward (out only — see "Forwarding" below)
   - emoji / reaction picker
   - media viewer / pinned messages bar / toast

### Files to modify

1. **`echo-client/src/lib/stores/ws.svelte.ts`** — extend the `WsEvent`
   union with the same 7 variants the server defines.
2. **`echo-client/src/routes/chats/groups/[id]/voice/[channelId]/+page.svelte`** —
   replace the `.vc-chat` stub with `<VoiceChannelChat groupId channelId />`.
   (The `.vc-chat` CSS block can be deleted.)

### Forwarding scope (per user decision)

- Forwarding **out of** voice-channel chat into groups / DMs: works.
- Forwarding **into** voice-channel chat from anywhere: dropped for v1.
  The existing `ForwardPicker` lists groups + DMs as targets; we don't add
  voice channels as a third target type yet.

### WebSocket event handlers (sketch)

```
case 'voice_channel_message':           append if channelId matches; auto-scroll
case 'voice_channel_message_edited':    map → patched message
case 'voice_channel_message_deleted':   filter out by messageId
case 'voice_channel_message_pinned':    set pinnedAt/pinnedBy on message + add to pinned list
case 'voice_channel_message_unpinned':  clear pinnedAt + remove from pinned list
case 'voice_channel_message_reaction':  replace reactions array on the message
case 'voice_channel_read':              update unread badge for non-self readers
case 'voice_channel_deleted':           navigate away (already partly handled in voice page)
```

---

## Slice 3 — Shared `<ChatPanel />` refactor (TODO, post-2b)

Once VoiceChannelChat and the group chat page both work, the orchestration
logic is duplicated. Extract a `<ChatPanel />` component parameterised by:

```
{
  kind: 'group' | 'voiceChannel',
  id: string,                                    // groupId or channelId
  service: ChatService,                          // sendMessage / edit / delete / pin / react / read / list / getPinned
  wsEventPrefix: 'group' | 'voice_channel',      // selects which WsEvent variants to subscribe to
  cache: ChatCache,                              // per-id cache
  features: { forwarding: boolean, drag-select: boolean, … }
}
```

Then the group page and the voice-channel chat both render `<ChatPanel />`.
This is risky to do mid-2b because the group chat is 600 lines and tightly
coupled — refactoring after both surfaces work makes the shared interface
obvious (you can see what diverges).

---

## Open items / deferred

- **Group policies in voice chat.** Voice chat currently hardcodes
  any-member-sends and admin+-pins. To honour the parent group's
  `messagePolicy` / `pinPolicy` / `historyVisible`, voice-service needs a
  `groupsMirror` table fed via GROUP_CREATED / GROUP_UPDATED events
  (similar to the existing `groupMembersMirror`).
- **Link previews.** Group chat has `group_message_links` for a per-group
  links gallery. Not mirrored for voice chat; revisit when the link
  gallery feature lands for voice channels.
- **Soft-delete-for-me.** Group chat has `group_message_deletions`
  (per-user "delete for me"). Not mirrored. Voice chat only supports global
  delete in v1.
- **System messages.** No `system_kind` column on `voice_channel_messages`
  — voice chat doesn't generate "X joined / left" system messages.
  The voice page itself shows a live participant list, so this isn't urgent.
- **Forward-into-voice-channel** in `ForwardPicker` — dropped from v1, see
  above.

---

## Recovery / rollback

- Schema changes are additive (three new tables, no alterations to existing
  ones). To roll back, drop the three tables and the generated migration
  file.
- The shared types changes are additive — older clients ignore unknown
  `WsEvent.type` values.
- The `ws-gateway` subscriber additions are inside an existing `else if`
  chain; remove the new branches to revert.
- The voice page UI in slice 1 is a structural change. To revert, restore
  the previous single `.vc-page` flat layout from git history.
