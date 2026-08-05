//! Native screen sharing for iOS.
//!
//! WKWebView has no `getDisplayMedia`, and iOS only exposes system screen
//! capture through a ReplayKit Broadcast Upload Extension. That extension
//! writes frames into an App Group container that only native code can read —
//! the webview's WebRTC stack lives in a sealed process and cannot be handed a
//! track. So the share is published by a second, native LiveKit connection,
//! which is what the Swift half of this plugin owns.
//!
//! Everywhere else the crate is a no-op reporting `is_supported() == false`,
//! and the frontend falls back to `getDisplayMedia`.

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
use ios::ScreenShare;

#[cfg(not(target_os = "ios"))]
mod stub;
#[cfg(not(target_os = "ios"))]
use stub::ScreenShare;

pub trait ScreenShareExt<R: Runtime> {
	fn screenshare(&self) -> &ScreenShare<R>;
}

impl<R: Runtime, T: Manager<R>> ScreenShareExt<R> for T {
	fn screenshare(&self) -> &ScreenShare<R> {
		self.state::<ScreenShare<R>>().inner()
	}
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
	Builder::new("screenshare")
		.invoke_handler(tauri::generate_handler![
			commands::is_supported,
			commands::start,
			commands::stop,
			commands::set_audio_muted
		])
		.setup(|app, _api| {
			#[cfg(target_os = "ios")]
			let screenshare = ios::init(app, _api)?;
			#[cfg(not(target_os = "ios"))]
			let screenshare = stub::init(app)?;
			app.manage(screenshare);
			Ok(())
		})
		.build()
}
