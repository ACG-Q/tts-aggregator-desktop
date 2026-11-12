use std::net::{Ipv4Addr, UdpSocket};

mod lan_sync;

use lan_sync::LanSyncHandle;

pub(crate) fn local_ipv4() -> String {
    UdpSocket::bind((Ipv4Addr::UNSPECIFIED, 0))
        .and_then(|s| s.connect(("223.5.5.5", 80)).and_then(|_| s.local_addr()))
        .map(|a| a.ip().to_string())
        .unwrap_or_else(|_| "127.0.0.1".to_string())
}

#[tauri::command]
fn lan_local_ip() -> String {
    local_ipv4()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_http::init())
        .manage(LanSyncHandle::default())
        .invoke_handler(tauri::generate_handler![
            lan_local_ip,
            lan_sync::lan_sync_start,
            lan_sync::lan_sync_set_nodes,
            lan_sync::lan_sync_stop,
            lan_sync::lan_sync_status,
            lan_sync::lan_sync_resolve
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
