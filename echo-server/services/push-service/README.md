# push-service (`:3009`)

Turns the events that already flow through NATS into phone notifications for
users whose app isn't connected.

It is a second reader of the streams `ws-gateway` consumes, under its own
durable consumer names (`push-dm`, `push-friends`, `push-groups`). `ws-gateway`
is untouched, and the two delivery paths cannot drift because they are fed by
the same messages.

| Endpoint | Description |
|---|---|
| `POST /push/devices` | Register this install: `{ token, platform: ios\|android, environment: sandbox\|production }` |
| `DELETE /push/devices/:token` | Unregister — call on sign-out |
| `GET /health` | Also reports whether APNs credentials are present |

## What produces a notification

DM messages, group messages, friend requests, accepted friend requests, and
group invites. Edits, reactions, read receipts, typing, presence, voice-channel
churn and server-written system messages ("X joined the group") stay silent.

Two rules do most of the work:

- **Never notify a connected app.** Before sending, the service asks
  `ws-gateway` at `GET /internal/presence/:userId` whether the user has a live
  socket. If they do, the app has already rendered the event and a banner would
  be the same news twice. This deliberately does *not* use the `echo.presence.*`
  NATS events — those are filtered by each user's online-status privacy, so
  someone hiding their presence is published as offline while still connected,
  and would be notified twice.
- **Never notify the author.** `GroupMessageEvent.targetUserIds` is the whole
  member list, sender included.

## Running without Apple credentials

This is the normal state until someone enrols in the Apple Developer Program.
With any of `APNS_KEY_PATH`, `APNS_KEY_ID`, `APNS_TEAM_ID` or `APNS_BUNDLE_ID`
missing, device registration still works and every notification is logged
instead of sent:

```
INFO (push-service): APNs not configured — notification dropped
    userId: "…", devices: 1, title: "Alice"
```

That line is the end-to-end proof that the pipeline works; only the last hop is
stubbed.

## Enabling APNs

1. Enrol in the Apple Developer Program (paid).
2. Certificates, Identifiers & Profiles → **Identifiers** → your App ID → enable
   **Push Notifications**.
3. **Keys** → create a key with APNs enabled → download the `.p8`. Apple lets
   you download it **once**. Note the Key ID shown next to it, and the Team ID
   from the top right of the portal.
4. Set the env vars. `APNS_BUNDLE_ID` is the app's bundle identifier, and
   `APNS_KEY_PATH` points at the `.p8`:

   ```
   APNS_KEY_PATH=/run/secrets/apns.p8
   APNS_KEY_ID=ABCD123456
   APNS_TEAM_ID=EFGH789012
   APNS_BUNDLE_ID=com.example.echo
   ```

   The `.p8` is a private credential. Mount it from outside the repo, never
   commit it, and don't paste its contents anywhere.

**Sandbox vs production is not a flag.** A device token minted by a development
build exists only in APNs' sandbox; sending it to the production host returns
`BadDeviceToken`. The client reports which build it is via `environment` on
registration, and the service picks the host per token. Tokens APNs disowns
(`410 Unregistered`, `BadDeviceToken`) are deleted rather than retried forever.

## Message previews

Off by default (`PUSH_MESSAGE_PREVIEW`). Messages are encrypted at rest via
`MESSAGE_ENCRYPTION_KEY`; a preview would hand their plaintext to Apple's
servers and to anyone reading the lock screen. With it off, a banner says who
wrote rather than what.

## Manual checks

With local infra and `ws-gateway` up:

```
pnpm --filter @echo/push-service exec tsx scripts/smoke.ts
pnpm --filter @echo/push-service exec tsx scripts/smoke-suppression.ts
```

The first registers devices and publishes one of each event; the second proves a
DM is suppressed while the user is connected and delivered once they aren't.
Both assert by what appears in the service log.

## Not done yet

- **The client half.** Nothing calls `POST /push/devices`, because getting an
  APNs token needs a native Tauri plugin (Swift: `requestAuthorization`, then
  `registerForRemoteNotifications`, then hand the token to JS) plus the Push
  Notifications capability and `aps-environment` entitlement in
  `src-tauri/gen/apple`. Note that `tauri ios init` regenerates that directory,
  so the entitlement has to survive a regen the way `scripts/ios-postinit.mjs`
  already handles other post-init fixes.
- **Android.** Tokens with `platform: 'android'` are stored and skipped at send
  time; FCM is a separate integration.
- **Localisation.** Copy is English-only. A push arrives as finished text, so
  translation has to happen here, which means the server needs to know each
  user's language.
- **Group names.** `GroupMessageEvent` carries only `groupId`, so a group banner
  is titled with the author. Adding `groupName` to the event in groups-service
  is the cheaper fix than a group cache here.
- **Badge counts.** The payload sets no `badge`; that needs a per-user unread
  total this service doesn't currently compute.
