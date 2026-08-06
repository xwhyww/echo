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
