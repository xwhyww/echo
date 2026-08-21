//! APNs device-token registration for iOS.
//!
//! The webview cannot reach APNs — asking for a token is a UIKit call, and the
//! token itself is delivered to the app delegate. So this plugin owns the whole
//! native side: the permission prompt, `registerForRemoteNotifications`, and
//! catching what comes back. `push-service` on the server side does the sending;
//! all this has to do is give it an address.
//!
//! Android is the same shape against Firebase Cloud Messaging: `android.rs` and
//! the Kotlin beside it obtain an FCM registration token, which push-service
//! sends to instead of APNs. The two platforms are configured independently on
//! the server, so one can be live while the other waits on credentials.
//!
//! Everywhere else the crate is a no-op whose `request_permission` reports
//! false, which is where the frontend hook stops.

use tauri::{
	plugin::{Builder, TauriPlugin},
	Manager, Runtime,
};

mod commands;
mod error;

pub use error::{Error, Result};

#[cfg(target_os = "ios")]
mod ios;
#[cfg(target_os = "ios")]
use ios::Push;

#[cfg(target_os = "android")]
mod android;
#[cfg(target_os = "android")]
use android::Push;

#[cfg(not(any(target_os = "ios", target_os = "android")))]
mod stub;
#[cfg(not(any(target_os = "ios", target_os = "android")))]
use stub::Push;

pub trait PushExt<R: Runtime> {
	fn push(&self) -> &Push<R>;
}

impl<R: Runtime, T: Manager<R>> PushExt<R> for T {
	fn push(&self) -> &Push<R> {
		self.state::<Push<R>>().inner()
	}
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
	Builder::new("push")
		.invoke_handler(tauri::generate_handler![
			commands::request_permission,
			commands::get_token,
			commands::environment,
			commands::platform
		])
		.setup(|app, _api| {
			#[cfg(target_os = "ios")]
			let push = ios::init(app, _api)?;
			#[cfg(target_os = "android")]
			let push = android::init(app, _api)?;
			#[cfg(not(any(target_os = "ios", target_os = "android")))]
			let push = stub::init(app)?;
			app.manage(push);
			Ok(())
		})
		.build()
}
