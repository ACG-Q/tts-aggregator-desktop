use std::net::{Ipv4Addr, TcpListener, UdpSocket};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

#[derive(Default, Clone)]
pub struct ShareState {
    pub running: Arc<AtomicBool>,
    pub payload: Arc<Mutex<String>>,
    pub token: Arc<Mutex<String>>,
}

fn local_ipv4() -> String {
    UdpSocket::bind((Ipv4Addr::UNSPECIFIED, 0))
        .and_then(|s| s.connect(("223.5.5.5", 80)).and_then(|_| s.local_addr()))
        .map(|a| a.ip().to_string())
        .unwrap_or_else(|_| "127.0.0.1".to_string())
}

fn respond(stream: &mut std::net::TcpStream, status: &str, ctype: &str, body: &str) {
    use std::io::Write;
    let resp = format!(
        "HTTP/1.1 {status}\r\nContent-Type: {ctype}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    let _ = stream.write_all(resp.as_bytes());
    let _ = stream.flush();
}

fn serve(listener: TcpListener, state: Arc<ShareState>) {
    for stream in listener.incoming() {
        if !state.running.load(Ordering::SeqCst) {
            if let Ok(mut stream) = stream {
                respond(
                    &mut stream,
                    "503 Service Unavailable",
                    "text/plain",
                    "share stopped",
                );
            }
            break;
        }
        let Ok(mut stream) = stream else { continue };
        let state = Arc::clone(&state);
        std::thread::spawn(move || {
            use std::io::Read;
            let mut buf = [0u8; 4096];
            let Ok(n) = stream.read(&mut buf) else { return };
            let req = String::from_utf8_lossy(&buf[..n]);
            let first = req.lines().next().unwrap_or("").to_string();

            let unauthorized = {
                let token = state.token.lock().unwrap().clone();
                if token.is_empty() {
                    false
                } else {
                    let q_ok = req
                        .lines()
                        .next()
                        .map(|l| l.contains(&format!("token={token}")))
                        .unwrap_or(false);
                    let h_ok = req.to_lowercase().contains(&format!("x-token: {token}"));
                    !(q_ok || h_ok)
                }
            };

            if !first.starts_with("GET /nodes.json") {
                respond(&mut stream, "404 Not Found", "text/plain", "not found");
            } else if unauthorized {
                respond(&mut stream, "401 Unauthorized", "text/plain", "invalid token");
            } else {
                let payload = state.payload.lock().unwrap().clone();
                respond(&mut stream, "200 OK", "application/json", &payload);
            }
        });
    }
}

#[tauri::command]
fn share_local_ip() -> String {
    local_ipv4()
}

#[tauri::command]
fn share_start(port: u16, token: String, state: tauri::State<'_, ShareState>) -> Result<(), String> {
    if state.running.load(Ordering::SeqCst) {
        *state.token.lock().unwrap() = token;
        return Ok(());
    }
    let listener =
        TcpListener::bind(("0.0.0.0", port)).map_err(|e| format!("监听 {port} 失败：{e}"))?;
    listener
        .set_nonblocking(false)
        .map_err(|e| format!("设置监听失败：{e}"))?;
    *state.token.lock().unwrap() = token;
    state.running.store(true, Ordering::SeqCst);
    let st = Arc::new(state.inner().clone());
    std::thread::spawn(move || {
        serve(listener, st);
        // serve 返回（收到 running=false 的新连接后 break），监听 socket 随线程结束释放
    });
    Ok(())
}

#[tauri::command]
fn share_stop(state: tauri::State<'_, ShareState>) {
    state.running.store(false, Ordering::SeqCst);
}

#[tauri::command]
fn share_set_token(token: String, state: tauri::State<'_, ShareState>) {
    *state.token.lock().unwrap() = token;
}

#[tauri::command]
fn share_set_payload(payload: String, state: tauri::State<'_, ShareState>) {
    *state.payload.lock().unwrap() = payload;
}

#[tauri::command]
fn share_status(state: tauri::State<'_, ShareState>) -> bool {
    state.running.load(Ordering::SeqCst)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_http::init())
        .manage(ShareState::default())
        .invoke_handler(tauri::generate_handler![
            share_local_ip,
            share_start,
            share_stop,
            share_set_token,
            share_set_payload,
            share_status
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
