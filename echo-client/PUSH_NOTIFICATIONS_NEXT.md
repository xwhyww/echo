# Push notifications — what is left, and who does it

`PUSH_NOTIFICATIONS.md` is the implementation checklist. Parts 2, 3 and 4 of it
are now written; this is what stands between that code and a banner on the
phone.

The whole thing reduces to one blocker, and it is not a code problem.

## Where it stands

| Part | State |
|---|---|
| Server (`push-service`, `:3009`) | Done before this work started |
| Part 1 — portal, APNs key, server credentials | **Not started — yours** |
| Part 2 — `aps-environment` entitlement | Written, **commented out** (see below) |
| Part 3 — native plugin (Rust + Swift) | Done |
| Part 4 — TypeScript (service, hook, logout) | Done |
| Part 5 — testing on a device | Blocked on Part 1 |

### The blocker

The signing team `VWRA297FY6` is a **personal** (free) team. Apple refuses the
capabilities at signing time:

```
Cannot create a iOS App Development provisioning profile for "com.evgenij.echo".
Personal development teams, including "Евгений Алексеев", do not support the
Push Notifications capability.

Provisioning profile "iOS Team Provisioning Profile: com.evgenij.echo"
doesn't support the group.com.evgenij.echo App Group.
```

Note the second line. This is **not only a push problem** — the same membership
gates the App Group, which is how the ReplayKit broadcast extension hands frames
to the app. So a paid membership is what makes *screen sharing* work too.

That was hidden until now for an unhappy reason. Tauri's xcodegen template
declares an `entitlements:` node for the app target, and xcodegen generates an
empty `<dict/>` from it and points `CODE_SIGN_ENTITLEMENTS` there — beating the
`settings.base` value `scripts/ios-postinit.mjs` sets. Every build was therefore
signed asking for *nothing*, which is why nothing was ever refused, and why
screen share would have failed silently on the device. `ios-postinit.mjs` now
deletes that node, so the tracked `src-tauri/ios/app.entitlements` is the only
one in play.

Because that made builds fail immediately, both entries in that file are
commented out for now. **Uncommenting them is the entire re-enable step.**

---

## Your part

Nothing here can be done from this machine — it is all account and server work.

### 1. Enrol in the Apple Developer Program

<https://developer.apple.com/programs/> — $99/year. Approval is usually hours,
occasionally a couple of days.

This is the only step that unblocks anything. Do not bother with the rest until
the membership is active.

### 2. Enable the capabilities on the App IDs

**Certificates, Identifiers & Profiles → Identifiers.**

| App ID | Needs |
|---|---|
| `com.evgenij.echo` | **Push Notifications**, **App Groups** (`group.com.evgenij.echo`) |
| `com.evgenij.echo.broadcast` | **App Groups** (same group). No push. |

Create the group itself under **Identifiers → App Groups** if it is not offered
in the list. The identifier must be exactly `group.com.evgenij.echo` — it is
hardcoded in both entitlements files and in `Info.ios.plist`
(`RTCAppGroupIdentifier`), and LiveKit finds the shared container by that name.

### 3. Create the APNs key

**Keys → +** → name it "Echo APNs" → tick **Apple Push Notifications service
(APNs)** → Continue → Register → **Download**.

> **Apple lets you download the `.p8` exactly once.** Put it somewhere safe and
> outside this repo immediately. Anyone holding it can send notifications to
> every install of the app until the key is revoked — do not commit it, and do
> not paste its contents into a chat or a ticket.

Write down three values:

- **Key ID** — the ten characters in the filename, also on the key's page
- **Team ID** — top right of the portal (`VWRA297FY6` today; confirm it does not
  change when the membership converts)
- **Bundle ID** — `com.evgenij.echo`

### 4. Give the server the credentials

Your client `.env` points at the deployed backend
(`VITE_API_URL=https://api.echo-application.ru`), **not** a local stack. So these
go on the deployment, not on this Mac:

```
APNS_KEY_PATH=/absolute/path/to/AuthKey_XXXXXXXXXX.p8
APNS_KEY_ID=XXXXXXXXXX
APNS_TEAM_ID=VWRA297FY6
APNS_BUNDLE_ID=com.evgenij.echo
```

Restart `push-service` and check it:

```sh
curl localhost:3009/health   # expect "apns":"configured"
```

Until this is done the service registers devices normally and logs
`APNs not configured — notification dropped` instead of sending. That line is
how you know the pipeline reached its last step.

### 5. Tell me it is done

Say so, and confirm the Team ID. That is the whole handoff.

---

## My part, once yours is done

In order, and each step is verifiable rather than assumed:

1. **Re-enable the entitlements.** Uncomment both blocks in
   `src-tauri/ios/app.entitlements`. No project regeneration is needed — the path
   is unchanged and already tracked.

2. **Rebuild, and check the signature rather than the exit code.** The lesson
   from this round is that a green build proved nothing:

   ```sh
   codesign -d --entitlements :- src-tauri/gen/apple/build/Payload/echo.app
   ```

   Both `aps-environment` and `com.apple.security.application-groups` must
   appear. If the build succeeds and they are absent, the entitlements are being
   dropped again and nothing downstream can work.

3. **Install and launch on the iPhone**, and confirm the permission prompt
   appears. It appears **once per install** — to see it again the app has to be
   deleted from the device first.

4. **Confirm the token reached the server.** This is the checkpoint that splits
   "the app half works" from "the server half works":

   ```sh
   docker compose exec postgres psql -U echo -d echo_push \
     -c "select user_id, platform, environment, left(token, 12) from device_tokens;"
   ```

   No row means the problem is in the plugin or the hook, and nothing after this
   can work. The `environment` column should read **sandbox** for a
   development-signed build — see the note below.

5. **End-to-end**: background the app (Home, not just another screen — a
   connected app is deliberately not notified), send a DM from another account,
   expect a banner. The `push-service` log should show the send rather than the
   "not configured" line.

6. **Re-test screen sharing.** It has never actually run with a working App
   Group, so this is its first real trial, not a regression check. A second
   device is needed to confirm the share is attributed to `<userId>#screen`.

7. **Fold the outcome back into the docs** and delete this file — it exists only
   to carry the handoff.

### If step 5 fails

Two rejections account for nearly everything:

- **`BadDeviceToken`** — sandbox/production mismatch. A development build's token
  only exists in APNs' sandbox. `PushPlugin.swift` reads the real answer out of
  the `aps-environment` entitlement in the embedded provisioning profile rather
  than guessing from `#if DEBUG`, precisely because every build this repo
  produces is *release* configuration signed with a *development* profile — the
  obvious check reports production and is wrong. If this fires anyway, that
  reader is where to look.
- **`TopicDisallowed`** — `APNS_BUNDLE_ID` does not match the App ID that has
  push enabled.

Also worth knowing: a **TestFlight build uses production APNs** even though it
feels like testing.

## What I cannot do from here

The portal, the `.p8`, and the deployment's environment. Everything else —
entitlements, build, signing verification, install, and the device tests above —
is mine.
