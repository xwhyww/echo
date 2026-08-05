/**
 * Screen-share sidecar identities.
 *
 * iOS cannot screen share from the webview — WKWebView has no `getDisplayMedia`,
 * and ReplayKit hands its frames to the native process, which has no way to
 * inject a track into the webview's WebRTC stack. So an iPhone presenting a
 * screen opens a *second* LiveKit connection, natively, publishing nothing but
 * the share.
 *
 * LiveKit evicts the older session when two connections claim one identity, so
 * that connection joins as `<userId>#screen`. It is not a participant, and
 * nothing above `voiceSnapshots` should ever see it: the fold there turns it
 * back into "this user is sharing".
 *
 * Mirrors `screenIdentity` / `baseIdentity` in the voice service — the two must
 * agree on the suffix. `#` is safe because our identities are UUIDs.
 */
const SCREEN_SUFFIX = '#screen';

export function isScreenIdentity(identity: string): boolean {
	return identity.endsWith(SCREEN_SUFFIX);
}

/** The user behind an identity, whether or not it is a sidecar. */
export function baseIdentity(identity: string): string {
	return isScreenIdentity(identity) ? identity.slice(0, -SCREEN_SUFFIX.length) : identity;
}
