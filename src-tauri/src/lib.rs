#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // The web build proxies two endpoints through Vercel functions: the NZB
        // indexer (which sends no CORS headers) and Premiumize's http-only
        // subtitle host (blocked as mixed content). A desktop build has no such
        // functions, so those requests are made from Rust instead, where neither
        // restriction applies. Reachable hosts are allow-listed in
        // capabilities/default.json.
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_shell::init())
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
