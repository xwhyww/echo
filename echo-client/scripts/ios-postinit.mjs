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
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
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
// The app reaches LiveKit through the screenshare plugin's Swift package, but
// the extension is a separate binary and needs its own dependency — it is where
// LKSampleHandler comes from.
doc.setIn(['packages', 'LiveKit'], {
	url: 'https://github.com/livekit/client-sdk-swift.git',
	from: LIVEKIT_VERSION,
});

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

// `embed` is what actually puts the extension inside the .app bundle. Filtered
// first so re-running doesn't stack duplicates, which xcodegen accepts and
// Xcode then trips over.
const deps = (spec.targets[appTargetName].dependencies ?? []).filter(
	(d) => d.target !== extTargetName,
);
deps.push({ target: extTargetName, embed: true, codeSign: true });
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
