import Foundation
import LiveKit
import Tauri
import UIKit
import WebKit

/// Native screen sharing, which on iOS is the only kind there is.
///
/// The webview cannot do this. WKWebView has no `getDisplayMedia`, and the
/// ReplayKit broadcast extension that actually captures the screen delivers its
/// frames over a socket in the App Group container — reachable from this
/// process, and from nowhere inside WebKit.
///
/// So the screen is published by its own LiveKit connection, joining the same
/// room as the webview's under a `<userId>#screen` identity (the server mints
/// the token; see `createScreenToken` in the voice service). It publishes only
/// the share and subscribes to nothing: the user's real connection is already
/// in the room and would otherwise receive every track twice.
// RoomDelegate is only here so `Room(delegate: self)` type-checks — every one of
// its methods is `@objc optional`, and this plugin implements none of them. The
// broadcast state, not the room's, is what `start` waits on.
class ScreenSharePlugin: Plugin, BroadcastManagerDelegate, RoomDelegate {
	private var room: Room?

	/// The `start` invocation, held while we wait for the user to confirm the
	/// system broadcast sheet. Resolved from `broadcastManager(didChangeState:)`,
	/// because that is the first moment we know frames are actually flowing.
	private var pendingStart: Invoke?
	private var startTimeout: DispatchWorkItem?

	/// Generous: the sheet has its own three-second countdown, and the user may
	/// well be reading it. This exists to release a stuck invocation, not to
	/// hurry anyone.
	private let startTimeoutSeconds = 60.0

	@objc public func isSupported(_ invoke: Invoke) throws {
		// The plugin only builds into the iOS target, so reaching this code at
		// all is the answer.
		invoke.resolve(["supported": true])
	}

	@objc public func start(_ invoke: Invoke) throws {
		let args = try invoke.parseArgs(StartArgs.self)

		Task { [weak self] in
			guard let self else { return }

			// Replacing an existing share: drop the old sidecar first. There is
			// no picker to cancel out of here, so unlike the web path there is no
			// window where this could leave the user un-shared by mistake.
			await self.teardown()

			let room = Room(
				delegate: self,
				roomOptions: RoomOptions(
					defaultScreenShareCaptureOptions: ScreenShareCaptureOptions(
						// Other apps' audio rides along with the video, matching
						// what desktop shares carry.
						appAudio: true,
						// Whole-device capture through the extension rather than
						// this app's own view, which is what anyone means by
						// sharing their screen.
						useBroadcastExtension: true
					),
					// Publish-only. The token forbids subscribing anyway; saying so
					// here keeps this connection from even asking.
					adaptiveStream: false,
					dynacast: false
				)
			)
			self.room = room

			do {
				try await room.connect(url: args.url, token: args.token)
			} catch {
				self.room = nil
				invoke.reject("connect failed: \(error.localizedDescription)")
				return
			}

			BroadcastManager.shared.delegate = self
			self.pendingStart = invoke
			self.armStartTimeout()

			do {
				// Raises the system broadcast sheet. It returns as soon as the
				// sheet is up — not when the user confirms it — so the invocation
				// stays pending until the delegate says broadcasting began.
				try await room.localParticipant.setScreenShare(enabled: true)
			} catch {
				self.cancelStartTimeout()
				self.pendingStart = nil
				await self.teardown()
				invoke.reject("broadcast failed: \(error.localizedDescription)")
				return
			}

			// If the extension was already running when we attached, no state
			// change will arrive — settle now rather than wait out the timeout.
			if BroadcastManager.shared.isBroadcasting {
				self.settleStart()
			}
		}
	}

	@objc public func stop(_ invoke: Invoke) throws {
		Task { [weak self] in
			await self?.teardown()
			invoke.resolve()
		}
	}

	@objc public func setAudioMuted(_ invoke: Invoke) throws {
		let args = try invoke.parseArgs(MutedArgs.self)

		Task { [weak self] in
			guard let room = self?.room,
			      let pub = room.localParticipant.trackPublications.values.first(where: {
			      	$0.source == .screenShareAudio
			      }) as? LocalTrackPublication
			else {
				// No audio in this broadcast — muting it is vacuously done. The
				// UI only offers the control when a share reports audio, so this
				// is a race rather than a mistake.
				invoke.resolve()
				return
			}

			do {
				if args.muted {
					try await pub.mute()
				} else {
					try await pub.unmute()
				}
				invoke.resolve()
			} catch {
				invoke.reject("mute failed: \(error.localizedDescription)")
			}
		}
	}

	// MARK: - Broadcast state

	func broadcastManager(didChangeState isBroadcasting: Bool) {
		if isBroadcasting {
			settleStart()
			return
		}

		// Stopped. Either the user dismissed the sheet without starting — in
		// which case a start is still pending and this is a cancellation — or a
		// running broadcast ended from Control Center, the status bar, or a
		// crashed extension.
		if let invoke = pendingStart {
			cancelStartTimeout()
			pendingStart = nil
			Task { [weak self] in
				await self?.teardown()
				// The exact string the frontend matches to treat a dismissed
				// sheet as a no-op rather than an error.
				invoke.reject("cancelled")
			}
			return
		}

		Task { [weak self] in
			await self?.teardown()
			// The counterpart of the web path's `ended` event on the capture
			// track: tells the frontend to drop its "sharing" state and announce
			// the change to the rest of the group.
			self?.trigger("ended", data: [:])
		}
	}

	private func settleStart() {
		cancelStartTimeout()
		guard let invoke = pendingStart else { return }
		pendingStart = nil
		invoke.resolve()
	}

	private func armStartTimeout() {
		cancelStartTimeout()
		let work = DispatchWorkItem { [weak self] in
			guard let self, let invoke = self.pendingStart else { return }
			self.pendingStart = nil
			Task {
				await self.teardown()
				// Indistinguishable from a dismissal at this level, and the
				// frontend should treat it the same way: quietly.
				invoke.reject("cancelled")
			}
		}
		startTimeout = work
		DispatchQueue.main.asyncAfter(deadline: .now() + startTimeoutSeconds, execute: work)
	}

	private func cancelStartTimeout() {
		startTimeout?.cancel()
		startTimeout = nil
	}

	/// Drops the sidecar. Disconnecting unpublishes as a side effect, so there
	/// is nothing else to unwind. Safe to call when nothing is connected.
	private func teardown() async {
		BroadcastManager.shared.requestStop()
		guard let room else { return }
		self.room = nil
		await room.disconnect()
	}
}

class StartArgs: Decodable {
	let url: String
	let token: String
}

class MutedArgs: Decodable {
	let muted: Bool
}

@_cdecl("init_plugin_screenshare")
func initPlugin() -> Plugin {
	return ScreenSharePlugin()
}
