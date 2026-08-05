use tauri::{command, AppHandle, Runtime};

use crate::{Result, ScreenShareExt};

#[command]
pub(crate) async fn is_supported<R: Runtime>(app: AppHandle<R>) -> Result<bool> {
	app.screenshare().is_supported()
}

#[command]
pub(crate) async fn start<R: Runtime>(app: AppHandle<R>, url: String, token: String) -> Result<()> {
	app.screenshare().start(&url, &token)
}

#[command]
pub(crate) async fn stop<R: Runtime>(app: AppHandle<R>) -> Result<()> {
	app.screenshare().stop()
}

#[command]
pub(crate) async fn set_audio_muted<R: Runtime>(app: AppHandle<R>, muted: bool) -> Result<()> {
	app.screenshare().set_audio_muted(muted)
}
