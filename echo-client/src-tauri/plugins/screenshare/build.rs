// Registers the commands as permissions. There is deliberately no
// `.ios_path("ios")` here, and so no Swift package for this plugin.
//
// That switch makes `tauri-plugin` compile the plugin's Swift through swift-rs,
// which drives `swift build` and then overrides the target triple on each
// swiftc invocation. SwiftPM itself still resolves the package graph as a macOS
// build, so it picks the macos-arm64_x86_64 slice of LiveKit's
// LiveKitWebRTC.xcframework — headers that import AppKit and cannot compile
// against the iPhoneOS SDK. XCFramework slice selection is exactly what
// swift-rs cannot influence.
//
// So Xcode compiles the Swift instead: ScreenSharePlugin.swift lives in
// src-tauri/ios/ and scripts/ios-native.sh copies it into the app target, which
// gets LiveKit and the Tauri Swift API as SwiftPM dependencies from
// scripts/ios-postinit.mjs. `init_plugin_screenshare` stays undefined in
// libapp.a and resolves at Xcode's final link, which is fine for a static lib.
const COMMANDS: &[&str] = &["is_supported", "start", "stop", "set_audio_muted"];

fn main() {
	tauri_plugin::Builder::new(COMMANDS).build();
}
