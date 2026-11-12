use std::sync::{Arc, Mutex};
use std::time::Duration;

use axum::body::Bytes;
use axum::extract::{DefaultBodyLimit, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use tokio::sync::oneshot;

use super::protocol::*;

pub type NotifyFn = Arc<dyn Fn(PendingPayload) + Send + Sync>;

pub struct Shared {
    pub sid: String,
    pub device_name: String,
    pub local_nodes: Mutex<Vec<SyncedNode>>,
    pub pending: Mutex<Option<Pending>>,
    pub notify: NotifyFn,
}

pub struct Pending {
    pub request_id: String,
    pub nodes: Vec<SyncedNode>,
    pub tx: oneshot::Sender<Outcome>,
}

pub enum Outcome {
    Accept { nodes: Vec<SyncedNode>, applied: usize },
    Reject,
}

pub fn router(shared: Arc<Shared>) -> Router {
    Router::new()
        .route("/v1/ping", get(ping))
        .route("/v1/sync", post(sync))
        .layer(DefaultBodyLimit::max(MAX_BODY_BYTES))
        .with_state(shared)
}

async fn ping(State(shared): State<Arc<Shared>>) -> Json<PingResponse> {
    let nodes = shared.local_nodes.lock().unwrap().len();
    Json(PingResponse {
        name: shared.device_name.clone(),
        platform: "desktop".into(),
        v: PROTOCOL_VERSION,
        nodes,
    })
}

async fn sync(State(shared): State<Arc<Shared>>, headers: HeaderMap, body: Bytes) -> Response {
    let sid = headers
        .get("x-sync-session")
        .and_then(|v| v.to_str().ok())
        .unwrap_or_default();
    if sid != shared.sid {
        return fail(StatusCode::FORBIDDEN, "rejected");
    }
    let req: SyncRequest = match serde_json::from_slice(&body) {
        Ok(v) => v,
        Err(_) => return fail(StatusCode::BAD_REQUEST, "invalid_body"),
    };
    if req.nodes.len() > MAX_NODES {
        return fail(StatusCode::PAYLOAD_TOO_LARGE, "too_large");
    }
    let offered = sanitize_nodes(req.nodes);
    let request_id = super::random_hex(8);
    let (tx, rx) = oneshot::channel();
    {
        let mut pending = shared.pending.lock().unwrap();
        if pending.is_some() {
            return fail(StatusCode::CONFLICT, "busy");
        }
        *pending = Some(Pending {
            request_id: request_id.clone(),
            nodes: offered.clone(),
            tx,
        });
    }
    (shared.notify)(PendingPayload {
        request_id: request_id.clone(),
        from: req.from,
        nodes: offered,
    });
    match tokio::time::timeout(Duration::from_secs(CONFIRM_TIMEOUT_SECS), rx).await {
        Ok(Ok(Outcome::Accept { nodes, applied })) => {
            Json(SyncResponse { nodes, applied }).into_response()
        }
        Ok(Ok(Outcome::Reject)) => {
            shared.pending.lock().unwrap().take();
            fail(StatusCode::FORBIDDEN, "rejected")
        }
        _ => {
            shared.pending.lock().unwrap().take();
            fail(StatusCode::REQUEST_TIMEOUT, "timeout")
        }
    }
}

fn fail(code: StatusCode, reason: &str) -> Response {
    (
        code,
        Json(ErrorBody {
            reason: reason.to_string(),
        }),
    )
        .into_response()
}

/// 前端确认后调用；返回是否命中待确认请求。
pub fn resolve_pending(
    shared: &Shared,
    request_id: &str,
    accept: bool,
    nodes: Vec<SyncedNode>,
    applied: usize,
) -> bool {
    let mut guard = shared.pending.lock().unwrap();
    let Some(pending) = guard.as_ref() else {
        return false;
    };
    if pending.request_id != request_id {
        return false;
    }
    let Some(pending) = guard.take() else {
        return false;
    };
    let outcome = if accept {
        Outcome::Accept { nodes, applied }
    } else {
        Outcome::Reject
    };
    pending.tx.send(outcome).is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn serve(shared: Arc<Shared>) -> String {
        let listener = tokio::net::TcpListener::bind(("127.0.0.1", 0))
            .await
            .unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move {
            axum::serve(listener, router(shared)).await.unwrap();
        });
        format!("http://{addr}")
    }

    fn shared(sid: &str, notify: NotifyFn) -> Arc<Shared> {
        Arc::new(Shared {
            sid: sid.into(),
            device_name: "测试机".into(),
            local_nodes: Mutex::new(vec![]),
            pending: Mutex::new(None),
            notify,
        })
    }

    #[tokio::test]
    async fn ping_reports_name_and_count() {
        let s = shared("abc", Arc::new(|_| {}));
        let base = serve(s).await;
        let body: serde_json::Value = reqwest_json(&format!("{base}/v1/ping")).await;
        assert_eq!(body["name"], "测试机");
        assert_eq!(body["platform"], "desktop");
        assert_eq!(body["v"], 1);
        assert_eq!(body["nodes"], 0);
    }

    #[tokio::test]
    async fn sync_rejects_wrong_sid() {
        let s = shared("abc", Arc::new(|_| {}));
        let base = serve(s).await;
        let status = post_status(&base, "wrong").await;
        assert_eq!(status, 403);
    }

    #[tokio::test]
    async fn sync_returns_403_after_user_rejects() {
        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<String>();
        let s = shared("abc", Arc::new(move |p: PendingPayload| {
            let _ = tx.send(p.request_id);
        }));
        let base = serve(s.clone()).await;
        let call = tokio::spawn(async move { post_status(&base, "abc").await });

        let request_id = rx.recv().await.expect("handler should notify the UI");
        assert!(resolve_pending(&s, &request_id, false, vec![], 0));
        assert_eq!(call.await.unwrap(), 403);
        assert!(s.pending.lock().unwrap().is_none());
    }

    #[tokio::test]
    async fn sync_returns_200_after_user_accepts() {
        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<String>();
        let s = shared("abc", Arc::new(move |p: PendingPayload| {
            let _ = tx.send(p.request_id);
        }));
        let base = serve(s.clone()).await;
        let call = tokio::spawn(async move { post_status(&base, "abc").await });

        let request_id = rx.recv().await.expect("handler should notify the UI");
        let nodes = vec![SyncedNode::new("https://local.example.com", "本机")];
        assert!(resolve_pending(&s, &request_id, true, nodes, 1));
        assert_eq!(call.await.unwrap(), 200);
    }

    async fn reqwest_json(url: &str) -> serde_json::Value {
        let text = fetch_text(url).await;
        serde_json::from_str(&text).unwrap()
    }

    async fn fetch_text(url: &str) -> String {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        let addr = url.trim_start_matches("http://").split('/').next().unwrap();
        let mut stream = tokio::net::TcpStream::connect(addr).await.unwrap();
        let req = format!("GET /v1/ping HTTP/1.1\r\nHost: {addr}\r\nConnection: close\r\n\r\n");
        stream.write_all(req.as_bytes()).await.unwrap();
        let mut buf = String::new();
        stream.read_to_string(&mut buf).await.unwrap();
        buf.split("\r\n\r\n").nth(1).unwrap_or("").to_string()
    }

    async fn post_status(base: &str, sid: &str) -> u16 {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        let addr = base.trim_start_matches("http://");
        let body = r#"{"from":{"name":"手机","platform":"android"},"nodes":[]}"#;
        let mut stream = tokio::net::TcpStream::connect(addr).await.unwrap();
        let req = format!(
            "POST /v1/sync HTTP/1.1\r\nHost: {addr}\r\nContent-Type: application/json\r\nX-Sync-Session: {sid}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
            body.len()
        );
        stream.write_all(req.as_bytes()).await.unwrap();
        let mut buf = String::new();
        stream.read_to_string(&mut buf).await.unwrap();
        buf.split_whitespace().nth(1).unwrap_or("0").parse().unwrap()
    }
}
