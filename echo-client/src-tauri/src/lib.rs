#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    // iOS screen sharing. A no-op reporting `is_supported() == false`
    // everywhere else, where the webview's getDisplayMedia handles it.
    .plugin(tauri_plugin_screenshare::init())
    // APNs registration. The webview cannot ask Apple for a device token, and
    // the token is delivered to the app delegate rather than to any of this.
    .plugin(tauri_plugin_push::init())
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
