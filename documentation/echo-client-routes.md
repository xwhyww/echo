# Echo Client — Routes & Pages

## Route Tree

```
/                           — Home (welcome message)
/login                      — Login page
/register                   — Registration page
/chats/
  +layout.svelte            — Chat section wrapper (Escape key handler)
  perschat/
    +page.svelte            — Empty state ("Select a chat")
    [id]/
      +page.svelte          — Chat thread (main messaging UI)
      info/
        +page.svelte        — Chat info (stats, avatar carousel)
      media/
        +page.svelte        — Media gallery (photos, videos, gifs, files, links)
/friends/
  +layout.svelte            — Friends section wrapper (useFriends context)
  +page.svelte              — Friends list
  incoming/
    +page.svelte            — Incoming friend requests
  outgoing/
    +page.svelte            — Outgoing friend requests
/profile/
  +layout.svelte            — Profile section wrapper
  +page.svelte              — Account settings (avatar, form)
  privacy/
    +page.svelte            — Privacy settings (6 toggles)
/user/
  [id]/
    +page.svelte            — Public user profile
/ui                         — Design system preview
```

## Root Layout: `/`

**File:** `src/routes/+layout.svelte`

Main application shell. Provides multi-panel layout with navigation sidebars (`Sidebar`, `ChannelSidebar`, `FriendsSidebar`, `SettingsSidebar`). Uses `useAuthGuard` to show auth pages for unauthenticated users vs full app layout for authenticated ones. Three-panel responsive design with collapsible sidebars.

## Auth Routes

### `/login`

Login form with email and password fields, password visibility toggle. Uses `useLogin` hook. Link to register page.

**Components:** Button, Input, ErrorAlert

### `/register`

Registration form: email, username, display name (optional), phone (optional), password. Uses `useRegister` hook.

**Components:** Button, Input, PhoneInput, ErrorAlert

## Chat Routes

### `/chats/perschat`

Empty state page before selecting a chat. Shows "Select a chat to start messaging".

### `/chats/perschat/[id]`

Full messaging interface for 1-to-1 conversations. The most complex page in the app.

**Features:**
- Message list with read receipts and unread separator
- Typing indicators
- Message composition with emoji picker and file attachments
- Reply, edit, forward, delete messages
- Bulk message selection and deletion
- Pinned messages bar
- Friendship status buttons (Add Friend, Accept/Decline)
- Privacy messaging restrictions
- @mention clicking with user navigation
- Media viewing (images, videos)
- Pending upload bubbles with progress

**Components:** ChatBubble, TextField, EmojiPicker, PinnedMessagesBar, FilePreviewModal, MediaViewer, ReplyPreview, ForwardPicker, PendingMessage, Toast, UndoBar

**State:** `usePersonalChat()`, `useFriendship()`

### `/chats/perschat/[id]/info`

Chat information panel. Shows companion's avatar carousel (navigable with arrows/dots), clickable stat rows (messages, photos, videos, files, links, GIFs). Links to media gallery page. Self-chat labeled "Notes".

**Components:** Avatar, Button

### `/chats/perschat/[id]/media`

Browsable media gallery with tabs: photos (grid), videos (grid with play overlay), GIFs (grid), files (list with size), links (list with date). Infinite scroll via IntersectionObserver. Query param: `?kind=photos|videos|gifs|files|links`.

**Components:** MediaViewer

## Friends Routes

### `/friends`

All confirmed friends in a scrollable list. Each card shows avatar, display name, username, online status. Actions: Message (navigates to chat), Remove (with undo bar). Click card to view profile.

**Components:** SidebarItem, Button, UndoBar

### `/friends/incoming`

Incoming friend requests with Accept/Decline buttons per request.

**Components:** SidebarItem, Button

### `/friends/outgoing`

Outgoing friend requests with Cancel button per request.

**Components:** SidebarItem, Button

## Profile Routes

### `/profile`

Account settings. Avatar management via AvatarCarousel (upload, crop, select, delete, clear). Form: email (readonly), username (readonly), display name, phone, status. Uses `useProfileAvatar` and `useProfileForm` hooks.

**Components:** Button, Input, PhoneInput, AvatarCarousel, AvatarCropModal, ErrorAlert, SuccessAlert

### `/profile/privacy`

Six privacy toggle groups with pill buttons (Everyone / Friends / Nobody):
- Online status visibility
- Phone visibility
- Email visibility
- Messaging permissions (Everyone / Existing chats only)
- Profile visibility
- Photo visibility

Uses `usePrivacy` hook.

## User Routes

### `/user/[id]`

Public user profile. Avatar carousel, status, online indicator, display name, username. Copiable fields (ID, email, phone) shown based on privacy. Action buttons adapt to friendship state (Message, Add Friend, Accept/Decline, Edit Profile if self). Undo bar for friend removal.

**Components:** Avatar, Button, Copiable, UndoBar

## Design System

### `/ui`

Preview page showcasing color palette, typography, button variants, input, badges, and status indicators.

**Components:** Button, Badge, Status, Input
