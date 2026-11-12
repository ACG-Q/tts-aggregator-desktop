# TTS Aggregator 桌面端 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 构建 Tauri 2 + React 桌面端：节点管理与调度、合成试听、长文本/TXT 连续朗读、音色浏览、调用日志、FOFA/ZoomEye 导入、局域网分享 `/nodes.json`。

**架构：** 协议逻辑（探测/三级端点回退/AUTO-GROUP-MANUAL 调度）从安卓 Kotlin 移植到 TS 层；Rust 仅承担 SQLite（tauri-plugin-sql）、出站 HTTP（tauri-plugin-http，绕 CORS）、局域网只读 HTTP 服务三条命令（share_*）；播放用 HTML5 Audio + blob URL。存储为单库 `tts_desktop.db`（nodes/logs/settings 三表），小配置以 JSON 存 settings 表。

**技术栈：** Tauri 2、React 18、TypeScript、Vite、Zustand、react-router-dom、Vitest、tauri-plugin-sql(sqlite)、tauri-plugin-http。

**规格：** `docs/superpowers/specs/2026-10-13-tauri-desktop-design.md`

**约定：** 所有命令在 Windows PowerShell 中执行（不使用 `&&`，用 `; if ($?) { ... }` 串联）；每任务结束 commit（中文 conventional commits）；工作目录为 `tts-aggregator-desktop`（任务 1 中创建）。

---

## 文件结构

```
tts-aggregator-desktop/
├── package.json / vite.config.ts / vitest.config.ts / index.html
├── src/
│   ├── main.tsx                 引导：开库 → 注入依赖 → 渲染
│   ├── App.tsx                  布局：侧栏导航 + 路由
│   ├── styles.css               全局样式（一处定义，各页复用类名）
│   ├── types/models.ts          领域类型（对齐 Model.kt）+ 枚举序号映射 + newId
│   ├── lib/async.ts             mapLimit 并发受限执行
│   ├── lib/api.ts               TtsApiClient 移植：probe/fetchVoices/synthesize
│   ├── lib/pool.ts              NodePool 移植：AUTO/GROUP/MANUAL + 冷却 + 记日志
│   ├── lib/split.ts             长文本切分器
│   ├── lib/encoding.ts          TXT 解码（utf-8 → gb18030 回退）
│   ├── lib/voices.ts            音色解析 + 中文显示名（Voice.displayName 移植）
│   ├── lib/share.ts             导出 payload 构建（camelCase，与安卓互导）
│   ├── lib/db.ts                SqlExec + 建表 + 行↔模型映射 + 三个仓储
│   ├── lib/importers/hosts.ts   HostRecord → baseUrl/去重/相关度/转节点
│   ├── lib/importers/fofa-file.ts    FOFA CSV/JSON 导出解析
│   ├── lib/importers/zoomeye-file.ts ZoomEye JSON 解析
│   ├── lib/importers/search.ts  FOFA/ZoomEye API 在线搜索（plugin-http fetch）
│   ├── store/deps.ts            依赖注入容器（db/api/仓储）
│   ├── store/settingsStore.ts   synth/pool/share/appPrefs 配置
│   ├── store/nodesStore.ts      节点列表 + 探测 + 导入
│   ├── store/logsStore.ts       日志列表 + 过滤
│   ├── store/voicesStore.ts     音色列表 + 缓存
│   ├── store/playerStore.ts     朗读管线（切分→合成→排队→播放）
│   ├── store/poolDeps.ts        PoolDeps 组装 + synthesizeText 入口
│   ├── store/shareSync.ts       分享 payload 推送到 Rust
│   └── pages/                   ReadPage / NodesPage / ImportPanel /
│                                VoicesPage / LogsPage / SettingsPage
└── src-tauri/
    ├── Cargo.toml               + tauri-plugin-sql / tauri-plugin-http
    ├── src/lib.rs               插件注册 + share_* 命令 + 内嵌 HTTP 服务
    ├── src/main.rs              （脚手架已有，必要时微调）
    └── capabilities/default.json
```

测试与源码同目录：`src/lib/*.test.ts`。

---

### 任务 1：环境检查与脚手架

**文件：**
- 创建：整个 `tts-aggregator-desktop/` 工程骨架（create-tauri-app react-ts 模板）

- [ ] **步骤 1：检查工具链**

```powershell
node -v; npm -v; rustc --version; cargo --version
```
预期：均输出版本号（Node ≥ 18，Rust stable）。任一缺失则停止并告知用户安装（Rust 需 MSVC 构建工具）。

- [ ] **步骤 2：在临时目录脚手架（目标目录非空，不能直接创建）**

在 `project-07` 目录执行：

```powershell
npm create tauri-app@latest tmp-desktop -- --template react-ts --manager npm --yes
```

预期：生成 `project-07/tmp-desktop/`（含 package.json、src/、src-tauri/）。若该命令因参数形式报错，改用交互式 `npm create tauri-app@latest` 并选择 React-TypeScript-Vite/npm。

- [ ] **步骤 3：把脚手架内容移入 tts-aggregator-desktop（保留已提交的 docs/）**

```powershell
Get-ChildItem -Force "tmp-desktop" | ForEach-Object { Move-Item -LiteralPath $_.FullName -Destination "tts-aggregator-desktop" }
Remove-Item -Recurse -Force "tmp-desktop"
Get-ChildItem -Force "tts-aggregator-desktop"
```

预期：目录含 docs/、package.json、src/、src-tauri/、.git/（原有 .gitignore 被模板覆盖或并存，需检查）。

- [ ] **步骤 4：确认 .gitignore 未被模板破坏**

检查 `tts-aggregator-desktop/.gitignore`，确保至少含以下行（模板缺则补）：

```
node_modules/
dist/
target/
.DS_Store
*.local
.env
```

- [ ] **步骤 5：安装依赖**

```powershell
npm i; if ($?) { npm i zustand react-router-dom @tauri-apps/api @tauri-apps/plugin-sql @tauri-apps/plugin-http }; if ($?) { npm i -D vitest }
```

预期：全部安装成功，`package.json` 中出现上述依赖。

- [ ] **步骤 6：加 test 脚本**

编辑 `package.json`：在 `scripts` 中加入：

```json
"test": "vitest run"
```

- [ ] **步骤 7：前端构建验证**

```powershell
npm run build
```

预期：`tsc && vite build` 成功，输出 `dist/`。

- [ ] **步骤 8：Rust 编译验证（首次会下载依赖，耗时数分钟）**

```powershell
cargo check --manifest-path src-tauri\Cargo.toml
```

预期：`Finished` dev profile，无 error。

- [ ] **步骤 9：Commit**

```powershell
git add -A; if ($?) { git commit -m "chore: Tauri 2 + React + TS 脚手架与依赖" }
```

---

### 任务 2：插件接线（sql + http + capabilities）

**文件：**
- 修改：`src-tauri/Cargo.toml`
- 修改：`src-tauri/src/lib.rs`
- 修改：`src-tauri/capabilities/default.json`

- [ ] **步骤 1：Cargo.toml 添加插件依赖**

在 `[dependencies]` 段加入：

```toml
tauri = { version = "2", features = [] }
tauri-plugin-sql = { version = "2", features = ["sqlite"] }
tauri-plugin-http = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

（`tauri`/`serde` 模板已有则保持原样，只补缺的行。）

- [ ] **步骤 2：lib.rs 注册插件**

将 `src-tauri/src/lib.rs` 全文替换为（share 命令在任务 13 再加，此处先只注册插件；若模板的 run 函数写在 main.rs，则把注册链加到 main.rs 的 Builder 上）：

```rust
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_http::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **步骤 3：capabilities/default.json 全文替换**

```json
{
  "identifier": "default",
  "description": "桌面端默认能力",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "sql:allow-load",
    "sql:allow-execute",
    "sql:allow-select",
    "sql:allow-close",
    {
      "identifier": "http:default",
      "allow": [
        "http://*",
        "http://*:*",
        "https://*",
        "https://*:*"
      ],
      "deny": []
    }
  ]
}
```

说明：`http://*:*` 允许任意端口的节点（URL Pattern 标准）；节点 API 与 FOFA/ZoomEye 都走 plugin-http 的 fetch。

- [ ] **步骤 4：编译验证**

```powershell
cargo check --manifest-path src-tauri\Cargo.toml
```

预期：`Finished`，无 error（权限文件错误会在运行时报，任务 7 启动 dev 时一并验证）。

- [ ] **步骤 5：Commit**

```powershell
git add -A; if ($?) { git commit -m "feat: 接入 tauri-plugin-sql/http 与能力配置" }
```

---

### 任务 3：类型 + 并发工具 + 数据库映射（TDD）

**文件：**
- 创建：`src/types/models.ts`
- 创建：`src/lib/async.ts`
- 创建：`src/lib/db.ts`
- 测试：`src/lib/async.test.ts`、`src/lib/db.test.ts`

- [ ] **步骤 1：编写失败的测试 `src/lib/async.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { mapLimit } from './async';

describe('mapLimit', () => {
  it('按序返回结果且并发数不超限', async () => {
    let active = 0;
    let peak = 0;
    const items = [1, 2, 3, 4, 5, 6];
    const out = await mapLimit(items, 2, async (n) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 10));
      active--;
      return n * 2;
    });
    expect(out).toEqual([2, 4, 6, 8, 10, 12]);
    expect(peak).toBeLessThanOrEqual(2);
  });

  it('空数组返回空', async () => {
    expect(await mapLimit([], 4, async () => 1)).toEqual([]);
  });
});
```

- [ ] **步骤 2：运行验证失败**

```powershell
npx vitest run src/lib/async.test.ts
```

预期：FAIL，`Cannot find module './async'`。

- [ ] **步骤 3：实现 `src/lib/async.ts`**

```ts
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.max(1, Math.min(limit, items.length || 1)) },
    async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i], i);
      }
    },
  );
  await Promise.all(workers);
  return results;
}
```

- [ ] **步骤 4：运行验证通过**

```powershell
npx vitest run src/lib/async.test.ts
```

预期：PASS（2 tests）。

- [ ] **步骤 5：编写失败的测试 `src/lib/db.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { logRow, nodeRow, rowToLog, rowToNode } from './db';
import type { CallLog, TtsNode } from '../types/models';

const node: TtsNode = {
  id: 'n1', baseUrl: 'https://a.example.com', label: 'A', keyless: true,
  apiKey: null, health: 'OK', lastChecked: 1700000000000,
  defaultVoice: 'zh-CN-XiaoxiaoNeural', voiceCount: 12, failCount: 0,
  cooldownUntil: 0, disabled: false, apiVersion: 'V1', source: 'fofa',
};

const log: CallLog = {
  id: 7, time: 1700000000001, nodeUrl: 'https://a.example.com', mode: 'AUTO',
  textLen: 42, attempt: 1, success: false, latencyMs: 321,
  fromNode: 'https://b.example.com', error: 'boom', triggeredCooldown: true,
  textPreview: '你好', voice: 'zh-CN-XiaoxiaoNeural', rate: 10, pitch: -5,
};

describe('db 行映射', () => {
  it('nodeRow ↔ rowToNode 往返一致（枚举按序号落库）', () => {
    const params = nodeRow(node);
    const row = {
      id: params[0], base_url: params[1], label: params[2], keyless: params[3],
      api_key: params[4], health: params[5], last_checked: params[6],
      default_voice: params[7], voice_count: params[8], fail_count: params[9],
      cooldown_until: params[10], disabled: params[11], api_version: params[12],
      source: params[13],
    };
    expect(rowToNode(row as never)).toEqual(node);
  });

  it('logRow ↔ rowToLog 往返一致', () => {
    const p = logRow(log);
    const row = {
      id: p[0], time: p[1], node_url: p[2], mode: p[3], text_len: p[4],
      attempt: p[5], success: p[6], latency_ms: p[7], from_node: p[8],
      error: p[9], cooldown: p[10], text_preview: p[11], voice: p[12],
      rate: p[13], pitch: p[14],
    };
    expect(rowToLog(row as never)).toEqual(log);
  });

  it('健康度序号与安卓一致：OK=0 FAIL=1 UNKNOWN=2', () => {
    expect(nodeRow({ ...node, health: 'UNKNOWN' })[5]).toBe(2);
    expect(nodeRow({ ...node, apiVersion: 'LEGACY' })[12]).toBe(1);
  });
});
```

- [ ] **步骤 6：运行验证失败**

```powershell
npx vitest run src/lib/db.test.ts
```

预期：FAIL，`Cannot find module './db'`。

- [ ] **步骤 7：实现 `src/types/models.ts`**

```ts
export type ApiVersion = 'V1' | 'LEGACY' | 'UNKNOWN';
export type Health = 'OK' | 'FAIL' | 'UNKNOWN';
export type CallMode = 'AUTO' | 'GROUP' | 'MANUAL';
export type NodeSource = 'manual' | 'fofa' | 'zoomeye';
export type LogFilter = 'ALL' | 'OK' | 'FAIL' | 'SWITCH';

export interface TtsNode {
  id: string;
  baseUrl: string;
  label: string;
  keyless: boolean;
  apiKey: string | null;
  health: Health;
  lastChecked: number;
  defaultVoice: string;
  voiceCount: number;
  failCount: number;
  cooldownUntil: number;
  disabled: boolean;
  apiVersion: ApiVersion;
  source: NodeSource;
}

export interface Voice {
  id: string;
  name: string;
  localName: string;
  gender: string;
  locale: string;
  styles: string[] | null;
}

export interface SynthPrefs { voice: string; rate: number; pitch: number; style: string }
export interface SynthSettings { rate: number; pitch: number; voice: string }
export interface PoolConfig {
  mode: CallMode;
  groupIds: string[];
  manualId: string | null;
  groupCursor: number;
  manualFailCount: number;
}
export interface ShareConfig { enabled: boolean; port: number; token: string; localhostOnly: boolean }
export interface AppPrefs { probeConcurrency: number }

export interface CallLog {
  id?: number;
  time: number;
  nodeUrl: string;
  mode: CallMode;
  textLen: number;
  attempt: number;
  success: boolean;
  latencyMs: number;
  fromNode: string | null;
  error: string | null;
  triggeredCooldown: boolean;
  textPreview: string;
  voice: string;
  rate: number;
  pitch: number;
}

export const HEALTH_ORDINAL: Record<Health, number> = { OK: 0, FAIL: 1, UNKNOWN: 2 };
export const API_VERSION_ORDINAL: Record<ApiVersion, number> = { V1: 0, LEGACY: 1, UNKNOWN: 2 };
export const MODE_ORDINAL: Record<CallMode, number> = { AUTO: 0, GROUP: 1, MANUAL: 2 };

export const DEFAULT_POOL: PoolConfig = { mode: 'AUTO', groupIds: [], manualId: null, groupCursor: 0, manualFailCount: 0 };
export const DEFAULT_SYNTH: SynthSettings = { rate: 0, pitch: 0, voice: '' };
export const DEFAULT_APP_PREFS: AppPrefs = { probeConcurrency: 4 };

export function newId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  return c?.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function defaultShare(port = 8787): ShareConfig {
  return { enabled: false, port, token: newId(), localhostOnly: false };
}

export function isCoolingDown(node: TtsNode, now: number): boolean {
  return node.cooldownUntil > now;
}

export function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}
```

- [ ] **步骤 8：实现 `src/lib/db.ts`**

```ts
import Database from '@tauri-apps/plugin-sql';
import {
  API_VERSION_ORDINAL, HEALTH_ORDINAL, MODE_ORDINAL,
  type ApiVersion, type CallLog, type CallMode, type Health, type TtsNode,
} from '../types/models';

export interface SqlExec {
  execute(sql: string, params?: unknown[]): Promise<unknown>;
  select<T>(sql: string, params?: unknown[]): Promise<T[]>;
}

export const LOG_KEEP = 500;
export const LOG_QUERY_LIMIT = 300;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS nodes (
    id TEXT PRIMARY KEY,
    base_url TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL DEFAULT '',
    keyless INTEGER NOT NULL DEFAULT 0,
    api_key TEXT,
    health INTEGER NOT NULL DEFAULT 2,
    last_checked INTEGER NOT NULL DEFAULT 0,
    default_voice TEXT NOT NULL DEFAULT '',
    voice_count INTEGER NOT NULL DEFAULT 0,
    fail_count INTEGER NOT NULL DEFAULT 0,
    cooldown_until INTEGER NOT NULL DEFAULT 0,
    disabled INTEGER NOT NULL DEFAULT 0,
    api_version INTEGER NOT NULL DEFAULT 2,
    source TEXT NOT NULL DEFAULT 'manual'
  )`,
  `CREATE INDEX IF NOT EXISTS idx_nodes_health ON nodes(health)`,
  `CREATE INDEX IF NOT EXISTS idx_nodes_checked ON nodes(last_checked)`,
  `CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    time INTEGER NOT NULL,
    node_url TEXT NOT NULL,
    mode INTEGER NOT NULL,
    text_len INTEGER NOT NULL,
    attempt INTEGER NOT NULL,
    success INTEGER NOT NULL,
    latency_ms INTEGER NOT NULL,
    from_node TEXT,
    error TEXT,
    cooldown INTEGER NOT NULL DEFAULT 0,
    text_preview TEXT NOT NULL DEFAULT '',
    voice TEXT NOT NULL DEFAULT '',
    rate INTEGER NOT NULL DEFAULT 0,
    pitch INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE INDEX IF NOT EXISTS idx_logs_time ON logs(time DESC)`,
  `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
];

export async function openDb(): Promise<SqlExec> {
  const db = await Database.load('sqlite:tts_desktop.db');
  for (const sql of SCHEMA) await db.execute(sql);
  return db;
}

// ---------- 行 ↔ 模型（纯函数，可单测） ----------

export interface NodeRow {
  id: string; base_url: string; label: string; keyless: number; api_key: string | null;
  health: number; last_checked: number; default_voice: string; voice_count: number;
  fail_count: number; cooldown_until: number; disabled: number; api_version: number; source: string;
}

export function rowToNode(r: NodeRow): TtsNode {
  const health: Health = (['OK', 'FAIL', 'UNKNOWN'] as Health[])[r.health] ?? 'UNKNOWN';
  const apiVersion: ApiVersion = (['V1', 'LEGACY', 'UNKNOWN'] as ApiVersion[])[r.api_version] ?? 'UNKNOWN';
  const source = r.source === 'fofa' || r.source === 'zoomeye' ? r.source : 'manual';
  return {
    id: r.id, baseUrl: r.base_url, label: r.label, keyless: r.keyless !== 0,
    apiKey: r.api_key, health, lastChecked: r.last_checked, defaultVoice: r.default_voice,
    voiceCount: r.voice_count, failCount: r.fail_count, cooldownUntil: r.cooldown_until,
    disabled: r.disabled !== 0, apiVersion, source,
  };
}

export function nodeRow(n: TtsNode): unknown[] {
  return [
    n.id, n.baseUrl, n.label, n.keyless ? 1 : 0, n.apiKey,
    HEALTH_ORDINAL[n.health], n.lastChecked, n.defaultVoice, n.voiceCount,
    n.failCount, n.cooldownUntil, n.disabled ? 1 : 0,
    API_VERSION_ORDINAL[n.apiVersion], n.source,
  ];
}

export interface LogRow {
  id: number; time: number; node_url: string; mode: number; text_len: number;
  attempt: number; success: number; latency_ms: number; from_node: string | null;
  error: string | null; cooldown: number; text_preview: string; voice: string;
  rate: number; pitch: number;
}

export function rowToLog(r: LogRow): CallLog {
  const mode: CallMode = (['AUTO', 'GROUP', 'MANUAL'] as CallMode[])[r.mode] ?? 'AUTO';
  return {
    id: r.id, time: r.time, nodeUrl: r.node_url, mode, textLen: r.text_len,
    attempt: r.attempt, success: r.success !== 0, latencyMs: r.latency_ms,
    fromNode: r.from_node, error: r.error, triggeredCooldown: r.cooldown !== 0,
    textPreview: r.text_preview, voice: r.voice, rate: r.rate, pitch: r.pitch,
  };
}

export function logRow(l: CallLog): unknown[] {
  return [
    l.id ?? null, l.time, l.nodeUrl, MODE_ORDINAL[l.mode], l.textLen,
    l.attempt, l.success ? 1 : 0, l.latencyMs, l.fromNode, l.error,
    l.triggeredCooldown ? 1 : 0, l.textPreview, l.voice, l.rate, l.pitch,
  ];
}

// ---------- 仓储 ----------

const NODE_UPSERT_SQL = `INSERT INTO nodes (
  id, base_url, label, keyless, api_key, health, last_checked, default_voice,
  voice_count, fail_count, cooldown_until, disabled, api_version, source
) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
ON CONFLICT(base_url) DO UPDATE SET
  label=excluded.label, keyless=excluded.keyless, api_key=excluded.api_key,
  health=excluded.health, last_checked=excluded.last_checked,
  default_voice=excluded.default_voice, voice_count=excluded.voice_count,
  fail_count=excluded.fail_count, cooldown_until=excluded.cooldown_until,
  disabled=excluded.disabled, api_version=excluded.api_version, source=excluded.source`;

export interface NodesRepo {
  getAll(): Promise<TtsNode[]>;
  upsert(n: TtsNode): Promise<void>;
  delete(ids: string[]): Promise<void>;
  setDisabled(ids: string[], disabled: boolean): Promise<void>;
  clear(): Promise<void>;
}

export function createNodesRepo(db: SqlExec): NodesRepo {
  return {
    async getAll() {
      const rows = await db.select<NodeRow>(
        'SELECT * FROM nodes ORDER BY health ASC, last_checked DESC',
      );
      return rows.map(rowToNode);
    },
    async upsert(n) {
      await db.execute(NODE_UPSERT_SQL, nodeRow(n));
    },
    async delete(ids) {
      if (!ids.length) return;
      const ph = ids.map(() => '?').join(',');
      await db.execute(`DELETE FROM nodes WHERE id IN (${ph})`, ids);
    },
    async setDisabled(ids, disabled) {
      if (!ids.length) return;
      const ph = ids.map(() => '?').join(',');
      await db.execute(`UPDATE nodes SET disabled = ? WHERE id IN (${ph})`, [disabled ? 1 : 0, ...ids]);
    },
    async clear() {
      await db.execute('DELETE FROM nodes');
    },
  };
}

export type LogsFilterKind = 'ALL' | 'OK' | 'FAIL' | 'SWITCH';

const LOG_FILTER_SQL: Record<LogsFilterKind, string> = {
  ALL: 'SELECT * FROM logs ORDER BY id DESC LIMIT ?',
  OK: 'SELECT * FROM logs WHERE success = 1 ORDER BY id DESC LIMIT ?',
  FAIL: 'SELECT * FROM logs WHERE success = 0 ORDER BY id DESC LIMIT ?',
  SWITCH: 'SELECT * FROM logs WHERE from_node IS NOT NULL ORDER BY id DESC LIMIT ?',
};

export interface LogsRepo {
  insert(l: CallLog): Promise<void>;
  query(filter: LogsFilterKind): Promise<CallLog[]>;
  clear(): Promise<void>;
}

export function createLogsRepo(db: SqlExec): LogsRepo {
  return {
    async insert(l) {
      await db.execute(
        `INSERT INTO logs (id, time, node_url, mode, text_len, attempt, success,
          latency_ms, from_node, error, cooldown, text_preview, voice, rate, pitch)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        logRow(l),
      );
      await db.execute(
        `DELETE FROM logs WHERE id NOT IN (SELECT id FROM logs ORDER BY id DESC LIMIT ${LOG_KEEP})`,
      );
    },
    async query(filter) {
      const rows = await db.select<LogRow>(LOG_FILTER_SQL[filter], [LOG_QUERY_LIMIT]);
      return rows.map(rowToLog);
    },
    async clear() {
      await db.execute('DELETE FROM logs');
    },
  };
}

export interface SettingsRepo {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  getJson<T>(key: string, fallback: T): Promise<T>;
  setJson(key: string, value: unknown): Promise<void>;
}

export function createSettingsRepo(db: SqlExec): SettingsRepo {
  return {
    async get(key) {
      const rows = await db.select<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key]);
      return rows.length ? rows[0].value : null;
    },
    async set(key, value) {
      await db.execute(
        'INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
        [key, value],
      );
    },
    async getJson(key, fallback) {
      const raw = await this.get(key);
      if (!raw) return fallback;
      try {
        return JSON.parse(raw) as T;
      } catch {
        return fallback;
      }
    },
    async setJson(key, value) {
      await this.set(key, JSON.stringify(value));
    },
  };
}
```

注意：`getJson` 内 `JSON.parse(raw) as T` 处 `T` 为方法泛型（`getJson<T>`），实现里写 `JSON.parse(raw) as T`。

- [ ] **步骤 9：运行全部测试验证通过**

```powershell
npx vitest run
```

预期：PASS（async 2 + db 3）。

- [ ] **步骤 10：Commit**

```powershell
git add -A; if ($?) { git commit -m "feat: 领域类型、并发工具与 SQLite 仓储（含映射单测）" }
```

---

### 任务 4：TtsApiClient 移植（TDD）

**文件：**
- 创建：`src/lib/api.ts`
- 测试：`src/lib/api.test.ts`

- [ ] **步骤 1：编写失败的测试 `src/lib/api.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { createApi, type FetchImpl } from './api';
import type { SynthPrefs } from '../types/models';

const BASE = 'https://node.example.com';
const prefs: SynthPrefs = { voice: '', rate: 0, pitch: 0, style: '' };

function router(routes: Record<string, () => Response | never>): { impl: FetchImpl; calls: string[] } {
  const calls: string[] = [];
  const impl: FetchImpl = async (url) => {
    calls.push(url);
    const hit = routes[url];
    if (!hit) throw new Error(`unexpected url: ${url}`);
    return hit();
  };
  return { impl, calls };
}

describe('probe', () => {
  it('老版 keyless：/tts 400 + /api/v1/health 404 + /voices 200 → LEGACY', async () => {
    const { impl, calls } = router({
      [`${BASE}/tts`]: () => new Response('必须提供文本参数', { status: 400 }),
      [`${BASE}/api/v1/health`]: () => new Response('not found', { status: 404 }),
      [`${BASE}/voices`]: () => new Response(JSON.stringify([{ short_name: 'a' }, { short_name: 'b' }]), { status: 200 }),
    });
    const api = createApi(impl, async () => {});
    const node = await api.probe(`${BASE}/`, 'N1');
    expect(node.baseUrl).toBe(BASE);          // 尾斜杠被去掉
    expect(node.keyless).toBe(true);
    expect(node.health).toBe('OK');
    expect(node.apiVersion).toBe('LEGACY');
    expect(node.voiceCount).toBe(2);
    expect(node.label).toBe('N1');
    expect(calls[0]).toBe(`${BASE}/tts`);
  });

  it('新版 V1：health 200 + /api/v1/voices 3 个', async () => {
    const { impl } = router({
      [`${BASE}/tts`]: () => new Response('bad request', { status: 400 }),
      [`${BASE}/api/v1/health`]: () => new Response('ok', { status: 200 }),
      [`${BASE}/api/v1/voices`]: () => new Response(JSON.stringify([{ short_name: 'x' }, { short_name: 'y' }, { short_name: 'z' }]), { status: 200 }),
    });
    const api = createApi(impl, async () => {});
    const node = await api.probe(BASE);
    expect(node.apiVersion).toBe('V1');
    expect(node.voiceCount).toBe(3);
    expect(node.health).toBe('OK');
  });

  it('完全不通 → FAIL / UNKNOWN / keyless=false', async () => {
    const impl: FetchImpl = async () => { throw new Error('network down'); };
    const api = createApi(impl, async () => {});
    const node = await api.probe(BASE);
    expect(node.health).toBe('FAIL');
    expect(node.apiVersion).toBe('UNKNOWN');
    expect(node.keyless).toBe(false);
  });
});

describe('synthesize 三级端点回退', () => {
  it('v1 POST 404 → 兼容 POST 404 → GET 200：按序调用并返回字节', async () => {
    const { impl, calls } = router({
      [`${BASE}/api/v1/tts`]: () => new Response('', { status: 404 }),
      [`${BASE}/tts`]: () => new Response('', { status: 404 }),
      [`${BASE}/tts?text=hi&t=hi&v=&r=0&p=0`]: () => new Response(new Uint8Array([1, 2, 3]), { status: 200 }),
    });
    const api = createApi(impl, async () => {});
    const bytes = await api.synthesize(
      { id: 'n', baseUrl: BASE, label: '', keyless: true, apiKey: null, health: 'OK',
        lastChecked: 0, defaultVoice: '', voiceCount: 0, failCount: 0, cooldownUntil: 0,
        disabled: false, apiVersion: 'LEGACY', source: 'manual' },
      'hi', prefs, 1,
    );
    expect(bytes).toBeInstanceOf(ArrayBuffer);
    expect(calls).toEqual([
      `${BASE}/api/v1/tts`,
      `${BASE}/tts`,
      `${BASE}/tts?text=hi&t=hi&v=&r=0&p=0`,
    ]);
  });

  it('非免 Key 节点：所有端点都带 api_key 查询参数', async () => {
    const urls: string[] = [];
    const impl: FetchImpl = async (url) => {
      urls.push(url);
      return new Response('', { status: 404 });
    };
    const api = createApi(impl, async () => {});
    await api.synthesize(
      { id: 'n', baseUrl: BASE, label: '', keyless: false, apiKey: 'SECRET', health: 'OK',
        lastChecked: 0, defaultVoice: 'v1', voiceCount: 0, failCount: 0, cooldownUntil: 0,
        disabled: false, apiVersion: 'LEGACY', source: 'manual' },
      'hi', prefs, 1,
    );
    expect(urls.length).toBe(3);
    for (const u of urls) expect(u).toContain('api_key=SECRET');
  });

  it('重试次数耗尽返回 null，并按 400ms 递增延迟', async () => {
    const delays: number[] = [];
    const impl: FetchImpl = async () => { throw new Error('down'); };
    const api = createApi(impl, async (ms) => { delays.push(ms); });
    const bytes = await api.synthesize(
      { id: 'n', baseUrl: BASE, label: '', keyless: true, apiKey: null, health: 'OK',
        lastChecked: 0, defaultVoice: '', voiceCount: 0, failCount: 0, cooldownUntil: 0,
        disabled: false, apiVersion: 'V1', source: 'manual' },
      'hi', prefs, 3,
    );
    expect(bytes).toBeNull();
    expect(delays).toEqual([400, 800]);
  });
});

describe('fetchVoices', () => {
  it('v1 失败回退老版 /voices 并解析字段', async () => {
    const { impl } = router({
      [`${BASE}/api/v1/voices`]: () => new Response('', { status: 404 }),
      [`${BASE}/voices`]: () => new Response(JSON.stringify([
        { short_name: 'zh-CN-XiaoxiaoNeural', display_name: 'Xiaoxiao', local_name: '晓晓', gender: 'Female', locale: 'zh-CN', style_list: ['cheerful'] },
      ]), { status: 200 }),
    });
    const api = createApi(impl, async () => {});
    const list = await api.fetchVoices(BASE);
    expect(list).not.toBeNull();
    expect(list![0]).toMatchObject({ id: 'zh-CN-XiaoxiaoNeural', localName: '晓晓', styles: ['cheerful'] });
  });
});
```

- [ ] **步骤 2：运行验证失败**

```powershell
npx vitest run src/lib/api.test.ts
```

预期：FAIL，`Cannot find module './api'`。

- [ ] **步骤 3：实现 `src/lib/api.ts`**

```ts
import {
  newId, normalizeBaseUrl, type ApiVersion, type SynthPrefs, type TtsNode, type Voice,
} from '../types/models';

export const DEFAULT_VOICE = 'zh-CN-XiaoxiaoNeural';
const SHORT_TIMEOUT = 6000;
const SYNTH_TIMEOUT = 60000;
const JSON_TYPE = 'application/json; charset=utf-8';

export type FetchImpl = (url: string, init?: RequestInit) => Promise<Response>;
export type DelayFn = (ms: number) => Promise<void>;

export interface Api {
  probe(baseUrl: string, label?: string, apiKey?: string | null): Promise<TtsNode>;
  fetchVoices(baseUrl: string): Promise<Voice[] | null>;
  synthesize(node: TtsNode, text: string, prefs: SynthPrefs, retries?: number): Promise<ArrayBuffer | null>;
}

const defaultFetch: FetchImpl = (url, init) =>
  import('@tauri-apps/plugin-http').then((m) => m.fetch(url, init));

export function createApi(
  fetchImpl: FetchImpl = defaultFetch,
  delay: DelayFn = (ms) => new Promise((r) => setTimeout(r, ms)),
): Api {
  async function get(url: string, timeoutMs: number): Promise<Response | null> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      return await fetchImpl(url, { method: 'GET', signal: ctrl.signal });
    } catch (e) {
      console.warn(`GET 失败: ${url}`, e);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  async function getOk(url: string, timeoutMs: number): Promise<boolean | null> {
    const r = await get(url, timeoutMs);
    return r ? r.ok : null;
  }

  async function voicesCount(url: string, timeoutMs: number, times = 1): Promise<number | null> {
    for (let i = 0; i < times; i++) {
      const r = await get(url, timeoutMs);
      if (r && r.ok) {
        try {
          const arr: unknown = await r.json();
          return Array.isArray(arr) ? arr.length : 0;
        } catch {
          return 0;
        }
      }
      if (i < times - 1) await delay(300);
    }
    return null;
  }

  interface Meta { voiceCount: number; defaultVoice: string; version: ApiVersion }

  async function fetchMeta(base: string): Promise<Meta | null> {
    const isV1 = await getOk(`${base}/api/v1/health`, SHORT_TIMEOUT);
    if (isV1 === null) return null; // 连 health 都不通 → 无法判定
    if (isV1) {
      const count = await voicesCount(`${base}/api/v1/voices`, SHORT_TIMEOUT * 2);
      return { voiceCount: count ?? 0, defaultVoice: DEFAULT_VOICE, version: 'V1' };
    }
    const count = await voicesCount(`${base}/voices`, SHORT_TIMEOUT, 2);
    return { voiceCount: count ?? 0, defaultVoice: DEFAULT_VOICE, version: 'LEGACY' };
  }

  async function probe(baseUrl: string, label = '', apiKey: string | null = null): Promise<TtsNode> {
    const base = normalizeBaseUrl(baseUrl);
    const keylessResp = await get(`${base}/tts`, SHORT_TIMEOUT);
    let keyless = false;
    if (keylessResp) {
      try {
        const body = await keylessResp.text();
        keyless = keylessResp.status === 400 && body.includes('必须提供文本参数');
      } catch {
        keyless = false;
      }
    }
    const meta = await fetchMeta(base);
    return {
      id: newId(), baseUrl: base, label, keyless, apiKey,
      health: meta || keyless ? 'OK' : 'FAIL', lastChecked: Date.now(),
      defaultVoice: meta?.defaultVoice ?? DEFAULT_VOICE, voiceCount: meta?.voiceCount ?? 0,
      failCount: 0, cooldownUntil: 0, disabled: false,
      apiVersion: meta?.version ?? 'UNKNOWN', source: 'manual',
    };
  }

  async function fetchVoices(baseUrl: string): Promise<Voice[] | null> {
    const base = normalizeBaseUrl(baseUrl);
    const urls = [`${base}/api/v1/voices`, `${base}/voices`];
    for (const url of urls) {
      const r = await get(url, url.endsWith('/voices') && !url.includes('/api/') ? SHORT_TIMEOUT : SYNTH_TIMEOUT);
      if (r && r.ok) {
        try {
          const arr: unknown = await r.json();
          if (Array.isArray(arr) && arr.length) return arr.map(toVoice).filter((v): v is Voice => v !== null);
        } catch {
          /* 解析失败 → 尝试下一个端点 */
        }
      }
    }
    return null;
  }

  function jsonBody(text: string, prefs: SynthPrefs, defaultVoice: string): string {
    const voice = prefs.voice || defaultVoice;
    const obj: Record<string, unknown> = { text, rate: prefs.rate, pitch: prefs.pitch };
    if (voice) obj.voice = voice;
    if (prefs.style) obj.style = prefs.style;
    return JSON.stringify(obj);
  }

  function withApiKey(base: string, node: TtsNode): string {
    if (!node.keyless && node.apiKey) {
      return `${base}${base.includes('?') ? '&' : '?'}api_key=${encodeURIComponent(node.apiKey)}`;
    }
    return base;
  }

  async function postJson(url: string, body: string): Promise<ArrayBuffer | null> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), SYNTH_TIMEOUT);
    try {
      const r = await fetchImpl(withApiKey(url, node0), {
        method: 'POST',
        headers: { 'Content-Type': JSON_TYPE },
        body,
        signal: ctrl.signal,
      });
      return r.ok ? await r.arrayBuffer() : null;
    } catch (e) {
      console.warn(`POST 失败: ${url}`, e);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  // postJson 需要 node 做 apiKey 附加 → 改为带 node 参数（见下方 synthesize 内定义）
  let node0: TtsNode;

  async function postTo(node: TtsNode, url: string, body: string): Promise<ArrayBuffer | null> {
    node0 = node;
    return postJson(url, body);
  }

  async function getCompat(node: TtsNode, text: string, p: SynthPrefs): Promise<ArrayBuffer | null> {
    const u = new URL(`${node.baseUrl}/tts`);
    u.searchParams.set('text', text);
    u.searchParams.set('t', text);
    u.searchParams.set('v', p.voice || node.defaultVoice);
    u.searchParams.set('r', String(p.rate));
    u.searchParams.set('p', String(p.pitch));
    if (p.style) u.searchParams.set('s', p.style);
    if (!node.keyless && node.apiKey) u.searchParams.set('api_key', node.apiKey);
    const r = await get(u.toString(), SYNTH_TIMEOUT);
    if (!r || !r.ok) return null;
    try {
      return await r.arrayBuffer();
    } catch {
      return null;
    }
  }

  async function synthesizeOnce(node: TtsNode, text: string, p: SynthPrefs): Promise<ArrayBuffer | null> {
    const body = jsonBody(text, p, node.defaultVoice);
    const post1 = await postTo(node, `${node.baseUrl}/api/v1/tts`, body);
    if (post1) return post1;
    const post2 = await postTo(node, `${node.baseUrl}/tts`, body);
    if (post2) return post2;
    return getCompat(node, text, p);
  }

  async function synthesize(node: TtsNode, text: string, prefs: SynthPrefs, retries = 3): Promise<ArrayBuffer | null> {
    for (let i = 0; i < retries; i++) {
      const bytes = await synthesizeOnce(node, text, prefs);
      if (bytes) return bytes;
      if (i < retries - 1) await delay(400 * (i + 1));
    }
    console.warn(`synthesize failed: ${node.baseUrl}`);
    return null;
  }

  return { probe, fetchVoices, synthesize };
}

function toVoice(raw: unknown): Voice | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.short_name === 'string' ? o.short_name : '';
  if (!id) return null;
  const styles = Array.isArray(o.style_list) ? o.style_list.map(String) : null;
  return {
    id,
    name: typeof o.display_name === 'string' ? o.display_name : '',
    localName: typeof o.local_name === 'string' ? o.local_name : '',
    gender: typeof o.gender === 'string' ? o.gender : '',
    locale: typeof o.locale === 'string' ? o.locale : '',
    styles,
  };
}
```

实现注意：上面 `postJson` 引用了 `node0` 的写法是错误设计——请**直接删除 `postJson` 与 `node0`、`postTo` 的拆分**，改为在 `synthesizeOnce` 内联 POST：

```ts
async function postTo(node: TtsNode, url: string, body: string): Promise<ArrayBuffer | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), SYNTH_TIMEOUT);
  try {
    const r = await fetchImpl(withApiKey(url, node), {
      method: 'POST',
      headers: { 'Content-Type': JSON_TYPE },
      body,
      signal: ctrl.signal,
    });
    return r.ok ? await r.arrayBuffer() : null;
  } catch (e) {
    console.warn(`POST 失败: ${url}`, e);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
```

并把 `withApiKey` 签名改为 `withApiKey(url: string, node: TtsNode)`（`getCompat` 里已单独拼 api_key，互不影响）。

- [ ] **步骤 4：运行验证通过**

```powershell
npx vitest run src/lib/api.test.ts
```

预期：PASS（6 tests）。

- [ ] **步骤 5：Commit**

```powershell
git add -A; if ($?) { git commit -m "feat: TtsApiClient 移植（探测/音色/三级端点回退，含单测）" }
```

---

### 任务 5：NodePool 调度移植（TDD）

**文件：**
- 创建：`src/lib/pool.ts`
- 测试：`src/lib/pool.test.ts`

- [ ] **步骤 1：编写失败的测试 `src/lib/pool.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { synthesize, type PoolDeps } from './pool';
import { DEFAULT_POOL, type CallLog, type PoolConfig, type TtsNode } from '../types/models';

function mkNode(id: string, over: Partial<TtsNode> = {}): TtsNode {
  return {
    id, baseUrl: `https://${id}.example.com`, label: id, keyless: true, apiKey: null,
    health: 'OK', lastChecked: 1000, defaultVoice: '', voiceCount: 1, failCount: 0,
    cooldownUntil: 0, disabled: false, apiVersion: 'V1', source: 'manual', ...over,
  };
}

interface Harness {
  deps: PoolDeps;
  logs: CallLog[];
  upserts: TtsNode[];
  config: PoolConfig;
}

function harness(
  nodes: TtsNode[],
  failUrls: string[] = [],
  config: Partial<PoolConfig> = {},
): Harness {
  const logs: CallLog[] = [];
  const upserts: TtsNode[] = [];
  const cfg: PoolConfig = { ...DEFAULT_POOL, ...config };
  let clock = 100000;
  const deps: PoolDeps = {
    getNodes: () => nodes.map((n) => upserts.filter((u) => u.id === n.id).pop() ?? n),
    getConfig: () => cfg,
    updateConfig: async (fn) => { Object.assign(cfg, fn(cfg)); },
    upsertNode: async (n) => { upserts.push(n); },
    insertLog: async (l) => { logs.push(l); },
    synth: async (n) => {
      if (failUrls.includes(n.baseUrl)) throw new Error('v1/兼容端点均不可用');
      return new ArrayBuffer(4);
    },
    now: () => (clock += 10),
  };
  return { deps, logs, upserts, config: cfg };
}

describe('AUTO', () => {
  it('首个失败自动切到下一个，日志记录失败链与 attempt 序号', async () => {
    const a = mkNode('a');
    const b = mkNode('b', { lastChecked: 999 });
    const h = harness([a, b], [a.baseUrl]);
    const r = await synthesize(h.deps, '你好', { voice: '', rate: 0, pitch: 0, style: '' });
    expect(r.node.id).toBe('b');
    expect(h.logs.length).toBe(2);
    expect(h.logs[0].success).toBe(false);
    expect(h.logs[0].attempt).toBe(1);
    expect(h.logs[1].success).toBe(true);
    expect(h.logs[1].attempt).toBe(2);
    expect(h.logs[1].fromNode).toBe(a.baseUrl);
    expect(h.upserts.some((n) => n.id === 'a' && n.failCount === 1)).toBe(true);
  });

  it('连续失败 3 次进入 10 分钟冷却，随后被排除出候选', async () => {
    const a = mkNode('a');
    const h = harness([a], [a.baseUrl]);
    const prefs = { voice: '', rate: 0, pitch: 0, style: '' };
    await expect(synthesize(h.deps, 'x', prefs)).rejects.toThrow('全部 1 个节点调用失败');
    await expect(synthesize(h.deps, 'x', prefs)).rejects.toThrow('全部 1 个节点调用失败');
    await expect(synthesize(h.deps, 'x', prefs)).rejects.toThrow('全部 1 个节点调用失败');
    const cooled = h.upserts.filter((n) => n.cooldownUntil > 0);
    expect(cooled.length).toBeGreaterThan(0);
    await expect(synthesize(h.deps, 'x', prefs)).rejects.toThrow('冷却中');
  });

  it('全部禁用/失败时报“没有可用节点”', async () => {
    const a = mkNode('a', { health: 'FAIL' });
    const h = harness([a]);
    await expect(synthesize(h.deps, 'x', { voice: '', rate: 0, pitch: 0, style: '' }))
      .rejects.toThrow('没有可用节点');
  });
});

describe('GROUP', () => {
  it('成功后游标轮换到下一个节点', async () => {
    const a = mkNode('a');
    const b = mkNode('b');
    const h = harness([a, b], [], { mode: 'GROUP', groupIds: ['a', 'b'], groupCursor: 0 });
    const r1 = await synthesize(h.deps, 'x', { voice: '', rate: 0, pitch: 0, style: '' });
    expect(r1.node.id).toBe('a');
    expect(h.config.groupCursor).toBe(1);
    const r2 = await synthesize(h.deps, 'x', { voice: '', rate: 0, pitch: 0, style: '' });
    expect(r2.node.id).toBe('b');
    expect(h.config.groupCursor).toBe(0);
  });

  it('组内全部失败则整体失败', async () => {
    const a = mkNode('a');
    const b = mkNode('b');
    const h = harness([a, b], [a.baseUrl, b.baseUrl], { mode: 'GROUP', groupIds: ['a', 'b'] });
    await expect(synthesize(h.deps, 'x', { voice: '', rate: 0, pitch: 0, style: '' }))
      .rejects.toThrow('组内 2 个节点全部失败');
  });
});

describe('MANUAL', () => {
  it('连败 3 次停止调用，成功则清零计数', async () => {
    const a = mkNode('a');
    const h = harness([a], [a.baseUrl], { mode: 'MANUAL', manualId: 'a' });
    const prefs = { voice: '', rate: 0, pitch: 0, style: '' };
    await expect(synthesize(h.deps, 'x', prefs)).rejects.toThrow('第 1 次失败');
    await expect(synthesize(h.deps, 'x', prefs)).rejects.toThrow('第 2 次失败');
    await expect(synthesize(h.deps, 'x', prefs)).rejects.toThrow('已停止调用');
    await expect(synthesize(h.deps, 'x', prefs)).rejects.toThrow('已连续失败 3 次');
    expect(h.config.manualFailCount).toBe(3);
  });

  it('未选手选节点时报明确错误', async () => {
    const h = harness([mkNode('a')], [], { mode: 'MANUAL', manualId: null });
    await expect(synthesize(h.deps, 'x', { voice: '', rate: 0, pitch: 0, style: '' }))
      .rejects.toThrow('尚未选择手选节点');
  });
});

describe('空节点表', () => {
  it('提示先添加节点', async () => {
    const h = harness([]);
    await expect(synthesize(h.deps, 'x', { voice: '', rate: 0, pitch: 0, style: '' }))
      .rejects.toThrow('还没有节点');
  });
});
```

- [ ] **步骤 2：运行验证失败**

```powershell
npx vitest run src/lib/pool.test.ts
```

预期：FAIL，`Cannot find module './pool'`。

- [ ] **步骤 3：实现 `src/lib/pool.ts`**

```ts
import {
  HEALTH_ORDINAL, isCoolingDown, type CallLog, type CallMode, type PoolConfig,
  type SynthPrefs, type TtsNode,
} from '../types/models';

export const FAIL_LIMIT = 3;
export const COOLDOWN_AFTER = 3;
export const COOLDOWN_MS = 10 * 60 * 1000;
export const TEXT_PREVIEW_LEN = 80;
export const SYNTH_RETRIES_PER_NODE = 1;

export interface PoolDeps {
  getNodes(): TtsNode[];
  getConfig(): PoolConfig;
  updateConfig(fn: (c: PoolConfig) => PoolConfig): Promise<void>;
  upsertNode(node: TtsNode): Promise<void>;
  insertLog(log: CallLog): Promise<void>;
  synth(node: TtsNode, text: string, prefs: SynthPrefs): Promise<ArrayBuffer>;
  now(): number;
}

export interface PoolResult { bytes: ArrayBuffer; node: TtsNode }

export async function synthesize(deps: PoolDeps, text: string, prefs: SynthPrefs): Promise<PoolResult> {
  const nodes = deps.getNodes();
  if (nodes.length === 0) throw new Error('还没有节点：请先到“节点”页添加');
  const mode = deps.getConfig().mode;
  if (mode === 'AUTO') return auto(deps, nodes, text, prefs);
  if (mode === 'GROUP') return group(deps, nodes, text, prefs);
  return manual(deps, nodes, text, prefs);
}

async function attempt(
  deps: PoolDeps, node: TtsNode, text: string, prefs: SynthPrefs,
  mode: CallMode, attemptNo: number, fromNode: string | null,
): Promise<ArrayBuffer> {
  const t0 = deps.now();
  try {
    const bytes = await deps.synth(node, text, prefs);
    const ms = deps.now() - t0;
    if (node.failCount > 0 || node.cooldownUntil > 0) {
      await deps.upsertNode({ ...node, failCount: 0, cooldownUntil: 0 });
    }
    await deps.insertLog({
      time: deps.now(), nodeUrl: node.baseUrl, mode, textLen: text.length,
      attempt: attemptNo, success: true, latencyMs: ms, fromNode,
      error: null, triggeredCooldown: false,
      textPreview: text.slice(0, TEXT_PREVIEW_LEN),
      voice: prefs.voice || node.defaultVoice, rate: prefs.rate, pitch: prefs.pitch,
    });
    return bytes;
  } catch (e) {
    const ms = deps.now() - t0;
    const err = e instanceof Error ? e.message : String(e);
    const failCount = node.failCount + 1;
    const triggered = failCount >= COOLDOWN_AFTER && mode !== 'MANUAL';
    const cooldownUntil = triggered ? deps.now() + COOLDOWN_MS : node.cooldownUntil;
    await deps.upsertNode({ ...node, failCount, cooldownUntil });
    await deps.insertLog({
      time: deps.now(), nodeUrl: node.baseUrl, mode, textLen: text.length,
      attempt: attemptNo, success: false, latencyMs: ms, fromNode,
      error: err, triggeredCooldown: triggered,
      textPreview: text.slice(0, TEXT_PREVIEW_LEN),
      voice: prefs.voice || node.defaultVoice, rate: prefs.rate, pitch: prefs.pitch,
    });
    throw new Error(`合成失败：${node.baseUrl}（${err}）`);
  }
}

async function auto(deps: PoolDeps, nodes: TtsNode[], text: string, prefs: SynthPrefs): Promise<PoolResult> {
  const now = deps.now();
  const candidates = nodes
    .filter((n) => n.health !== 'FAIL' && !n.disabled && !isCoolingDown(n, now))
    .sort((a, b) => HEALTH_ORDINAL[a.health] - HEALTH_ORDINAL[b.health] || b.lastChecked - a.lastChecked);
  if (candidates.length === 0) {
    const cooling = nodes.filter((n) => isCoolingDown(n, now)).length;
    throw new Error(cooling > 0
      ? `所有节点均不可用（${cooling} 个冷却中），请到节点管理重新测试`
      : '没有可用节点，请到节点管理重新测试');
  }
  let prevFailed: string | null = null;
  for (let i = 0; i < candidates.length; i++) {
    const node = candidates[i];
    try {
      const bytes = await attempt(deps, node, text, prefs, 'AUTO', i + 1, prevFailed);
      return { bytes, node };
    } catch {
      prevFailed = node.baseUrl;
    }
  }
  throw new Error(`全部 ${candidates.length} 个节点调用失败，详见调用日志`);
}

async function group(deps: PoolDeps, nodes: TtsNode[], text: string, prefs: SynthPrefs): Promise<PoolResult> {
  const cfg = deps.getConfig();
  const now = deps.now();
  const members = nodes.filter((n) => cfg.groupIds.includes(n.id) && !isCoolingDown(n, now));
  if (members.length === 0) {
    throw new Error(cfg.groupIds.length === 0
      ? '组内没有节点，请在节点列表勾选组成员'
      : '组内节点全部冷却/不可用');
  }
  let prevFailed: string | null = null;
  for (let i = 0; i < members.length; i++) {
    const idx = (cfg.groupCursor + i) % members.length;
    try {
      const bytes = await attempt(deps, members[idx], text, prefs, 'GROUP', i + 1, prevFailed);
      await deps.updateConfig((c) => ({ ...c, groupCursor: (idx + 1) % members.length }));
      return { bytes, node: members[idx] };
    } catch {
      prevFailed = members[idx].baseUrl;
    }
  }
  throw new Error(`组内 ${members.length} 个节点全部失败，详见调用日志`);
}

async function manual(deps: PoolDeps, nodes: TtsNode[], text: string, prefs: SynthPrefs): Promise<PoolResult> {
  const cfg = deps.getConfig();
  if (cfg.manualFailCount >= FAIL_LIMIT) {
    throw new Error(`手选节点已连续失败 ${FAIL_LIMIT} 次，调用已停止。请重新测试或更换手选节点。`);
  }
  const node = nodes.find((n) => n.id === cfg.manualId);
  if (!node) throw new Error('尚未选择手选节点，请在节点列表选择');
  try {
    const bytes = await attempt(deps, node, text, prefs, 'MANUAL', cfg.manualFailCount + 1, null);
    if (cfg.manualFailCount !== 0) await deps.updateConfig((c) => ({ ...c, manualFailCount: 0 }));
    return { bytes, node };
  } catch (e) {
    const fails = cfg.manualFailCount + 1;
    await deps.updateConfig((c) => ({ ...c, manualFailCount: fails }));
    const cause = e instanceof Error ? e.message : String(e);
    throw new Error(fails >= FAIL_LIMIT
      ? `手选节点连续失败 ${FAIL_LIMIT} 次，已停止调用：${cause}`
      : `手选节点第 ${fails} 次失败（剩余 ${FAIL_LIMIT - fails} 次机会）：${cause}`);
  }
}
```

注意：MANUAL 分支里 `deps.getConfig()` 每次调用返回 harness 的同一 `cfg` 对象；`updateConfig` 直接 `Object.assign` 同一引用，因此后续读到最新计数——生产实现（settingsStore.updatePool）会整体替换，pool 每次进入 manual 时重新 `getConfig()`，行为一致。

- [ ] **步骤 4：运行验证通过**

```powershell
npx vitest run src/lib/pool.test.ts
```

预期：PASS（9 tests）。

- [ ] **步骤 5：Commit**

```powershell
git add -A; if ($?) { git commit -m "feat: NodePool 调度移植 AUTO/GROUP/MANUAL（含单测）" }
```

---

### 任务 6：状态层与依赖容器

**文件：**
- 创建：`src/store/deps.ts`、`src/store/settingsStore.ts`、`src/store/nodesStore.ts`、`src/store/logsStore.ts`、`src/store/voicesStore.ts`、`src/store/poolDeps.ts`、`src/store/shareSync.ts`
- 创建：`src/lib/voices.ts`（含单测，供 voicesStore 使用）、`src/lib/share.ts`

- [ ] **步骤 1：`src/store/deps.ts`**

```ts
import type { Api } from '../lib/api';
import type { LogsRepo, NodesRepo, SettingsRepo, SqlExec } from '../lib/db';

export interface Deps {
  db: SqlExec;
  api: Api;
  nodes: NodesRepo;
  logs: LogsRepo;
  settings: SettingsRepo;
}

let current: Deps | null = null;

export function setDeps(d: Deps): void {
  current = d;
}

export function deps(): Deps {
  if (!current) throw new Error('应用尚未初始化');
  return current;
}
```

- [ ] **步骤 2：`src/lib/voices.ts` + 测试（先测后码）**

测试 `src/lib/voices.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { parseVoices, voiceDisplayName } from './voices';

describe('voiceDisplayName（安卓 Voice.displayName 移植）', () => {
  it('英文名+系列词 → 全中文', () => {
    expect(voiceDisplayName({ id: 'x', name: 'Xiaoxiao Dragon HD Flash Latest', localName: '' }))
      .toBe('晓晓 龙 高清 闪速 最新版');
  });

  it('local_name 优先直接显示', () => {
    expect(voiceDisplayName({ id: 'x', name: 'Xiaoxiao', localName: '晓晓' })).toBe('晓晓');
  });

  it('非中文音色保留原文', () => {
    expect(voiceDisplayName({ id: 'x', name: 'Jenny', localName: '' })).toBe('Jenny');
  });

  it('空名回退 id', () => {
    expect(voiceDisplayName({ id: 'zh-CN-XiaoxiaoNeural', name: '', localName: '' }))
      .toBe('zh-CN-XiaoxiaoNeural');
  });
});

describe('parseVoices', () => {
  it('容错解析：缺字段跳过、字段缺省补齐', () => {
    const list = parseVoices([
      { short_name: 'a', display_name: 'A' },
      { display_name: 'no-id' },
      'not-an-object',
      { short_name: 'b', style_list: ['calm'] },
    ]);
    expect(list.length).toBe(2);
    expect(list[0]).toMatchObject({ id: 'a', name: 'A', localName: '', styles: null });
    expect(list[1]).toMatchObject({ id: 'b', styles: ['calm'] });
  });

  it('非数组输入返回空', () => {
    expect(parseVoices({ error: true })).toEqual([]);
  });
});
```

实现 `src/lib/voices.ts`（映射表从安卓 `Model.kt` 复制）：

```ts
import type { Voice } from '../types/models';

const VOICE_NAME_ZH: Record<string, string> = {
  Xiaoxiao: '晓晓', Xiaochen: '晓辰', Xiaoyi: '晓伊', Xiaorui: '晓睿', Xiaozhou: '晓舟',
  Xiaomo: '晓墨', Xiaohan: '晓涵', Xiaorou: '晓柔', Xiaobei: '晓北', Xiaoni: '晓妮',
  Xiaozhen: '晓臻', Xiaoxuan: '晓萱', Xiaomeng: '晓萌', XiaobeiNeural: '晓北',
  Xiaojiao: '晓姣', Yunxi: '云希', Yunyang: '云扬', Yunxia: '云夏', Yunfeng: '云枫',
  Yunze: '云泽', Yunjian: '云健', Yunxiao: '云骁', Yunfan: '云帆', Yunyi: '云逸',
  Yunhao: '云皓', Yunjin: '云瑾', Yunrui: '云睿', HsiaoChen: '晓臻', HsiaoYu: '晓雅',
  HsiaoTing: '晓婷', YunJhe: '云哲', YunJhih: '云智', YunZe2: '云泽', HiuMaan: '晓曼',
  HiuGaai: '晓儿', HiuChi: '晓芝', HiuSik: '晓色', WanLung: '云龙', WanYiu: '云尧',
  WanNgo: '云娥', HiuChing: '晓晴', Hiufan: '晓雯', WanYi: '云逸',
};

const VOICE_SERIES_ZH: Record<string, string> = {
  Dragon: '龙', HD: '高清', Flash: '闪速', Latest: '最新版', Multilingual: '多语种',
  Instant: '即时', Turbo: '加速版', Lite: '轻量版', Pro: '专业版', Nano: '微型版',
  Standard: '标准版', Enhanced: '增强版', Natural: '自然', Fast: '快速', New: '新版',
  HighQuality: '高品质', Narrator: '旁白', Reader: '朗读', Mini: '迷你版',
};

export function voiceDisplayName(v: Pick<Voice, 'id' | 'name' | 'localName'>): string {
  const raw = v.localName || v.name;
  if (!raw) return v.id;
  let base = raw;
  for (const [key, zh] of Object.entries(VOICE_NAME_ZH)) {
    if (base.startsWith(key)) {
      base = zh + base.slice(key.length);
      break;
    }
  }
  return base.split(' ')
    .map((w) => VOICE_SERIES_ZH[w] ?? w)
    .filter((w) => w.length > 0)
    .join(' ');
}

export function parseVoices(data: unknown): Voice[] {
  if (!Array.isArray(data)) return [];
  const out: Voice[] = [];
  for (const item of data) {
    if (typeof item !== 'object' || item === null) continue;
    const o = item as Record<string, unknown>;
    const id = typeof o.short_name === 'string' ? o.short_name : '';
    if (!id) continue;
    out.push({
      id,
      name: typeof o.display_name === 'string' ? o.display_name : '',
      localName: typeof o.local_name === 'string' ? o.local_name : '',
      gender: typeof o.gender === 'string' ? o.gender : '',
      locale: typeof o.locale === 'string' ? o.locale : '',
      styles: Array.isArray(o.style_list) ? o.style_list.map(String) : null,
    });
  }
  return out;
}
```

运行：`npx vitest run src/lib/voices.test.ts` → PASS 后继续。

- [ ] **步骤 3：`src/lib/share.ts`**

```ts
import type { PoolConfig, TtsNode } from '../types/models';

export interface ExportPayload {
  version: 1;
  exportedAt: number;
  pool: PoolConfig;
  nodes: TtsNode[];
}

export function buildExportPayload(nodes: TtsNode[], pool: PoolConfig, now = Date.now()): ExportPayload {
  return { version: 1, exportedAt: now, pool, nodes };
}
```

- [ ] **步骤 4：`src/store/settingsStore.ts`**

```ts
import { create } from 'zustand';
import {
  DEFAULT_APP_PREFS, DEFAULT_POOL, DEFAULT_SYNTH, defaultShare,
  type AppPrefs, type PoolConfig, type ShareConfig, type SynthSettings,
} from '../types/models';
import { deps } from './deps';
import { notifyShare } from './shareSync';

interface SettingsState {
  synth: SynthSettings;
  pool: PoolConfig;
  share: ShareConfig;
  appPrefs: AppPrefs;
  loaded: boolean;
  load(): Promise<void>;
  saveSynth(s: SynthSettings): Promise<void>;
  updatePool(fn: (c: PoolConfig) => PoolConfig): Promise<void>;
  saveShare(s: ShareConfig): Promise<void>;
  saveAppPrefs(p: AppPrefs): Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  synth: DEFAULT_SYNTH,
  pool: DEFAULT_POOL,
  share: defaultShare(),
  appPrefs: DEFAULT_APP_PREFS,
  loaded: false,
  async load() {
    const s = deps().settings;
    set({
      synth: await s.getJson('synth_settings', DEFAULT_SYNTH),
      pool: await s.getJson('pool_config', DEFAULT_POOL),
      share: await s.getJson('share_config', defaultShare()),
      appPrefs: await s.getJson('app_prefs', DEFAULT_APP_PREFS),
      loaded: true,
    });
  },
  async saveSynth(synth) {
    set({ synth });
    await deps().settings.setJson('synth_settings', synth);
  },
  async updatePool(fn) {
    const pool = fn(get().pool);
    set({ pool });
    await deps().settings.setJson('pool_config', pool);
    await notifyShare();
  },
  async saveShare(share) {
    set({ share });
    await deps().settings.setJson('share_config', share);
  },
  async saveAppPrefs(appPrefs) {
    set({ appPrefs });
    await deps().settings.setJson('app_prefs', appPrefs);
  },
}));
```

- [ ] **步骤 5：`src/store/shareSync.ts`**

```ts
import { invoke } from '@tauri-apps/api/core';
import type { PoolConfig, ShareConfig, TtsNode } from '../types/models';
import { buildExportPayload } from '../lib/share';

export interface ShareProvider {
  (): { nodes: TtsNode[]; pool: PoolConfig; share: ShareConfig };
}

let provider: ShareProvider | null = null;

export function setShareProvider(p: ShareProvider): void {
  provider = p;
}

export async function notifyShare(): Promise<void> {
  if (!provider) return;
  const { nodes, pool, share } = provider();
  if (!share.enabled) return;
  try {
    await invoke('share_set_payload', { payload: JSON.stringify(buildExportPayload(nodes, pool)) });
  } catch (e) {
    console.warn('分享 payload 同步失败', e);
  }
}
```

- [ ] **步骤 6：`src/store/nodesStore.ts`**

```ts
import { create } from 'zustand';
import { mapLimit } from '../lib/async';
import { normalizeBaseUrl, type CallMode, type NodeSource, type TtsNode } from '../types/models';
import { deps } from './deps';
import { useSettingsStore } from './settingsStore';
import { notifyShare } from './shareSync';

interface NodesState {
  nodes: TtsNode[];
  loading: boolean;
  probing: boolean;
  probeProgress: string | null;
  load(): Promise<void>;
  add(input: { baseUrl: string; label: string; apiKey: string | null; source?: NodeSource }): Promise<void>;
  importRecords(records: { baseUrl: string; label: string }[], source: NodeSource): Promise<void>;
  reprobe(node: TtsNode): Promise<void>;
  probeAll(): Promise<void>;
  update(node: TtsNode, origBaseUrl?: string): Promise<void>;
  remove(ids: string[]): Promise<void>;
  setDisabled(ids: string[], disabled: boolean): Promise<void>;
}

export const useNodesStore = create<NodesState>((set, get) => ({
  nodes: [],
  loading: false,
  probing: false,
  probeProgress: null,

  async load() {
    set({ loading: true });
    try {
      const nodes = await deps().nodes.getAll();
      set({ nodes });
    } finally {
      set({ loading: false });
    }
  },

  async add({ baseUrl, label, apiKey, source = 'manual' }) {
    const probed = await deps().api.probe(baseUrl, label, apiKey);
    await deps().nodes.upsert({ ...probed, source });
    await get().load();
    await notifyShare();
  },

  async importRecords(records, source) {
    for (const r of records) {
      await deps().nodes.upsert({
        id: crypto.randomUUID(), baseUrl: normalizeBaseUrl(r.baseUrl), label: r.label,
        keyless: false, apiKey: null, health: 'UNKNOWN', lastChecked: 0,
        defaultVoice: '', voiceCount: 0, failCount: 0, cooldownUntil: 0,
        disabled: false, apiVersion: 'UNKNOWN', source,
      });
    }
    await get().load();
    await notifyShare();
    await get().probeAll();
  },

  async reprobe(node) {
    const probed = await deps().api.probe(node.baseUrl, node.label, node.apiKey);
    await deps().nodes.upsert({
      ...node,
      health: probed.health,
      lastChecked: probed.lastChecked,
      voiceCount: probed.voiceCount,
      apiVersion: probed.apiVersion,
      defaultVoice: probed.defaultVoice || node.defaultVoice,
      keyless: probed.keyless,
      failCount: 0,
      cooldownUntil: 0,
    });
  },

  async probeAll() {
    if (get().probing) return;
    set({ probing: true, probeProgress: null });
    try {
      const snapshot = [...get().nodes];
      const total = snapshot.length;
      let done = 0;
      const concurrency = useSettingsStore.getState().appPrefs.probeConcurrency;
      await mapLimit(snapshot, concurrency, async (n) => {
        try {
          await get().reprobe(n);
        } finally {
          done++;
          set({ probeProgress: `已探测 ${done}/${total}` });
        }
      });
      await get().load();
      await notifyShare();
    } finally {
      set({ probing: false, probeProgress: null });
    }
  },

  async update(node, origBaseUrl) {
    if (origBaseUrl && origBaseUrl !== node.baseUrl) {
      await deps().nodes.delete([node.id]);
    }
    await deps().nodes.upsert(node);
    await get().load();
    await notifyShare();
  },

  async remove(ids) {
    await deps().nodes.delete(ids);
    await get().load();
    await notifyShare();
  },

  async setDisabled(ids, disabled) {
    await deps().nodes.setDisabled(ids, disabled);
    await get().load();
    await notifyShare();
  },
}));
```

注意：`importRecords` 与 `update` 中用到 `crypto.randomUUID()`，webview 与 Node 19+ 均可用；为兼容可改用 `newId()`（从 types/models 导入）。**请统一改为 `newId()`** 并加导入。

- [ ] **步骤 7：`src/store/logsStore.ts`**

```ts
import { create } from 'zustand';
import type { CallLog, LogFilter } from '../types/models';
import type { LogsFilterKind } from '../lib/db';
import { deps } from './deps';

interface LogsState {
  logs: CallLog[];
  filter: LogFilter;
  loading: boolean;
  load(filter?: LogFilter): Promise<void>;
  clear(): Promise<void>;
}

export const useLogsStore = create<LogsState>((set, get) => ({
  logs: [],
  filter: 'ALL',
  loading: false,
  async load(filter) {
    if (filter) set({ filter });
    set({ loading: true });
    try {
      const logs = await deps().logs.query(get().filter as LogsFilterKind);
      set({ logs });
    } finally {
      set({ loading: false });
    }
  },
  async clear() {
    await deps().logs.clear();
    set({ logs: [] });
  },
}));
```

- [ ] **步骤 8：`src/store/voicesStore.ts`**

```ts
import { create } from 'zustand';
import { parseVoices, voiceDisplayName } from '../lib/voices';
import type { TtsNode, Voice } from '../types/models';
import { deps } from './deps';

interface VoicesState {
  voices: Voice[];
  loading: boolean;
  error: string | null;
  initCache(): Promise<void>;
  load(force?: boolean, source?: TtsNode): Promise<void>;
}

export const useVoicesStore = create<VoicesState>((set, get) => ({
  voices: [],
  loading: false,
  error: null,
  async initCache() {
    const cached = await deps().settings.getJson<Voice[]>('voices_cache', []);
    if (cached.length && get().voices.length === 0) set({ voices: cached });
  },
  async load(force = false, source) {
    if (get().loading) return;
    if (!force && get().voices.length > 0) return;
    set({ loading: true, error: null });
    try {
      const nodes = (await deps().nodes.getAll());
      const node = source ?? nodes.find((n) => n.health === 'OK') ?? nodes[0];
      if (!node) {
        set({ error: '没有可用节点，请先在“节点”页添加并探测' });
        return;
      }
      const list = await deps().api.fetchVoices(node.baseUrl);
      if (!list || list.length === 0) {
        set({ error: `拉取音色失败：${node.baseUrl}` });
        return;
      }
      set({ voices: list });
      await deps().settings.setJson('voices_cache', list);
    } finally {
      set({ loading: false });
    }
  },
}));

export { voiceDisplayName };
```

- [ ] **步骤 9：`src/store/poolDeps.ts`**

```ts
import { SYNTH_RETRIES_PER_NODE, synthesize, type PoolDeps, type PoolResult } from '../lib/pool';
import type { CallLog, PoolConfig, SynthPrefs, TtsNode } from '../types/models';
import { deps } from './deps';
import { useLogsStore } from './logsStore';
import { useNodesStore } from './nodesStore';
import { useSettingsStore } from './settingsStore';

export function makePoolDeps(nodes: TtsNode[], pool: PoolConfig): PoolDeps {
  return {
    getNodes: () => nodes,
    getConfig: () => pool,
    updateConfig: async (fn) => {
      await useSettingsStore.getState().updatePool(fn);
    },
    upsertNode: async (n) => {
      await deps().nodes.upsert(n);
      await useNodesStore.getState().load();
    },
    insertLog: async (l: CallLog) => {
      await deps().logs.insert(l);
      await useLogsStore.getState().load();
    },
    synth: async (n, t, p) => {
      const bytes = await deps().api.synthesize(n, t, p, SYNTH_RETRIES_PER_NODE);
      if (!bytes) throw new Error('v1/兼容端点均不可用');
      return bytes;
    },
    now: () => Date.now(),
  };
}

export function currentPrefs(): SynthPrefs {
  const s = useSettingsStore.getState().synth;
  return { voice: s.voice, rate: s.rate, pitch: s.pitch, style: '' };
}

export async function synthesizeText(
  text: string,
  prefs: SynthPrefs = currentPrefs(),
): Promise<PoolResult> {
  const nodes = useNodesStore.getState().nodes;
  const pool = useSettingsStore.getState().pool;
  return synthesize(makePoolDeps(nodes, pool), text, prefs);
}
```

- [ ] **步骤 10：类型检查**

```powershell
npx tsc --noEmit
```

预期：无 error（若有未使用导入等按报错修正）。

- [ ] **步骤 11：Commit**

```powershell
git add -A; if ($?) { git commit -m "feat: 状态层（配置/节点/日志/音色）与依赖容器" }
```

---

### 任务 7：布局、样式与引导启动

**文件：**
- 创建：`src/styles.css`
- 修改：`src/App.tsx`、`src/main.tsx`
- 删除：`src/App.css`（模板文件，改用 styles.css；相应改 import）
- 创建：`src/pages/ReadPage.tsx`（骨架，任务 9 补朗读管线）、其余页面占位

- [ ] **步骤 1：`src/styles.css` 全文**

```css
:root {
  --primary: #16A34A; --primary-deep: #15803D; --primary-soft: #DCFCE7;
  --accent: #0EA5E9; --accent-soft: #E0F2FE;
  --danger: #DC2626; --danger-soft: #FEE2E2;
  --warn: #D97706; --warn-soft: #FEF3C7;
  --ink: #0F172A; --ink-2: #475569; --ink-3: #94A3B8;
  --bg: #F1F5F9; --card: #FFFFFF; --line: #E2E8F0;
  --radius: 14px; --shadow: 0 1px 3px rgba(15, 23, 42, .06), 0 4px 16px rgba(15, 23, 42, .05);
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif; background: var(--bg); color: var(--ink); font-size: 14px; }
.layout { display: flex; height: 100vh; }
.sidebar { width: 168px; background: var(--card); border-right: 1px solid var(--line); padding: 18px 12px; display: flex; flex-direction: column; gap: 4px; flex-shrink: 0; }
.brand { font-size: 15px; font-weight: 800; padding: 0 10px 16px; color: var(--primary-deep); }
.sidebar a { display: block; padding: 10px 12px; border-radius: 10px; color: var(--ink-2); text-decoration: none; font-weight: 600; }
.sidebar a.active { background: var(--primary-soft); color: var(--primary-deep); }
.sidebar a:hover { background: var(--bg); }
.content { flex: 1; overflow-y: auto; padding: 20px; }
.page-title { font-size: 18px; font-weight: 800; margin-bottom: 14px; }
.card { background: var(--card); border: 1px solid rgba(226, 232, 240, .7); border-radius: var(--radius); box-shadow: var(--shadow); padding: 16px; margin-bottom: 14px; }
.row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.row.between { justify-content: space-between; }
.grow { flex: 1; min-width: 0; }
.muted { color: var(--ink-3); font-size: 12.5px; }
.btn { border: 1px solid var(--line); background: var(--card); color: var(--ink-2); border-radius: 10px; padding: 8px 14px; font-size: 13.5px; font-weight: 600; cursor: pointer; }
.btn:hover { background: var(--bg); }
.btn.primary { background: linear-gradient(135deg, var(--primary), var(--primary-deep)); color: #fff; border: none; }
.btn.danger { background: var(--danger-soft); color: var(--danger); border-color: transparent; }
.btn:disabled { opacity: .5; cursor: not-allowed; }
.input, textarea.input { border: 1.5px solid var(--line); background: #F8FAFC; border-radius: 10px; padding: 8px 10px; font-size: 13.5px; color: var(--ink); outline: none; font-family: inherit; }
.input:focus { border-color: var(--primary); background: #fff; }
textarea.input { width: 100%; min-height: 160px; resize: vertical; }
.badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11.5px; font-weight: 700; }
.badge.ok { background: var(--primary-soft); color: var(--primary-deep); }
.badge.fail { background: var(--danger-soft); color: var(--danger); }
.badge.unknown { background: var(--line); color: var(--ink-2); }
.badge.warn { background: var(--warn-soft); color: var(--warn); }
.badge.accent { background: var(--accent-soft); color: var(--accent); }
.tabs { display: flex; gap: 6px; margin-bottom: 12px; }
.tabs button { border: 1px solid var(--line); background: var(--card); border-radius: 999px; padding: 6px 14px; font-size: 13px; cursor: pointer; color: var(--ink-2); }
.tabs button.active { background: var(--primary); color: #fff; border-color: var(--primary); }
table.table { width: 100%; border-collapse: collapse; }
.table th { text-align: left; font-size: 12px; color: var(--ink-3); padding: 8px 8px; border-bottom: 1px solid var(--line); font-weight: 600; }
.table td { padding: 9px 8px; border-bottom: 1px solid var(--line); font-size: 13px; vertical-align: middle; }
.table tr:hover td { background: #F8FAFC; }
.dialog-mask { position: fixed; inset: 0; background: rgba(15, 23, 42, .45); display: flex; align-items: center; justify-content: center; z-index: 50; }
.dialog { background: var(--card); border-radius: var(--radius); padding: 20px; width: 420px; max-width: 92vw; box-shadow: 0 20px 60px rgba(15, 23, 42, .3); }
.dialog h3 { font-size: 15px; margin-bottom: 14px; }
.field { display: flex; flex-direction: column; gap: 5px; margin-bottom: 12px; }
.field label { font-size: 12.5px; color: var(--ink-2); font-weight: 600; }
.seg-list { max-height: 300px; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; }
.seg { padding: 8px 10px; border-radius: 8px; background: var(--bg); font-size: 13px; color: var(--ink-2); border-left: 3px solid transparent; }
.seg.playing { background: var(--primary-soft); border-left-color: var(--primary); color: var(--primary-deep); font-weight: 600; }
.seg.synthesizing { border-left-color: var(--accent); }
.seg.error { background: var(--danger-soft); border-left-color: var(--danger); color: var(--danger); }
.seg.done { opacity: .55; }
.slider-row { display: flex; align-items: center; gap: 10px; }
.slider-row input[type='range'] { flex: 1; }
.mono { font-family: ui-monospace, Consolas, monospace; font-size: 12.5px; }
```

- [ ] **步骤 2：`src/App.tsx` 全文**

```tsx
import { HashRouter, NavLink, Route, Routes } from 'react-router-dom';
import { LogsPage } from './pages/LogsPage';
import { NodesPage } from './pages/NodesPage';
import { ReadPage } from './pages/ReadPage';
import { SettingsPage } from './pages/SettingsPage';
import { VoicesPage } from './pages/VoicesPage';

const NAV: [string, string][] = [
  ['/', '朗读'],
  ['/nodes', '节点'],
  ['/voices', '音色'],
  ['/logs', '日志'],
  ['/settings', '设置'],
];

export default function App() {
  return (
    <HashRouter>
      <div className="layout">
        <nav className="sidebar">
          <div className="brand">TTS Aggregator</div>
          {NAV.map(([to, label]) => (
            <NavLink key={to} to={to} end={to === '/'}>{label}</NavLink>
          ))}
        </nav>
        <main className="content">
          <Routes>
            <Route path="/" element={<ReadPage />} />
            <Route path="/nodes" element={<NodesPage />} />
            <Route path="/voices" element={<VoicesPage />} />
            <Route path="/logs" element={<LogsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  );
}
```

- [ ] **步骤 3：页面文件（本任务先建 4 个最小占位，ReadPage 完整骨架；任务 8-10 充实）**

`src/pages/ReadPage.tsx`（骨架，任务 9 完成朗读管线）：

```tsx
export function ReadPage() {
  return (
    <div>
      <div className="page-title">朗读</div>
      <div className="card">朗读管线在任务 9 接入。</div>
    </div>
  );
}
```

`src/pages/NodesPage.tsx`、`src/pages/VoicesPage.tsx`、`src/pages/LogsPage.tsx`、`src/pages/SettingsPage.tsx` 各自同构占位（标题 + “任务 N 接入”），保证可编译。

- [ ] **步骤 4：`src/main.tsx` 引导（本任务先开库+依赖注入+初始加载）**

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';
import { createApi } from './lib/api';
import { createLogsRepo, createNodesRepo, createSettingsRepo, openDb } from './lib/db';
import { setDeps } from './store/deps';
import { setShareProvider } from './store/shareSync';
import { useNodesStore } from './store/nodesStore';
import { useSettingsStore } from './store/settingsStore';
import { useVoicesStore } from './store/voicesStore';

async function bootstrap() {
  const db = await openDb();
  setDeps({
    db,
    api: createApi(),
    nodes: createNodesRepo(db),
    logs: createLogsRepo(db),
    settings: createSettingsRepo(db),
  });
  await useSettingsStore.getState().load();
  await useNodesStore.getState().load();
  await useVoicesStore.getState().initCache();
  setShareProvider(() => ({
    nodes: useNodesStore.getState().nodes,
    pool: useSettingsStore.getState().pool,
    share: useSettingsStore.getState().share,
  }));
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

bootstrap().catch((e) => {
  console.error(e);
  document.body.innerHTML = `<pre style="padding:24px">启动失败：${String(e)}</pre>`;
});
```

删除模板遗留：`src/App.css`、`src/assets/react.svg`（若存在），并移除模板 `App.tsx`/`main.tsx` 中对它们的引用（上述新全文已覆盖）。

- [ ] **步骤 5：构建验证**

```powershell
npx tsc --noEmit; if ($?) { npm run build }
```

预期：无 error。

- [ ] **步骤 6：启动 dev 验证（可手动打开窗口后关闭）**

```powershell
npm run tauri dev
```

预期：窗口打开、左侧导航渲染、无控制台报错；权限/插件加载错误按报错修正（常见：capabilities JSON 缩进/字段名）。验证后关闭窗口。

- [ ] **步骤 7：Commit**

```powershell
git add -A; if ($?) { git commit -m "feat: 应用布局、全局样式与引导启动" }
```

---

### 任务 8：朗读管线（切分器 + 播放器，TDD 切分器）

**文件：**
- 创建：`src/lib/split.ts`、`src/lib/encoding.ts`（含测试）
- 创建：`src/store/playerStore.ts`
- 修改：`src/pages/ReadPage.tsx`、`src/main.tsx`（配置 synthFn）

- [ ] **步骤 1：编写失败的测试 `src/lib/split.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { splitForReading } from './split';

describe('splitForReading', () => {
  it('按空行/换行分段，保序去空', () => {
    expect(splitForReading('第一段。\n\n第二段。\n第三段。'))
      .toEqual(['第一段。', '第二段。', '第三段。']);
  });

  it('超长无标点段硬切，段长不超过 800', () => {
    const text = 'あ'.repeat(1850);
    const segs = splitForReading(text, 800);
    expect(segs.length).toBe(3);
    for (const s of segs) expect(s.length).toBeLessThanOrEqual(800);
    expect(segs.join('')).toBe(text);
  });

  it('超长段在句号处切分', () => {
    const sentence = '这是一句话。';
    const text = sentence.repeat(200); // 2400 字
    const segs = splitForReading(text, 800);
    expect(segs.length).toBeGreaterThanOrEqual(3);
    for (const s of segs) expect(s.endsWith('。') || s.length <= 800).toBe(true);
    expect(segs.join('')).toBe(text);
  });

  it('CRLF 归一化与空输入', () => {
    expect(splitForReading('a\r\nb')).toEqual(['a', 'b']);
    expect(splitForReading('   ')).toEqual([]);
  });
});
```

测试 `src/lib/encoding.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { decodeTextBuffer } from './encoding';

describe('decodeTextBuffer', () => {
  it('UTF-8 正常解码', () => {
    const buf = new TextEncoder().encode('你好，世界').buffer;
    expect(decodeTextBuffer(buf)).toBe('你好，世界');
  });

  it('非法 UTF-8 回退 gb18030', () => {
    // GBK 编码的 "中文"：0xD6D0 0xCEC4
    const gbk = new Uint8Array([0xd6, 0xd0, 0xce, 0xc4]);
    expect(decodeTextBuffer(gbk.buffer)).toBe('中文');
  });
});
```

- [ ] **步骤 2：运行验证失败**

```powershell
npx vitest run src/lib/split.test.ts src/lib/encoding.test.ts
```

预期：FAIL，两个模块不存在。

- [ ] **步骤 3：实现 `src/lib/split.ts` 与 `src/lib/encoding.ts`**

```ts
// src/lib/split.ts
export function splitForReading(raw: string, maxLen = 800): string[] {
  const text = raw.replace(/\r\n/g, '\n').trim();
  if (!text) return [];
  const out: string[] = [];
  for (const para of text.split(/\n+/)) {
    const p = para.trim();
    if (!p) continue;
    if (p.length <= maxLen) {
      out.push(p);
      continue;
    }
    let buf = '';
    const sentences = p.split(/(?<=[。！？!?；;])/);
    for (const s of sentences) {
      if (!s) continue;
      if ((buf + s).length <= maxLen) {
        buf += s;
      } else {
        if (buf) out.push(buf);
        buf = '';
        let rest = s;
        while (rest.length > maxLen) {
          out.push(rest.slice(0, maxLen));
          rest = rest.slice(maxLen);
        }
        buf = rest;
      }
    }
    if (buf) out.push(buf);
  }
  return out;
}
```

```ts
// src/lib/encoding.ts
export function decodeTextBuffer(buf: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('gb18030').decode(buf);
  }
}

export async function readTextFile(file: File): Promise<string> {
  return decodeTextBuffer(await file.arrayBuffer());
}
```

- [ ] **步骤 4：运行验证通过**

```powershell
npx vitest run src/lib/split.test.ts src/lib/encoding.test.ts
```

预期：PASS（6 tests）。

- [ ] **步骤 5：实现 `src/store/playerStore.ts`**

```ts
import { create } from 'zustand';
import { splitForReading } from '../lib/split';

export type SegStatus = 'pending' | 'synthesizing' | 'playing' | 'done' | 'error';
export type PlayerStatus = 'idle' | 'running' | 'paused';
export interface Segment { text: string; status: SegStatus }

interface PlayerState {
  status: PlayerStatus;
  segs: Segment[];
  index: number;
  error: string | null;
  currentTime: number;
  duration: number;
  setSynth(fn: (text: string) => Promise<ArrayBuffer>): void;
  start(text: string): Promise<void>;
  pause(): void;
  resume(): Promise<void>;
  stop(): void;
  skipNext(): void;
}

const audio = new Audio();
let synthFn: ((text: string) => Promise<ArrayBuffer>) | null = null;
let runToken = 0;
let resolveEnded: (() => void) | null = null;
let currentUrl: string | null = null;
let prefetch: { index: number; promise: Promise<ArrayBuffer> } | null = null;

function setSeg(i: number, status: SegStatus): void {
  const segs = [...usePlayerStore.getState().segs];
  if (!segs[i]) return;
  segs[i] = { ...segs[i], status };
  usePlayerStore.setState({ segs });
}

function revokeUrl(): void {
  if (currentUrl) {
    URL.revokeObjectURL(currentUrl);
    currentUrl = null;
  }
}

audio.addEventListener('ended', () => {
  resolveEnded?.();
  resolveEnded = null;
});
audio.addEventListener('timeupdate', () => {
  usePlayerStore.setState({ currentTime: audio.currentTime, duration: audio.duration || 0 });
});

function playAndWait(): Promise<void> {
  return new Promise((resolve, reject) => {
    resolveEnded = resolve;
    audio.onerror = () => {
      resolveEnded = null;
      reject(new Error('音频播放失败'));
    };
    audio.play().catch((e: unknown) => {
      resolveEnded = null;
      reject(e instanceof Error ? e : new Error(String(e)));
    });
  });
}

async function pump(token: number): Promise<void> {
  let consecutiveErrors = 0;
  while (token === runToken) {
    const s = usePlayerStore.getState();
    if (s.status !== 'running') return;
    if (s.index >= s.segs.length) {
      const allError = s.segs.length > 0 && s.segs.every((x) => x.status === 'error');
      usePlayerStore.setState({
        status: 'idle',
        error: allError ? '朗读失败：所有段合成均失败，详见日志' : null,
      });
      return;
    }
    const i = s.index;
    setSeg(i, 'synthesizing');
    try {
      let bytes: Promise<ArrayBuffer>;
      if (prefetch && prefetch.index === i) {
        bytes = prefetch.promise;
        prefetch = null;
      } else {
        if (!synthFn) throw new Error('朗读器未初始化');
        bytes = synthFn(s.segs[i].text);
      }
      const buf = await bytes;
      if (token !== runToken || usePlayerStore.getState().status !== 'running') return;
      revokeUrl();
      currentUrl = URL.createObjectURL(new Blob([buf], { type: 'audio/mpeg' }));
      audio.src = currentUrl;
      audio.currentTime = 0;
      setSeg(i, 'playing');
      // 预合成下一段
      const nextIdx = i + 1;
      if (synthFn && nextIdx < usePlayerStore.getState().segs.length && !prefetch) {
        const text = usePlayerStore.getState().segs[nextIdx].text;
        setSeg(nextIdx, 'synthesizing');
        prefetch = { index: nextIdx, promise: synthFn(text) };
        prefetch.promise.catch(() => { /* 到位时再统一处理失败 */ });
      }
      await playAndWait();
      if (token !== runToken) return;
      revokeUrl();
      audio.removeAttribute('src');
      setSeg(i, 'done');
      consecutiveErrors = 0;
      usePlayerStore.setState({ index: i + 1 });
    } catch (e) {
      if (token !== runToken) return;
      setSeg(i, 'error');
      consecutiveErrors++;
      usePlayerStore.setState({
        error: `第 ${i + 1} 段失败：${e instanceof Error ? e.message : String(e)}`,
        index: i + 1,
      });
      if (consecutiveErrors >= usePlayerStore.getState().segs.length) {
        usePlayerStore.setState({ status: 'idle', error: '朗读失败：连续段落全部失败，详见日志' });
        return;
      }
    }
  }
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  status: 'idle',
  segs: [],
  index: 0,
  error: null,
  currentTime: 0,
  duration: 0,
  setSynth(fn) {
    synthFn = fn;
  },
  async start(text) {
    get().stop();
    const segs = splitForReading(text).map((t) => ({ text: t, status: 'pending' as SegStatus }));
    if (segs.length === 0) {
      set({ error: '没有可朗读的文本' });
      return;
    }
    prefetch = null;
    set({ status: 'running', segs, index: 0, error: null, currentTime: 0, duration: 0 });
    const token = ++runToken;
    void pump(token);
  },
  pause() {
    if (get().status !== 'running') return;
    audio.pause();
    set({ status: 'paused' });
  },
  async resume() {
    if (get().status !== 'paused') return;
    set({ status: 'running' });
    await audio.play().catch(() => { /* src 无效时进入下一轮 pump 合成 */ });
    // 若当前段无 src（暂停于段间），重新驱动 pump
    if (!audio.src) void pump(runToken);
  },
  stop() {
    runToken++;
    audio.pause();
    revokeUrl();
    audio.removeAttribute('src');
    prefetch = null;
    resolveEnded?.();
    resolveEnded = null;
    set({ status: 'idle', currentTime: 0, duration: 0 });
  },
  skipNext() {
    const s = get();
    if (s.status === 'idle' || s.segs.length === 0) return;
    runToken++;
    audio.pause();
    revokeUrl();
    audio.removeAttribute('src');
    resolveEnded?.();
    resolveEnded = null;
    prefetch = null;
    const next = Math.min(s.index + 1, s.segs.length);
    if (next >= s.segs.length) {
      set({ status: 'idle', index: s.segs.length });
      return;
    }
    set({ index: next, status: 'running' });
    const token = ++runToken;
    void pump(token);
  },
}));
```

实现要点（执行者注意）：
- `resume()` 中 `audio.play()` 后 pump 仍在等待同一个 `ended`（pause 未 resolve），因此无需重启 pump；`if (!audio.src)` 分支兜底。
- `stop()` 里 `runToken++` 使旧 pump 失效，随后的 `resolveEnded?.()` 让挂起的 `playAndWait` 立即返回。
- 若 `start` 被 `stop` 中断（`stop` 内 `runToken++` 后 `start` 又 `++`），token 唯一性成立。

- [ ] **步骤 6：main.tsx 配置 synthFn**

在 `bootstrap()` 中（`setShareProvider` 之后）加入：

```ts
import { synthesizeText } from './store/poolDeps';
import { usePlayerStore } from './store/playerStore';

usePlayerStore.getState().setSynth(async (text) => {
  const result = await synthesizeText(text);
  return result.bytes;
});
```

- [ ] **步骤 7：实现 `src/pages/ReadPage.tsx`**

```tsx
import { useRef, useState } from 'react';
import { readTextFile } from '../lib/encoding';
import { voiceDisplayName } from '../lib/voices';
import { usePlayerStore } from '../store/playerStore';
import { useSettingsStore } from '../store/settingsStore';
import { useVoicesStore } from '../store/voicesStore';

export function ReadPage() {
  const [text, setText] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const player = usePlayerStore();
  const { synth, saveSynth } = useSettingsStore();
  const { voices, load } = useVoicesStore();

  const playing = player.status === 'running' || player.status === 'paused';

  return (
    <div>
      <div className="page-title">朗读</div>

      <div className="card">
        <textarea
          className="input"
          placeholder="粘贴或输入要朗读的文本，或导入 TXT…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn" onClick={() => fileRef.current?.click()}>导入 TXT</button>
          <input
            ref={fileRef}
            type="file"
            accept=".txt,text/plain"
            style={{ display: 'none' }}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (file) setText(await readTextFile(file));
              e.target.value = '';
            }}
          />
          <div className="grow" />
          <span className="muted">{text.length} 字</span>
        </div>
      </div>

      <div className="card">
        <div className="row">
          <div className="field grow" style={{ marginBottom: 0 }}>
            <label>音色</label>
            <select
              className="input"
              value={synth.voice}
              onFocus={() => void load()}
              onChange={(e) => void saveSynth({ ...synth, voice: e.target.value })}
            >
              <option value="">节点默认音色</option>
              {voices.map((v) => (
                <option key={v.id} value={v.id}>{voiceDisplayName(v)}（{v.id}）</option>
              ))}
            </select>
          </div>
          <div className="field" style={{ marginBottom: 0, minWidth: 160 }}>
            <label>语速 {synth.rate}</label>
            <div className="slider-row">
              <input
                type="range" min={-100} max={100} value={synth.rate}
                onChange={(e) => void saveSynth({ ...synth, rate: Number(e.target.value) })}
              />
            </div>
          </div>
          <div className="field" style={{ marginBottom: 0, minWidth: 160 }}>
            <label>音调 {synth.pitch}</label>
            <div className="slider-row">
              <input
                type="range" min={-100} max={100} value={synth.pitch}
                onChange={(e) => void saveSynth({ ...synth, pitch: Number(e.target.value) })}
              />
            </div>
          </div>
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          {player.status !== 'running' && player.status !== 'paused' ? (
            <button className="btn primary" onClick={() => void player.start(text)}>开始朗读</button>
          ) : player.status === 'running' ? (
            <button className="btn" onClick={player.pause}>暂停</button>
          ) : (
            <button className="btn primary" onClick={() => void player.resume()}>继续</button>
          )}
          <button className="btn" onClick={player.skipNext} disabled={player.status === 'idle'}>下一段</button>
          <button className="btn danger" onClick={player.stop} disabled={!playing}>停止</button>
          <div className="grow" />
          {player.segs.length > 0 && (
            <span className="muted">
              进度 {Math.min(player.index + 1, player.segs.length)}/{player.segs.length} 段
              {player.duration > 0 && ` · ${Math.floor(player.currentTime)}s / ${Math.floor(player.duration)}s`}
            </span>
          )}
        </div>
        {player.error && <div className="muted" style={{ color: 'var(--danger)', marginTop: 8 }}>{player.error}</div>}
      </div>

      {player.segs.length > 0 && (
        <div className="card">
          <div className="seg-list">
            {player.segs.map((seg, i) => (
              <div key={i} className={`seg ${seg.status}`}>{i + 1}. {seg.text}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **步骤 8：构建验证**

```powershell
npx tsc --noEmit; if ($?) { npx vitest run }
```

预期：tsc 无 error，全部测试 PASS。

- [ ] **步骤 9：Commit**

```powershell
git add -A; if ($?) { git commit -m "feat: 长文本切分/排队朗读管线与 TXT 导入" }
```

---

### 任务 9：节点管理页

**文件：**
- 修改：`src/pages/NodesPage.tsx`（占位 → 完整实现）

- [ ] **步骤 1：实现 `src/pages/NodesPage.tsx` 全文**

```tsx
import { useEffect, useState } from 'react';
import { useNodesStore } from '../store/nodesStore';
import { useSettingsStore } from '../store/settingsStore';
import { isCoolingDown, type CallMode, type TtsNode } from '../types/models';

const MODES: [CallMode, string, string][] = [
  ['AUTO', '自动', '按健康度依次尝试，失败自动切换'],
  ['GROUP', '组', '组内轮询，成功后换下一个'],
  ['MANUAL', '手选', '只用选中节点，连败 3 次后停止'],
];

function healthBadge(n: TtsNode): JSX.Element {
  if (n.disabled) return <span className="badge unknown">已禁用</span>;
  if (isCoolingDown(n, Date.now())) return <span className="badge warn">冷却中</span>;
  if (n.health === 'OK') return <span className="badge ok">正常</span>;
  if (n.health === 'FAIL') return <span className="badge fail">失败</span>;
  return <span className="badge unknown">未测</span>;
}

const emptyForm = { baseUrl: '', label: '', apiKey: '' };

export function NodesPage() {
  const st = useNodesStore();
  const { pool, updatePool, appPrefs, saveAppPrefs } = useSettingsStore();
  const [showForm, setShowForm] = useState<null | 'add' | 'edit'>(null);
  const [editOrig, setEditOrig] = useState<string>('');
  const [form, setForm] = useState(emptyForm);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { void st.load(); }, []);

  function openAdd() {
    setForm(emptyForm);
    setEditOrig('');
    setErr(null);
    setShowForm('add');
  }

  function openEdit(n: TtsNode) {
    setForm({ baseUrl: n.baseUrl, label: n.label, apiKey: n.apiKey ?? '' });
    setEditOrig(n.baseUrl);
    setErr(null);
    setShowForm('edit');
  }

  async function submit() {
    if (!form.baseUrl.trim()) { setErr('URL 不能为空'); return; }
    setErr(null);
    try {
      if (showForm === 'add') {
        await st.add({ baseUrl: form.baseUrl, label: form.label, apiKey: form.apiKey || null });
      } else {
        const orig = st.nodes.find((n) => n.baseUrl === editOrig);
        if (!orig) throw new Error('节点不存在');
        await st.update(
          { ...orig, baseUrl: form.baseUrl.trim(), label: form.label, apiKey: form.apiKey || null },
          editOrig,
        );
      }
      setShowForm(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div>
      <div className="page-title">节点</div>

      <div className="card">
        <div className="row between">
          <div className="row">
            <button className="btn primary" onClick={openAdd}>添加节点</button>
            <button className="btn" onClick={() => void st.probeAll()} disabled={st.probing}>
              {st.probing ? (st.probeProgress ?? '探测中…') : '全部探测'}
            </button>
            <span className="muted">共 {st.nodes.length} 个</span>
          </div>
          <div className="row">
            <label className="muted">探测并发</label>
            <input
              className="input" style={{ width: 64 }} type="number" min={1} max={8}
              value={appPrefs.probeConcurrency}
              onChange={(e) => void saveAppPrefs({ ...appPrefs, probeConcurrency: Math.max(1, Math.min(8, Number(e.target.value) || 1)) })}
            />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="row" style={{ marginBottom: 8 }}>
          {MODES.map(([mode, label, desc]) => (
            <button
              key={mode}
              className={`btn ${pool.mode === mode ? 'primary' : ''}`}
              title={desc}
              onClick={() => void updatePool((c) => ({ ...c, mode }))}
            >
              {label}
            </button>
          ))}
          <span className="muted">{MODES.find(([m]) => m === pool.mode)?.[2]}</span>
        </div>

        <table className="table">
          <thead>
            <tr>
              <th>状态</th><th>节点</th><th>API</th><th>音色</th><th>组</th><th>手选</th><th>来源</th><th style={{ width: 220 }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {st.nodes.map((n) => (
              <tr key={n.id}>
                <td>{healthBadge(n)}</td>
                <td>
                  <div style={{ fontWeight: 600 }}>{n.label || '—'}</div>
                  <div className="muted mono">{n.baseUrl}</div>
                </td>
                <td><span className="badge accent">{n.apiVersion}</span>{n.keyless && <> <span className="badge ok">免Key</span></>}</td>
                <td>{n.voiceCount || '—'}</td>
                <td>
                  <input
                    type="checkbox"
                    checked={pool.groupIds.includes(n.id)}
                    onChange={() => void updatePool((c) => ({
                      ...c,
                      groupIds: c.groupIds.includes(n.id)
                        ? c.groupIds.filter((x) => x !== n.id)
                        : [...c.groupIds, n.id],
                    }))}
                  />
                </td>
                <td>
                  <input
                    type="radio" name="manual" checked={pool.manualId === n.id}
                    onChange={() => void updatePool((c) => ({ ...c, manualId: n.id, manualFailCount: 0 }))}
                  />
                </td>
                <td className="muted">{n.source}</td>
                <td>
                  <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                    <button className="btn" onClick={() => void st.reprobe(n)}>测试</button>
                    <button className="btn" onClick={() => openEdit(n)}>编辑</button>
                    <button className="btn" onClick={() => void st.setDisabled([n.id], !n.disabled)}>
                      {n.disabled ? '启用' : '禁用'}
                    </button>
                    <button className="btn danger" onClick={() => { if (confirm(`删除 ${n.baseUrl}？`)) void st.remove([n.id]); }}>删</button>
                  </div>
                </td>
              </tr>
            ))}
            {st.nodes.length === 0 && (
              <tr><td colSpan={8} className="muted" style={{ textAlign: 'center', padding: 24 }}>还没有节点，点击“添加节点”</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="dialog-mask" onClick={() => setShowForm(null)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <h3>{showForm === 'add' ? '添加节点' : '编辑节点'}</h3>
            <div className="field">
              <label>节点 URL</label>
              <input className="input" placeholder="https://tts.example.com" value={form.baseUrl}
                onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} />
            </div>
            <div className="field">
              <label>备注名</label>
              <input className="input" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
            </div>
            <div className="field">
              <label>API Key（免 Key 节点留空）</label>
              <input className="input" value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} />
            </div>
            {err && <div className="muted" style={{ color: 'var(--danger)', marginBottom: 8 }}>{err}</div>}
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setShowForm(null)}>取消</button>
              <button className="btn primary" onClick={() => void submit()}>保存并探测</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **步骤 2：构建验证**

```powershell
npx tsc --noEmit; if ($?) { npm run build }
```

预期：无 error。

- [ ] **步骤 3：手动验证**

`npm run tauri dev` → 节点页：添加一个真实可用的 TTS 节点 URL → 保存后列表出现且状态为“正常”；编辑/禁用/删除可用；切换调度模式生效（重启后保持）。

- [ ] **步骤 4：Commit**

```powershell
git add -A; if ($?) { git commit -m "feat: 节点管理页（增删改/探测/调度模式/组与手选）" }
```

---

### 任务 10：音色页、日志页、设置页

**文件：**
- 修改：`src/pages/VoicesPage.tsx`、`src/pages/LogsPage.tsx`、`src/pages/SettingsPage.tsx`

- [ ] **步骤 1：实现 `src/pages/VoicesPage.tsx`**

```tsx
import { useEffect, useMemo, useState } from 'react';
import { voiceDisplayName } from '../lib/voices';
import { synthesizeText } from '../store/poolDeps';
import { useSettingsStore } from '../store/settingsStore';
import { useVoicesStore } from '../store/voicesStore';

export function VoicesPage() {
  const { voices, loading, error, load } = useVoicesStore();
  const { synth, saveSynth } = useSettingsStore();
  const [q, setQ] = useState('');
  const [gender, setGender] = useState('');
  const [locale, setLocale] = useState('');
  const [auditioning, setAuditioning] = useState<string | null>(null);

  useEffect(() => { void load(); }, []);

  const locales = useMemo(() => [...new Set(voices.map((v) => v.locale).filter(Boolean))], [voices]);
  const shown = voices.filter((v) =>
    (!gender || v.gender === gender)
    && (!locale || v.locale === locale)
    && (!q || voiceDisplayName(v).includes(q) || v.id.toLowerCase().includes(q.toLowerCase())));

  async function audition(id: string) {
    setAuditioning(id);
    try {
      const { bytes } = await synthesizeText('你好，这是一段试听。', { voice: id, rate: synth.rate, pitch: synth.pitch, style: '' });
      const url = URL.createObjectURL(new Blob([bytes], { type: 'audio/mpeg' }));
      const a = new Audio(url);
      a.onended = () => URL.revokeObjectURL(url);
      await a.play();
    } catch (e) {
      alert(`试听失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setAuditioning(null);
    }
  }

  return (
    <div>
      <div className="page-title">音色</div>
      <div className="card">
        <div className="row">
          <button className="btn primary" onClick={() => void load(true)} disabled={loading}>
            {loading ? '拉取中…' : '重新拉取'}
          </button>
          <input className="input grow" placeholder="搜索音色名 / ID" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="input" value={gender} onChange={(e) => setGender(e.target.value)}>
            <option value="">全部性别</option>
            <option value="Female">女</option>
            <option value="Male">男</option>
          </select>
          <select className="input" value={locale} onChange={(e) => setLocale(e.target.value)}>
            <option value="">全部语言</option>
            {locales.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        {error && <div className="muted" style={{ color: 'var(--danger)', marginTop: 8 }}>{error}</div>}
      </div>

      <div className="card">
        <table className="table">
          <thead><tr><th>名称</th><th>ID</th><th>性别</th><th>语言</th><th>风格</th><th style={{ width: 160 }}>操作</th></tr></thead>
          <tbody>
            {shown.map((v) => (
              <tr key={v.id}>
                <td style={{ fontWeight: 600 }}>{voiceDisplayName(v)}</td>
                <td className="mono muted">{v.id}</td>
                <td>{v.gender === 'Female' ? '女' : v.gender === 'Male' ? '男' : v.gender || '—'}</td>
                <td>{v.locale || '—'}</td>
                <td className="muted">{v.styles?.length ? v.styles.join(' / ') : '—'}</td>
                <td>
                  <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                    <button className="btn" disabled={auditioning === v.id} onClick={() => void audition(v.id)}>
                      {auditioning === v.id ? '试听中…' : '试听'}
                    </button>
                    <button className="btn" onClick={() => void saveSynth({ ...synth, voice: v.id })}>
                      {synth.voice === v.id ? '当前默认' : '设为默认'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr><td colSpan={6} className="muted" style={{ textAlign: 'center', padding: 24 }}>
                {voices.length ? '没有匹配的音色' : '还没有音色，请先添加节点并探测'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **步骤 2：实现 `src/pages/LogsPage.tsx`**

```tsx
import { useEffect } from 'react';
import { useLogsStore } from '../store/logsStore';
import type { LogFilter } from '../types/models';

const FILTERS: [LogFilter, string][] = [
  ['ALL', '全部'], ['OK', '成功'], ['FAIL', '失败'], ['SWITCH', '切换'],
];

function fmtTime(t: number): string {
  return new Date(t).toLocaleTimeString('zh-CN', { hour12: false });
}

export function LogsPage() {
  const { logs, filter, loading, load, clear } = useLogsStore();

  useEffect(() => { void load(); }, []);

  return (
    <div>
      <div className="page-title">调用日志</div>
      <div className="card">
        <div className="row between">
          <div className="tabs" style={{ marginBottom: 0 }}>
            {FILTERS.map(([f, label]) => (
              <button key={f} className={filter === f ? 'active' : ''} onClick={() => void load(f)}>{label}</button>
            ))}
          </div>
          <div className="row">
            <button className="btn" onClick={() => void load()} disabled={loading}>{loading ? '刷新中…' : '刷新'}</button>
            <button className="btn danger" onClick={() => { if (confirm('清空全部日志？')) void clear(); }}>清空</button>
          </div>
        </div>
      </div>

      <div className="card">
        <table className="table">
          <thead>
            <tr><th>时间</th><th>结果</th><th>节点</th><th>模式</th><th>尝试</th><th>耗时</th><th>长度</th><th>内容预览</th></tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id}>
                <td className="muted">{fmtTime(l.time)}</td>
                <td>
                  {l.success
                    ? <span className="badge ok">成功</span>
                    : <span className="badge fail">失败</span>}
                  {l.triggeredCooldown && <> <span className="badge warn">触发冷却</span></>}
                </td>
                <td className="mono muted">{l.nodeUrl}</td>
                <td>{l.mode}</td>
                <td>{l.attempt}</td>
                <td>{l.latencyMs}ms</td>
                <td>{l.textLen}</td>
                <td title={l.error ?? undefined} className="muted">
                  {l.error ? `⚠ ${l.error} · ` : ''}{l.textPreview}{l.fromNode ? `（从 ${l.fromNode} 切换）` : ''}
                </td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr><td colSpan={8} className="muted" style={{ textAlign: 'center', padding: 24 }}>暂无日志</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **步骤 3：实现 `src/pages/SettingsPage.tsx`（分享区块在任务 13 扩充）**

```tsx
import { useState } from 'react';
import { voiceDisplayName } from '../lib/voices';
import { useSettingsStore } from '../store/settingsStore';
import { useVoicesStore } from '../store/voicesStore';

export function SettingsPage() {
  const { synth, saveSynth, appPrefs, saveAppPrefs } = useSettingsStore();
  const { voices } = useVoicesStore();
  const [copied, setCopied] = useState(false);
  void copied; void setCopied; // 任务 13 分享区使用

  const curVoice = voices.find((v) => v.id === synth.voice);

  return (
    <div>
      <div className="page-title">设置</div>

      <div className="card">
        <div className="row between" style={{ marginBottom: 10 }}>
          <strong>默认语音参数</strong>
          <span className="muted">作用于朗读与试听</span>
        </div>
        <div className="row">
          <div className="field grow" style={{ marginBottom: 0 }}>
            <label>默认音色</label>
            <input className="input mono" value={curVoice ? `${voiceDisplayName(curVoice)}（${synth.voice}）` : synth.voice || '节点默认'}
              onChange={(e) => {
                const raw = e.target.value;
                const m = raw.match(/（(.+)）$/);
                void saveSynth({ ...synth, voice: m ? m[1] : raw });
              }} />
          </div>
          <div className="field" style={{ marginBottom: 0, minWidth: 180 }}>
            <label>语速 {synth.rate}</label>
            <input type="range" min={-100} max={100} value={synth.rate}
              onChange={(e) => void saveSynth({ ...synth, rate: Number(e.target.value) })} />
          </div>
          <div className="field" style={{ marginBottom: 0, minWidth: 180 }}>
            <label>音调 {synth.pitch}</label>
            <input type="range" min={-100} max={100} value={synth.pitch}
              onChange={(e) => void saveSynth({ ...synth, pitch: Number(e.target.value) })} />
          </div>
        </div>
      </div>

      <div className="card">
        <strong>探测</strong>
        <div className="row" style={{ marginTop: 10 }}>
          <label className="muted">并发数</label>
          <input className="input" style={{ width: 70 }} type="number" min={1} max={8}
            value={appPrefs.probeConcurrency}
            onChange={(e) => void saveAppPrefs({ ...appPrefs, probeConcurrency: Math.max(1, Math.min(8, Number(e.target.value) || 1)) })} />
          <span className="muted">全部探测时同时发起的请求数（1-8）</span>
        </div>
      </div>

      {/* 任务 13：局域网分享卡片插入此处 */}
    </div>
  );
}
```

- [ ] **步骤 4：构建验证**

```powershell
npx tsc --noEmit; if ($?) { npm run build }
```

预期：无 error。

- [ ] **步骤 5：手动验证**

`npm run tauri dev` → 音色页拉取列表、试听有声、设默认生效；日志页在试听/朗读后出现记录且过滤正常；设置页改语速后朗读生效。

- [ ] **步骤 6：Commit**

```powershell
git add -A; if ($?) { git commit -m "feat: 音色/日志/设置三个页面" }
```

---

### 任务 11：导入器（HostRecord + FOFA/ZoomEye 文件解析，TDD）

**文件：**
- 创建：`src/lib/importers/hosts.ts`、`src/lib/importers/fofa-file.ts`、`src/lib/importers/zoomeye-file.ts` 及对应 `.test.ts`

- [ ] **步骤 1：编写失败的测试 `src/lib/importers/hosts.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { buildBaseUrl, dedupeByBaseUrl, rankRelevance, recordsToNodes } from './hosts';
import type { HostRecord } from './hosts';

const rec = (p: Partial<HostRecord>): HostRecord => ({
  ip: '1.2.3.4', port: 443, protocol: 'https', title: '', ...p,
});

describe('buildBaseUrl', () => {
  it('https 默认 443 不带端口', () => {
    expect(buildBaseUrl(rec({ port: 443, protocol: 'https' }))).toBe('https://1.2.3.4');
  });

  it('http 80 不带端口，其他端口保留', () => {
    expect(buildBaseUrl(rec({ protocol: 'http', port: 80 }))).toBe('http://1.2.3.4');
    expect(buildBaseUrl(rec({ protocol: 'http', port: 8080 }))).toBe('http://1.2.3.4:8080');
  });

  it('protocol 空按 https 启发式', () => {
    expect(buildBaseUrl(rec({ protocol: '', port: 443 }))).toBe('https://1.2.3.4');
    expect(buildBaseUrl(rec({ protocol: '', port: 9999 }))).toBe('https://1.2.3.4:9999');
  });
});

describe('dedupeByBaseUrl', () => {
  it('按 baseUrl 去重保序', () => {
    const out = dedupeByBaseUrl([rec({}), rec({}), rec({ ip: '5.6.7.8' })]);
    expect(out).toHaveLength(2);
  });
});

describe('rankRelevance', () => {
  it('title 含 tts/speech/voice 得分更高，排前', () => {
    const hot = rec({ ip: '9.9.9.9', title: 'My TTS Server' });
    const cold = rec({ ip: '8.8.8.8', title: 'Nginx' });
    expect(rankRelevance(hot)).toBeGreaterThan(rankRelevance(cold));
  });
});

describe('recordsToNodes', () => {
  it('产出带 source 的节点记录骨架', () => {
    const out = recordsToNodes([rec({ ip: '7.7.7.7', title: 'tts' })], 'fofa');
    expect(out).toHaveLength(1);
    expect(out[0].baseUrl).toBe('https://7.7.7.7');
    expect(out[0].source).toBe('fofa');
    expect(out[0].label).toContain('tts');
  });
});
```

- [ ] **步骤 2：编写失败的测试 `src/lib/importers/fofa-file.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { parseFofaCsv, parseFofaJson } from './fofa-file';

describe('parseFofaCsv', () => {
  it('解析 export=1 格式（表头 ip,port,protocol,title）', () => {
    const csv = 'ip,port,protocol,title\n1.1.1.1,443,https,TTS gateway\n2.2.2.2,80,http,nginx\n';
    const out = parseFofaCsv(csv);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ ip: '1.1.1.1', port: 443, protocol: 'https', title: 'TTS gateway' });
  });

  it('列顺序可变（按表头定位），跳过坏行不吞错误', () => {
    const csv = 'port,ip,protocol,title\n8080,3.3.3.3,http,x\nbad,row\n';
    const out = parseFofaCsv(csv);
    expect(out).toHaveLength(1);
    expect(out[0].ip).toBe('3.3.3.3');
    expect(out[0].port).toBe(8080);
  });

  it('空输入返回空数组', () => {
    expect(parseFofaCsv('')).toEqual([]);
  });
});

describe('parseFofaJson', () => {
  it('解析 results 数组（FOFA API / export JSON）', () => {
    const json = JSON.stringify({ results: [['1.1.1.1', 443, 'https', 'tts']] });
    const out = parseFofaJson(json);
    expect(out).toEqual([{ ip: '1.1.1.1', port: 443, protocol: 'https', title: 'tts' }]);
  });

  it('解析对象数组形态', () => {
    const json = JSON.stringify([{ ip: '4.4.4.4', port: 8443, protocol: 'https', title: 'voice' }]);
    const out = parseFofaJson(json);
    expect(out[0].port).toBe(8443);
  });

  it('非法 JSON 抛出明确错误', () => {
    expect(() => parseFofaJson('not json')).toThrow(/JSON/);
  });
});
```

- [ ] **步骤 3：编写失败的测试 `src/lib/importers/zoomeye-file.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { parseZoomeyeJson } from './zoomeye-file';

describe('parseZoomeyeJson', () => {
  it('解析 matches[].port 与 ip_str、title/site 线索', () => {
    const json = JSON.stringify({
      matches: [
        { ip_str: '5.5.5.5', port: 443, protocol: 'https', title: 'TTS' },
        { ip_str: '6.6.6.6', port: 80, site: 'http://x.com' },
      ],
    });
    const out = parseZoomeyeJson(json);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ ip: '5.5.5.5', port: 443, title: 'TTS' });
    expect(out[1].port).toBe(80);
  });

  it('port 字符串形式转数字，缺失跳过', () => {
    const json = JSON.stringify({
      matches: [
        { ip_str: '7.7.7.7', port: '8080' },
        { ip_str: '8.8.8.8' },
      ],
    });
    const out = parseZoomeyeJson(json);
    expect(out).toHaveLength(1);
    expect(out[0].port).toBe(8080);
  });

  it('非法 JSON 抛出明确错误', () => {
    expect(() => parseZoomeyeJson('{oops')).toThrow(/JSON/);
  });
});
```

- [ ] **步骤 4：运行验证失败**

```powershell
npx vitest run src/lib/importers
```

预期：FAIL（模块不存在）。

- [ ] **步骤 5：实现三个模块**

`src/lib/importers/hosts.ts`：

```ts
import type { NodeSource, TtsNode } from '../../types/models';
import { normalizeBaseUrl } from '../../types/models';

export interface HostRecord {
  ip: string;
  port: number;
  protocol: string;
  title: string;
}

export function buildBaseUrl(r: HostRecord): string {
  const proto = r.protocol === 'http' ? 'http' : 'https';
  const defaultPort = proto === 'https' ? 443 : 80;
  const host = r.ip.includes(':') ? `[${r.ip}]` : r.ip;
  return r.port === defaultPort ? `${proto}://${host}` : `${proto}://${host}:${r.port}`;
}

export function dedupeByBaseUrl(records: HostRecord[]): HostRecord[] {
  const seen = new Set<string>();
  const out: HostRecord[] = [];
  for (const r of records) {
    const url = buildBaseUrl(r);
    if (seen.has(url)) continue;
    seen.add(url);
    out.push(r);
  }
  return out;
}

const KEYWORDS = ['tts', 'speech', 'voice', 'azure', 'piper', 'coqui', 'edge'];

export function rankRelevance(r: HostRecord): number {
  const s = `${r.title} ${r.protocol}`.toLowerCase();
  return KEYWORDS.reduce((score, k) => (s.includes(k) ? score + 1 : score), 0);
}

export function recordsToNodes(records: HostRecord[], source: NodeSource): Omit<TtsNode, 'id'>[] {
  return [...records]
    .sort((a, b) => rankRelevance(b) - rankRelevance(a))
    .map((r) => ({
      baseUrl: normalizeBaseUrl(buildBaseUrl(r)),
      label: r.title || r.ip,
      keyless: false,
      apiKey: null,
      health: 'UNKNOWN' as const,
      lastChecked: 0,
      defaultVoice: '',
      voiceCount: 0,
      failCount: 0,
      cooldownUntil: 0,
      disabled: false,
      apiVersion: 'UNKNOWN' as const,
      source,
    }));
}
```

`src/lib/importers/fofa-file.ts`：

```ts
import type { HostRecord } from './hosts';

function safeParse(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch (e) {
    throw new Error(`FOFA 文件不是合法 JSON：${e instanceof Error ? e.message : String(e)}`);
  }
}

function toPort(v: string | number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function parseFofaCsv(csv: string): HostRecord[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const idx = (name: string): number => header.indexOf(name);
  const [iIp, iPort, iProto, iTitle] = [idx('ip'), idx('port'), idx('protocol'), idx('title')];
  if (iIp < 0 || iPort < 0) throw new Error('FOFA CSV 缺少 ip/port 列');
  const out: HostRecord[] = [];
  for (const line of lines.slice(1)) {
    try {
      const cells = line.split(',');
      const port = toPort((cells[iPort] ?? '').trim());
      const ip = (cells[iIp] ?? '').trim();
      if (!ip || !port) continue;
      out.push({
        ip,
        port,
        protocol: iProto >= 0 ? (cells[iProto] ?? '').trim() : '',
        title: iTitle >= 0 ? (cells[iTitle] ?? '').trim() : '',
      });
    } catch {
      // 单行损坏跳过，其余行继续
    }
  }
  return out;
}

export function parseFofaJson(text: string): HostRecord[] {
  const data = safeParse(text);
  if (Array.isArray(data)) return fromResults(data);
  if (data && typeof data === 'object') {
    const obj = data as { results?: unknown };
    if (Array.isArray(obj.results)) return fromResults(obj.results);
  }
  throw new Error('FOFA JSON 中未找到 results 数组');
}

function fromResults(rows: unknown[]): HostRecord[] {
  const out: HostRecord[] = [];
  for (const row of rows) {
    if (Array.isArray(row)) {
      const [ip, port, protocol, title] = row;
      if (typeof ip !== 'string') continue;
      const p = toPort(port as string | number);
      if (!p) continue;
      out.push({ ip, port: p, protocol: String(protocol ?? ''), title: String(title ?? '') });
    } else if (row && typeof row === 'object') {
      const o = row as Record<string, unknown>;
      const ip = typeof o.ip === 'string' ? o.ip : '';
      const p = toPort((o.port ?? 0) as string | number);
      if (!ip || !p) continue;
      out.push({
        ip,
        port: p,
        protocol: String(o.protocol ?? ''),
        title: String(o.title ?? ''),
      });
    }
  }
  return out;
}
```

`src/lib/importers/zoomeye-file.ts`：

```ts
import type { HostRecord } from './hosts';

interface ZoomEyeMatch {
  ip_str?: unknown;
  port?: unknown;
  protocol?: unknown;
  title?: unknown;
  site?: unknown;
}

function titleOf(m: ZoomEyeMatch): string {
  if (typeof m.title === 'string' && m.title) return m.title;
  if (typeof m.site === 'string') return m.site;
  return '';
}

export function parseZoomeyeJson(text: string): HostRecord[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error(`ZoomEye 文件不是合法 JSON：${e instanceof Error ? e.message : String(e)}`);
  }
  const matches = (data as { matches?: unknown }).matches;
  if (!Array.isArray(matches)) throw new Error('ZoomEye JSON 中未找到 matches 数组');
  const out: HostRecord[] = [];
  for (const raw of matches) {
    if (!raw || typeof raw !== 'object') continue;
    const m = raw as ZoomEyeMatch;
    const ip = typeof m.ip_str === 'string' ? m.ip_str : '';
    const port = Number(m.port);
    if (!ip || !Number.isFinite(port) || port <= 0) continue;
    out.push({
      ip,
      port,
      protocol: typeof m.protocol === 'string' ? m.protocol : '',
      title: titleOf(m),
    });
  }
  return out;
}
```

- [ ] **步骤 6：运行验证通过**

```powershell
npx vitest run src/lib/importers
```

预期：PASS（约 14 tests）。

- [ ] **步骤 7：Commit**

```powershell
git add -A; if ($?) { git commit -m "feat: FOFA/ZoomEye 文件导入解析器（TDD）" }
```

---

### 任务 12：导入面板 + 在线 API 搜索

**文件：**
- 创建：`src/lib/importers/search.ts`（含测试）
- 创建：`src/pages/ImportPanel.tsx`
- 修改：`src/pages/NodesPage.tsx`（挂载面板）

- [ ] **步骤 1：编写失败的测试 `src/lib/importers/search.test.ts`（注入 mock fetch）**

```ts
import { describe, expect, it } from 'vitest';
import { searchFofa, searchZoomeye, type FetchImpl } from './search';

describe('searchFofa', () => {
  it('GET /api/v1/search/all?email&key&q&size，解析 results', async () => {
    const calls: string[] = [];
    const fetchImpl: FetchImpl = async (url) => {
      calls.push(url);
      return new Response(JSON.stringify({ results: [['1.1.1.1', 443, 'https', 'tts']] }), { status: 200 });
    };
    const out = await searchFofa(fetchImpl, {
      email: 'a@b.c', key: 'KEY', query: 'title="tts"', size: 50,
    });
    expect(calls[0]).toContain('email=a%40b.c');
    expect(calls[0]).toContain('q=');
    expect(calls[0]).toContain('size=50');
    expect(out).toHaveLength(1);
    expect(out[0].ip).toBe('1.1.1.1');
  });

  it('非 2xx 抛出明确错误（不吞异常）', async () => {
    const fetchImpl: FetchImpl = async () => new Response('{"errmsg":"x"}', { status: 401 });
    await expect(searchFofa(fetchImpl, { email: 'e', key: 'k', query: 'q', size: 10 }))
      .rejects.toThrow(/401/);
  });
});

describe('searchZoomeye', () => {
  it('GET /host/search/query?q&page，带 API-KEY 头，解析 matches', async () => {
    let sawHeader = '';
    const fetchImpl: FetchImpl = async (_url, init) => {
      const h = new Headers(init?.headers);
      sawHeader = h.get('API-KEY') ?? '';
      return new Response(JSON.stringify({
        matches: [{ ip_str: '5.5.5.5', port: 443, title: 'tts' }],
      }), { status: 200 });
    };
    const out = await searchZoomeye(fetchImpl, { apiKey: 'ZZ', query: 'tts', page: 1 });
    expect(sawHeader).toBe('ZZ');
    expect(out).toHaveLength(1);
    expect(out[0].port).toBe(443);
  });

  it('非 2xx 抛出明确错误', async () => {
    const fetchImpl: FetchImpl = async () => new Response('', { status: 429 });
    await expect(searchZoomeye(fetchImpl, { apiKey: 'k', query: 'q', page: 1 }))
      .rejects.toThrow(/429/);
  });
});
```

- [ ] **步骤 2：运行验证失败**

```powershell
npx vitest run src/lib/importers/search.test.ts
```

预期：FAIL。

- [ ] **步骤 3：实现 `src/lib/importers/search.ts`**

```ts
import type { FetchImpl } from '../api';
import { parseFofaJson } from './fofa-file';
import type { HostRecord } from './hosts';
import { parseZoomeyeJson } from './zoomeye-file';

export type { FetchImpl };

export interface FofaCreds { email: string; key: string; query: string; size: number }
export interface ZoomeyeCreds { apiKey: string; query: string; page: number }

async function expectOk(res: Response, what: string): Promise<void> {
  if (!res.ok) throw new Error(`${what} 请求失败：HTTP ${res.status}`);
}

export async function searchFofa(fetchImpl: FetchImpl, c: FofaCreds): Promise<HostRecord[]> {
  const url = 'https://fofa.info/api/v1/search/all'
    + `?email=${encodeURIComponent(c.email)}&key=${encodeURIComponent(c.key)}`
    + `&q=${encodeURIComponent(c.query)}&size=${c.size}&fields=ip,port,protocol,title`;
  const res = await fetchImpl(url);
  await expectOk(res, 'FOFA');
  return parseFofaJson(await res.text());
}

export async function searchZoomeye(fetchImpl: FetchImpl, c: ZoomeyeCreds): Promise<HostRecord[]> {
  const url = `https://api.zoomeye.org/host/search/query?q=${encodeURIComponent(c.query)}&page=${c.page}`;
  const res = await fetchImpl(url, { headers: { 'API-KEY': c.apiKey } });
  await expectOk(res, 'ZoomEye');
  return parseZoomeyeJson(await res.text());
}
```

注意：`FetchImpl` 在任务 4 的 `src/lib/api.ts` 已定义并导出；此处直接复用，不重复定义。

- [ ] **步骤 4：运行验证通过**

```powershell
npx vitest run src/lib/importers
```

预期：PASS。

- [ ] **步骤 5：实现 `src/pages/ImportPanel.tsx`**

```tsx
import { useRef, useState } from 'react';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { decodeTextBuffer } from '../lib/encoding';
import { buildBaseUrl, dedupeByBaseUrl, rankRelevance, type HostRecord } from '../lib/importers/hosts';
import { parseFofaCsv, parseFofaJson } from '../lib/importers/fofa-file';
import { searchFofa, searchZoomeye } from '../lib/importers/search';
import { parseZoomeyeJson } from '../lib/importers/zoomeye-file';
import { deps } from '../store/deps';
import { useNodesStore } from '../store/nodesStore';

type Tab = 'fofa-file' | 'zoomeye-file' | 'fofa-api' | 'zoomeye-api';
const TABS: [Tab, string][] = [
  ['fofa-file', 'FOFA 文件'], ['zoomeye-file', 'ZoomEye 文件'],
  ['fofa-api', 'FOFA 搜索'], ['zoomeye-api', 'ZoomEye 搜索'],
];

export function ImportPanel() {
  const [tab, setTab] = useState<Tab>('fofa-file');
  const [records, setRecords] = useState<HostRecord[] | null>(null);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fofa, setFofa] = useState({ email: '', key: '', query: 'title="tts" || title="speech"', size: 100 });
  const [ze, setZe] = useState({ apiKey: '', query: 'tts', page: 1 });
  const fileRef = useRef<HTMLInputElement>(null);

  function accept(list: HostRecord[]): void {
    const deduped = dedupeByBaseUrl(list);
    setRecords(deduped);
    setErr(null);
    // 关键词命中默认勾选
    const on = new Set<number>();
    deduped.forEach((r, i) => { if (rankRelevance(r) > 0) on.add(i); });
    setChecked(on);
  }

  async function onFilePicked(file: File): Promise<void> {
    try {
      const text = await decodeTextBuffer(await file.arrayBuffer());
      const list = tab === 'zoomeye-file' ? parseZoomeyeJson(text)
        : file.name.toLowerCase().endsWith('.json') ? parseFofaJson(text)
          : parseFofaCsv(text);
      accept(list);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setRecords(null);
    }
  }

  async function runApiSearch(): Promise<void> {
    setBusy(true);
    try {
      const list = tab === 'fofa-api'
        ? await searchFofa((u, i) => tauriFetch(u, i), { ...fofa, size: Math.min(500, fofa.size) })
        : await searchZoomeye((u, i) => tauriFetch(u, i), ze);
      accept(list);
      await deps().settings.setJson(
        tab === 'fofa-api' ? 'fofa_credentials' : 'zoomeye_credentials',
        tab === 'fofa-api' ? { ...fofa } : { ...ze },
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setRecords(null);
    } finally {
      setBusy(false);
    }
  }

  async function doImport(): Promise<void> {
    if (!records) return;
    const chosen = records.filter((_, i) => checked.has(i));
    if (chosen.length === 0) { setErr('未勾选任何记录'); return; }
    setBusy(true);
    try {
      await useNodesStore.getState().importRecords(
        chosen.map((r) => ({ baseUrl: buildBaseUrl(r), label: r.title || r.ip })),
        tab.startsWith('fofa') ? 'fofa' : 'zoomeye',
      );
      setRecords(null);
      setChecked(new Set());
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div className="tabs">
        {TABS.map(([t, label]) => (
          <button key={t} className={tab === t ? 'active' : ''} onClick={() => { setTab(t); setRecords(null); setErr(null); }}>
            {label}
          </button>
        ))}
      </div>

      {tab.endsWith('-file') && (
        <div className="row">
          <button className="btn" onClick={() => fileRef.current?.click()}>选择文件</button>
          <span className="muted">支持 FOFA 导出的 CSV/JSON、ZoomEye 导出的 JSON</span>
          <input ref={fileRef} type="file" accept=".csv,.json" style={{ display: 'none' }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFilePicked(f); e.target.value = ''; }} />
        </div>
      )}

      {tab === 'fofa-api' && (
        <div className="row">
          <input className="input" placeholder="email" value={fofa.email} onChange={(e) => setFofa({ ...fofa, email: e.target.value })} />
          <input className="input" placeholder="api key" value={fofa.key} onChange={(e) => setFofa({ ...fofa, key: e.target.value })} />
          <input className="input grow" placeholder="查询语法" value={fofa.query} onChange={(e) => setFofa({ ...fofa, query: e.target.value })} />
          <button className="btn primary" disabled={busy} onClick={() => void runApiSearch()}>{busy ? '搜索中…' : '搜索'}</button>
        </div>
      )}

      {tab === 'zoomeye-api' && (
        <div className="row">
          <input className="input" placeholder="API-KEY" value={ze.apiKey} onChange={(e) => setZe({ ...ze, apiKey: e.target.value })} />
          <input className="input grow" placeholder="关键词" value={ze.query} onChange={(e) => setZe({ ...ze, query: e.target.value })} />
          <button className="btn primary" disabled={busy} onClick={() => void runApiSearch()}>{busy ? '搜索中…' : '搜索'}</button>
        </div>
      )}

      {err && <div className="muted" style={{ color: 'var(--danger)', marginTop: 8 }}>{err}</div>}

      {records && records.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div className="row between" style={{ marginBottom: 6 }}>
            <span className="muted">命中 {records.length} 条，已勾选 {checked.size} 条（含 tts/speech/voice 关键词的默认勾选）</span>
            <div className="row">
              <button className="btn" onClick={() => setChecked(new Set(records.map((_, i) => i)))}>全选</button>
              <button className="btn" onClick={() => setChecked(new Set())}>全不选</button>
              <button className="btn primary" disabled={busy || checked.size === 0} onClick={() => void doImport()}>
                {busy ? '导入中…' : `导入 ${checked.size} 条并探测`}
              </button>
            </div>
          </div>
          <div className="seg-list">
            {records.map((r, i) => (
              <label key={i} className="seg row" style={{ gap: 8 }}>
                <input type="checkbox" checked={checked.has(i)}
                  onChange={() => {
                    const next = new Set(checked);
                    if (next.has(i)) next.delete(i); else next.add(i);
                    setChecked(next);
                  }} />
                <span className="mono">{r.ip}:{r.port}</span>
                <span className="grow">{r.title || '—'}</span>
                {rankRelevance(r) > 0 && <span className="badge ok">TTS 相关</span>}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

实现要点：
- 凭证直接写 settings 表 JSON 键 `fofa_credentials` / `zoomeye_credentials`（走任务 6 的 `deps().settings.setJson`，不建表、不加 Rust 命令，对齐修订后规格）。ImportPanel 需补充 `import { deps } from '../store/deps';`。
- 导入时用 `buildBaseUrl(r)` 产出完整 baseUrl 传给 `importRecords`。

- [ ] **步骤 6：在 `NodesPage.tsx` 挂载**

在 `NodesPage` 返回结构中，“添加节点”卡片之后插入：

```tsx
import { ImportPanel } from './ImportPanel';
// ...
<ImportPanel />
```

- [ ] **步骤 7：构建验证**

```powershell
npx tsc --noEmit; if ($?) { npx vitest run }
```

预期：tsc 无 error，全部 PASS。

- [ ] **步骤 8：手动验证**

`npm run tauri dev` → 节点页 → FOFA 文件 tab 选一个样例 CSV → 列表出现且关键词行默认勾选 → 导入后自动探测并入库（source 显示 fofa）。API 搜索填假凭证 → 显示明确 HTTP 错误而非静默。

- [ ] **步骤 9：Commit**

```powershell
git add -A; if ($?) { git commit -m "feat: FOFA/ZoomEye 导入面板与 API 在线搜索（TDD）" }
```

---

### 任务 13：Rust 局域网分享服务 + 设置页分享区

**文件：**
- 修改：`src-tauri/src/lib.rs`（share_* 命令 + 内嵌 HTTP 服务）
- 创建：`src/lib/share.test.ts`（payload 已在任务 6 有实现，本任务补测）
- 修改：`src/pages/SettingsPage.tsx`（分享卡片）

- [ ] **步骤 1：编写失败的测试 `src/lib/share.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { buildExportPayload } from './share';
import { DEFAULT_POOL, type TtsNode } from '../types/models';

const node = (id: string, url: string): TtsNode => ({
  id, baseUrl: url, label: '', keyless: false, apiKey: 'SECRET',
  health: 'OK', lastChecked: 1, defaultVoice: '', voiceCount: 3,
  failCount: 0, cooldownUntil: 0, disabled: false, apiVersion: 'V1', source: 'manual',
});

describe('buildExportPayload', () => {
  it('含节点与调度配置', () => {
    const p = buildExportPayload([node('a', 'https://x')], DEFAULT_POOL, 1000);
    expect(p.nodes).toHaveLength(1);
    expect(p.pool.mode).toBe('AUTO');
    expect(p.exportedAt).toBe(1000);
  });

  it('剔除 apiKey 等敏感字段', () => {
    const p = buildExportPayload([node('a', 'https://x')], DEFAULT_POOL, 0);
    expect(JSON.stringify(p)).not.toContain('SECRET');
    expect(JSON.stringify(p)).not.toContain('apiKey');
  });
});
```

- [ ] **步骤 2：运行验证失败（若任务 6 的实现已剔除 apiKey 则为通过，这是期望）**

```powershell
npx vitest run src/lib/share.test.ts
```

预期：PASS（任务 6 已实现剔除敏感字段）；若 FAIL，修正 `buildExportPayload` 确保导出剔除 `apiKey`。

- [ ] **步骤 3：`src-tauri/src/lib.rs` 追加 share 命令与内嵌服务**

```rust
use std::net::{Ipv4Addr, TcpListener, UdpSocket};
use std::sync::{Arc, Mutex};
use std::time::Duration;

#[derive(Default)]
pub struct ShareState {
    pub running: Arc<Mutex<bool>>,
    pub payload: Arc<Mutex<String>>,
    pub token: Arc<Mutex<String>>,
}

fn local_ipv4() -> String {
    // 通过 UDP 连接外网地址触发路由表查询（不真正发包）
    UdpSocket::bind((Ipv4Addr::UNSPECIFIED, 0))
        .and_then(|s| s.connect(("223.5.5.5", 80)).and_then(|_| s.local_addr()))
        .map(|a| a.ip().to_string())
        .unwrap_or_else(|_| "127.0.0.1".to_string())
}

fn serve(listener: TcpListener, state: Arc<ShareState>) {
    for stream in listener.incoming() {
        let Ok(mut stream) = stream else { continue };
        let state = Arc::clone(&state);
        std::thread::spawn(move || {
            use std::io::{Read, Write};
            let mut buf = [0u8; 4096];
            let Ok(n) = stream.read(&mut buf) else { return };
            let req = String::from_utf8_lossy(&buf[..n]);
            let first = req.lines().next().unwrap_or("").to_string();

            let unauthorized = {
                let token = state.token.lock().unwrap().clone();
                if token.is_empty() { false } else {
                    let q_ok = req.lines().next().map(|l| l.contains(&format!("token={token}"))).unwrap_or(false);
                    let h_ok = req.to_lowercase().contains(&format!("x-token: {token}"));
                    !(q_ok || h_ok)
                }
            };

            let body = if !first.starts_with("GET /nodes.json") {
                ("HTTP/1.1 404 Not Found", "text/plain", "not found".to_string())
            } else if unauthorized {
                ("HTTP/1.1 401 Unauthorized", "text/plain", "invalid token".to_string())
            } else {
                let payload = state.payload.lock().unwrap().clone();
                ("HTTP/1.1 200 OK", "application/json", payload)
            };
            let resp = format!(
                "{}\r\nContent-Type: {}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                body.0, body.1, body.2.len(), body.2
            );
            let _ = stream.write_all(resp.as_bytes());
            let _ = stream.flush();
        });
    }
}

#[tauri::command]
pub fn share_local_ip() -> String { local_ipv4() }

#[tauri::command]
pub fn share_start(port: u16, token: String, state: tauri::State<'_, ShareState>) -> Result<(), String> {
    let running = state.running.lock().unwrap();
    if *running { return Ok(()); }
    *state.token.lock().unwrap() = token;
    let listener = TcpListener::bind(("0.0.0.0", port)).map_err(|e| format!("监听 {port} 失败：{e}"))?;
    let st = state.inner().clone();
    std::thread::spawn(move || serve(listener, st));
    *state.running.lock().unwrap() = true;
    Ok(())
}

#[tauri::command]
pub fn share_stop(state: tauri::State<'_, ShareState>) {
    // 简化处理：标记停止，服务线程在下一次 accept 前不可中断；
    // 采用置空 payload + running=false，界面据此显示已停止。
    *state.running.lock().unwrap() = false;
}

#[tauri::command]
pub fn share_set_token(token: String, state: tauri::State<'_, ShareState>) {
    *state.token.lock().unwrap() = token;
}

#[tauri::command]
pub fn share_set_payload(payload: String, state: tauri::State<'_, ShareState>) {
    *state.payload.lock().unwrap() = payload;
}

#[tauri::command]
pub fn share_status(state: tauri::State<'_, ShareState>) -> bool {
    *state.running.lock().unwrap()
}
```

实现者注意（执行时按实际项目结构落地）：
1. `ShareState` 在 builder 中 `.manage(ShareState::default())` 注册。
2. `share_start` 只在 `share_status` 为 false 时启动监听线程；端口被占用返回中文明确错误。
3. `share_stop` 无法真正回收线程（TcpListener 无跨线程中断原语），实现方案：改用“绑定即活、运行状态由 `running` 布尔控制”——`serve` 循环内检查 `running`，为 false 时对新连接直接回 503 并 `break` 退出循环（监听 socket 在线程结束时 drop）。这是本任务的实现要求，上面的示意代码需按此修正。
4. **不新增** `settings_set_json` Rust 命令：settings 键值写入统一走前端 `deps().settings.setJson`（任务 12 已如此接线），保持 Rust 面最小。

- [ ] **步骤 4：设置页分享卡片（替换 SettingsPage 中的占位注释）**

```tsx
import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useSettingsStore } from '../store/settingsStore';
import { notifyShare } from '../store/shareSync';

// 组件内新增：
const [ip, setIp] = useState('');
const [running, setRunning] = useState(false);
const [copied, setCopied] = useState(false);

useEffect(() => {
  void invoke<string>('share_local_ip').then(setIp);
  void invoke<boolean>('share_status').then(setRunning);
}, []);

async function toggleShare(): Promise<void> {
  try {
    if (running) {
      await invoke('share_stop');
      setRunning(false);
    } else {
      await invoke('share_start', { port: share.port, token: share.token });
      await notifyShare();
      setRunning(true);
    }
  } catch (e) {
    alert(e instanceof Error ? e.message : String(e));
  }
}

function shareUrl(): string {
  const host = share.localhostOnly ? '127.0.0.1' : ip || '127.0.0.1';
  return `http://${host}:${share.port}/nodes.json?token=${share.token}`;
}
```

`SettingsPage` 返回结构末尾（“探测”卡片之后）插入分享卡片：

```tsx
<div className="card">
  <div className="row between" style={{ marginBottom: 10 }}>
    <strong>局域网分享</strong>
    <button className={`btn ${share.enabled ? 'primary' : ''}`} onClick={() => void toggleShare()}>
      {running ? '停止分享' : '开启分享'}
    </button>
  </div>
  <div className="row" style={{ marginBottom: 8 }}>
    <label className="muted">端口</label>
    <input className="input" style={{ width: 80 }} type="number" min={1} max={65535}
      value={share.port}
      onChange={(e) => void saveShare({ ...share, port: Number(e.target.value) || 8787 })} />
    <label className="muted">
      <input type="checkbox" checked={share.localhostOnly}
        onChange={(e) => void saveShare({ ...share, localhostOnly: e.target.checked })} /> 仅本机 (127.0.0.1)
    </label>
    <button className="btn" onClick={() => void saveShare({ ...share, token: crypto.randomUUID() })}>重置 Token</button>
  </div>
  <div className="row">
    <input className="input mono grow" readOnly value={shareUrl()} onFocus={(e) => e.target.select()} />
    <button className="btn" onClick={() => { void navigator.clipboard.writeText(shareUrl()); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
      {copied ? '已复制' : '复制'}
    </button>
  </div>
  <div className="muted" style={{ marginTop: 6 }}>
    同一局域网的设备访问该地址即可拉取节点列表（只读，需 token）。{running ? `当前监听 0.0.0.0:${share.port}` : '未开启'}
  </div>
</div>
```

并把任务 10 遗留的 `void copied; void setCopied;` 占位删除，`useSettingsStore` 解构补充 `share, saveShare`。

- [ ] **步骤 5：shareSync 接线验证**

任务 6 的 `notifyShare` 已在 add/update/remove/probe 后调用。补一处：`settingsStore.saveShare` 末尾追加 `await notifyShare();`（token/端口变更后同步 payload + `share_set_token` 调用，若 token 变更需 `invoke('share_set_token', { token: share.token })`）。

- [ ] **步骤 6：构建验证**

```powershell
npx tsc --noEmit; if ($?) { cargo check --manifest-path src-tauri\Cargo.toml }
```

预期：tsc 无 error；cargo 无 error/warning（warning 逐个清理）。

- [ ] **步骤 7：手动验证**

`npm run tauri dev` → 设置页 → 开启分享 → 复制 URL → 浏览器访问 → 带 token 得到 200 JSON，改 token 得 401；手机（或本机另一端口模拟）访问同网段 IP 成功；关闭分享后停止响应新请求。

- [ ] **步骤 8：Commit**

```powershell
git add -A; if ($?) { git commit -m "feat: Rust 局域网只读分享服务（/nodes.json + token 校验）" }
```

---

### 任务 14：README、全量验证与规格核对

**文件：**
- 创建：`README.md`
- 修改：`docs/superpowers/specs/2026-10-13-tauri-desktop-design.md`（勾选完成项）

- [ ] **步骤 1：编写 `README.md`**

内容（中文）：项目简介（安卓版桌面配套）、环境要求（Node 18+、Rust、pnpm/npm）、`npm install`、`npm run tauri dev`、`npm run tauri build`、功能列表、与安卓版差异（本机仅支持 TXT 导入；扫码改为局域网 URL）、测试命令 `npx vitest run`、目录结构摘要。

- [ ] **步骤 2：全量验证（三条全过才算完成）**

```powershell
npx vitest run
```
预期：全部 PASS，0 fail。

```powershell
npx tsc --noEmit; if ($?) { npm run build }
```
预期：无 error。

```powershell
cargo check --manifest-path src-tauri\Cargo.toml
```
预期：无 error。

- [ ] **步骤 3：端到端手动验收（对照规格 4.4）**

按顺序并在每项后记录结果：
1. 真实节点探测 → 显示健康度/延迟/音色数
2. 单段试听（音色页）→ 有声
3. TXT 长文导入 → 朗读、暂停、继续、下一段、停止
4. FOFA CSV 导入 → 逐条勾选 → 入库探测
5. 手机浏览器拉取 `/nodes.json?token=` → 200；无 token → 401

- [ ] **步骤 4：规格勾选**

打开规格文档，将已实现条目以 `- [x]` 标记（或在文末追加“实现状态”表），未完成项如实标注并说明。

- [ ] **步骤 5：Commit（最终）**

```powershell
git add -A; if ($?) { git commit -m "docs: README 与规格实现状态核对" }
```

---

## 完成定义

- 任务 1–14 全部勾选，三个验证命令（vitest / tsc+build / cargo check）全绿。
- 规格 4.4 五项手动验收通过并记录。
- 两个仓库各有最终 commit，无未提交文件（`git status` 干净）。
- 下一步（另行计划，不在本文档范围）：子项目 #2 安卓本机 HTTP 服务、子项目 #3 阅读 App 生成接入配置。


