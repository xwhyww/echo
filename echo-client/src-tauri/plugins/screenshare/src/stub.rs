//! Everywhere that is not iOS.
//!
//! `getDisplayMedia` exists on every other target Echo ships to, so the
//! frontend never reaches these — but the commands are registered
//! unconditionally, and `is_supported` returning false is what tells it so.

use tauri::{AppHandle, Runtime};

pub fn init<R: Runtime>(_app: &AppHandle<R>) -> crate::Result<ScreenShare<R>> {
	Ok(ScreenShare(std::marker::PhantomData))
}

// `fn() -> R` rather than a bare `R`: managed state must be Send + Sync, and a
// PhantomData over R would only be so when R is. The function-pointer form
// carries the same type parameter with none of the auto-trait baggage.
pub struct ScreenShare<R: Runtime>(std::marker::PhantomData<fn() -> R>);

impl<R: Runtime> ScreenShare<R> {
	pub fn is_supported(&self) -> crate::Result<bool> {
		Ok(false)
	}

	pub fn start(&self, _url: &str, _token: &str) -> crate::Result<()> {
		Err(crate::Error::Plugin("unsupported".into()))
	}

	pub fn stop(&self) -> crate::Result<()> {
		Ok(())
	}

	pub fn set_audio_muted(&self, _muted: bool) -> crate::Result<()> {
		Ok(())
	}
}
