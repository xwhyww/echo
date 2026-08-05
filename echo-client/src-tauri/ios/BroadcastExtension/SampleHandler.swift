import LiveKit
import ReplayKit

/// The ReplayKit broadcast extension: a separate process iOS spawns when the
/// user confirms the system broadcast sheet.
///
/// It does almost nothing itself. `LKSampleHandler` writes each captured
/// `CMSampleBuffer` to a Unix socket in the shared App Group container, and the
/// main app — which is where the LiveKit connection lives — reads that socket
/// and publishes the frames. The split is imposed by iOS: only an extension may
/// receive system screen capture, and only the app has the network session.
///
/// Nothing here is app-specific, so there is nothing to keep in sync. The one
/// thing that matters is the App Group, which is configured in
/// Broadcast.entitlements and must match the app's.
@available(macCatalyst 13.1, *)
class SampleHandler: LKSampleHandler {
	// Surfaces in Console.app under the "LKSampleHandler" category. An extension
	// has no other way to tell you why it died, and the failure modes here
	// (App Group mismatch, socket never accepted) are all silent otherwise.
	override var enableLogging: Bool { true }
}
