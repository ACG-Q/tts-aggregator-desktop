# 局域网同步设计（桌面端 + 安卓端）

日期：2026-11-10
状态：待评审
范围：`tts-aggregator-desktop`、`tts-aggregator-android`
实现顺序：先桌面端，后安卓端，共用本规格的协议与合并规则

## 背景

桌面端现有的「局域网分享」把 `nodes.json` 以常驻 HTTP 服务的形式暴露到局域网，用户需要在浏览器里下载文件再手动导入。这条路径有三个问题：

1. 常驻服务需要用户手动开端口、手动关，容易忘记关闭。
2. 只支持「下载文件再导入」，不能反向把手机节点推回电脑。
3. 导入格式与手机端 `NodeTransfer` 的格式不同，桌面导出的 JSON 手机认不全。

用户希望在同一 Wi-Fi 下，桌面与手机之间一键互传节点，双向合并，不需要任何文件操作。

## 目标与非目标

目标：

- 局域网内自动发现对端设备（mDNS），发现失败时可用二维码 / 配对串兜底。
- 一次操作完成**双向**交换：双方各自拿到对方的节点并合并。
- 合并只增不删，保留本地敏感信息（apiKey）与用户状态（禁用、分组）。
- 桌面端删除旧的常驻分享服务，入口原位替换为「局域网同步」。

非目标：

- 不同步偏好设置、书籍、日志、音色缓存。
- 不做跨公网同步、不做账号体系、不做云端中转。
- 不做自动定时同步，只做用户手动触发。
- 同步后不自动探测节点（保持用户已有的探测节奏）。
- 安卓端不引入新的 HTTP 服务端依赖（协议只有两个端点）。

## 1. 总体架构与协议

### 传输方案

mDNS **只负责发现**，数据走按需启动的 HTTP 端点：

- 接收方启动一个随机端口的 HTTP 服务，并在 mDNS 上广播自己。
- 发起方通过 mDNS 拿到 host/port/sid，直接发 HTTP 请求。
- 同步结束（或页面离开）后接收方停止服务，端口不常驻。

选择理由：mDNS TXT 记录容量有限（实际约 8–9 KB），节点多时无法承载完整数据；而 HTTP 天然支持请求体与响应体，一次往返即可完成双向交换。

### 服务发现

- 服务类型：`_pulse-tts._tcp`
- 实例名：`<deviceName>`
- TXT 记录：
  - `name`：设备显示名
  - `platform`：`desktop` / `android`
  - `v`：协议版本，当前 `1`
  - `sid`：本次会话 ID（128 bit，十六进制）
  - `nodes`：本机节点数（十进制字符串，仅用于展示）

TXT 不含节点内容、不含 apiKey、不含端口（端口由 SRV 记录提供）。

### HTTP 协议

两个端点，均为 `application/json; charset=utf-8`。

**`GET /v1/ping`**

响应 `200`：

```json
{ "name": "书房的电脑", "platform": "desktop", "v": 1, "nodes": 12 }
```

用途：发起方在展示确认框前，确认对端在线并拿到节点数。

**`POST /v1/sync`**

请求头：`X-Sync-Session: <sid>`（必须与 mDNS TXT 或配对串中的 sid 一致）

请求体：

```json
{
  "from": { "name": "Pixel 8", "platform": "android" },
  "nodes": [ /* SyncedNode[] */ ]
}
```

响应：

- `200`：`{ "nodes": [ /* SyncedNode[] */ ], "applied": 7 }`
  - `nodes`：接收方自己当前的节点（供发起方合并）
  - `applied`：接收方实际新增 + 更新的条数
- `403`：`{ "reason": "rejected" }`（用户拒绝，或 sid 不匹配）
- `408`：`{ "reason": "timeout" }`（60 秒内未确认）
- `413`：`{ "reason": "too_large" }`（请求体超过 1 MB 或节点超过 500）

一次 `POST` 往返完成双向交换，不需要第二轮请求。

### 同步节点结构

```ts
interface SyncedNode {
  url: string;            // 完整 base URL，如 https://tts.example.com
  label: string;
  health: 'OK' | 'FAIL' | 'UNKNOWN';
  apiVersion: 'V1' | 'LEGACY' | 'UNKNOWN';
  defaultVoice: string;
  voiceCount: number;
  group?: string;         // 仅安卓消费，桌面忽略
  keyless?: boolean;      // 新建节点时采用，已有节点保留本地值
}
```

**永不含**：`apiKey`、`disabled`、`failCount`、`cooldownUntil`、`lastChecked`、`id`、`source`。字段缺失即默认值，接收方不因缺字段而拒绝整批。

### 配对串与二维码

```
pulsetts://sync?host=192.168.1.20&port=53421&sid=<hex>&name=<urlencoded device name>&platform=desktop
```

- 桌面端在同步页显示二维码（`qrcode.react`），并显示可复制的配对串。
- 安卓端用**系统相机**扫码，`pulsetts://` 深链唤起 App，App 内不申请相机权限。
- 安卓端同时显示自己的配对串文本，供桌面粘贴（桌面没有摄像头）。
- 因此发现方向是单向的：**安卓广播并浏览**，桌面只广播、不浏览。桌面发起同步依靠扫码后的手机主动请求，或粘贴手机配对串。这一点是前述「无摄像头」约束的直接结果。
- 配对串解析失败（缺字段、端口非法、scheme 不是 `pulsetts`）时原地提示，不发请求。

### 确认流程

- 确认框只在**接收方**弹出。发起方主动发起，视为已确认。
- 接收方 60 秒内未操作 → `408`，发起方提示超时。
- 接收方拒绝 → `403`，发起方提示被拒绝。

## 2. 桌面端设计

### 2.1 删除旧分享实现

整体移除：

- `src-tauri/src/lib.rs` 中的 `ShareState`、`serve()`、`share_local_ip/start/stop/set_token/set_payload/status` 命令及注册。
- `src/lib/share.ts`、`src/lib/share.test.ts`、`src/store/shareSync.ts`。
- `src/types/models.ts` 中的 `ShareConfig`、`defaultShare`。
- `src/store/settingsStore.ts` 中的 `share` 字段、`saveShare`、`share_config` 读取。
- `src/main.tsx` 中的 `setShareProvider`。
- `src/components/settings/DataSection.tsx`、`src/store/nodesStore.ts` 中的 `notifyShare` 调用。
- `src/pages/SettingsPage.tsx` 中的「局域网分享」区块。

保留：UDP connect 取本机 IPv4 的逻辑，改名为 `lan_local_ip` 命令，供同步页展示本机地址。

### 2.2 Rust 模块

新增 `src-tauri/src/lan_sync/`：

| 文件 | 职责 |
| --- | --- |
| `mod.rs` | `LanSyncState`、Tauri 命令、启动/停止生命周期 |
| `protocol.rs` | `SyncedNode`、`PingResponse`、`SyncRequest/Response`、URL 规范化、合并函数（纯函数，带单测） |
| `http.rs` | axum 路由 `GET /v1/ping`、`POST /v1/sync`，会话校验，确认通道，body 上限 |
| `mdns.rs` | `mdns-sd` 注册 `_pulse-tts._tcp` 与 TXT 更新，注销 |

依赖新增：`axum`（含 `tokio` 运行时）、`mdns-sd`、`rand`。这些都是成熟且维护活跃的 crate；axum 与 mdns-sd 均为 MIT/Apache-2.0 双许可。

### 2.3 Tauri 命令

```rust
lan_local_ip() -> String
lan_sync_start(device_name: String, nodes: Vec<SyncedNode>) -> SyncStatus
lan_sync_set_nodes(nodes: Vec<SyncedNode>)            // 节点变化时刷新广播与 ping 计数
lan_sync_stop()
lan_sync_status() -> Option<SyncStatus>
lan_sync_resolve(request_id: String, accept: bool, nodes: Vec<SyncedNode>, applied: usize) -> ()
```

- `SyncStatus { running: bool, port: u16, sid: String, local_ip: String }`
- 入站请求通过 `app.emit("lan-sync://request", PendingSyncRequest)` 通知前端；前端确认后调用 `lan_sync_resolve` 放行或拒绝。
- 60 秒超时由 `lan_sync` 内部计时器处理，超时自动以 `408` 结束。

### 2.4 前端

- `src/lib/lanSync.ts`（纯函数）：配对串解析/生成、`normalizeUrl`、`mergeNodes`、`toSyncedNodes`。
- `src/store/lanSyncStore.ts`：状态机 `idle | starting | waiting | requesting | syncing | done | error`，监听 `lan-sync://request`。
- `src/components/settings/LanSyncSection.tsx`：设置页区块，展示开关、本机地址、节点数、二维码、配对串输入框、最近一次结果摘要。
- `src/components/PairingQr.tsx`：封装 `qrcode.react`，二维码内容为配对串。
- 出站请求使用 `@tauri-apps/plugin-http`（已具备跨域访问能力），超时 8 秒。
- 入站由 Rust 常驻，前端只负责确认与合并展示。

### 2.5 设置页布局

「局域网分享」区块原位替换为「局域网同步」：

1. 标题行：`局域网同步` + 开关。
2. 关闭态：一行说明「开启后，同一 Wi-Fi 下的手机可以发现这台电脑」。
3. 开启态：
   - 本机地址 `192.168.x.x:端口`
   - 二维码（160×160）与「复制配对串」按钮
   - 「与手机配对」输入框 + 「连接」按钮（粘贴手机配对串）
   - 待确认请求卡片（设备名、节点数、确认/拒绝、60 秒倒计时）
   - 最近结果摘要（新增 A · 更新 B · 共 C）

## 3. 安卓端设计

### 3.1 模块划分

新增 `data/lansync/` 包：

| 文件 | 职责 | 依赖 |
| --- | --- | --- |
| `SyncProtocol.kt` | `SyncedNode` 等 `@Serializable` 模型、配对串解析/生成、URL 规范化、合并纯函数 | kotlinx-serialization |
| `SyncServer.kt` | 按需启动的 HTTP 服务端（`ServerSocket` + 线程池），处理两个端点 | 仅 JDK |
| `SyncClient.kt` | OkHttp 出站 `ping` / `postSync` | 现有 OkHttp 4.12 |
| `MdnsDiscovery.kt` | `NsdManager` 发现 `_pulse-tts._tcp`，解析 TXT | Android framework |

不引入 Ktor / NanoHTTPD：协议只有两个端点、单次请求、无并发压力，手写 `ServerSocket` 约 150 行即可。若实现时发现分块传输、keep-alive 等边界过多，再回退到 NanoHTTPD。

### 3.2 交互流程

**出站（手机发起）**

1. 设置页点「局域网同步」→ 进入 `LanSyncScreen`（独立 Compose 页面）。
2. 进入即开始 `NsdManager` 发现，列表展示「设备名 · 平台 · 节点数」，支持下拉重扫。
3. 无结果时底部提供「扫码 / 粘贴配对串」入口。
4. 点击设备 → `GET /v1/ping` → 弹出确认「将向 X 发送 N 个节点并接收 M 个节点」→ 确认后 `POST /v1/sync`。
5. `200` → 合并 → 结果摘要，**不自动探测**。

**入站（手机接收）**

1. `SyncServer` 启动后 `/v1/ping` 返回本机信息，对端据此发起 `POST`。
2. 收到请求 → `StateFlow<PendingSyncRequest?>` → `LanSyncScreen` 弹出确认框（60 秒倒计时）。
3. 确认 → 合并后 `200`；拒绝 → `403`；超时 → `408`。

### 3.3 与现有代码的衔接

- 新增 `NodeRepository.mergeSynced(nodes: List<SyncedNode>): MergeResult`。现有 `upsert` 是覆盖语义，不满足「保留 apiKey / disabled / group」。
- 合并后不调用 `probeAll()`。
- `SettingsScreen.kt` 在数据分组新增一行入口（复用现有 `SettingsRow` 样式），导航到 `LanSyncScreen`。
- `AndroidManifest.xml` 增加 `pulsetts://` 的 `intent-filter`（`BROWSABLE` + `DEFAULT`，`launchMode` 保持现有），`MainActivity.onNewIntent` 把配对串交给 `LanSyncViewModel`。
- 新增权限 `android.permission.CHANGE_WIFI_MULTICAST_STATE`，发现期间持有 `MulticastLock`，退出页面释放。

### 3.4 版本兼容

`minSdk 26`：`NsdManager` 可用，但部分机型的 `onServiceFound` 不直接给出 TXT，需要额外 `resolveService`（34 以下已弃用但仍可用）。实现采用「`onServiceFound` 优先读 TXT，缺失则 `resolveService`」双路径。

## 4. 合并语义

两端共用同一套规则，`mergeNodes` 为纯函数：

```
规范化 URL：trim → scheme/host 小写 → 去默认端口 (80/443) → 去末尾 "/"
```

- 远端 URL 无法解析或非 `http/https` → 丢弃该条，计入 `skipped`。
- 规范化 URL 本地不存在 → 新增：`apiKey = null`、`disabled = false`、`group` 取默认值、`source = 'manual'`、`keyless` 取远端值（缺省 `false`）。
- 已存在 → 只覆盖 `label / health / apiVersion / defaultVoice / voiceCount`；保留 `apiKey / disabled / group / keyless / failCount / cooldownUntil / lastChecked / id / source`。
- 本地有、远端没有 → 永不删除。
- 同一批内重复 URL → 后出现者覆盖前者，计数按一条。
- 请求体上限 1 MB、节点上限 500；超限返回 `413`，本地不做任何修改。
- 存储失败 → 事务回滚，提示「保存失败，未做任何修改」。

`MergeResult { added: number, updated: number, skipped: number, total: number }`。

## 5. 安全边界

- HTTP 服务只绑定局域网可达地址，随机端口。桌面端由开关控制生命周期（离开设置页不停止，关闭开关或退出应用时停止）；安卓端跟随 `LanSyncScreen` 生命周期，离开页面即停止。
- `POST /v1/sync` 必须携带本次会话 `sid`；`sid` 每次启动随机生成（128 bit），不匹配返回 `403`。
- `SyncedNode` 结构体内没有 `apiKey` 字段，序列化层无法泄露；接收端也不会读取。
- 不持久化对端身份；不把节点 URL 全文与 sid 写入日志，只记数量与结果。
- 接受局域网明文传输（自签 HTTPS 的成本高于收益），前提是「仅局域网 + 随机 sid + 接收方确认」。

## 6. 错误处理

| 场景 | 行为 |
| --- | --- |
| 对方拒绝 | `403` → 「对方拒绝了本次同步」 |
| 确认超时 | `408` → 「对方 60 秒内未确认」 |
| 网络不可达 / 超时（8 秒） | 「无法连接到设备，请确认在同一 Wi-Fi」，保留列表可重试 |
| mDNS 不可用 | 降级到配对串 / 二维码，不弹错误 |
| 配对串格式错误 | 原地提示「配对串无效」，不发请求 |
| 合并时存储失败 | 回滚，「保存失败，未做任何修改」 |
| 端口占用 | 随机端口重试 3 次，仍失败提示「无法启动同步服务」 |
| 对端协议版本高于本机 | `v > 1` 时提示「对方版本较新，请升级后重试」 |

## 7. 测试策略

### 单元测试（两端用例表一致）

- `normalizeUrl`：大小写、默认端口、末尾斜杠、非法 scheme、带路径。
- `mergeNodes`：新增 / 更新保留 apiKey / 不删除本地 / 重复 URL / 空数组 / 500 上限 / 非法 URL 跳过 / 缺字段默认值。
- 配对串：生成 → 解析往返、缺字段、非法端口、非 `pulsetts` scheme、中文设备名。
- 协议序列化：断言 `SyncedNode` 的 JSON 键集合不含 `apiKey`。
- 桌面端额外覆盖 `toSyncedNodes` 的字段裁剪。

### 集成测试（桌面 Rust `#[tokio::test]`）

- 起真实 HTTP server → `ping` → `sync` → 校验响应与合并计数。
- 错误 `sid` → `403`；超时 → `408`；超过 1 MB / 500 节点 → `413`。
- `lan_sync_stop` 后端口不再可连。

### 真机验收（手动，两端）

1. 同一 Wi-Fi：电脑开同步页，手机发现并同步 → 双向节点数正确。
2. 手机发起 → 桌面弹确认 → 合并；拒绝 → 手机提示被拒绝。
3. 屏蔽 mDNS（关闭组播或使用隔离 AP）→ 扫码配对串仍可同步。
4. 重复同步 → 无重复节点，本地 apiKey 与禁用状态未丢失。
5. 60 秒不操作 → 超时提示。
6. 同步后节点不被自动探测。

## 8. 迁移与兼容

- 旧 `share_config` 键不再读取；保留在存储中不影响运行，不做主动清理。
- 旧 `share_*` 命令移除后，前端不再有调用点（随删除一并清理）。
- 文件导入 / 导出功能完全保留，与本功能互不影响。
- 协议 `v=1`；未来扩展字段一律可选，接收方忽略未知字段。
