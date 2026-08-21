// Everything `tauri android <cmd>` needs around it, and the reason for each.
//
//   node scripts/android.mjs init
//   node scripts/android.mjs dev
//   node scripts/android.mjs build
//
// Node rather than sh, unlike the ios:* scripts beside it: Android is the one
// mobile target that gets developed on Windows, and npm runs its scripts through
// cmd.exe, where `sh` does not exist.
import { spawnSync } from 'node:child_process';
import { appendFileSync, copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

const [command = 'dev', ...rest] = process.argv.slice(2);
const root = process.cwd();
const env = { ...process.env };

// .env, the same file scripts/with-env.sh loads for the ios:* scripts. Vite
// reads the VITE_* names by itself; the Tauri CLI reads nothing.
if (existsSync('.env')) {
	for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
		const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
		if (match) env[match[1]] ??= match[2].trim().replace(/^["']|["']$/g, '');
	}
}

/**
 * An ASCII build directory when the checkout is not on one.
 *
 * The NDK drives the linker through a .cmd wrapper, and that wrapper re-encodes
 * its arguments in the console codepage rather than UTF-8. A checkout under
 * E:\пет-проекты\ therefore reaches ld.lld as mojibake and every object file
 * "cannot open" — the sources compile, only the link dies. Cargo itself handles
 * the path, so moving the build output alone is enough; what is left on the
 * command line is debug info, not files the linker opens.
 *
 * Only when it is needed, so an ASCII checkout keeps its artifacts in
 * src-tauri/target where everything else looks for them.
 */
// eslint-disable-next-line no-control-regex
if (/[^\x00-\x7F]/.test(root) && !env.CARGO_TARGET_DIR) {
	env.CARGO_TARGET_DIR = join(env.LOCALAPPDATA || env.HOME || root, 'echo-android-target');
	console.error(`android: non-ASCII path, building into ${env.CARGO_TARGET_DIR}`);
}

/**
 * The edits the generated Gradle project needs and cannot keep.
 *
 * src-tauri/gen/android is generated and gitignored, so anything added there by
 * hand is lost the next time `tauri android init` runs. Re-applied on every
 * command instead.
 */
function patchGeneratedProject() {
	if (!existsSync('src-tauri/gen/android')) return;
	patchPathCheck();
	patchFirebase();
}

function patchPathCheck() {
	const props = 'src-tauri/gen/android/gradle.properties';
	if (!existsSync(props)) return;
	if (readFileSync(props, 'utf8').includes('android.overridePathCheck')) return;
	// The Android Gradle Plugin refuses outright to configure a project whose
	// path contains non-ASCII characters, and names this flag as the way to say
	// "I know". It is not a fix for the encoding trouble the check warns about —
	// the NDK linker really is broken by such a path, which is what
	// CARGO_TARGET_DIR above deals with. What is left is Gradle's own file tree,
	// and that it handles.
	appendFileSync(props, '\n# See scripts/android.mjs — this checkout is under a non-ASCII path.\nandroid.overridePathCheck=true\n');
	console.error('android: enabled android.overridePathCheck');
}

/**
 * Wires Firebase Cloud Messaging into the generated app module.
 *
 * The push plugin's own Gradle module declares the firebase-messaging
 * dependency, but that is only half of it: FCM reads its project configuration
 * from `google-services.json`, and that file belongs to the *application*, not
 * to a library. So three things have to reach the generated project, and all
 * three are lost on the next `tauri android init` — hence re-applying them here
 * rather than editing gen/android by hand.
 *
 * Without google-services.json nothing is patched at all. That is the correct
 * state before anyone has made a Firebase project: the app builds and runs, the
 * plugin's getToken returns null, and the registration hook gives up quietly.
 */
function patchFirebase() {
	// Kept in src-tauri/ beside the other per-developer credentials, and
	// gitignored for the same reason — it identifies one Firebase project.
	const source = 'src-tauri/google-services.json';
	if (!existsSync(source)) {
		console.error('android: no src-tauri/google-services.json, skipping Firebase setup');
		return;
	}

	copyFileSync(source, 'src-tauri/gen/android/app/google-services.json');

	// The classpath entry, on the root project's buildscript.
	const rootGradle = 'src-tauri/gen/android/build.gradle.kts';
	const root = readFileSync(rootGradle, 'utf8');
	if (!root.includes('com.google.gms:google-services')) {
		writeFileSync(
			rootGradle,
			root.replace(
				'classpath("com.android.tools.build:gradle:',
				'classpath("com.google.gms:google-services:4.4.2")\n        classpath("com.android.tools.build:gradle:',
			),
		);
	}

	// And the plugin itself, applied to the app module. It is what turns
	// google-services.json into the resources firebase-messaging reads at
	// runtime; without it the SDK initialises against nothing and getToken fails
	// with a message that mentions none of this.
	const appGradle = 'src-tauri/gen/android/app/build.gradle.kts';
	const app = readFileSync(appGradle, 'utf8');
	if (!app.includes('com.google.gms.google-services')) {
		writeFileSync(
			appGradle,
			app.replace('id("rust")', 'id("rust")\n    id("com.google.gms.google-services")'),
		);
	}

	console.error('android: Firebase wired into the generated project');
}

/**
 * Points the emulator's localhost at this machine's backend.
 *
 * A bundled Tauri webview serves itself from http://tauri.localhost, so the
 * frontend cannot read the backend's address off the URL it was loaded from the
 * way the browser and `tauri ios dev` do (see src/lib/api/client.ts) and falls
 * back to localhost — which on a device means the device. 3000 is the gateway,
 * 3004 the websocket: the pair client.ts hardcodes.
 *
 * No device attached is not a failure — `tauri android dev` starts one itself,
 * and re-running this command afterwards is all it takes.
 */
function adbPath() {
	const sdk = env.ANDROID_HOME || env.ANDROID_SDK_ROOT;
	if (!sdk) return null;
	return join(sdk, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');
}

/**
 * 5173 the dev server, 5174 its HMR socket, 3000 the gateway, 3004 the
 * websocket — the last two are the pair client.ts hardcodes.
 */
const FORWARDED_PORTS = [5173, 5174, 3000, 3004];

function reversePorts(adb) {
	for (const port of FORWARDED_PORTS) {
		spawnSync(adb, ['reverse', `tcp:${port}`, `tcp:${port}`], { stdio: 'inherit' });
	}
}

/**
 * The address an emulator should reach everything on: its own loopback, with
 * `adb reverse` carrying each port back to this machine.
 *
 * Left alone, the Tauri CLI picks an address by walking this machine's network
 * interfaces, and it cannot tell a wifi address from a VPN tunnel's. Pick the
 * tunnel and the emulator has no route to it — the app launches, the webview
 * finds nothing, and the screen stays black with nothing in the log to say why.
 * Which interface wins also changes as the machine joins and leaves networks, so
 * a run that worked an hour ago stops working for no visible reason.
 *
 * Loopback plus forwarding depends on none of that. It is also the only address
 * that works for every port at once: 10.0.2.2, the emulator's alias for the
 * host, would do for the dev server, but Vite has to *bind* the HMR socket to
 * whatever host it is told, and no process can bind an address that belongs to
 * the emulator.
 *
 * Emulator only — a phone on USB is reachable the same way, but `adb reverse`
 * there is the user's call, and the CLI's guess is the best default.
 */
const EMULATOR_HOST_ALIAS = '127.0.0.1';

function isEmulator(adb) {
	const devices = spawnSync(adb, ['devices'], { encoding: 'utf8' }).stdout ?? '';
	return devices
		.split(/\r?\n/)
		.slice(1)
		.some((line) => /^emulator-[0-9]+\s+device$/.test(line.trim()));
}

patchGeneratedProject();

if (command === 'dev') {
	const adb = adbPath();
	if (!adb) {
		console.error('android: ANDROID_HOME is not set, skipping device setup');
	} else if (spawnSync(adb, ['get-state'], { stdio: 'ignore' }).status !== 0) {
		// Not a failure: `tauri android dev` offers to start an emulator itself,
		// and re-running this command afterwards is all it takes.
		console.error('android: no device attached, skipping device setup');
	} else {
		reversePorts(adb);
		if (!env.TAURI_DEV_HOST && !rest.includes('--host') && isEmulator(adb)) {
			// Both, because they are read at different points: the CLI takes
			// `--host` for the URL it writes into the app, and Vite reads the
			// variable for its HMR socket (see vite.config.ts).
			env.TAURI_DEV_HOST = EMULATOR_HOST_ALIAS;
			rest.push('--host', EMULATOR_HOST_ALIAS);
			console.error(`android: serving the emulator from ${EMULATOR_HOST_ALIAS}`);
		}
	}
}

// `shell: true` because on Windows the only `npx` on PATH is a .cmd, which
// CreateProcess cannot start on its own.
const tauri = spawnSync('npx', ['tauri', 'android', command, ...rest], {
	stdio: 'inherit',
	env,
	shell: true,
});

// init writes the Gradle project this patches, so it has to run again after.
if (command === 'init' && tauri.status === 0) patchGeneratedProject();

process.exit(tauri.status ?? 1);
