# Push notifications — the Mac half

Everything on the server is finished and tested. What is missing is the part
that can only be built on macOS: the iOS app has no way to ask Apple for a
device token yet, so `device_tokens` is never populated and nothing has an
address to be delivered to.

This is the checklist for closing that gap. Work through it in order — each part
is testable on its own, and parts 1 and 2 are worth doing first because they are
the only ones with an external dependency.

## What already exists

`echo-server/services/push-service` (`:3009`) consumes the same NATS streams
`ws-gateway` reads and turns DMs, group messages, friend requests, accepted
requests and group invites into APNs notifications. It suppresses anything for a
user whose app is currently connected, and never notifies the author of their
own group message. Both rules are verified end to end.

Two endpoints are live behind the gateway:

| Endpoint | Body |
|---|---|
| `POST /push/devices` | `{ token, platform: 'ios' \| 'android', environment: 'sandbox' \| 'production' }` |
| `DELETE /push/devices/:token` | — |

Without APNs credentials the service registers devices normally and logs
`APNs not configured — notification dropped` instead of sending. That line is
how you know the pipeline reached its last step. See
`echo-server/services/push-service/README.md` for the server side.

So the remaining work is: get a token from Apple, POST it to that endpoint, and
give the server the credentials to send with.

---

## Part 1 — Apple Developer portal

Needs a **paid** Apple Developer Program membership. The free personal team
cannot enable push at all, which is the one thing worth checking before starting.

1. **Certificates, Identifiers & Profiles → Identifiers →** the App ID for
   `com.evgenij.echo` → enable **Push Notifications** → Save.

   The identifier comes from `src-tauri/tauri.conf.json` (`identifier`). Note the
   broadcast extension (`com.evgenij.echo.broadcast`) is a separate App ID and
   does **not** need push.

2. **Keys → +** → name it something like "Echo APNs" → tick **Apple Push
   Notifications service (APNs)** → Continue → Register → **Download**.

   You get a `AuthKey_XXXXXXXXXX.p8`. **Apple lets you download it exactly
   once.** Put it somewhere safe and outside this repo immediately.

3. Write down three values:
   - **Key ID** — the ten characters in the key's filename, also shown on its page
   - **Team ID** — top right of the developer portal, next to your account name
   - **Bundle ID** — `com.evgenij.echo`

4. Hand them to the server. In `echo-server/.env` (which is gitignored):

   ```
   APNS_KEY_PATH=/absolute/path/to/AuthKey_XXXXXXXXXX.p8
   APNS_KEY_ID=XXXXXXXXXX
   APNS_TEAM_ID=YYYYYYYYYY
   APNS_BUNDLE_ID=com.evgenij.echo
   ```

   Restart push-service and check it: `curl localhost:3009/health` should report
   `"apns":"configured"`.

> **Do not commit the `.p8` and do not paste its contents into chat or a ticket.**
> Anyone holding it can send notifications to every install of the app until the
> key is revoked.

## Part 2 — Entitlements

An app cannot register for remote notifications without the `aps-environment`
entitlement, and the failure mode is a runtime error rather than a build error,
so it is easy to miss.

Add it to **`src-tauri/ios/app.entitlements`**, which already exists for the App
Group:

```xml
<key>aps-environment</key>
<string>development</string>
```

`development` is correct for `tauri ios dev` and for a device build signed with a
development profile. A TestFlight or App Store build needs `production` — Xcode
substitutes it automatically when archiving with a distribution profile, so the
literal string in the file is the debug value.

**This survives regeneration, and that is not an accident.** `src-tauri/gen/` is
wiped and rebuilt by `tauri ios init`, but `scripts/ios-postinit.mjs` already
points the app target's `CODE_SIGN_ENTITLEMENTS` at `../../ios/app.entitlements`,
which is tracked. Nothing extra is needed here — but if you ever find the
entitlement missing after an init, that setting is the thing to check.

You do **not** need `UIBackgroundModes: remote-notification` in
`src-tauri/Info.ios.plist`. That is for *silent* pushes that wake the app to do
work. Ordinary alert notifications, which is all this sends, are displayed by
iOS itself with the app suspended.

## Part 3 — The native plugin

The webview cannot reach APNs; only native code can. Build a Tauri plugin the
same shape as the screenshare one, which is a working reference for every piece
of the wiring.

### Create `src-tauri/plugins/push/`

Mirror `src-tauri/plugins/screenshare/` file for file:

```
push/
├── Cargo.toml               # needs `links = "tauri-plugin-push"`
├── build.rs                 # COMMANDS list + .ios_path("ios")
├── permissions/default.toml # allow-* entries for each command
├── ios/
│   ├── Package.swift        # depends on the generated ../.tauri/tauri-api
│   └── Sources/PushPlugin.swift
└── src/
    ├── lib.rs               # Builder::new("push"), invoke_handler, setup
    ├── commands.rs
    ├── error.rs
    ├── ios.rs               # tauri::ios_plugin_binding!(init_plugin_push)
    └── stub.rs              # desktop/dev no-op
```

Two commands are enough:

- `request_permission()` → `bool` — prompts, then registers for remote
  notifications; resolves false if the user declines
- `get_token()` → `String | null` — the APNs token as hex, once it has arrived

Also expose whether this is a debug build, so the client can send the right
`environment`; `cfg!(debug_assertions)` on the Rust side is the simplest source
of truth and avoids guessing in TypeScript.

### Register it

Three places, all mirroring `screenshare`:

- `src-tauri/Cargo.toml` — `tauri-plugin-push = { path = "plugins/push" }`
- `src-tauri/src/lib.rs` — `.plugin(tauri_plugin_push::init())`
- `src-tauri/capabilities/default.json` — add `"push:default"` to `permissions`

Forgetting the capability entry is the classic one: the plugin builds, the
command exists, and every call fails at runtime with a permissions error.

### Getting the token out of Swift

The prompt and the registration call are straightforward:

```swift
UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound]) { granted, _ in
    guard granted else { return }
    DispatchQueue.main.async { UIApplication.shared.registerForRemoteNotifications() }
}
```

The awkward part is that the token does not come back to your plugin. It arrives
at the **app delegate**, in
`application(_:didRegisterForRemoteNotificationsWithDeviceToken:)` — and Tauri
generates and owns the app delegate.

Two ways round it, in the order I would try them:

1. **Check whether the pinned Tauri Swift API forwards it.** Look in
   `src-tauri/gen/apple/.tauri/tauri-api` (present after `tauri ios init`) for
   app-delegate forwarding or a notification the `Plugin` base class posts. If it
   exists, use it — nothing below is needed. I could not verify this from
   Windows, so treat it as the first thing to check rather than as a known gap.

2. **Intercept it the way this repo already intercepts UIKit.**
   `src-tauri/ios/EchoInputAccessory.m` removes the keyboard accessory bar
   app-wide by patching UIKit from a file that `scripts/ios-native.sh` copies
   into the generated project before xcodegen runs. The same channel works here:
   add a file to `src-tauri/ios/` that swizzles the delegate method, and hand the
   token to the plugin (a notification through `NotificationCenter` keeps the two
   halves decoupled).

   `ios-native.sh` currently copies only `*.m`. If you write Swift instead of
   Objective-C, widen that glob — and see `IOS_KEYBOARD_ACCESSORY.md`, which
   documents the same pattern in more depth.

Convert the token to hex before returning it; APNs addresses devices by the hex
string, and `Data.description` is not it:

```swift
let hex = deviceToken.map { String(format: "%02x", $0) }.joined()
```

## Part 4 — The TypeScript side

Small, and it follows the conventions in `CLAUDE.md`.

**`src/lib/api/pushService.ts`** — two calls against the gateway, using the
existing client so the auth header and `API_URL` come for free:

```ts
export function registerDevice(token: string, environment: 'sandbox' | 'production') { … }
export function unregisterDevice(token: string) { … }
```

**`src/lib/hooks/auth/usePushRegistration.svelte.ts`** — a hook owning the
sequence: wait for auth, ask permission, get the token, POST it. Mount it once
from `src/routes/+layout.svelte` next to `useAuthGuard()` and
`useKeyboardDismiss()`.

Register on **every launch**, not only the first. APNs rotates tokens on
reinstall, on restore-from-backup and occasionally on its own, and re-reading is
the only way to notice. The endpoint upserts on the token, so repeating it is
free.

**`src/lib/stores/auth.svelte.ts`** — call `unregisterDevice` from `logout()`,
alongside the existing `personalChatsStore.reset()`. Otherwise the phone keeps
receiving notifications for an account that is no longer signed in on it.

Guard all of it with the existing `isTauri` check from `$lib/api/client.js` and a
platform check — there is no plugin in a browser, and the desktop stub returns
false.

## Part 5 — Testing

**A real device is required.** The Simulator cannot obtain an APNs token.
(`xcrun simctl push` can fake a *payload* into the Simulator, which is useful for
checking how a banner looks, but it exercises none of this pipeline.)

1. Start infra and services: `pnpm dev:full` in `echo-server`.
2. `npm run ios:dev` with the device connected. Accept the notification prompt.
3. Confirm the token reached the server:

   ```sh
   docker compose exec postgres psql -U echo -d echo_push -c "select user_id, platform, environment, left(token, 12) from device_tokens;"
   ```

   No row means the problem is in parts 3–4, and nothing after this will work.
4. **Background the app** — press the home button, do not just switch screens.
   A connected app is deliberately not notified.
5. From another account, send a DM to the signed-in user.
6. A banner should appear. In the push-service log you should see the send
   rather than `APNs not configured — notification dropped`.

If step 6 logs an APNs rejection, the two that account for nearly everything are
`BadDeviceToken` (sandbox/production mismatch — see below) and
`TopicDisallowed` (`APNS_BUNDLE_ID` does not match the App ID with push enabled).

## Gotchas

- **Sandbox and production are different worlds.** A token from a development
  build only exists in APNs' sandbox; sending it to the production host returns
  `BadDeviceToken`, and vice versa. A **TestFlight build uses production APNs**
  even though it feels like testing — this is the single most common way to lose
  an afternoon. The client reports which build it is via `environment`, and the
  server picks the host per token, so this only bites if the client reports it
  wrong.
- **The permission prompt appears once per install.** To see it again, delete the
  app from the device. To check what the user chose without prompting, read
  `UNUserNotificationCenter.current().getNotificationSettings`.
- **Notifications are silently dropped while the app is connected.** If you are
  testing and nothing arrives, confirm the app is actually backgrounded before
  suspecting the pipeline.
- **Message previews are off by default.** Banners say who wrote, not what,
  because messages are encrypted at rest and a preview would hand the plaintext
  to Apple. Set `PUSH_MESSAGE_PREVIEW=true` server-side if you want them — it is
  a product decision, not a bug.
- **`src-tauri/gen/` is disposable.** Anything hand-written there is lost on the
  next `tauri ios init`. Native sources belong in `src-tauri/ios/` and project
  changes in `scripts/ios-postinit.mjs`.
- **Group banners are titled with the sender, not the group**, because
  `GroupMessageEvent` carries only `groupId`. Fixing it properly means adding
  `groupName` to the event in groups-service.

## Still out of scope

- **Android/FCM.** There is no Android target in this project yet, and tokens
  registered with `platform: 'android'` are stored but skipped at send time.
- **Localisation.** Copy is English-only. A push arrives as finished text, so it
  has to be translated server-side, which means the server needs to know each
  user's language.
- **Badge counts.** Nothing sets `aps.badge`; that needs a per-user unread total
  the push service does not currently compute.
- **Tap-to-navigate.** Each notification carries `type` and the relevant id in
  its payload, so the data is there — but nothing reads it on launch yet.
