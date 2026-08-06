//! Everywhere that is not iOS.
//!
//! APNs is an Apple service and there is no Android target in this project, so
//! the desktop and browser builds have nothing to register. `request_permission`
//! answering false is what stops the frontend hook before it asks for a token.

use tauri::{AppHandle, Runtime};

pub fn init<R: Runtime>(_app: &AppHandle<R>) -> crate::Result<Push<R>> {
	Ok(Push(std::marker::PhantomData))
}

// `fn() -> R` rather than a bare `R`: managed state must be Send + Sync, and a
// PhantomData over R would only be so when R is.
pub struct Push<R: Runtime>(std::marker::PhantomData<fn() -> R>);

impl<R: Runtime> Push<R> {
	pub fn request_permission(&self) -> crate::Result<bool> {
		Ok(false)
	}

	pub fn get_token(&self) -> crate::Result<Option<String>> {
		Ok(None)
	}

	pub fn environment(&self) -> crate::Result<String> {
		Ok("sandbox".into())
	}
}
