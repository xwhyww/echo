# Echo — Telegram-Style Chat Logic

## Overview

Chat system modeled after Telegram: fast open, instant scroll restoration, bidirectional infinite scroll, cursor-based pagination, aggressive caching.

---

## 1. Chat List (Sidebar)

### Data Model
```
ChatListItem {
  chatId
  type: "channel" | "dm" | "group_dm"
  title
  avatar
  lastMessage: { text, senderId, senderName, timestamp }
  unreadCount
  isMuted
  isPinned
  draft: string | null          // saved unsent text
  lastReadMessageId             // for unread separator
  typing: { userId, name }[]    // who's typing now
}
```

### Behavior
- Chat list sorted: pinned first (by pin order), then by `lastMessage.timestamp` descending
- Max **100 chats** cached in memory (LRU eviction — least recently opened gets dropped)
- When a new message arrives in a non-cached chat → create a lightweight `ChatListItem` without loading full messages
- Chat list updates in real-time via WebSocket: new messages bump chat to top, typing indicators update inline
- Muted chats still show unread count but no badge highlight
- Drafts persist across chat switches (stored in local cache, not server)

---

## 2. Message Cache

### Structure
```
ChatCache {
  chatId
  messages: Message[]           // sorted by id/timestamp ascending
  hasOlderMessages: boolean     // false = reached beginning of chat
  hasNewerMessages: boolean     // false = we're at the live tail
  scrollPosition: number | null // pixel offset from bottom, null = pinned to bottom
  firstUnreadMessageId: string | null
}
```

### Limits
- Max **1000 messages** per chat in memory
- When exceeding 1000:
  - If user is scrolled to bottom → trim oldest messages, set `hasOlderMessages = true`
  - If user is in the middle → trim from the side furthest from viewport
- Max **100 chats** with cached messages simultaneously (LRU eviction)

---

## 3. Opening a Chat

### Case A: Chat has cache + user was at bottom
1. Render cached messages instantly (no loading state)
2. Restore scroll → pinned to bottom
3. Fetch new messages since last cached message via `GET /messages?after={lastCachedId}`
4. Append to array, stay pinned to bottom
5. Mark as read

### Case B: Chat has cache + user was scrolled up
1. Render cached messages instantly
2. Restore exact scroll position (pixel offset)
3. Do NOT auto-scroll to bottom
4. Show "↓ N new messages" floating button if there are unread messages below
5. Fetch gap messages only if user scrolls into uncached region

### Case C: Chat has no cache (first open or evicted)
1. Show skeleton/loading state
2. Fetch latest messages: `GET /messages?chatId={id}&limit=50&direction=before`
3. Render messages, scroll to bottom
4. Set `hasNewerMessages = false` (we're at the tail)
5. Mark as read

### Case D: Chat has unread messages (opened from unread indicator)
1. Fetch messages around the first unread: `GET /messages?around={firstUnreadId}&limit=50`
2. Render with unread separator line ("── N unread messages ──")
3. Scroll so the separator is near top of viewport
4. `hasOlderMessages = true`, `hasNewerMessages = true` (bidirectional loading needed)

---

## 4. Scrolling & Pagination

### Cursor-based loading
All pagination is cursor-based (by message ID), never offset-based.

```
GET /messages?chatId={id}&before={messageId}&limit=50   // scroll up
GET /messages?chatId={id}&after={messageId}&limit=50    // scroll down
GET /messages?chatId={id}&around={messageId}&limit=50   // jump to message (25 before + 25 after)
```

### Scroll Up (loading older messages)
1. When user scrolls within **500px** of the top → trigger fetch
2. Fetch: `GET /messages?before={oldestLoadedId}&limit=50`
3. Prepend to array
4. **Preserve scroll position** — user should not see a jump. Anchor to the message that was at the top of viewport before prepend
5. If response returns fewer than 50 → `hasOlderMessages = false` (reached beginning)
6. If total messages exceed 1000 → trim from bottom, set `hasNewerMessages = true`

### Scroll Down (loading newer messages)
1. When user scrolls within **500px** of the bottom AND `hasNewerMessages = true` → trigger fetch
2. Fetch: `GET /messages?after={newestLoadedId}&limit=50`
3. Append to array
4. If response returns fewer than 50 → `hasNewerMessages = false` (reached live tail)
5. If total messages exceed 1000 → trim from top, set `hasOlderMessages = true`

### Reaching the bottom
- When user scrolls to bottom and `hasNewerMessages = false` → pin to bottom (auto-scroll on new messages)
- "↓" floating button appears when not pinned to bottom
- Clicking "↓" button:
  - If all newer messages are cached → smooth scroll to bottom
  - If not → discard current cache, fetch latest 50, scroll to bottom (same as Case C)

---

## 5. Scroll Position Persistence

### On leaving a chat
- Save `scrollPosition` = distance in pixels from the bottom of the scroll container
- `null` means "pinned to bottom"
- Save alongside the message cache for that chat

### On returning to a chat
- If `scrollPosition === null` → scroll to bottom
- If `scrollPosition !== null` → restore exact pixel position from bottom
- This survives chat switching within the same session
- On app restart: only restore if messages are still cached (otherwise open fresh → Case C)

---

## 6. Jump to Message (Search, Reply Click, Link)

When user clicks "go to message" (from search results, reply reference, or shared link):

1. Check if target message is in current cache:
   - **Yes** → smooth scroll to it, highlight with brief animation
   - **No** → continue to step 2
2. Clear current message cache for this chat
3. Fetch: `GET /messages?around={targetId}&limit=50`
4. Render messages, scroll so target is centered in viewport
5. Highlight target message (flash background color, fade after 2s)
6. Set `hasOlderMessages = true`, `hasNewerMessages = true`
7. User can now scroll both directions to load more

### After jumping
- Bidirectional scroll loading is active
- "↓" button shows with unread count if applicable
- If user scrolls back to bottom → resume normal tail behavior

---

## 7. Real-time Messages (WebSocket)

### New message arrives in current chat
- If user is pinned to bottom → append message, auto-scroll down
- If user is scrolled up → append message to cache (or increment unread counter on "↓" button), do NOT scroll
- If `hasNewerMessages = true` (user is in a historical section) → do NOT append, just update unread counter

### New message arrives in another chat
- Update `ChatListItem.lastMessage` and `unreadCount`
- Bump chat to top of list (unless pinned)
- If that chat has a message cache → append message to it (respecting 1000 limit)

### Message edited
- Find in cache by ID → update content, add `(edited)` marker
- If not in cache → ignore (will be correct when fetched)

### Message deleted
- Find in cache by ID → remove or replace with "message deleted" tombstone
- If not in cache → ignore

---

## 8. Unread Messages

### Tracking
- Server tracks `lastReadMessageId` per user per chat
- Client sends read receipt when:
  - Chat is open AND user is pinned to bottom → mark latest as read
  - Chat is open AND user scrolls down past unread messages → mark visible as read
  - Do NOT mark as read if app is minimized/unfocused

### Unread separator
- Thin line with label "── N unread messages ──" rendered between last read message and first unread
- Separator disappears once user scrolls past it and chat is marked as read
- On next chat open, separator is gone (messages are now read)

---

## 9. Virtual Scrolling

Since up to 1000 messages can be in memory, use virtual scrolling:
- Only render messages visible in viewport + buffer (e.g., ±20 messages)
- Measure and cache message heights after first render
- Estimate heights for unmeasured messages (use average height)
- Recalculate on window resize or content change (image load, embed expand)

---

## 10. Typing Indicators

- Show in chat area: "User is typing..." with animated dots, above the input box
- Show in chat list: replace `lastMessage` preview with "User is typing..." (italic)
- Multiple users: "Alice and Bob are typing...", 3+: "3 people are typing..."
- Expire after **5 seconds** of no typing event
- Send typing event on keydown, throttled to 1 event per 3 seconds

---

## 11. Draft Messages

- When user types in input but switches to another chat → save text as `draft`
- Draft persists in `ChatListItem` cache (memory only, not sent to server)
- When returning to chat → restore draft to input field
- Show draft preview in chat list: "Draft: ..." in orange/accent color
- Draft is cleared when message is sent

---

## 12. Edge Cases

| Scenario | Behavior |
|----------|----------|
| User opens chat with 3 messages total | Load all, `hasOlderMessages = false`, `hasNewerMessages = false` |
| User has slow connection | Show loading skeleton at top/bottom while fetching cursor |
| Fetch returns 0 messages | Set respective `has*Messages = false`, no UI change |
| User rapidly switches chats | Cancel in-flight requests for previous chat, prioritize current |
| WebSocket reconnect | Fetch messages since last cached ID to fill gap |
| Cache evicted while chat is open | Should not happen — current chat is always most-recently-used |
| Message references a deleted message | Show "Original message was deleted" in reply preview |
| User scrolls up, new messages arrive, then jumps to bottom | If gap > 50 messages, re-fetch latest 50 instead of loading all intermediates |

---

## 13. API Endpoints Summary

```
GET  /messages?chatId&before&limit        → older messages (scroll up)
GET  /messages?chatId&after&limit         → newer messages (scroll down)
GET  /messages?chatId&around&limit        → context around a message (jump)
GET  /messages?chatId&limit               → latest messages (initial load)
POST /messages/read                       → mark messages as read { chatId, messageId }
WS   message:new                          → real-time new message
WS   message:edit                         → real-time edit
WS   message:delete                       → real-time delete
WS   typing:start                         → user started typing
WS   typing:stop                          → user stopped typing
```

---

## 14. State Diagram

```
                    ┌─────────────┐
                    │  Chat Closed │
                    └──────┬──────┘
                           │ open chat
                    ┌──────▼──────┐
              ┌─────│  Has Cache? │─────┐
              │ yes └─────────────┘ no  │
              │                         │
       ┌──────▼──────┐          ┌───────▼───────┐
       │  Restore     │          │  Fetch Latest  │
       │  Scroll Pos  │          │  50 Messages   │
       └──────┬──────┘          └───────┬───────┘
              │                         │
       ┌──────▼─────────────────────────▼──────┐
       │           Chat Active                  │
       │                                        │
       │  ┌─ scroll up ──→ fetch older ─────┐  │
       │  │                                  │  │
       │  │  ← scroll down ── fetch newer ──┘  │
       │  │                                     │
       │  │  ← new WS message ── append/count  │
       │  │                                     │
       │  │  ← jump to msg ── fetch around ──┘ │
       └──────────────┬────────────────────────┘
                      │ switch chat
               ┌──────▼──────┐
               │ Save Scroll  │
               │ Save Draft   │
               │ Keep Cache   │
               └──────┬──────┘
                      │
               ┌──────▼──────┐
               │  Chat Closed │
               └─────────────┘
```
