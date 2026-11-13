# 桌面端局域网同步「自动允许」设计

## 目标

在电脑端增加一个可选开关：开启后，收到的同步请求不再弹出全局确认框，直接合并并返回结果。用于免值守的批量测试，也方便长期信任的设备。

## 非目标

- 不改变同步内容：仍然只合并节点，不传输 apiKey、禁用状态、失败计数、cooldown。
- 不改变接收端的 60 秒确认窗口语义：开关关闭时行为与现状完全一致。
- 不改变配对串、mDNS、二维码格式。

## 数据与持久化

- 键：`lan_sync_auto_allow`（JSON 布尔），默认 `false`。
- 位置：`useLanSyncStore` 增加 `autoAllow: boolean` 与 `setAutoAllow(v: boolean)`。
- 读取时机：`refresh()` 时与 `lan_sync_status` 一起加载；`start()` 前已就绪。
- 写入时机：开关切换时立即 `settings.setJson` 并更新内存状态。

## 接收流程

`lan-sync-request` 事件到达时：

1. 若 `autoAllow === true`：
   - 用 `mergeNodes` 合并本地与请求节点；
   - 调用 `lan_sync_resolve(requestId, accept=true, nodes, applied)`；
   - **不写 `pending`**，全局确认框不出现；
   - 记录结果文案「已自动允许 <设备名> 的同步：新增 X，更新 Y」，并刷新节点与音色。
2. 若 `autoAllow === false`：走现有流程（`pending` + `LanSyncRequestDialog` + 60 秒超时）。

安全性：`X-Sync-Session` 校验在 Rust 侧先于通知执行，自动允许不绕过它；超时与 busy 分支保持不变。

### 超时对齐

当前前端在 60 秒整点主动 `reject()`，与 Rust 侧 60 秒超时存在竞争，可能让发送端收到 403（「对方拒绝」）而不是 408（「超时」）。改为前端在 **62 秒** 才清理弹窗，让 Rust 的 60 秒 `408 timeout` 先返回，语义与协议一致。

## 界面

设置 → 局域网同步，在「同步服务」区块下方增加：

- 标题：`自动允许同步请求`
- 副文案：`开启后不再弹窗确认，仅建议在可信任的网络中使用。`
- 开关：与现有 `Switch` 组件一致；切换后立即持久化。

状态区沿用现有提示位，展示自动允许的结果或错误。

## 测试

- 单测（`lanSyncStore`）：`autoAllow=true` 时收到请求 → 调用 `lan_sync_resolve` 且不设置 `pending`；`false` 时仍设置 `pending`。
- 手动验收：开启后手机发起 → 无弹窗、桌面节点数立即变化；关闭后恢复弹窗与拒绝/超时。

## 验收标准

1. 开关默认关闭，重启后保持上次设置。
2. 开启后手机发起同步，桌面无弹窗且合并成功，状态区出现「已自动允许…」。
3. 关闭后拒绝、60 秒超时两条路径与之前一致。
4. `npm test`、`tsc --noEmit`、`cargo test` 全绿。
