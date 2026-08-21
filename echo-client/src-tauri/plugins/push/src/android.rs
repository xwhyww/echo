use serde::{de::DeserializeOwned, Deserialize};
use tauri::{
	plugin::{PluginApi, PluginHandle},
	AppHandle, Runtime,
};

/// The Kotlin package holding `PushPlugin`. Unlike iOS, where the binding is a
/// macro over a C symbol, Android resolves the class by name at runtime — so
/// this string and the `package` line in PushPlugin.kt have to agree, and
/// nothing checks that they do until the app launches.
const PLUGIN_IDENTIFIER: &str = "com.echo.plugin.push";

pub fn init<R: Runtime, C: DeserializeOwned>(
	_app: &AppHandle<R>,
	api: PluginApi<R, C>,
) -> crate::Result<Push<R>> {
	let handle = api
		.register_android_plugin(PLUGIN_IDENTIFIER, "PushPlugin")
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
	/// Absent until FCM has answered. Not an error — the caller retries.
	token: Option<String>,
}

#[derive(Deserialize)]
struct EnvironmentResponse {
	environment: String,
}

impl<R: Runtime> Push<R> {
	/// Shows the system prompt on Android 13 and later, and reports true
	/// without prompting below that — there is no runtime notification
	/// permission before API 33.
	pub fn request_permission(&self) -> crate::Result<bool> {
		let res: GrantedResponse = self
			.0
			.run_mobile_plugin("requestPermission", ())
			.map_err(|e| crate::Error::Plugin(e.to_string()))?;
		Ok(res.granted)
	}

	/// The FCM registration token, or `None` while the request is in flight.
	pub fn get_token(&self) -> crate::Result<Option<String>> {
		let res: TokenResponse = self
			.0
			.run_mobile_plugin("getToken", ())
			.map_err(|e| crate::Error::Plugin(e.to_string()))?;
		Ok(res.token)
	}

	/// Always `production`. FCM has no sandbox/production split — the field
	/// exists so both platforms answer the same three commands, and the server
	/// ignores it for Android rows.
	pub fn environment(&self) -> crate::Result<String> {
		let res: EnvironmentResponse = self
			.0
			.run_mobile_plugin("environment", ())
			.map_err(|e| crate::Error::Plugin(e.to_string()))?;
		Ok(res.environment)
	}
}
