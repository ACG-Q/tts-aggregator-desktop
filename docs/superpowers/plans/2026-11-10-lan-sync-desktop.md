# 桌面端局域网同步实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 在桌面端把旧的常驻「局域网分享」替换为按需启动的局域网同步：mDNS 广播 + 二维码配对，一次 HTTP 往返双向合并节点。

**架构：** Rust 侧 `lan_sync` 模块负责 HTTP 服务端、mDNS 广播与会话校验，入站请求通过 Tauri 事件交给前端确认；前端用纯函数完成配对串解析与节点合并，出站请求走 `@tauri-apps/plugin-http`。

**技术栈：** Tauri 2、axum 0.8、tokio 1、mdns-sd、rand、React 19、zustand、vitest、qrcode.react。

**范围说明：** 本计划只覆盖桌面端。协议与安卓端见 `docs/superpowers/specs/2026-11-10-lan-sync-design.md` 与另一份安卓计划。

**工作目录：** 所有命令均在 `tts-aggregator-desktop/` 下执行。

---

## 文件结构

| 文件 | 职责 |
| --- | --- |
| `src-tauri/src/lan_sync/protocol.rs` | 协议类型、URL 规范化、入站节点清洗 |
| `src-tauri/src/lan_sync/http.rs` | axum 路由、sid 校验、确认通道、超时 |
| `src-tauri/src/lan_sync/mdns.rs` | `_pulse-tts._tcp` 注册与注销 |
| `src-tauri/src/lan_sync/mod.rs` | 生命周期状态、Tauri 命令、事件 |
| `src-tauri/src/lib.rs` | 移除分享代码，挂载 lan_sync |
| `src/lib/lanSync.ts` | 配对串、节点裁剪、合并纯函数 |
| `src/lib/lanSync.test.ts` | 上述纯函数单测 |
| `src/store/lanSyncStore.ts` | 同步状态机与出站/入站编排 |
| `src/store/nodesStore.ts` | 新增 `mergeSynced` |
| `src/components/settings/SetBits.tsx` | 从设置页抽出的 `SetCard` / `SetRow` / `Switch` |
| `src/components/PairingQr.tsx` | 二维码封装 |
| `src/components/settings/LanSyncSection.tsx` | 设置页区块 |
| `src/pages/SettingsPage.tsx` | 删除分享区块，接入 LanSyncSection |

---

### 任务 1：移除旧局域网分享实现

**文件：**
- 修改：`src-tauri/src/lib.rs`（整体删减）
- 修改：`src/main.tsx:8,58-62`
- 修改：`src/store/settingsStore.ts:3-11,17,23,30,38,53-64`
- 修改：`src/store/nodesStore.ts:6,43,56,92,110,116`
- 修改：`src/components/settings/DataSection.tsx:18,123`
- 修改：`src/types/models.ts:44`
- 修改：`src/pages/SettingsPage.tsx:19,29,36,116-149,473-550`
- 删除：`src/lib/share.ts`、`src/lib/share.test.ts`、`src/store/shareSync.ts`

- [ ] **步骤 1：删除分享相关文件**

```bash
git rm src/lib/share.ts src/lib/share.test.ts src/store/shareSync.ts
```

- [ ] **步骤 2：清理 `types/models.ts`**

删除 `ShareConfig` 类型与 `defaultShare` 函数（`grep -n "ShareConfig\|defaultShare" src` 应无残留）。

```ts
// 删除这一行
export interface ShareConfig { enabled: boolean; port: number; token: string; localhostOnly: boolean }
```

```ts
// 删除 defaultShare 函数整体
export function defaultShare(): ShareConfig { ... }
```

- [ ] **步骤 3：清理 `settingsStore.ts`**

```ts
import {
  DEFAULT_APP_PREFS, DEFAULT_POOL, DEFAULT_SYNTH,
  normalizeAppPrefs, normalizeSynth,
  type AppPrefs, type PoolConfig, type SynthSettings,
} from '../types/models';
```

```ts
interface SettingsState {
  synth: SynthSettings;
  pool: PoolConfig;
  appPrefs: AppPrefs;
  loaded: boolean;
  load(): Promise<void>;
  saveSynth(s: SynthSettings): Promise<void>;
  updatePool(fn: (c: PoolConfig) => PoolConfig): Promise<void>;
  saveAppPrefs(p: AppPrefs): Promise<void>;
}
```

```ts
  synth: DEFAULT_SYNTH,
  pool: DEFAULT_POOL,
  appPrefs: DEFAULT_APP_PREFS,
```

```ts
      synth: normalizeSynth(await s.getJson('synth_settings', DEFAULT_SYNTH)),
      pool: await s.getJson('pool_config', DEFAULT_POOL),
      appPrefs: normalizeAppPrefs(await s.getJson<Partial<AppPrefs>>('app_prefs', {})),
```

```ts
  async updatePool(fn) {
    const pool = fn(get().pool);
    set({ pool });
    await deps().settings.setJson('pool_config', pool);
  },
```

删除 `saveShare` 整个方法，并删除 `import { invoke }` 与 `import { notifyShare }`。

- [ ] **步骤 4：清理其余 `notifyShare` 调用点**

`src/main.tsx`：删掉 `setShareProvider` 的 import 与 58–62 行的调用块。
`src/store/nodesStore.ts`：删掉 import 与全部 `await notifyShare();` 行。
`src/components/settings/DataSection.tsx`：删掉 import 与第 123 行调用。

- [ ] **步骤 5：替换 `lib.rs` 为不含分享功能的骨架**

```rust
use std::net::{Ipv4Addr, UdpSocket};

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
        .invoke_handler(tauri::generate_handler![lan_local_ip])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **步骤 6：删除设置页的分享区块**

`src/pages/SettingsPage.tsx`：

```ts
type SectionKey = 'voice' | 'appearance' | 'schedule' | 'data';
const SECTIONS: [SectionKey, string, string][] = [
  ['voice', '语音参数', '默认音色、语速与音调'],
  ['appearance', '外观与播放', '主题与默认播放速度'],
  ['schedule', '调度与探测', '失败冷却与探测行为'],
  ['data', '数据', '导出与导入配置'],
];
```

删除组件内 `share` / `saveShare` 解构、`copied` / `ip` / `running` state、`useEffect` 中的 `share_local_ip` / `share_status` 调用、`toggleShare()`、`shareUrl()`、以及 `{active === 'share' && (...)}` 整段（约 473–550 行）。同时删除未再使用的 `Copy`、`Check` 图标 import（其余图标保留）。

- [ ] **步骤 7：类型检查与测试**

```bash
npx tsc --noEmit
npm test
```

预期：tsc 无输出；vitest 全绿（分享单测已随文件删除）。

- [ ] **步骤 8：Commit**

```bash
git add -A
git commit -m "refactor(share): 移除常驻局域网分享服务"
```

---

### 任务 2：Rust 协议层

**文件：**
- 创建：`src-tauri/src/lan_sync/protocol.rs`
- 修改：`src-tauri/src/lan_sync/mod.rs`（本任务只需 `pub mod protocol;` 这一条模块声明）

- [ ] **步骤 1：先写失败的单测**

创建 `src-tauri/src/lan_sync/protocol.rs`，先只写测试与签名：

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_strips_default_port_and_trailing_slash() {
        assert_eq!(normalize_url("https://A.example.com:443/"), Some("https://a.example.com".into()));
        assert_eq!(normalize_url("http://a.example.com:80/tts/"), Some("http://a.example.com/tts".into()));
        assert_eq!(normalize_url("http://a.example.com:8080/"), Some("http://a.example.com:8080".into()));
    }

    #[test]
    fn normalize_rejects_non_http() {
        assert_eq!(normalize_url("ftp://a.example.com"), None);
        assert_eq!(normalize_url("a.example.com"), None);
        assert_eq!(normalize_url("   "), None);
    }

    #[test]
    fn sanitize_drops_invalid_and_dedupes_last_wins() {
        let nodes = vec![
            SyncedNode::new("https://a.example.com/", "旧"),
            SyncedNode::new("ftp://bad", "坏"),
            SyncedNode::new("https://A.example.com", "新"),
        ];
        let out = sanitize_nodes(nodes);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].label, "新");
        assert_eq!(out[0].url, "https://a.example.com");
    }
}
```

- [ ] **步骤 2：运行，确认编译失败**

```bash
cd src-tauri
cargo test lan_sync
```

预期：FAIL，报 `cannot find function normalize_url` / `SyncedNode::new`。

- [ ] **步骤 3：实现协议层**

在测试模块上方写入：

```rust
use serde::{Deserialize, Serialize};

pub const PROTOCOL_VERSION: u32 = 1;
pub const MAX_NODES: usize = 500;
pub const MAX_BODY_BYTES: usize = 1024 * 1024;
pub const CONFIRM_TIMEOUT_SECS: u64 = 60;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SyncedNode {
    pub url: String,
    #[serde(default)]
    pub label: String,
    #[serde(default = "unknown")]
    pub health: String,
    #[serde(default = "unknown")]
    pub api_version: String,
    #[serde(default)]
    pub default_voice: String,
    #[serde(default)]
    pub voice_count: i64,
    #[serde(default)]
    pub group: Option<String>,
    #[serde(default)]
    pub keyless: Option<bool>,
}

fn unknown() -> String {
    "UNKNOWN".to_string()
}

impl SyncedNode {
    pub fn new(url: &str, label: &str) -> Self {
        Self {
            url: url.to_string(),
            label: label.to_string(),
            health: unknown(),
            api_version: unknown(),
            default_voice: String::new(),
            voice_count: 0,
            group: None,
            keyless: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PeerInfo {
    pub name: String,
    pub platform: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PingResponse {
    pub name: String,
    pub platform: String,
    pub v: u32,
    pub nodes: usize,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SyncRequest {
    pub from: PeerInfo,
    #[serde(default)]
    pub nodes: Vec<SyncedNode>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncResponse {
    pub nodes: Vec<SyncedNode>,
    pub applied: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct ErrorBody {
    pub reason: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingPayload {
    pub request_id: String,
    pub from: PeerInfo,
    pub nodes: Vec<SyncedNode>,
}

pub fn normalize_url(raw: &str) -> Option<String> {
    let s = raw.trim();
    let rest = if let Some(r) = strip_scheme(s, "http://") {
        ("http", r)
    } else if let Some(r) = strip_scheme(s, "https://") {
        ("https", r)
    } else {
        return None;
    };
    let (scheme, rest) = rest;
    let rest = rest.split(['?', '#']).next().unwrap_or("");
    let (authority, path) = match rest.split_once('/') {
        Some((a, p)) => (a, p),
        None => (rest, ""),
    };
    let authority = authority.to_ascii_lowercase();
    if authority.is_empty() {
        return None;
    }
    let default_port = if scheme == "http" { ":80" } else { ":443" };
    let authority = authority.strip_suffix(default_port).unwrap_or(&authority);
    let path = path.trim_end_matches('/');
    Some(if path.is_empty() {
        format!("{scheme}://{authority}")
    } else {
        format!("{scheme}://{authority}/{path}")
    })
}

fn strip_scheme<'a>(s: &'a str, prefix: &str) -> Option<&'a str> {
    if s.len() >= prefix.len() && s[..prefix.len()].eq_ignore_ascii_case(prefix) {
        Some(&s[prefix.len()..])
    } else {
        None
    }
}

/// 丢弃非法 URL，并把规范化后的结果去重（后出现的覆盖先出现的）。
pub fn sanitize_nodes(nodes: Vec<SyncedNode>) -> Vec<SyncedNode> {
    let mut map: Vec<(String, SyncedNode)> = Vec::new();
    for node in nodes {
        let Some(url) = normalize_url(&node.url) else { continue };
        let item = SyncedNode { url: url.clone(), ..node };
        match map.iter_mut().find(|(k, _)| *k == url) {
            Some((_, slot)) => *slot = item,
            None => map.push((url, item)),
        }
    }
    map.into_iter().map(|(_, n)| n).collect()
}
```

- [ ] **步骤 4：运行测试**

```bash
cd src-tauri
cargo test lan_sync::protocol
```

预期：3 个测试 PASS。

- [ ] **步骤 5：Commit**

```bash
git add src-tauri/src/lan_sync
git commit -m "feat(lan-sync): 协议类型与 URL 规范化"
```

---

### 任务 3：Rust HTTP 层

**文件：**
- 创建：`src-tauri/src/lan_sync/http.rs`
- 修改：`src-tauri/Cargo.toml`

- [ ] **步骤 1：添加依赖**

```toml
axum = "0.8"
tokio = { version = "1", features = ["rt-multi-thread", "macros", "sync", "time", "net"] }
rand = "0.8"
mdns-sd = "0.13"
```

```bash
cd src-tauri
cargo build
```

预期：依赖下载并编译成功。

- [ ] **步骤 2：写 HTTP 层与单测**

创建 `src-tauri/src/lan_sync/http.rs`：

```rust
use std::sync::{Arc, Mutex};
use std::time::Duration;

use axum::body::Bytes;
use axum::extract::{DefaultBodyLimit, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::Serialize;
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

async fn sync(
    State(shared): State<Arc<Shared>>,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
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
        _ => {
            shared.pending.lock().unwrap().take();
            fail(StatusCode::REQUEST_TIMEOUT, "timeout")
        }
    }
}

fn fail(code: StatusCode, reason: &str) -> Response {
    (code, Json(ErrorBody { reason: reason.to_string() })).into_response()
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
    let Some(pending) = guard.as_ref() else { return false };
    if pending.request_id != request_id {
        return false;
    }
    let Some(pending) = guard.take() else { return false };
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
        let listener = tokio::net::TcpListener::bind(("127.0.0.1", 0)).await.unwrap();
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

    async fn reqwest_json(url: &str) -> serde_json::Value {
        let text = fetch_text(url).await;
        serde_json::from_str(&text).unwrap()
    }

    async fn fetch_text(url: &str) -> String {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        let addr = url.trim_start_matches("http://");
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
```

- [ ] **步骤 3：在 `mod.rs` 中挂载模块**

```rust
pub mod http;
pub mod protocol;
```

`src-tauri/src/lan_sync/mod.rs` 暂时只有上面两行，并在文件末尾加：

```rust
pub fn random_hex(bytes: usize) -> String {
    use rand::RngCore;
    let mut buf = vec![0u8; bytes];
    rand::thread_rng().fill_bytes(&mut buf);
    buf.iter().map(|b| format!("{b:02x}")).collect()
}
```

- [ ] **步骤 4：运行测试**

```bash
cd src-tauri
cargo test lan_sync::http
```

预期：2 个测试 PASS（`ping_reports_name_and_count`、`sync_rejects_wrong_sid`）。

- [ ] **步骤 5：Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/lan_sync
git commit -m "feat(lan-sync): HTTP 端点、会话校验与确认通道"
```

---

### 任务 4：Rust mDNS 广播

**文件：**
- 创建：`src-tauri/src/lan_sync/mdns.rs`
- 修改：`src-tauri/src/lan_sync/mod.rs`

- [ ] **步骤 1：实现注册与注销**

```rust
use mdns_sd::{ServiceDaemon, ServiceInfo};

const SERVICE_TYPE: &str = "_pulse-tts._tcp.local.";

pub struct MdnsRegistration {
    daemon: ServiceDaemon,
    fullname: String,
}

impl MdnsRegistration {
    pub fn register(device_name: &str, sid: &str, port: u16, nodes: usize) -> Result<Self, String> {
        let daemon = ServiceDaemon::new().map_err(|e| format!("mDNS 初始化失败：{e}"))?;
        let instance = sanitize_instance(device_name);
        let host = format!("{}.local.", sanitize_host(device_name));
        let nodes_text = nodes.to_string();
        let props = [
            ("name", device_name),
            ("platform", "desktop"),
            ("v", "1"),
            ("sid", sid),
            ("nodes", nodes_text.as_str()),
        ];
        let info = ServiceInfo::new(SERVICE_TYPE, &instance, &host, "", port, &props[..])
            .map_err(|e| format!("mDNS 服务信息无效：{e}"))?
            .enable_addr_auto();
        let fullname = info.get_fullname().to_string();
        daemon
            .register(info)
            .map_err(|e| format!("mDNS 注册失败：{e}"))?;
        Ok(Self { daemon, fullname })
    }
}

impl Drop for MdnsRegistration {
    fn drop(&mut self) {
        let _ = self.daemon.unregister(&self.fullname);
        let _ = self.daemon.shutdown();
    }
}

fn sanitize_instance(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '-' })
        .collect();
    let trimmed = cleaned.trim_matches('-');
    if trimmed.is_empty() { "Pulse Desktop".into() } else { trimmed.to_string() }
}

fn sanitize_host(name: &str) -> String {
    sanitize_instance(name).to_ascii_lowercase()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_keeps_ascii_and_replaces_spaces() {
        assert_eq!(sanitize_instance("书房的 电脑"), "--");
        assert_eq!(sanitize_instance("Study PC"), "Study-PC");
    }
}
```

> 说明：mDNS 实例名允许 UTF-8；这里为了跨平台稳定，只用 ASCII 生成实例名与主机名，显示名仍通过 TXT `name` 传递中文。

- [ ] **步骤 2：挂载模块并测试**

`mod.rs` 增加 `pub mod mdns;`，然后：

```bash
cd src-tauri
cargo test lan_sync::mdns
```

预期：1 个测试 PASS。

- [ ] **步骤 3：Commit**

```bash
git add src-tauri/src/lan_sync
git commit -m "feat(lan-sync): mDNS 服务广播"
```

---

### 任务 5：Rust 生命周期与 Tauri 命令

**文件：**
- 修改：`src-tauri/src/lan_sync/mod.rs`
- 修改：`src-tauri/src/lib.rs`

- [ ] **步骤 1：实现状态与命令**

在 `mod.rs` 中追加：

```rust
use std::sync::{Arc, Mutex};

use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

pub struct LanSyncHandle {
    active: Mutex<Option<Active>>,
}

impl Default for LanSyncHandle {
    fn default() -> Self {
        Self { active: Mutex::new(None) }
    }
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

#[tauri::command]
pub async fn lan_sync_start(
    app: AppHandle,
    handle: State<'_, LanSyncHandle>,
    device_name: String,
    nodes: Vec<SyncedNode>,
) -> Result<SyncStatus, String> {
    lan_sync_stop(handle.clone());
    let sid = random_hex(16);
    let notify: http::NotifyFn = {
        let app = app.clone();
        Arc::new(move |payload| {
            let _ = app.emit("lan-sync://request", payload);
        })
    };
    let shared = Arc::new(http::Shared {
        sid: sid.clone(),
        device_name: device_name.clone(),
        local_nodes: Mutex::new(sanitize_nodes(nodes.clone())),
        pending: Mutex::new(None),
        notify,
    });
    let listener = tokio::net::TcpListener::bind(("0.0.0.0", 0))
        .await
        .map_err(|e| format!("无法启动同步服务：{e}"))?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let (shutdown, rx) = tokio::sync::oneshot::channel::<()>();
    let router = http::router(shared.clone());
    tauri::async_runtime::spawn(async move {
        let _ = axum::serve(listener, router)
            .with_graceful_shutdown(async {
                let _ = rx.await;
            })
            .await;
    });
    let mdns = mdns::MdnsRegistration::register(&device_name, &sid, port, nodes.len())
        .map_err(|e| format!("{e}"))?;
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
pub fn lan_sync_status(handle: State<'_, LanSyncHandle>) -> Option<SyncStatus> {
    handle.active.lock().unwrap().as_ref().map(|a| SyncStatus {
        running: true,
        port: a.port,
        sid: a.sid.clone(),
        local_ip: crate::local_ipv4(),
    })
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
    let Some(active) = guard.as_ref() else { return false };
    http::resolve_pending(&active.shared, &request_id, accept, sanitize_nodes(nodes), applied)
}
```

- [ ] **步骤 2：接入 `lib.rs`**

```rust
mod lan_sync;

use lan_sync::{LanSyncHandle, SyncStatus};

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
            lan_sync_start,
            lan_sync_set_nodes,
            lan_sync_stop,
            lan_sync_status,
            lan_sync_resolve
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

`SyncStatus` 若未直接使用可删掉该行 import；编译会提示。

- [ ] **步骤 3：编译与测试**

```bash
cd src-tauri
cargo test
```

预期：全部 PASS；`cargo build` 无 error。

- [ ] **步骤 4：Commit**

```bash
git add src-tauri/src
git commit -m "feat(lan-sync): 服务生命周期与 Tauri 命令"
```

---

### 任务 6：前端纯函数与单测

**文件：**
- 创建：`src/lib/lanSync.ts`
- 创建：`src/lib/lanSync.test.ts`

- [ ] **步骤 1：写失败测试**

```ts
import { describe, expect, it } from 'vitest';
import {
  buildPairingString, mergeNodes, normalizeUrl, parsePairingString, toSyncedNodes,
} from './lanSync';
import type { TtsNode } from '../types/models';

function node(overrides: Partial<TtsNode>): TtsNode {
  return {
    id: 'n1', baseUrl: 'https://a.example.com', label: 'A', keyless: false, apiKey: 'secret',
    health: 'OK', lastChecked: 1, defaultVoice: 'v', voiceCount: 3, failCount: 2,
    cooldownUntil: 0, disabled: true, apiVersion: 'V1', source: 'manual', ...overrides,
  };
}

describe('normalizeUrl', () => {
  it('去默认端口与末尾斜杠', () => {
    expect(normalizeUrl('https://A.example.com:443/')).toBe('https://a.example.com');
    expect(normalizeUrl('http://a.example.com:80/tts/')).toBe('http://a.example.com/tts');
    expect(normalizeUrl('http://a.example.com:8080/')).toBe('http://a.example.com:8080');
  });
  it('拒绝非 http 协议', () => {
    expect(normalizeUrl('ftp://a.example.com')).toBeNull();
    expect(normalizeUrl('a.example.com')).toBeNull();
  });
});

describe('mergeNodes', () => {
  it('新增节点不携带 apiKey，且默认未禁用', () => {
    const { nodes, result } = mergeNodes([], [
      { url: 'https://new.example.com/', label: '新', health: 'FAIL', apiVersion: 'LEGACY', defaultVoice: 'x', voiceCount: 8 },
    ]);
    expect(result).toEqual({ added: 1, updated: 0, skipped: 0, total: 1 });
    expect(nodes[0].apiKey).toBeNull();
    expect(nodes[0].disabled).toBe(false);
    expect(nodes[0].baseUrl).toBe('https://new.example.com');
  });

  it('已有节点只更新元数据，保留密钥与禁用状态', () => {
    const local = [node({})];
    const { nodes, result } = mergeNodes(local, [
      { url: 'https://a.example.com', label: '改名', health: 'FAIL', apiVersion: 'V1', defaultVoice: 'z', voiceCount: 9 },
    ]);
    expect(result.updated).toBe(1);
    expect(nodes[0].label).toBe('改名');
    expect(nodes[0].apiKey).toBe('secret');
    expect(nodes[0].disabled).toBe(true);
    expect(nodes[0].failCount).toBe(2);
  });

  it('不删除本地独有节点，非法 URL 计入 skipped', () => {
    const local = [node({ id: 'keep' })];
    const { nodes, result } = mergeNodes(local, [
      { url: 'ftp://bad', label: '', health: 'OK', apiVersion: 'V1', defaultVoice: '', voiceCount: 0 },
    ]);
    expect(result.skipped).toBe(1);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].id).toBe('keep');
  });
});

describe('toSyncedNodes', () => {
  it('裁剪掉 apiKey 等本地字段', () => {
    const out = toSyncedNodes([node({})]);
    expect(Object.keys(out[0]).sort()).toEqual(
      ['apiVersion', 'defaultVoice', 'health', 'label', 'url', 'voiceCount'],
    );
  });
});

describe('配对串', () => {
  it('生成后可原样解析', () => {
    const peer = { host: '192.168.1.20', port: 53421, sid: 'ab12', name: '书房的电脑', platform: 'desktop' as const };
    expect(parsePairingString(buildPairingString(peer))).toEqual(peer);
  });
  it('拒绝非法输入', () => {
    expect(parsePairingString('https://x')).toBeNull();
    expect(parsePairingString('pulsetts://sync?host=a&port=0&sid=x')).toBeNull();
  });
});
```

- [ ] **步骤 2：运行，确认失败**

```bash
npm test -- lanSync
```

预期：FAIL，`Cannot find module './lanSync'`。

- [ ] **步骤 3：实现 `src/lib/lanSync.ts`**

```ts
import { newId, type Health, type TtsNode, type ApiVersion } from '../types/models';

export interface SyncedNode {
  url: string;
  label?: string;
  health?: string;
  apiVersion?: string;
  defaultVoice?: string;
  voiceCount?: number;
  group?: string;
  keyless?: boolean;
}

export interface Peer {
  host: string;
  port: number;
  sid: string;
  name: string;
  platform: 'desktop' | 'android';
}

export interface SyncNodeResult {
  nodes: TtsNode[];
  result: { added: number; updated: number; skipped: number; total: number };
}

const HEALTHS: Health[] = ['OK', 'FAIL', 'UNKNOWN'];
const API_VERSIONS: ApiVersion[] = ['V1', 'LEGACY', 'UNKNOWN'];

export function normalizeUrl(raw: string): string | null {
  const s = raw.trim();
  if (!/^https?:\/\//i.test(s)) return null;
  let url: URL;
  try {
    url = new URL(s);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (!url.hostname) return null;
  const defaultPort = url.protocol === 'http:' ? '80' : '443';
  const port = url.port && url.port !== defaultPort ? `:${url.port}` : '';
  const path = url.pathname.replace(/\/+$/, '');
  return `${url.protocol}//${url.hostname}${port}${path}`;
}

export function toSyncedNodes(nodes: TtsNode[]): SyncedNode[] {
  return nodes.map((n) => ({
    url: n.baseUrl,
    label: n.label,
    health: n.health,
    apiVersion: n.apiVersion,
    defaultVoice: n.defaultVoice,
    voiceCount: n.voiceCount,
  }));
}

function asHealth(v: string | undefined): Health {
  return HEALTHS.includes(v as Health) ? (v as Health) : 'UNKNOWN';
}

function asApiVersion(v: string | undefined): ApiVersion {
  return API_VERSIONS.includes(v as ApiVersion) ? (v as ApiVersion) : 'UNKNOWN';
}

export function mergeNodes(local: TtsNode[], remote: SyncedNode[]): SyncNodeResult {
  const byUrl = new Map<string, TtsNode>();
  for (const n of local) byUrl.set(normalizeUrl(n.baseUrl) ?? n.baseUrl, n);

  const remoteByUrl = new Map<string, { key: string; node: SyncedNode }>();
  let skipped = 0;
  for (const r of remote) {
    const key = normalizeUrl(r.url);
    if (!key) {
      skipped++;
      continue;
    }
    remoteByUrl.set(key, { key, node: r });
  }

  const next = [...local];
  let added = 0;
  let updated = 0;

  for (const [key, { node: r }] of remoteByUrl) {
    const existing = byUrl.get(key);
    if (existing) {
      const index = next.findIndex((n) => n.id === existing.id);
      next[index] = {
        ...existing,
        label: r.label ?? existing.label,
        health: asHealth(r.health),
        apiVersion: asApiVersion(r.apiVersion),
        defaultVoice: r.defaultVoice ?? existing.defaultVoice,
        voiceCount: r.voiceCount ?? existing.voiceCount,
      };
      updated++;
      continue;
    }
    const fresh: TtsNode = {
      id: newId(),
      baseUrl: key,
      label: r.label ?? '',
      keyless: r.keyless ?? false,
      apiKey: null,
      health: asHealth(r.health),
      lastChecked: 0,
      defaultVoice: r.defaultVoice ?? '',
      voiceCount: r.voiceCount ?? 0,
      failCount: 0,
      cooldownUntil: 0,
      disabled: false,
      apiVersion: asApiVersion(r.apiVersion),
      source: 'manual',
    };
    next.push(fresh);
    byUrl.set(key, fresh);
    added++;
  }

  return {
    nodes: next,
    result: { added, updated, skipped, total: added + updated },
  };
}

export function buildPairingString(peer: Peer): string {
  const params = new URLSearchParams({
    host: peer.host,
    port: String(peer.port),
    sid: peer.sid,
    name: peer.name,
    platform: peer.platform,
  });
  return `pulsetts://sync?${params.toString()}`;
}

export function parsePairingString(raw: string): Peer | null {
  const text = raw.trim();
  if (!text.toLowerCase().startsWith('pulsetts://sync')) return null;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== 'pulsetts:') return null;
  const host = url.searchParams.get('host')?.trim();
  const sid = url.searchParams.get('sid')?.trim();
  const name = url.searchParams.get('name')?.trim() || '对端设备';
  const platform = url.searchParams.get('platform') === 'android' ? 'android' : 'desktop';
  const port = Number(url.searchParams.get('port'));
  if (!host || !sid) return null;
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  return { host, port, sid, name, platform };
}
```

- [ ] **步骤 4：运行测试**

```bash
npm test -- lanSync
```

预期：全部 PASS。

- [ ] **步骤 5：Commit**

```bash
git add src/lib/lanSync.ts src/lib/lanSync.test.ts
git commit -m "feat(lan-sync): 配对串与节点合并纯函数"
```

---

### 任务 7：`nodesStore.mergeSynced`

**文件：**
- 修改：`src/store/nodesStore.ts`
- 修改：`src/store/nodesStore.test.ts`（若不存在则创建）

- [ ] **步骤 1：写失败测试**

创建/追加 `src/store/nodesStore.test.ts`：

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TtsNode } from '../types/models';

const saved: TtsNode[] = [];
const upsert = vi.fn(async (n: TtsNode) => { saved.push(n); });

vi.mock('./deps', () => ({
  deps: () => ({ nodes: { upsert, getAll: async () => [...saved], delete: vi.fn(), setDisabled: vi.fn() } }),
}));

import { useNodesStore } from './nodesStore';

describe('mergeSynced', () => {
  beforeEach(() => {
    saved.length = 0;
    upsert.mockClear();
    useNodesStore.setState({ nodes: [] });
  });

  it('新增远端节点并写入仓库，不触发探测', async () => {
    const result = await useNodesStore.getState().mergeSynced([
      { url: 'https://b.example.com', label: 'B', health: 'OK', apiVersion: 'V1', defaultVoice: '', voiceCount: 1 },
    ]);
    expect(result).toEqual({ added: 1, updated: 0, skipped: 0, total: 1 });
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(useNodesStore.getState().nodes).toHaveLength(1);
  });
});
```

- [ ] **步骤 2：运行，确认失败**

```bash
npm test -- nodesStore
```

预期：FAIL，`mergeSynced is not a function`。

- [ ] **步骤 3：实现**

`nodesStore.ts` 增加 import：

```ts
import { mergeNodes, type SyncedNode, type SyncNodeResult } from '../lib/lanSync';
```

接口增加：

```ts
  mergeSynced(remote: SyncedNode[]): Promise<SyncNodeResult['result']>;
```

实现：

```ts
  async mergeSynced(remote) {
    if (remote.length === 0) return { added: 0, updated: 0, skipped: 0, total: 0 };
    const { nodes, result } = mergeNodes(get().nodes, remote);
    const before = new Map(get().nodes.map((n) => [n.id, n]));
    for (const node of nodes) {
      if (before.get(node.id) !== node) await deps().nodes.upsert(node);
    }
    await get().load();
    return result;
  },
```

- [ ] **步骤 4：运行测试**

```bash
npm test -- nodesStore
```

预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add src/store/nodesStore.ts src/store/nodesStore.test.ts
git commit -m "feat(nodes): 支持局域网同步的合并写入"
```

---

### 任务 8：同步状态机

**文件：**
- 创建：`src/store/lanSyncStore.ts`

- [ ] **步骤 1：实现 store**

```ts
import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { fetch as httpFetch } from '@tauri-apps/plugin-http';
import {
  buildPairingString, mergeNodes, toSyncedNodes,
  type Peer, type SyncedNode,
} from '../lib/lanSync';
import { useNodesStore } from './nodesStore';

export type LanSyncPhase =
  | 'idle' | 'starting' | 'waiting' | 'requesting' | 'syncing' | 'done' | 'error';

interface SyncStatus {
  running: boolean;
  port: number;
  sid: string;
  localIp: string;
}

export interface PendingRequest {
  requestId: string;
  from: { name: string; platform: string };
  nodes: SyncedNode[];
}

interface LanSyncState {
  phase: LanSyncPhase;
  status: SyncStatus | null;
  pending: PendingRequest | null;
  message: string | null;
  result: { added: number; updated: number; skipped: number } | null;
  deviceName: string;
  start(deviceName: string): Promise<void>;
  refresh(): Promise<void>;
  stop(): Promise<void>;
  syncTo(peer: Peer): Promise<void>;
  accept(): Promise<void>;
  reject(): Promise<void>;
  bind(): Promise<UnlistenFn>;
}

const TIMEOUT_MS = 8000;

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export const useLanSyncStore = create<LanSyncState>((set, get) => ({
  phase: 'idle',
  status: null,
  pending: null,
  message: null,
  result: null,
  deviceName: '书房的电脑',

  async refresh() {
    try {
      const status = await invoke<SyncStatus | null>('lan_sync_status');
      set({ status, phase: status ? 'waiting' : 'idle' });
    } catch {
      set({ status: null, phase: 'idle' });
    }
  },

  async start(deviceName) {
    set({ phase: 'starting', message: null, result: null, deviceName });
    try {
      const nodes = toSyncedNodes(useNodesStore.getState().nodes);
      const status = await invoke<SyncStatus>('lan_sync_start', { deviceName, nodes });
      set({ status: { ...status, localIp: status.localIp }, phase: 'waiting' });
    } catch (e) {
      set({ phase: 'error', message: errorText(e) });
    }
  },

  async stop() {
    await invoke('lan_sync_stop').catch(() => undefined);
    set({ status: null, pending: null, phase: 'idle' });
  },

  async syncTo(peer) {
    set({ phase: 'syncing', message: null, result: null });
    try {
      const from = { name: get().deviceName, platform: 'desktop' };
      const nodes = toSyncedNodes(useNodesStore.getState().nodes);
      const res = await httpFetch(`http://${peer.host}:${peer.port}/v1/sync`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-sync-session': peer.sid },
        body: JSON.stringify({ from, nodes }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.status === 403) {
        set({ phase: 'error', message: '对方拒绝了本次同步' });
        return;
      }
      if (res.status === 408) {
        set({ phase: 'error', message: '对方 60 秒内未确认' });
        return;
      }
      if (!res.ok) {
        set({ phase: 'error', message: `同步失败（${res.status}）` });
        return;
      }
      const body = await res.json() as { nodes: SyncedNode[]; applied: number };
      const result = await useNodesStore.getState().mergeSynced(body.nodes ?? []);
      set({ phase: 'done', result });
    } catch {
      set({ phase: 'error', message: '无法连接到设备，请确认在同一 Wi-Fi' });
    }
  },

  async accept() {
    const pending = get().pending;
    if (!pending) return;
    try {
      const merged = mergeNodes(useNodesStore.getState().nodes, pending.nodes);
      const applied = merged.result.total;
      await invoke('lan_sync_resolve', {
        requestId: pending.requestId,
        accept: true,
        nodes: toSyncedNodes(merged.nodes),
        applied,
      });
      const result = await useNodesStore.getState().mergeSynced(pending.nodes);
      set({ pending: null, phase: 'done', result });
    } catch (e) {
      set({ pending: null, phase: 'error', message: errorText(e) });
    }
  },

  async reject() {
    const pending = get().pending;
    set({ pending: null, phase: 'waiting' });
    if (!pending) return;
    await invoke('lan_sync_resolve', {
      requestId: pending.requestId, accept: false, nodes: [], applied: 0,
    }).catch(() => undefined);
  },

  bind() {
    return listen<{ requestId: string; from: { name: string; platform: string }; nodes: SyncedNode[] }>(
      'lan-sync://request',
      (event) => {
        set({ pending: event.payload, phase: 'requesting' });
        setTimeout(() => {
          if (get().pending?.requestId === event.payload.requestId) {
            void get().reject();
            set({ message: '请求已超时' });
          }
        }, 60_000);
      },
    );
  },
}));

export function pairInfo(status: SyncStatus | null, name: string): Peer | null {
  if (!status) return null;
  return {
    host: status.localIp,
    port: status.port,
    sid: status.sid,
    name,
    platform: 'desktop',
  };
}

export { buildPairingString };
```

- [ ] **步骤 2：类型检查**

```bash
npx tsc --noEmit
```

预期：无输出。

- [ ] **步骤 3：Commit**

```bash
git add src/store/lanSyncStore.ts
git commit -m "feat(lan-sync): 同步状态机与出站请求"
```

---

### 任务 9：设置页 UI

**文件：**
- 创建：`src/components/settings/SetBits.tsx`
- 创建：`src/components/PairingQr.tsx`
- 创建：`src/components/settings/LanSyncSection.tsx`
- 修改：`src/pages/SettingsPage.tsx`
- 修改：`src/main.tsx`（绑定事件）
- 修改：`package.json`

- [ ] **步骤 1：安装二维码依赖**

```bash
npm install qrcode.react@^4.2.0
```

- [ ] **步骤 2：抽出共享 UI 组件**

`src/components/settings/SetBits.tsx`：把 `SettingsPage.tsx` 中的 `Switch`、`SetCard`、`SetRow` 原样搬过来并 `export`。

```tsx
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Switch({ checked, onCheckedChange, label }: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'relative h-[22px] w-[38px] shrink-0 rounded-full border transition-colors',
        checked ? 'border-primary/60 bg-primary/80' : 'border-line-strong bg-surface-3',
      )}
    >
      <span
        className={cn(
          'absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-white shadow-sm transition-[left]',
          checked ? 'left-[17px]' : 'left-[3px]',
        )}
      />
    </button>
  );
}

export function SetCard({ title, children, danger }: { title: string; children: ReactNode; danger?: boolean }) {
  return (
    <div className="mb-3.5 rounded-[13px] border border-line bg-card px-[18px] py-1">
      <div className={cn('pb-0.5 pt-3.5 text-[12px] font-semibold', danger && 'text-destructive')}>
        {title}
      </div>
      {children}
    </div>
  );
}

export function SetRow({ title, desc, control, stacked }: {
  title: string;
  desc: string;
  control: ReactNode;
  stacked?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex gap-6 border-t border-line py-[15px] first-of-type:border-t-0',
        stacked ? 'flex-col' : 'items-center justify-between',
      )}
    >
      <div className="min-w-0">
        <b className="block text-[12.5px] font-semibold">{title}</b>
        <span className="mt-[3px] block text-[10.5px] text-muted-foreground">{desc}</span>
      </div>
      <div className={cn('flex shrink-0 items-center gap-2.5', stacked && 'w-full')}>{control}</div>
    </div>
  );
}
```

`SettingsPage.tsx` 删除这三个本地定义，改为 `import { SetCard, SetRow, Switch } from '@/components/settings/SetBits';`。

- [ ] **步骤 3：二维码组件**

`src/components/PairingQr.tsx`：

```tsx
import { QRCodeSVG } from 'qrcode.react';

export function PairingQr({ value, size = 160 }: { value: string; size?: number }) {
  return (
    <div className="rounded-[10px] bg-white p-2.5">
      <QRCodeSVG value={value} size={size} level="M" bgColor="#ffffff" fgColor="#1a1e18" />
    </div>
  );
}
```

- [ ] **步骤 4：同步区块**

`src/components/settings/LanSyncSection.tsx`：

```tsx
import { useEffect, useState } from 'react';
import { Check, Copy, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SetCard, SetRow, Switch } from '@/components/settings/SetBits';
import { PairingQr } from '@/components/PairingQr';
import { buildPairingString, parsePairingString } from '@/lib/lanSync';
import { pairInfo, useLanSyncStore } from '@/store/lanSyncStore';
import { useNodesStore } from '@/store/nodesStore';
import { cn } from '@/lib/utils';

export function LanSyncSection() {
  const {
    phase, status, pending, message, result, deviceName,
    start, refresh, stop, syncTo, accept, reject, bind,
  } = useLanSyncStore();
  const nodes = useNodesStore((s) => s.nodes);
  const [pairing, setPairing] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    void refresh();
    const unlisten = bind();
    return () => { void unlisten.then((fn) => fn()); };
  }, [bind, refresh]);

  const running = Boolean(status?.running);
  const peer = pairInfo(status, deviceName);
  const link = peer ? buildPairingString(peer) : '';

  async function connect(): Promise<void> {
    const parsed = parsePairingString(pairing);
    if (!parsed) {
      useLanSyncStore.setState({ message: '配对串无效' });
      return;
    }
    await syncTo(parsed);
  }

  return (
    <section>
      <div className="mb-4">
        <h2 className="text-[17px] font-semibold tracking-[-0.01em]">局域网同步</h2>
        <p className="mt-1 text-[11.5px] text-muted-foreground">
          同一 Wi-Fi 下的手机可以发现这台电脑，一键双向合并节点。只同步节点，不传密钥。
        </p>
      </div>

      <SetCard title="同步服务">
        <SetRow
          title="服务状态"
          desc={running ? `监听 ${status?.localIp}:${status?.port}` : '当前未开启。'}
          control={
            <Switch
              label="局域网同步"
              checked={running}
              onCheckedChange={(v) => { if (v) void start(deviceName); else void stop(); }}
            />
          }
        />

        {running && peer && (
          <>
            <SetRow
              stacked
              title="手机扫码"
              desc="用系统相机扫码即可发起同步；也可以把下面的配对串发到手机粘贴。"
              control={
                <div className="flex w-full flex-col items-start gap-3">
                  <PairingQr value={link} />
                  <div className="flex w-full gap-2">
                    <Input className="grow font-mono text-[10.5px]" readOnly value={link} onFocus={(e) => e.target.select()} />
                    <Button variant="outline" onClick={() => {
                      void navigator.clipboard.writeText(link);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    }}>
                      {copied ? <Check className="mr-1 h-4 w-4" /> : <Copy className="mr-1 h-4 w-4" />}
                      {copied ? '已复制' : '复制'}
                    </Button>
                  </div>
                </div>
              }
            />
            <SetRow
              stacked
              title="连接手机"
              desc="粘贴手机端显示的配对串。"
              control={
                <div className="flex w-full gap-2">
                  <Input
                    className="grow font-mono text-[11px]"
                    placeholder="pulsetts://sync?host=…"
                    value={pairing}
                    onChange={(e) => setPairing(e.target.value)}
                  />
                  <Button onClick={() => void connect()} disabled={!pairing.trim() || phase === 'syncing'}>
                    {phase === 'syncing' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                    连接
                  </Button>
                </div>
              }
            />
            <SetRow
              title="本机节点"
              desc="开启同步后，节点的健康与音色信息会随广播刷新。"
              control={<span className="text-[12px] text-muted-foreground">{nodes.length} 个</span>}
            />
          </>
        )}
      </SetCard>

      {pending && (
        <SetCard title="待确认的同步请求">
          <SetRow
            title={`${pending.from.name} 请求同步`}
            desc={`将发送 ${pending.nodes.length} 个节点，并接收本机的 ${nodes.length} 个节点。`}
            control={
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => void reject()}>拒绝</Button>
                <Button onClick={() => void accept()}>确认同步</Button>
              </div>
            }
          />
        </SetCard>
      )}

      {result && (
        <div className={cn('mb-3.5 rounded-[10px] border border-line bg-card px-4 py-3 text-[11.5px]')}>
          同步完成：新增 {result.added}，更新 {result.updated}，跳过 {result.skipped}。
        </div>
      )}
      {message && (
        <div className="mb-3.5 rounded-[10px] border border-destructive/30 bg-destructive/8 px-4 py-3 text-[11.5px] text-destructive">
          {message}
        </div>
      )}
    </section>
  );
}
```

> 说明：`start` 只由开关触发，不需要额外的 effect。

- [ ] **步骤 5：接入设置页**

`SettingsPage.tsx`：

```tsx
type SectionKey = 'voice' | 'appearance' | 'schedule' | 'data' | 'sync';

const SECTIONS: [SectionKey, string, string][] = [
  ['voice', '语音参数', '默认音色、语速与音调'],
  ['appearance', '外观与播放', '主题与默认播放速度'],
  ['schedule', '调度与探测', '失败冷却与探测行为'],
  ['data', '数据', '导出与导入配置'],
  ['sync', '局域网同步', '与手机双向合并节点'],
];
```

```tsx
{active === 'sync' && <LanSyncSection />}
```

```tsx
import { LanSyncSection } from '@/components/settings/LanSyncSection';
```

- [ ] **步骤 6：节点变化时刷新广播**

`src/components/settings/LanSyncSection.tsx` 增加：

```tsx
useEffect(() => {
  if (!status?.running) return;
  void invoke('lan_sync_set_nodes', { nodes: toSyncedNodes(nodes) }).catch(() => undefined);
}, [nodes, status?.running]);
```

并补 import：

```tsx
import { invoke } from '@tauri-apps/api/core';
import { toSyncedNodes } from '@/lib/lanSync';
```

- [ ] **步骤 7：类型检查与构建**

```bash
npx tsc --noEmit
npm run build
```

预期：均成功。

- [ ] **步骤 8：Commit**

```bash
git add -A
git commit -m "feat(settings): 局域网同步区块与二维码配对"
```

---

### 任务 10：全量验证与真机验收

**文件：** 无新增，仅验证。

- [ ] **步骤 1：单元与构建**

```bash
npm test
npm run build
cd src-tauri
cargo test
```

预期：vitest 全绿、构建成功、cargo test 全绿。

- [ ] **步骤 2：启动桌面端**

```bash
set WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222
npm run tauri dev
```

（PowerShell 用 `$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=9222"` 后再执行 `npm run tauri dev`。）

- [ ] **步骤 3：手工核对**

1. 设置 → 局域网同步，开关打开后显示本机地址与二维码。
2. 用手机系统相机扫二维码，确认 `pulsetts://` 能唤起 App（安卓端完成后验证）。
3. 在桌面「连接手机」粘贴合法配对串 → 进入同步；粘贴非法串 → 提示「配对串无效」。
4. 关闭开关 → 二维码与地址消失，端口不再监听。
5. 重启应用 → 同步服务默认关闭（不残留旧分享服务）。

- [ ] **步骤 4：Commit（如有调整）**

```bash
git add -A
git commit -m "chore(lan-sync): 真机验收修正"
```

---

## 规格覆盖对照

| 规格条目 | 对应任务 |
| --- | --- |
| 删除旧分享服务与设置项 | 任务 1 |
| mDNS `_pulse-tts._tcp` TXT | 任务 4 |
| `GET /v1/ping` / `POST /v1/sync` | 任务 3 |
| sid 校验、60 秒确认、413/403/408 | 任务 3、5 |
| 桌面二维码与配对串 | 任务 6、9 |
| 合并只增不删、保留 apiKey/禁用 | 任务 6、7 |
| 同步后不自动探测 | 任务 7（只 upsert + load） |
| 节点裁剪不含 apiKey | 任务 6（`toSyncedNodes`） |
| 错误提示 | 任务 8、9 |
| 测试策略 | 任务 2、3、6、7、10 |
