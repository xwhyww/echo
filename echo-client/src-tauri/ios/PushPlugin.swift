import Foundation
import Tauri
import UIKit
import UserNotifications

/// The native half of push registration.
///
/// Three things the webview cannot do: show the system permission prompt, ask
/// APNs for a device token, and know which APNs environment that token belongs
/// to. Everything above this (`usePushRegistration.svelte.ts`) just calls the
/// three commands in order and posts the result to `push-service`.
///
/// The token does not arrive here directly — it is delivered to the app
/// delegate, which Tauri owns. EchoPushDelegate.m adds the delegate methods at
/// runtime and republishes the result as a notification, which is what the
/// observer below is waiting for.
class PushPlugin: Plugin {
	/// Held for `getToken`, which is a poll: registration is asynchronous and
	/// the frontend calls back until this is non-nil.
	private var deviceToken: String?
	private var observers: [NSObjectProtocol] = []

	override init() {
		super.init()

		let center = NotificationCenter.default
		observers.append(
			center.addObserver(
				forName: Notification.Name("EchoDidRegisterForRemoteNotifications"),
				object: nil,
				queue: .main
			) { [weak self] note in
				self?.deviceToken = note.userInfo?["token"] as? String
			})

		observers.append(
			center.addObserver(
				forName: Notification.Name("EchoDidFailToRegisterForRemoteNotifications"),
				object: nil,
				queue: .main
			) { [weak self] note in
				// Left nil deliberately: `getToken` keeps answering null, the
				// hook gives up after its own attempts, and the reason is here
				// rather than nowhere.
				self?.deviceToken = nil
				let reason = note.userInfo?["error"] as? String ?? "unknown"
				Logger.error("push registration failed: \(reason)")
			})
	}

	deinit {
		observers.forEach(NotificationCenter.default.removeObserver)
	}

	/// Prompts on first call, reports the stored answer afterwards — iOS shows
	/// the prompt once per install, and calling again is silent.
	///
	/// Registration is kicked off here rather than in `getToken` so that a
	/// declined prompt never registers at all.
	@objc public func requestPermission(_ invoke: Invoke) throws {
		UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound]) {
			granted, error in
			if let error {
				invoke.reject("authorization failed: \(error.localizedDescription)")
				return
			}
			guard granted else {
				invoke.resolve(["granted": false])
				return
			}
			// Must be on the main thread; UIApplication is not thread-safe.
			DispatchQueue.main.async {
				UIApplication.shared.registerForRemoteNotifications()
				invoke.resolve(["granted": true])
			}
		}
	}

	/// Null until APNs answers, which is normally within a second of
	/// registering but is not guaranteed — the caller polls.
	@objc public func getToken(_ invoke: Invoke) throws {
		invoke.resolve(["token": deviceToken as Any])
	}

	/// Which APNs host this build's tokens belong to.
	@objc public func environment(_ invoke: Invoke) throws {
		invoke.resolve(["environment": Self.apsEnvironment()])
	}

	/// Read from the `aps-environment` entitlement in the embedded provisioning
	/// profile.
	///
	/// The obvious shortcut — `#if DEBUG`, or Rust's `cfg!(debug_assertions)` —
	/// is wrong here, and wrong in the direction that costs an afternoon: every
	/// build this repo produces is *release* configuration signed with a
	/// *development* profile, so a debug check reports production while the
	/// token is really a sandbox one. APNs answers that mismatch with
	/// `BadDeviceToken`.
	///
	/// A profile signed for the App Store has no `aps-environment` of its own
	/// and ships no profile at all, so the absent case is production.
	private static func apsEnvironment() -> String {
		guard
			let url = Bundle.main.url(forResource: "embedded", withExtension: "mobileprovision"),
			let data = try? Data(contentsOf: url),
			// The profile is CMS-signed with the plist embedded as plain text.
			// isoLatin1 maps every byte to a character, so the binary wrapper
			// survives the round trip instead of failing to decode.
			let text = String(data: data, encoding: .isoLatin1),
			let range = text.range(of: "<key>aps-environment</key>")
		else { return "production" }

		let tail = text[range.upperBound...]
		guard
			let open = tail.range(of: "<string>"),
			let close = tail.range(of: "</string>")
		else { return "production" }

		let value = tail[open.upperBound..<close.lowerBound].trimmingCharacters(
			in: .whitespacesAndNewlines)
		return value == "development" ? "sandbox" : "production"
	}
}

@_cdecl("init_plugin_push")
func initPushPlugin() -> Plugin {
	return PushPlugin()
}
