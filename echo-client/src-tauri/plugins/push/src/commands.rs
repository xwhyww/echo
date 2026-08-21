use tauri::{command, AppHandle, Runtime};

use crate::{PushExt, Result};

#[command]
pub(crate) async fn request_permission<R: Runtime>(app: AppHandle<R>) -> Result<bool> {
	app.push().request_permission()
}

#[command]
pub(crate) async fn get_token<R: Runtime>(app: AppHandle<R>) -> Result<Option<String>> {
	app.push().get_token()
}

#[command]
pub(crate) async fn environment<R: Runtime>(app: AppHandle<R>) -> Result<String> {
	app.push().environment()
}

/// Which mobile platform this build is running on, and so which provider the
/// token belongs to — APNs or FCM. The server stores it alongside the token and
/// picks the sender from it.
///
/// Answered in Rust from `cfg!` rather than by asking the native plugin: it is a
/// compile-time fact, and routing it through Swift and Kotlin would mean two
/// more implementations of a constant. `other` is desktop, where the stub
/// already refuses the permission and nothing gets this far.
#[command]
pub(crate) async fn platform() -> Result<String> {
	Ok(if cfg!(target_os = "ios") {
		"ios".into()
	} else if cfg!(target_os = "android") {
		"android".into()
	} else {
		"other".into()
	})
}
