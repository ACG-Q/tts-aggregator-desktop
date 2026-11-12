# Tauri 桌面端（TTS Aggregator Desktop）设计规格

日期：2026-10-13
状态：已批准（分节评审通过）

## 0. 背景与范围

本仓库现有 `tts-aggregator-android`（Kotlin/Compose 的 TTS 聚合器：系统 TTS 引擎 + 节点池调度 + OkHttp 客户端，对接两代 `/tts`、`/api/v1` 节点 API）。

整体路线拆分为三个独立子系统，按序推进：

1. **#1 本设计**：Tauri 桌面端（管理 + 朗读，对齐安卓）
2. **#2**：安卓本机 HTTP 服务（复用 NodePool，暴露 `/tts` 给同机 App）
3. **#3**：阅读 App 接入配置生成（依赖 #2 的端口/参数约定）

本文档只覆盖 #1；#2、#3 各自另立规格。

## 1. 总体架构

**技术栈**：Tauri 2 + React 18 + TypeScript + Vite；状态管理 Zustand（对齐安卓 StateFlow 思路）；存储 SQLite（`tauri-plugin-sql`）。

```
┌─ 前端 (React/TS) ─────────────────────────────┐
│  页面层   朗读 | 节点 | 音色 | 日志 | 设置            │
│  状态层   zustand store（nodes/voices/logs/player）│
│  逻辑层   NodePool 移植（AUTO/GROUP/MANUAL 调度）    │
│           TtsApiClient 移植（三级端点回退+重试）      │
│           朗读管线（切分→排队→连续播放）              │
│           导入器（FOFA/ZoomEye 文件+API）            │
└──────────────┬────────────────────────────┘
               │ invoke() / tauri-plugin-http / sql
┌─ Rust 侧 ────┴────────────────────────────┐
│ tauri-plugin-sql (SQLite: nodes/logs/settings)  │
│ tauri-plugin-http（节点 API + FOFA/ZoomEye 出站，绕 CORS）│
│ 文件选择：webview input[type=file]（TXT / CSV / JSON 导入）  │
│ 内嵌小 HTTP 服务：GET /nodes.json（局域网分享）      │
│ MP3 播放：webview HTML5 Audio（无需 Rust 解码）     │
└─────────────────────────────────────┘
```

**关键决策**：

- **协议逻辑（探测/合成/调度）在 TS 层实现**，从 Kotlin 直接移植；Rust 只做三件不可替代的事：SQLite、出站 HTTP、局域网监听。
- **播放走 HTML5 Audio + blob URL**：节点返回 MP3 直接可播；桌面端不做 MP3→PCM 解码（那是安卓系统 TTS 的硬性要求）。
- **不做的**：EPUB、二维码分享、桌面端系统 TTS 引擎（桌面程序无法注册为系统朗读引擎，"朗读"仅在应用内）、Hilt/Redux 等重型方案。

## 2. 页面与功能

| 页面 | 内容 |
|------|------|
| **朗读**（首页） | 文本框 + 音色/语速/音调选择 + 播放控制；本地 TXT 打开导入；长文本自动切分（按段落 / ~800 字边界）、逐段合成、进度条与段落高亮、暂停/继续/跳段 |
| **节点** | 列表（健康度/延迟/音色数/世代标签）、增删改、探测按钮、API Key、调度模式 AUTO/GROUP/MANUAL 与分组配置、**导入**（FOFA/ZoomEye 文件选择 + API Key 在线搜索）、**局域网分享**（本机 IP + token + `/nodes.json` 地址与开关） |
| **音色** | 拉取 `/voices`，中文显示名（移植 `Voice.displayName` 映射）、性别/语言过滤、点选试听 |
| **日志** | 调用日志列表、按 OK/FAIL/切换过滤、详情（延迟/尝试次数/错误）、一键清空；写入 SQLite |
| **设置** | 默认音色/语速/音调、探测并发、分享 token 重置 |

安卓端的"管理/关于"页并入节点页与设置页，不单独占位。

**错误处理**：合成失败→按调度切换节点并记日志（与安卓一致）；探测失败→标 FAIL 冷却；FOFA/ZoomEye API 错误→明确提示，不吞异常。

## 3. 数据模型（SQLite）

```sql
nodes(id TEXT PRIMARY KEY, base_url TEXT NOT NULL UNIQUE, label TEXT NOT NULL DEFAULT '',
      keyless INTEGER NOT NULL DEFAULT 0, api_key TEXT,
      health INTEGER NOT NULL DEFAULT 2, last_checked INTEGER NOT NULL DEFAULT 0,
      default_voice TEXT NOT NULL DEFAULT '', voice_count INTEGER NOT NULL DEFAULT 0,
      fail_count INTEGER NOT NULL DEFAULT 0, cooldown_until INTEGER NOT NULL DEFAULT 0,
      disabled INTEGER NOT NULL DEFAULT 0, api_version INTEGER NOT NULL DEFAULT 2,
      source TEXT NOT NULL DEFAULT 'manual')  -- manual | fofa | zoomeye，导入溯源
logs(id INTEGER PRIMARY KEY AUTOINCREMENT, time INTEGER NOT NULL, node_url TEXT NOT NULL,
     mode INTEGER NOT NULL, text_len INTEGER NOT NULL, attempt INTEGER NOT NULL,
     success INTEGER NOT NULL, latency_ms INTEGER NOT NULL, from_node TEXT,
     error TEXT, cooldown INTEGER NOT NULL DEFAULT 0,
     text_preview TEXT NOT NULL DEFAULT '', voice TEXT NOT NULL DEFAULT '',
     rate INTEGER NOT NULL DEFAULT 0, pitch INTEGER NOT NULL DEFAULT 0)
settings(key TEXT PRIMARY KEY, value TEXT NOT NULL)
```

- 列名与安卓 `NodeStore`/`LogStore` 完全同构（snake_case、health/apiVersion 存枚举序号），行↔模型映射可直接对照移植。
- 小配置（`pool_config`、`synth_settings`、`share_config`、`voices_cache`、`fofa_credentials`）以 JSON 存入 `settings` 表，对齐安卓 SharedPreferences JSON 模式，不单独立表。
- 导出 `nodes.json` 的节点对象用 camelCase 序列化（与 `Model.kt` `@SerialName` 一致），保证与安卓端互导。

## 4. 关键流程

### 4.1 合成试听 / 长文本朗读管线

```
文本 → 切分器(按段落, 超800字按句号再切, 保序编号)
     → 队列: [seg1..segN]
     → 逐段: NodePool.synthesize(seg) → blob → Audio 播放
     → 当前段播放完成(ended 事件) → 下一段；同时预合成下一段(流水线)
失败: 本段按 AUTO 切换下一节点重试 → 仍失败记日志并跳段/停止(可配)
暂停: 停止取新段 + 当前段 audio.pause()；继续: 从断点恢复
跳段: abort 当前合成(fetch abort) → 队列指针+1
TXT 导入: webview file input 选文件 → UTF-8(fatal 校验失败回退 gb18030) → 入文本框
```

### 4.2 FOFA / ZoomEye 导入

```
文件: webview file input 选 CSV/JSON → 解析器(两格式各一实现, 统一产出
      HostRecord{ip,port,protocol,title}) → 拼 baseUrl:
      按 protocol/port 启发式决定 http/https
API:  填 email+key(FOFA) / apiKey(ZoomEye) → tauri-plugin-http 出站(绕 CORS) → 同样产出 HostRecord
去重(按 baseUrl) → 批量探测(probe, 并发限 4) → 写入 nodes(source=fofa/zoomeye)
过滤启发式: title/protocol 含 tts、speech、voice 关键词优先，
      其余候选由用户逐条勾选后入库
```

### 4.3 局域网分享

```
设置开启 → Rust 取本机 IPv4 → 监听 0.0.0.0:8787(端口可改)
GET /nodes.json → 401 除非 ?token= 或 X-Token 头匹配(settings 里的随机 token)
响应 = 导出格式 JSON(含节点+调度配置, 不含日志)
页面显示: http://192.168.x.x:8787/nodes.json?token=xxxx + 复制按钮
安全: 只读单端点、可选仅本机(127.0.0.1)或全接口(0.0.0.0)、token 可一键重置
```

### 4.4 测试

- 单测（Vitest，纯函数）：文本切分器、FOFA/ZoomEye 文件解析器、三级端点回退顺序（注入 mock fetch）、调度 AUTO/GROUP/MANUAL 切换与冷却（注入假依赖）、行↔模型映射、并发受限探测(mapLimit)。
- 手动验收：真实节点探测、试听、TXT 长文朗读、局域网手机拉取 `/nodes.json`。

## 5. 里程碑

1. 脚手架：`npm create tauri-app`（React+TS+Vite）+ SQLite 插件 + 路由骨架
2. 节点管理 + 探测 + 调度逻辑移植（含单测）
3. 音色页 + 朗读试听（单段）
4. 长文本切分/排队朗读 + TXT 导入
5. 日志页 + 设置页
6. FOFA/ZoomEye 文件导入 → API 在线搜索
7. 局域网分享 HTTP 端点

## 6. 实现状态（2026-10-14 核对）

| 规格条目 | 状态 | 备注 |
|----------|------|------|
| 朗读页：文本框 + 音色/语速/音调 + 播放控制 | ✅ 已实现 | ReadPage + playerStore |
| 朗读页：TXT 导入（UTF-8 → gb18030 回退） | ✅ 已实现 | encoding.ts + 测试 |
| 朗读页：长文本切分/逐段排队/暂停/继续/跳段/预合成 | ✅ 已实现 | split.ts + playerStore，切分边界按测试修正为 800 字硬切+句号回溯 |
| 节点页：列表/增删改/探测/API Key/世代标签 | ✅ 已实现 | NodesPage + nodesStore |
| 节点页：调度模式 AUTO/GROUP/MANUAL 与分组配置 | ✅ 已实现 | pool.ts（8 测试覆盖） |
| 节点页：FOFA/ZoomEye 文件导入 + API 在线搜索 | ✅ 已实现 | importers/（19 测试） |
| 音色页：拉取/中文名/过滤/试听/默认 | ✅ 已实现 | VoicesPage + voices.ts（6 测试） |
| 日志页：列表/过滤/清空/详情 | ✅ 已实现 | LogsPage + logsStore |
| 设置页：默认语音参数/探测并发 | ✅ 已实现 | SettingsPage |
| 局域网分享：/nodes.json + token + 本机 IP + 开关 | ✅ 已实现 | lib.rs 内嵌 HTTP 服务 + 设置页分享卡片；导出剔除 apiKey（share.test 验证） |
| SQLite 三表结构与安卓同构 | ✅ 已实现 | db.ts + SCHEMA |
| 错误处理：切换记日志/探测冷却/导入明确报错 | ✅ 已实现 | pool.ts + importers 抛中文明确错误 |
| 数据模型 camelCase 导出互导 | ✅ 已实现 | buildExportPayload |
| 测试：切分/解析/回退/调度/映射/并发 | ✅ 已实现 | 53 个 Vitest 用例全过 |
| 手动验收（规格 4.4 四项） | ⏳ 待用户验收 | 自动化验证全绿后由用户统一执行 |
