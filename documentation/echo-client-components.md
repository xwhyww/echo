# Echo Client — Components, Stores, Hooks, API, Utils

## Components

`src/lib/components/` — components are filed by domain into subfolders:
`ui/`, `layouts/`, `sidebar/`, `chat/`, `emoji/`, `media/`, `audio/`, `voice/`,
`call/`, `user/`, `friends/`, `groups/`, `settings/`. See
`echo-client/CLAUDE.md` §6 for what belongs where.

| Component | Description |
|-----------|-------------|
| `Accordion.svelte` | Expandable/collapsible content panel |
| `Avatar.svelte` | User avatar with photo or colored initials fallback. 18-color palette. |
| `AvatarCarousel.svelte` | Horizontally scrollable avatar list with upload, select, delete, clear actions |
| `AvatarCropModal.svelte` | Modal with Cropper.js for square-cropping avatar images (circular preview, square output) |
| `Badge.svelte` | Notification badge (numeric or mention dot) |
| `Button.svelte` | Button with variants: primary, secondary, ghost, disabled |
| `ButtonIcon.svelte` | Icon-only button variant |
| `ChannelSidebar.svelte` | Left sidebar for channel navigation (placeholder for future feature) |
| `ChatBubble.svelte` | Chat message bubble with avatar, text, attachments (images/videos/files), reply preview, forwarded header, pins, context menu |
| `Copiable.svelte` | Text block with click-to-copy functionality |
| `EmojiPicker.svelte` | Emoji selection popover for message composition |
| `ErrorAlert.svelte` | Red error banner with message |
| `FilePreviewModal.svelte` | Modal preview for file attachments before sending |
| `ForwardPicker.svelte` | Modal to select a user/chat to forward messages to |
| `FriendsSidebar.svelte` | Left sidebar for /friends section with nav links (All, Incoming, Outgoing) |
| `Input.svelte` | Styled text input component |
| `MediaViewer.svelte` | Full-screen overlay for viewing images/videos with navigation |
| `MessageTime.svelte` | Formatted timestamp display for messages |
| `PendingMessage.svelte` | Chat bubble shown during file upload with progress ring, cancel, retry |
| `PhoneInput.svelte` | Phone number input with formatting |
| `PinnedMessagesBar.svelte` | Collapsible bar showing pinned messages in a chat |
| `ReplyPreview.svelte` | Inline preview of the message being replied to |
| `SettingsSidebar.svelte` | Left sidebar for /profile section with nav links (Account, Privacy) |
| `Sidebar.svelte` | Main navigation sidebar with chat list, search, user menu |
| `SidebarItem.svelte` | Row item in sidebars showing avatar, name, status, optional actions |
| `Status.svelte` | Online status indicator dot (online, idle, dnd, offline) |
| `SuccessAlert.svelte` | Green success banner with message |
| `TextField.svelte` | Multi-line text input for message composition with attachment support |
| `Toast.svelte` | Temporary notification toast |
| `UndoBar.svelte` | Bottom bar with undo action (used for friend removal, message deletion) |
| `UserInfo.svelte` | User profile card display |
| `UserMenu.svelte` | Dropdown menu from user avatar in sidebar |
| `UserSearch.svelte` | User search input with results dropdown |
| `layouts/SideBar/index.svelte` | Shared sidebar layout wrapper |

## Stores

`src/lib/stores/`

| Store | Description |
|-------|-------------|
| `auth.svelte.ts` | Current user session: `user`, `token`, `isAuthenticated`, `loading`. Handles login/logout/init from localStorage. |
| `friends.svelte.ts` | Friends list and friend request state. Tracks accepted friends, incoming/outgoing requests. |
| `personalChats.svelte.ts` | Chat list state: all personal chats, unread counts, search, cursor pagination. |
| `sidebar.svelte.ts` | Active sidebar tracking (`activeSidebar` context for layout switching). |
| `typing.svelte.ts` | Typing indicator state per chat. Tracks who is currently typing. |
| `uploads.svelte.ts` | Upload task queue: tracks file uploads with progress, status (uploading/processing/failed), cancel/retry. Client-side dedup via hash check. |
| `ws.svelte.ts` | WebSocket connection management. Connects to ws-gateway, handles reconnection, dispatches incoming events to stores. |

## Hooks

`src/lib/hooks/` — hooks are filed by domain into subfolders: `ui/`, `auth/`,
`chat/`, `voice/`, `audio/`, `media/`, `user/`, `friends/`, `groups/`. See
`echo-client/CLAUDE.md` §2 for what belongs where.

| Hook | Description |
|------|-------------|
| `useAuthGuard.svelte.ts` | Redirects unauthenticated users to /login. Guards protected routes. |
| `useFriends.svelte.ts` | Loads and manages friends/requests for the /friends layout context. |
| `useFriendship.svelte.ts` | Tracks friendship status with a specific user (for chat headers, profile pages). |
| `useLogin.svelte.ts` | Login form state: email, password, submitting, error. Calls auth API. |
| `usePerschatLayout.svelte.ts` | Layout state for the personal chat section. |
| `usePersonalChat.svelte.ts` | Full chat state for a single conversation: messages, pagination, sending, editing, replying, forwarding, pinning, uploads, read receipts. |
| `usePersonalChats.svelte.ts` | Chat list management: load chats, search, handle real-time updates from WebSocket. |
| `usePrivacy.svelte.ts` | Privacy settings form state. Loads and saves all six privacy fields. |
| `useProfileAvatar.svelte.ts` | Avatar management on /profile: upload, crop, select, clear, delete. |
| `useProfileForm.svelte.ts` | Profile form state: displayName, phone, status. Submit handler. |
| `useRegister.svelte.ts` | Registration form state: all fields, submitting, error. Calls auth API. |
| `useUserSearch.svelte.ts` | Debounced user search with results state. |

## API Modules

`src/lib/api/`

| Module | Description |
|--------|-------------|
| `auth.ts` | Auth endpoints: register, login, getMe, updateMe, avatar CRUD. Types: `User`, `Avatar`. |
| `client.ts` | Base HTTP client (`api()`, `apiUpload()`, `apiUploadWithProgress()`). Token injection, error handling, `resolveUrl()` for file URLs. |
| `friendsService.ts` | Friends endpoints: request, accept, decline, remove, cancel, status checks, bulk status. |
| `personalChats.ts` | Type definitions: `PersonalChat`, `PersonalMessage`, `Attachment`, `ForwardedFrom`, `PersonalChatUser`. |
| `personalChatsService.ts` | Chat endpoints: CRUD, messages, send, forward, edit, delete, batch-delete, pins, stats, media, upload, checkAttachments. |
| `privacyService.ts` | Privacy endpoints: getPrivacy, updatePrivacy. |
| `userService.ts` | User endpoints: search, getById, bulk fetch. |

## Utils

`src/lib/utils/`

| Module | Description |
|--------|-------------|
| `compressImage.ts` | Client-side image compression (Canvas API -> WebP, max 2048px). `compressImage()`, `compressFiles()`, `hashFile()` (SHA-256 for dedup). |
