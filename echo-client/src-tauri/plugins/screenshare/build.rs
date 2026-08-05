// Registers the commands as permissions and links the iOS Swift package under
// ios/ into the generated Xcode project.
const COMMANDS: &[&str] = &["is_supported", "start", "stop", "set_audio_muted"];

fn main() {
	tauri_plugin::Builder::new(COMMANDS).ios_path("ios").build();
}
