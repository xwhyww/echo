use serde::{de::DeserializeOwned, Deserialize};
use tauri::{
	plugin::{PluginApi, PluginHandle},
	AppHandle, Runtime,
};

tauri::ios_plugin_binding!(init_plugin_push);

pub fn init<R: Runtime, C: DeserializeOwned>(
	_app: &AppHandle<R>,
	api: PluginApi<R, C>,
) -> crate::Result<Push<R>> {
	let handle = api
		.register_ios_plugin(init_plugin_push)
		.map_err(|e| crate::Error::Plugin(e.to_string()))?;
	Ok(Push(handle))
}

pub struct Push<R: Runtime>(PluginHandle<R>);

#[derive(Deserialize)]
struct GrantedResponse {
	granted: bool,
}

#[derive(Deserialize)]
struct TokenResponse {
	/// Absent until APNs has answered. Not an error — the caller retries.
	token: Option<String>,
}

#[derive(Deserialize)]
struct EnvironmentResponse {
	environment: String,
}

impl<R: Runtime> Push<R> {
	/// Shows the system prompt the first time and registers for remote
	/// notifications when the user allows it. On every later call it reports
	/// the existing choice without prompting — iOS only ever asks once per
	/// install.
	pub fn request_permission(&self) -> crate::Result<bool> {
		let res: GrantedResponse = self
			.0
			.run_mobile_plugin("requestPermission", ())
			.map_err(|e| crate::Error::Plugin(e.to_string()))?;
		Ok(res.granted)
	}

	/// The APNs token as hex, or `None` while registration is still in flight.
	pub fn get_token(&self) -> crate::Result<Option<String>> {
		let res: TokenResponse = self
			.0
			.run_mobile_plugin("getToken", ())
			.map_err(|e| crate::Error::Plugin(e.to_string()))?;
		Ok(res.token)
	}

	/// Which APNs world this build's tokens live in — `sandbox` or
	/// `production`. Read from the `aps-environment` entitlement in the
	/// embedded provisioning profile rather than inferred from the build
	/// profile: a release-configuration build signed for development is still
	/// sandbox, and guessing that wrong is what produces `BadDeviceToken`.
	pub fn environment(&self) -> crate::Result<String> {
		let res: EnvironmentResponse = self
			.0
			.run_mobile_plugin("environment", ())
			.map_err(|e| crate::Error::Plugin(e.to_string()))?;
		Ok(res.environment)
	}
}
