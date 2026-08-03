# Echo client — architecture conventions

SvelteKit 5 (runes) + Tauri. Vanilla CSS with Svelte scoped styles — no Tailwind,
no CSS-in-JS.

The reference implementation of everything below is the voice-roles screen. When
in doubt, open these and copy their shape:

- `src/routes/chats/groups/[id]/voice/settings/roles/+page.svelte` — the page
- `src/lib/hooks/voice/useGroupVoiceSettings.svelte.ts` — the page's logic
- `src/lib/components/voice/VoiceRolesPanel.svelte` — the content component
- `src/lib/hooks/voice/useVoiceRoles.svelte.ts` — the content component's logic
- `src/lib/utils/voiceRoles.ts` — its pure helpers

## 1. A route page is a composition, not a screen

A `+page.svelte` should be a hook call and a handful of tags. No `$state`, no
fetching, no event handlers, usually no `<style>` block at all:

```svelte
<script lang="ts">
	import LoadState from '$lib/components/ui/LoadState.svelte';
	import PageColumn from '$lib/components/layouts/PageColumn.svelte';
	import { useGroupVoiceSettings } from '$lib/hooks/voice/useGroupVoiceSettings.svelte.js';

	const settings = useGroupVoiceSettings();
</script>

<PageColumn>
	<LoadState loading={settings.loading} error={settings.loadError}>
		<VoiceRolesPanel groupId={settings.groupId} />
	</LoadState>
</PageColumn>
```

- `PageColumn` (`$lib/components/layouts/`) owns the page's column, insets and
  header offset. Props: `gap`, `paddingTop`.
- `LoadState` owns the loading / error / empty triad. Props: `loading`,
  `loadingLabel`, `error`, `empty`, plus the content as children. Never hand-roll
  `{#if loading}…{:else if error}…` again.

## 2. Logic lives in hooks

`src/lib/hooks/<folder>/use*.svelte.ts`. A hook owns the `$state`, the
`$effect`s, the service calls and the handlers, and returns an object of
getters:

```ts
export function useThing(id: () => string) {
	let items = $state<Item[]>([]);
	// …
	return {
		get items() { return items; },
		get loading() { return loading; },
		set query(v: string) { query = v; },   // pairs where the view binds
		reload,
	};
}
```

- Route-bound hooks may read `page` from `$app/state` directly
  (`useGroupVoiceSettings`, `usePerschatLayout`). Reusable ones take their inputs
  as getters — `useThing(() => groupId)` — so they follow navigation without
  being re-created.
- Expose a `get`/`set` pair only for fields the markup binds; everything else is
  read-only.
- Bindings reach through the hook object: `bind:value={panel.createName}` works
  because the getter/setter pair is there.

Hooks are filed by domain, the same way components are (§6) — no loose files in
`hooks/`, and imports are always `$lib/hooks/<folder>/<name>.svelte.js`:

| Folder | What belongs there |
| --- | --- |
| `ui/` | Domain-free gestures and behaviours: `useDoubleTap`, `useDragReorder`, `useHoverPopup`, `useFullscreen`, `useCountdown`, `useSlidingPill`, `useEmojiEditor` |
| `auth/` | `useAuthGuard`, `usePhoneAuth`, `usePhoneField`, `usePasswordForm` |
| `chat/` | Both chat surfaces: panel, bubble, composer, history window, scroll, search, selection, drafts |
| `voice/` | Voice channels, roles, LiveKit tracks, screen-share volume |
| `audio/` | Attachment playback and microphone/device settings |
| `media/` | `useMediaGallery` |
| `user/` | Own profile and other people's: `useProfileForm`, `useProfileAvatar`, `usePrivacy`, `useUserProfile`, `useUserSearch` |
| `friends/` | `useFriends`, `useFriendRequests`, `useFriendship`, `useContactsList` |
| `groups/` | Group list, creation, info, invites, settings, moderation, membership |

A hook belongs to the domain whose screens it serves, not to the folder of the
component that happens to call it.

## 3. Pure helpers live in utils

`src/lib/utils/*.ts` — no runes, no I/O, no reactivity. Sorting, filtering,
permission bit maths, reordering, label formatting. These are the parts worth
unit-testing, so keep them free of Svelte (`voiceRoles.ts` is the model).

## 4. Type and colour are composed in the markup

Component CSS must not set `font-size`, `font-weight`, `line-height` or `color`.
Compose the classes instead:

```svelte
<p class="body-sm text-error">{error}</p>
<h2 class="heading-md fw-semibold">{title}</h2>
```

- Type: `src/lib/styles/fonts.css` (`heading-*`, `body-*`, `fw-*`, `overline`).
- Colour: `src/lib/styles/utilities.css` (`text-muted`, `text-faint`,
  `text-accent`, `text-error`). Add a class there when one is missing rather than
  writing `color:` in a component.
- A scoped rule that existed only to set a colour should be deleted, not emptied.

Backgrounds, borders and surface treatments stay in CSS — use the mixins:
`glass.mixin` (`glass`, `glass-less`, `glass-modal`), `modal.mixin`,
`button.mixin` (`button-*`, `context-item`), `layout.mixin` (`flex-center`),
`bubble.mixin` (`bubble-content`, `bubble-row` — shared by the settled message
and the one still uploading, which must not differ).

## 5. Everything repeated is a component

No bespoke `<button class="btn …">`, no hand-rolled modal chrome, no second
implementation of a card. Reach for the existing ones:

| Need | Component |
| --- | --- |
| Button / icon button | `Button` (`variant`: primary, secondary, ghost, dashed, danger), `ButtonIcon` |
| Text field | `Input`, `Textarea`, `TextField` |
| Label / control / hint stack | `Field` (`variant`: page \| compact, plus `note`, `hint`, `for`) |
| Dialog shell | `Modal` (`layout`: form \| alert, `tone`, `closeDisabled`) |
| Yes/no question | `confirm()` from `$lib/stores/confirm.svelte.js` — never a local dialog |
| Transient message | `toasts.error()` / `.info()` from `$lib/stores/toasts.svelte.js` |
| Load/error/empty | `LoadState` |
| Page shell | `layouts/PageColumn` |
| Small pieces | `Avatar`, `Chip`, `Pill`, `Badge`, `Checkbox`, `Loading`, `SectionHeader`, `TitleIcon`, `ColorSwatches`, `BlockWrapper` |

`confirm()` and `toasts` are rendered once by `ConfirmHost` / `ToastHost` in the
root layout. Callers own no dialog state:

```ts
if (await confirm({ title, message: t.x.deleteBody(name), tone: 'danger', requireText: name })) {
	await service.remove(id);
}
```

## 6. Components are filed by domain

`src/lib/components/` has no loose files — every component lives in the folder
that matches what it is about. Import paths are always absolute
(`$lib/components/<folder>/<Name>.svelte`), never relative, even between
siblings.

| Folder | What belongs there |
| --- | --- |
| `ui/` | Domain-free primitives: `Button`, `Input`, `Field`, `Modal`, `LoadState`, `Toast`, `Switch`, `Chip`… |
| `layouts/` | Page and app shells: `PageColumn`, `SideBar/`, `Header`, `MobileHeader`, `AppBars` |
| `sidebar/` | The sidebars themselves and their rows: `Sidebar`, `SidebarItem`, `AllChatsSidebar`, `SidebarVoice*` |
| `chat/` | Messaging surface: panels, bubbles, composer, reply/forward, selection, context menu |
| `emoji/` | `AppleEmoji`, `EmojiPicker`, reaction chips and pickers |
| `media/` | Attachments, previews, grids, gallery, `MediaViewer` |
| `audio/` | Player bar, waveform, voice messages, recorder |
| `voice/` | Voice channels: stage, tiles, roles, categories, screen share |
| `call/` | 1:1 calls: `CallDock`, `CallScreen`, `IncomingCallModal` |
| `user/` | Avatars, profile cards and panels, status, user pickers |
| `friends/` | Friend rows and friend actions |
| `groups/` | Group creation, invites, member and group rows |
| `settings/` | `SettingRow`, `SettingsBlock` |

A component used by two domains belongs in `ui/` if it is generic, otherwise it
stays with the domain that owns its behaviour.

## 7. Size limits

A component over ~250 lines is a refactor waiting to happen. Split it:
one component per visual unit (`VoiceRoleRow`, `CreateRoleModal`,
`RoleMemberPickerModal`), each owning the state that dies with it — a modal's
draft belongs to the modal, not to the parent's hook.

Sizes are tokens, not literals: `var(--sp-*)`, `var(--radius-*)`,
`var(--header-h-padding-*)`, `var(--count-badge-size)`, `var(--z-*)`. Add a token
to `tokens.css` rather than repeating a magic number.

## Checks

`npm run check` must not add errors or warnings. The baseline is **1 error, 0
warnings**: `SettingsSidebar` links to `/profile/notifications`, a page nobody
has written yet. Anything else is yours.

`npm run build` passes end to end, prerender crawl included. See
`REFACTORING.md` for what the project still owes.
