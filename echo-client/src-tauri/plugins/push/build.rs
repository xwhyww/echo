// Registers the commands as permissions.
//
// No `.ios_path("ios")`, and so no Swift package — the same choice the
// screenshare plugin documents. Here it is for consistency rather than
// necessity: this plugin has no third-party Swift dependency, so swift-rs could
// have compiled it. But its Swift needs a companion that patches the app
// delegate (EchoPushDelegate.m), that companion has to live in src-tauri/ios/ to
// reach the app target, and splitting one plugin across two Swift build systems
// buys nothing. PushPlugin.swift sits beside it, and Xcode compiles both.
const COMMANDS: &[&str] = &["request_permission", "get_token", "environment", "platform"];

fn main() {
	// `.android_path` does have to be here, unlike the iOS side: the Kotlin is a
	// Gradle library module with a Firebase dependency, and this is what gets it
	// added to the generated project as `:tauri-plugin-push`.
	tauri_plugin::Builder::new(COMMANDS)
		.android_path("android")
		.build();
}
