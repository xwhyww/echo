use serde::{de::DeserializeOwned, Deserialize, Serialize};
use tauri::{
	plugin::{PluginApi, PluginHandle},
	AppHandle, Runtime,
};

tauri::ios_plugin_binding!(init_plugin_screenshare);

pub fn init<R: Runtime, C: DeserializeOwned>(
	_app: &AppHandle<R>,
	api: PluginApi<R, C>,
) -> crate::Result<ScreenShare<R>> {
	let handle = api.register_ios_plugin(init_plugin_screenshare)?;
	Ok(ScreenShare(handle))
}

pub struct ScreenShare<R: Runtime>(PluginHandle<R>);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct StartArgs<'a> {
	url: &'a str,
	token: &'a str,
}

#[derive(Serialize)]
struct MutedArgs {
	muted: bool,
}

#[derive(Deserialize)]
struct SupportedResponse {
	supported: bool,
}

impl<R: Runtime> ScreenShare<R> {
	pub fn is_supported(&self) -> crate::Result<bool> {
		let res: SupportedResponse = self
			.0
			.run_mobile_plugin("isSupported", ())
			.map_err(|e| crate::Error::Plugin(e.to_string()))?;
		Ok(res.supported)
	}

	/// Connects the publish-only LiveKit sidecar and raises the system
	/// broadcast sheet. Resolves once frames are flowing; rejects with the
	/// literal "cancelled" when the sheet is dismissed.
	pub fn start(&self, url: &str, token: &str) -> crate::Result<()> {
		self.0
			.run_mobile_plugin::<serde_json::Value>("start", StartArgs { url, token })
			.map_err(|e| crate::Error::Plugin(e.to_string()))?;
		Ok(())
	}

	pub fn stop(&self) -> crate::Result<()> {
		self.0
			.run_mobile_plugin::<serde_json::Value>("stop", ())
			.map_err(|e| crate::Error::Plugin(e.to_string()))?;
		Ok(())
	}

	pub fn set_audio_muted(&self, muted: bool) -> crate::Result<()> {
		self.0
			.run_mobile_plugin::<serde_json::Value>("setAudioMuted", MutedArgs { muted })
			.map_err(|e| crate::Error::Plugin(e.to_string()))?;
		Ok(())
	}
}
