# Building Echo for Android

```bash
npm run android:init      # once, and again whenever gen/android is wiped
npm run android:dev       # emulator or attached device, with HMR
npm run android:build -- --apk -t aarch64
```

Everything the Tauri CLI needs *around* it lives in `scripts/android.mjs`, which
every one of those commands goes through. Read it before working around it: each
thing it does is there for a failure that is hard to diagnose from its symptom.
Node rather than a shell script, unlike the `ios:*` scripts, because Android is
the target that gets developed on Windows and npm runs scripts through
`cmd.exe`.

## What has to be installed

| | |
|---|---|
| Android SDK | `ANDROID_HOME` set; platform-tools, build-tools, a platform |
| NDK | `NDK_HOME` pointing at it — 27.3.13750724 is what this was built with |
| JDK 17 | Gradle 8.14 will not run on a newer one |
| Rust targets | `rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android` |

## The state of it

Both builds work, unsigned, with no Firebase project:

```
app-universal-debug.apk              145 MB    (debug, universal)
app-universal-release-unsigned.apk    40 MB    (release, universal)
```

Two things are still outstanding, and neither is code:

- **Signing.** The release APK is unsigned, so it cannot be installed on a
  device or uploaded to Play. See below.
- **Push.** Without `src-tauri/google-services.json` the Firebase step is
  skipped, `getToken` returns null, and the registration hook gives up quietly.
  The app builds and runs; it just never receives a notification. See
  `PUSH_NOTIFICATIONS.md`.

## Signing a release build

Tauri reads the signing config from `gen/android/keystore.properties`, which is
generated and gitignored — so it has to be recreated whenever `android:init`
runs, and the keystore itself must live somewhere else.

```bash
keytool -genkey -v -keystore ~/echo-release.jks \
  -keyalg RSA -keysize 2048 -validity 10000 -alias echo
```

```properties
# src-tauri/gen/android/keystore.properties
storeFile=/absolute/path/to/echo-release.jks
storePassword=…
keyAlias=echo
keyPassword=…
```

**Keep the keystore and back it up.** Play identifies an app by its signing key:
lose it and the listing cannot be updated, ever, by anyone. It belongs wherever
`MESSAGE_ENCRYPTION_KEY` is kept — two places, neither of them this repository
and neither of them the build machine alone.

## Why the script does what it does

### A separate build directory on a non-ASCII path

The NDK drives the linker through a `.cmd` wrapper that re-encodes its arguments
in the console codepage rather than UTF-8. A checkout under `E:\пет-проекты\`
therefore reaches `ld.lld` as mojibake and every object file "cannot open" — the
sources compile, only the link dies. Cargo itself handles the path fine, so
moving the build output alone fixes it: the script sets `CARGO_TARGET_DIR` to an
ASCII path under `%LOCALAPPDATA%` when, and only when, it detects one.

An ASCII checkout keeps its artifacts in `src-tauri/target`, where everything
else looks for them.

### `android.overridePathCheck`

The Android Gradle Plugin refuses outright to configure a project whose path
contains non-ASCII characters, and names this flag as the way to say "I know".
It is not a fix for the encoding trouble the check warns about — that is what
`CARGO_TARGET_DIR` above deals with. What is left is Gradle's own file tree, and
that it handles.

### Re-patching `gen/android` on every command

`src-tauri/gen/android` is generated and gitignored, so anything added there by
hand is lost the next time `android:init` runs. The script re-applies its edits
before every command instead of asking anyone to remember.

That is also why the Firebase wiring lives there: `google-services.json` belongs
to the *application* module, not to the push plugin's library module, so three
separate things have to reach a generated project that regenerates itself.

### `adb reverse` and `--host 127.0.0.1` for the emulator

A bundled Tauri webview serves itself from `http://tauri.localhost`, so the
frontend cannot read the backend's address off the URL it was loaded from — the
way the browser and `tauri ios dev` can — and falls back to localhost, which on a
device means the device. `adb reverse` carries 5173, 5174, 3000 and 3004 back to
the development machine.

Left alone, the Tauri CLI picks a dev-server address by walking this machine's
network interfaces, and it cannot tell a wifi address from a VPN tunnel's. Pick
the tunnel and the emulator has no route to it: the app launches, the webview
finds nothing, and the screen stays black with nothing in the log to say why.
Which interface wins also changes as the machine joins and leaves networks, so a
run that worked an hour ago stops working for no visible reason.

Loopback plus forwarding depends on none of that, and it is the only address
that works for every port at once — `10.0.2.2`, the emulator's alias for the
host, would do for the dev server, but Vite has to *bind* its HMR socket to
whatever host it is told, and no process can bind an address belonging to the
emulator.

Emulator only. A phone on USB is reachable the same way, but `adb reverse` there
is the developer's call and the CLI's guess is the better default.
