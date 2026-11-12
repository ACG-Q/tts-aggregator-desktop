pub mod http;
pub mod mdns;
pub mod protocol;

use std::sync::{Arc, Mutex};

use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use protocol::{sanitize_nodes, SyncedNode};

pub fn random_hex(bytes: usize) -> String {
    use rand::RngCore;
    let mut buf = vec![0u8; bytes];
    rand::thread_rng().fill_bytes(&mut buf);
    buf.iter().map(|b| format!("{b:02x}")).collect()
}

#[derive(Default)]
pub struct LanSyncHandle {
    active: Mutex<Option<Active>>,
}

struct Active {
    shared: Arc<http::Shared>,
    port: u16,
    sid: String,
    shutdown: Option<tokio::sync::oneshot::Sender<()>>,
    _mdns: mdns::MdnsRegistration,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncStatus {
    pub running: bool,
    pub port: u16,
    pub sid: String,
    pub local_ip: String,
}

fn status_of(active: &Active) -> SyncStatus {
    SyncStatus {
        running: true,
        port: active.port,
        sid: active.sid.clone(),
        local_ip: crate::local_ipv4(),
    }
}

fn stop_active(handle: &LanSyncHandle) {
    let mut guard = handle.active.lock().unwrap();
    if let Some(mut active) = guard.take() {
        if let Some(tx) = active.shutdown.take() {
            let _ = tx.send(());
        }
        if let Some(pending) = active.shared.pending.lock().unwrap().take() {
            let _ = pending.tx.send(http::Outcome::Reject);
        }
    }
}

#[tauri::command]
pub async fn lan_sync_start(
    app: AppHandle,
    handle: State<'_, LanSyncHandle>,
    device_name: String,
    nodes: Vec<SyncedNode>,
) -> Result<SyncStatus, String> {
    stop_active(&handle);
    let sid = random_hex(16);
    let notify: http::NotifyFn = {
        let app = app.clone();
        Arc::new(move |payload| {
            let _ = app.emit("lan-sync://request", payload);
        })
    };
    let node_count = nodes.len();
    let shared = Arc::new(http::Shared {
        sid: sid.clone(),
        device_name: device_name.clone(),
        local_nodes: Mutex::new(sanitize_nodes(nodes)),
        pending: Mutex::new(None),
        notify,
    });
    let listener = tokio::net::TcpListener::bind(("0.0.0.0", 0))
        .await
        .map_err(|e| format!("无法启动同步服务：{e}"))?;
    let port = listener
        .local_addr()
        .map_err(|e| format!("无法启动同步服务：{e}"))?
        .port();
    let (shutdown, rx) = tokio::sync::oneshot::channel::<()>();
    let router = http::router(shared.clone());
    tauri::async_runtime::spawn(async move {
        let _ = axum::serve(listener, router)
            .with_graceful_shutdown(async {
                let _ = rx.await;
            })
            .await;
    });
    let mdns = match mdns::MdnsRegistration::register(&device_name, &sid, port, node_count) {
        Ok(m) => m,
        Err(e) => {
            let _ = shutdown.send(());
            return Err(e);
        }
    };
    let status = SyncStatus {
        running: true,
        port,
        sid: sid.clone(),
        local_ip: crate::local_ipv4(),
    };
    *handle.active.lock().unwrap() = Some(Active {
        shared,
        port,
        sid,
        shutdown: Some(shutdown),
        _mdns: mdns,
    });
    Ok(status)
}

#[tauri::command]
pub fn lan_sync_set_nodes(handle: State<'_, LanSyncHandle>, nodes: Vec<SyncedNode>) {
    if let Some(active) = handle.active.lock().unwrap().as_ref() {
        *active.shared.local_nodes.lock().unwrap() = sanitize_nodes(nodes);
    }
}

#[tauri::command]
pub fn lan_sync_stop(handle: State<'_, LanSyncHandle>) {
    stop_active(&handle);
}

#[tauri::command]
pub fn lan_sync_status(handle: State<'_, LanSyncHandle>) -> Option<SyncStatus> {
    handle.active.lock().unwrap().as_ref().map(status_of)
}

#[tauri::command]
pub fn lan_sync_resolve(
    handle: State<'_, LanSyncHandle>,
    request_id: String,
    accept: bool,
    nodes: Vec<SyncedNode>,
    applied: usize,
) -> bool {
    let guard = handle.active.lock().unwrap();
    let Some(active) = guard.as_ref() else {
        return false;
    };
    http::resolve_pending(
        &active.shared,
        &request_id,
        accept,
        sanitize_nodes(nodes),
        applied,
    )
}
