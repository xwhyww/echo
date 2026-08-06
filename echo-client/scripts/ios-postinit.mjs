// Adds the ReplayKit broadcast extension to the generated Xcode project.
//
// Tauri has no notion of app extensions: `tauri ios init` writes an xcodegen
// spec with exactly one target, the app. But iOS will not hand system screen
// capture to an app — only to a Broadcast Upload Extension, a second bundle
// with its own identifier, entitlements and signing. So the spec has to grow
// one, and this is where.
//
// It runs as a patch rather than as a checked-in project.yml because the whole
// of gen/ is regenerated (and gitignored): anything written there by hand is
// lost on the next init. The sources it points at live in src-tauri/ios/, which
// is tracked.
//
// Idempotent — running it twice leaves the same spec, so ios:clean can chain it
// without checking.

import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const specPath = path.join(root, 'src-tauri/gen/apple/project.yml');

// Must match Info.ios.plist (RTCScreenSharingExtension / RTCAppGroupIdentifier)
// and both entitlements files. LiveKit finds the extension and the shared
// container by these names.
const APP_ID = 'com.evgenij.echo';
const EXT_ID = `${APP_ID}.broadcast`;
const LIVEKIT_VERSION = '2.6.0';

// project.yml sits in gen/apple/; the tracked sources are two levels up.
const IOS_DIR = '../../ios';

if (!existsSync(specPath)) {
	console.error(`[ios-postinit] ${specPath} not found — run \`tauri ios init\` first`);
	process.exit(1);
}

// parseDocument rather than parse: it edits the tree in place and leaves every
// node it isn't asked to touch byte-identical. A plain parse/stringify round
// trip rewrites the whole file — harmlessly for the most part, but it turns
// `deploymentTarget: 15.0` into `15`, and reformatting a generated file makes
// the next diff against it unreadable.
const doc = YAML.parseDocument(readFileSync(specPath, 'utf8'));
const spec = doc.toJS();

// The app target's name is derived from the Tauri app name, so find it by shape
// rather than by guessing the string.
const appTargetName = Object.keys(spec.targets ?? {}).find(
	(name) => spec.targets[name]?.type === 'application',
);
if (!appTargetName) {
	console.error('[ios-postinit] no application target in project.yml — cannot attach the extension');
	process.exit(1);
}
const extTargetName = `${appTargetName.replace(/_iOS$/, '')}_broadcast`;

// ─── The LiveKit package ───────────────────────────────────────
// Both binaries need it: the extension is where LKSampleHandler comes from, and
// the app publishes the frames the extension sends it.
//
// The app's copy has to come through Xcode rather than through the plugin's
// Rust build. LiveKit depends on LiveKitWebRTC as an XCFramework, and SwiftPM
// only picks the ios-arm64 slice over the macOS one when it knows it is
// building for iOS — which is true under Xcode and false under the swift-rs
// path `tauri-plugin`'s `ios_path` would use. See the plugin's build.rs.
doc.setIn(['packages', 'LiveKit'], {
	url: 'https://github.com/livekit/client-sdk-swift.git',
	from: LIVEKIT_VERSION,
});

// ─── The Tauri Swift API ───────────────────────────────────────
// ScreenSharePlugin.swift subclasses Tauri's `Plugin` and takes `Invoke`, so the
// app target needs this package. `tauri-plugin` would normally vendor it into
// each plugin that declares an `ios_path`; with that switch gone, it is copied
// straight out of the `tauri` crate instead. `cargo metadata` locates the crate
// so the path follows the dependency's version rather than being pinned here.
const tauriManifest = JSON.parse(
	execFileSync('cargo', ['metadata', '--format-version', '1'], {
		cwd: path.join(root, 'src-tauri'),
		encoding: 'utf8',
		maxBuffer: 64 * 1024 * 1024,
	}),
).packages.find((p) => p.name === 'tauri')?.manifest_path;

if (!tauriManifest) {
	console.error('[ios-postinit] could not locate the `tauri` crate — is src-tauri/ a cargo workspace?');
	process.exit(1);
}

const tauriApiSrc = path.join(path.dirname(tauriManifest), 'mobile/ios-api');
const tauriApiDst = path.join(root, 'src-tauri/gen/apple/TauriAPI');
if (!existsSync(tauriApiSrc)) {
	console.error(`[ios-postinit] ${tauriApiSrc} not found — cannot supply the Tauri Swift API`);
	process.exit(1);
}
// Copied rather than referenced in place: the registry checkout is shared
// between projects and SwiftPM should not be writing anything into it.
//
// Tests/ comes along even though nothing here runs it. Xcode validates a local
// package the way it validates a root one, so the `TauriTests` target the
// manifest declares has to have its sources, or dependency resolution fails
// before a line is compiled.
rmSync(tauriApiDst, { recursive: true, force: true });
cpSync(tauriApiSrc, tauriApiDst, {
	recursive: true,
	filter: (src) => !/(^|\/)(\.build|Package\.resolved)$/.test(src),
});
doc.setIn(['packages', 'Tauri'], { path: 'TauriAPI' });

// ─── The extension target ──────────────────────────────────────
// `SKIP_INSTALL` and the XPC package type are what distinguish an embedded
// extension from a standalone app; without them the archive is rejected.
const extSettings = {
	PRODUCT_NAME: 'EchoBroadcast',
	PRODUCT_BUNDLE_IDENTIFIER: EXT_ID,
	INFOPLIST_FILE: `${IOS_DIR}/BroadcastExtension/Info.plist`,
	CODE_SIGN_ENTITLEMENTS: `${IOS_DIR}/BroadcastExtension/Broadcast.entitlements`,
	SKIP_INSTALL: true,
	// The extension runs inside ReplayKit's process, which already has the Swift
	// runtime; the app is what embeds it.
	ALWAYS_EMBED_SWIFT_STANDARD_LIBRARIES: false,
};

// Inherit the signing team the app was configured with (scripts/with-env.sh
// passes APPLE_DEVELOPMENT_TEAM through), or the extension fails to sign with a
// far less obvious error than "no team".
const team = spec.settingGroups?.app?.base?.DEVELOPMENT_TEAM;
if (team) extSettings.DEVELOPMENT_TEAM = team;

doc.setIn(['targets', extTargetName], {
	type: 'app-extension',
	platform: 'iOS',
	sources: [{ path: `${IOS_DIR}/BroadcastExtension` }],
	settings: { base: extSettings },
	dependencies: [{ package: 'LiveKit', product: 'LiveKit' }],
});

// ─── Attaching it to the app ───────────────────────────────────
doc.setIn(
	['targets', appTargetName, 'settings', 'base', 'CODE_SIGN_ENTITLEMENTS'],
	`${IOS_DIR}/app.entitlements`,
);

// …and drop the template's own entitlements node, or the setting above is dead
// letter. xcodegen's `entitlements` key *generates* a file at the given path and
// points CODE_SIGN_ENTITLEMENTS at it, which beats anything in `settings.base`.
// Tauri's template declares it with no contents, so what it generates is an
// empty <dict/> — and an app signed with that has neither the App Group the
// broadcast extension shares nor `aps-environment`. Both failures are silent at
// build time and only show up as things not working on the device.
doc.deleteIn(['targets', appTargetName, 'entitlements']);

// The app target is Objective-C++ until ScreenSharePlugin.swift lands in it,
// and Xcode refuses to compile Swift in a target with no language version.
doc.setIn(['targets', appTargetName, 'settings', 'base', 'SWIFT_VERSION'], '5.0');

// `embed` is what actually puts the extension inside the .app bundle. Filtered
// first so re-running doesn't stack duplicates, which xcodegen accepts and
// Xcode then trips over — and the same filter keeps the two package
// dependencies single.
const deps = (spec.targets[appTargetName].dependencies ?? []).filter(
	(d) => d.target !== extTargetName && d.package !== 'LiveKit' && d.package !== 'Tauri',
);
deps.push({ target: extTargetName, embed: true, codeSign: true });
// Where ScreenSharePlugin.swift gets `import LiveKit` and `import Tauri` from.
deps.push({ package: 'LiveKit', product: 'LiveKit' });
deps.push({ package: 'Tauri', product: 'Tauri' });
doc.setIn(['targets', appTargetName, 'dependencies'], deps);

writeFileSync(specPath, doc.toString(), 'utf8');
console.log(`[ios-postinit] added ${extTargetName} to project.yml`);

// Regenerate the .xcodeproj from the patched spec. `tauri ios init` already ran
// xcodegen against the unpatched one, so without this the target exists only on
// paper.
execFileSync('xcodegen', ['generate', '--spec', 'project.yml'], {
	cwd: path.join(root, 'src-tauri/gen/apple'),
	stdio: 'inherit',
});
console.log('[ios-postinit] regenerated the Xcode project');
