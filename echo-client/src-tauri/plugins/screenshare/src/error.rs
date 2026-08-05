use serde::{Serialize, Serializer};

#[derive(Debug, thiserror::Error)]
pub enum Error {
	#[error(transparent)]
	Tauri(#[from] tauri::Error),
	#[error(transparent)]
	Json(#[from] serde_json::Error),
	/// Anything the Swift side rejected with. Its message reaches JS verbatim,
	/// which is what lets `screenShare.svelte.ts` recognise the literal
	/// "cancelled" and treat a dismissed broadcast sheet as a no-op.
	#[error("{0}")]
	Plugin(String),
}

pub type Result<T> = std::result::Result<T, Error>;

impl Serialize for Error {
	fn serialize<S: Serializer>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error> {
		serializer.serialize_str(self.to_string().as_ref())
	}
}
