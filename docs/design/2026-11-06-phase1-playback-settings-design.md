# 阶段一：朗读播放体验与设置补齐 · 设计规格

- 状态：已批准
- 日期：2026-11-06
- 范围：朗读播放体验、设置项、配置导入导出、相关基础设施修正
- 上游参考：`tts-aggregator-android`（Pulse 聚合朗读）

## 1. 背景与目标

桌面端已具备文本朗读、书架、节点池、音色、日志与局域网分享，但相比 Android 版仍缺少一批直接影响使用体验的能力。阶段一目标：

1. 朗读时可看到当前句级进度，而不仅是段落进度。
2. 支持睡眠定时、±10 秒跳转、字数与预计时长。
3. 调度参数（失败阈值、冷却时长）可在界面配置，不再写死。
4. 启动时可选自动探测节点。
5. 配置可导出/导入（不含密钥），便于备份与设备间迁移。
6. 退出后可续听上次的文本或书籍位置。
7. 同时修正影响以上功能的渲染与安全配置问题。

后续阶段（本次不做）：节点管理增强（分组、批量、搜索筛选、统计）、音色选择器增强（内置离线音色、快捷筛选、风格）。

## 2. 非目标

- 不修改节点/日志/书籍的数据库表结构。
- 不实现音频文件的持久化缓存，不追求启动后秒续。
- 不改写 Rust 局域网分享服务，不引入 axum/tokio。
- 不迁移数据库到 tauri-plugin-sql 的 migration API。
- 不修改 Tauri `identifier`，不引入 ESLint/Prettier。
- 不做豆包/OpenAI 等新协议适配。

## 3. 现状与差距

| 能力 | Android | 桌面现状 |
|---|---|---|
| 句级高亮 | 有，按字符比例估算 | 只有段落级高亮 |
| 睡眠定时 | 0/15/30/60 分钟 | 无 |
| 快进快退 | ±10 秒 | ±15 秒 |
| 字数/时长 | 有，4.2 字/秒 | 无 |
| 失败阈值/冷却 | 可配置 | `pool.ts` 写死 3 次 / 10 分钟 |
| 启动自动测试 | 有 | 无 |
| 配置导入导出 | 有，不含密钥 | 无 |
| 自动续听 | 有快照 | 纯文本仅存内存；书籍靠书架进度 |

## 4. 设计

### 4.1 配置模型（`src/types/models.ts`）

`AppPrefs` 新增字段：

| 字段 | 默认值 | 可选值 | 说明 |
|---|---|---|---|
| `failThreshold` | 3 | 2 / 3 / 5 / 10 | 连续失败多少次触发冷却 |
| `cooldownMinutes` | 10 | 1 / 5 / 10 / 30 / 60 | 冷却时长（分钟） |
| `autoTestOnLaunch` | false | boolean | 启动后自动探测全部节点 |
| `sleepMinutes` | 0 | 0 / 15 / 30 / 60 | 默认睡眠定时，0 为关闭 |
| `resumeLast` | true | boolean | 是否保存并展示续听快照 |

新增导出常量：`FAIL_THRESHOLD_OPTIONS`、`COOLDOWN_MINUTES_OPTIONS`、`SLEEP_MINUTES_OPTIONS`。

`normalizeAppPrefs` 对每个字段做白名单校验；旧版本 JSON 缺少字段时自动补默认值，非法值回退默认值。

### 4.2 播放快照（`src/lib/snapshot.ts`、`src/store/resumeStore.ts`）

```ts
interface PlaybackSnapshot {
  version: 1;
  source:
    | { kind: 'text' }
    | { kind: 'book'; bookId: string; chapterIdx: number };
  segIndex: number;
  text: string;              // 仅 text 来源
  bookTitle?: string;
  chapterTitle?: string;
  chapterCount?: number;
  updatedAt: number;
}
```

- 存储：现有 `settings` 表的 `playback_snapshot` 键。
- 写入时机：每段播放完成、暂停、停止。写入前读取 `resumeLast`；关闭时不写并清除旧快照。
- 读取时机：`main.tsx` 引导阶段读入 `resumeStore`，只展示入口，不自动播放。
- 书籍快照的 `bookTitle` / `chapterTitle` / `chapterCount` 写入时取自 `nowPlayingStore`；缺失时启动后按 `bookId` 查询 `books` / `chapters` 补齐。
- 清除时机：纯文本整篇播完；用户开始新的朗读时覆盖；对应书籍被删除时清理。
- 快照校验：`parseSnapshot(raw)` 校验版本、来源、段索引与文本，非法返回 `null`。

`playerStore` 新增 `setSnapshotSink(fn)`，由 `main.tsx` 注入持久化实现，避免 store 直接依赖数据库。

### 4.3 句级高亮（`src/lib/sentences.ts`、`SentenceText.tsx`）

- `splitSentences(text)` 按 `。！？!?；;\n` 切分，返回 `{ text, start, end }[]`，保留空行与标点。
- `sentenceIndexAt(ratio, sentences)`：
  - `ratio <= 0` 返回 0；`ratio >= 1` 返回最后一句。
  - 以累计字符数 * `ratio` 定位目标字符偏移，落在哪句区间就返回哪句。
- 播放比例 = `currentTime / duration`；`duration <= 0` 时固定第一句。
- 展开播放条中的当前段逐句渲染：已读句 `text-muted-foreground`，当前句 `bg-primary text-primary-foreground`，未读句正常；当前句自动 `scrollIntoView({ block: 'nearest' })`。
- 朗读页段落列表中的当前段同步高亮当前句。
- 这是估算方案：语速、标点停顿、数字读法都会带来偏差；与 Android 行为一致，可接受。

### 4.4 睡眠定时

- `playerStore` 新增：
  - `sleepEndsAt: number | null`
  - `defaultSleepMinutes: number`
  - `setDefaultSleepMinutes(n)`
  - `setSleepTimer(minutes)`：`minutes > 0` 时写入 `Date.now() + minutes * 60_000`，否则清空
  - `clearSleepTimer()`
- 到期行为：`pause()`、清空 `sleepEndsAt`、`toast('睡眠定时已结束')`。
- 定时器为会话级，不持久化；应用退出即失效。
- 开始新的朗读（`start` / `startSegs`）时，若 `defaultSleepMinutes > 0` 自动启动。
- UI：展开播放条提供 关闭/15/30/60 分钟选择器；设置页「外观与播放」设置默认值。
- 倒计时显示由 `useSleepCountdown` 本地每秒计算，不把每秒 tick 写入全局 store。

### 4.5 前进/后退 10 秒

- `PlayerDock` 的 ±15 秒改为 ±10 秒，标题同步。
- 越界由现有 `seek()` 钳制到 `[0, duration]`。

### 4.6 字数与预计时长（`src/lib/estimate.ts`）

- `estimateReadingSeconds(chars)`：`chars / 4.2`。
- 朗读页显示 `N 字 · 约 X 分 Y 秒`。
- 超过 8000 字显示提示「文本较长，将分 N 段合成」，不截断、不阻止朗读。

### 4.7 自动续听入口

- 朗读页（`ReadPage`）：当快照为 `text` 且 `resumeLast` 为真，显示「继续上次：第 X/Y 段 · 相对时间」卡片，提供「继续」与「忽略」。
  - 「继续」调用 `player.start(snapshot.text, snapshot.segIndex)`；`start` 增加可选 `fromSeg` 参数，跳过已读段。
  - 「忽略」清空快照。
- 书架页（`BooksPage`）：快照为 `book` 时显示「继续上次：《书名》第 N 章」卡片，点击调用 `playChapter(bookId, chapterIdx, segIndex)`。
  - 书籍或章节不存在时隐藏入口并清空快照。
- 设置页提供「自动续听」开关；关闭后不写快照、隐藏入口。

### 4.8 调度参数接入（`src/lib/pool.ts`）

- `PoolDeps` 新增 `getPolicy(): { failThreshold: number; cooldownMinutes: number }`。
- 冷却判断使用策略值，删除写死的 `COOLDOWN_AFTER` / `COOLDOWN_MS`。
- 手选模式连续失败上限保持 3 次（与 Android 一致），不随 `failThreshold` 变化。
- `makePoolDeps` 从 `settingsStore.appPrefs` 读取策略。

### 4.9 设置页（`SettingsPage.tsx`）

小节：语音参数 / 外观与播放 / 调度与探测 / 数据 / 局域网分享。

- 外观与播放：主题、默认倍速、默认睡眠定时、自动续听。
- 调度与探测：失败阈值、冷却时长、启动自动测试、探测并发 1–8。
- 数据：导出配置、导入配置，文案说明「不含 API Key 与分享 Token」。
- 改动统一走 `saveAppPrefs`；睡眠默认值同步到 `playerStore`。

### 4.10 启动自动测试（`main.tsx`）

- 节点加载完成后，若 `autoTestOnLaunch` 为真，`void useNodesStore.getState().probeAll()`，不阻塞首屏渲染。

### 4.11 配置导入导出（`src/lib/configTransfer.ts`）

导出格式：

```json
{
  "version": 1,
  "exportedAt": "2026-11-06T00:00:00.000Z",
  "count": 3,
  "settings": { "synth": { "...": "" }, "appPrefs": { "...": "" } },
  "nodes": [
    {
      "name": "主节点",
      "url": "https://example.com",
      "source": "manual",
      "health": "OK",
      "keyless": true,
      "apiVersion": "V1",
      "defaultVoice": "",
      "voiceCount": 0
    }
  ]
}
```

- 不导出 `apiKey`、分享 token、`pool`（节点 ID 与环境绑定）。
- 导出前完整构建对象，再一次性写入文件。
- 导入先整体解析校验，通过后才写库；版本不匹配或结构非法直接报错，不产生半成品。
- 合并策略：
  - 按 `normalizeBaseUrl` 去重。
  - 已存在节点保留原 `apiKey` 与 `disabled`，更新名称、健康度、API 版本、音色数、默认音色，清零 `failCount` 与 `cooldownUntil`。
  - 新节点以 `health='UNKNOWN'` 入库，`apiKey=null`，`source` 取合法值否则 `manual`。
  - 导入后恢复 `synth` 与 `appPrefs`（经 `normalizeAppPrefs`），刷新节点、同步分享 payload，并后台执行一次 `probeAll()`。
- 文件对话框：
  - 导出：`save()` 默认名 `tts-aggregator-config-YYYYMMDD.json`，`writeTextFile()`。
  - 导入：`open()` 限定 `.json`，`readTextFile()`。
  - 对话框选中的路径自动进入 fs scope，不配置静态目录。

### 4.12 渲染与基础设施修正

**Zustand 订阅**
- `PlayerDock`、`ReadPage`、`BookDetailPage` 改为精确选择器；多字段用 `useShallow`。
- 避免 `timeupdate`（约 4Hz）导致整页重渲染。

**mediaSession**
- 仅在 `status`、`index`、`segs.length` 变化时更新 `playbackState` 与 `MediaMetadata`。

**主题防闪烁**
- `saveAppPrefs` 同时写入 `localStorage` 主题镜像；`load` 后回写。
- 修复 `index.html` 启动脚本读取不到 SQLite 配置的问题。

**cn 统一**
- 14 个 shadcn 组件从 `cn` 包改为 `@/lib/utils`，移除 `cn` 依赖，与 `components.json` 的 alias 一致。

**Tauri 配置**
- `productName` 与窗口标题：`TTS Aggregator`。
- 窗口 1200×800，最小 960×640。
- 保留 identifier。
- CSP：

```json
{
  "default-src": "'self'",
  "script-src": "'self'",
  "connect-src": "ipc: http://ipc.localhost ws://localhost:1420",
  "img-src": "'self' data: blob:",
  "media-src": "'self' blob:",
  "style-src": "'self' 'unsafe-inline'"
}
```

**依赖新增**
- npm：`@tauri-apps/plugin-dialog@^2`、`@tauri-apps/plugin-fs@^2`
- Cargo：`tauri-plugin-dialog = "2"`、`tauri-plugin-fs = "2"`
- 许可证：MIT / Apache-2.0；由 Tauri 团队维护，与现有插件同代。

**权限**
- `dialog:allow-open`、`dialog:allow-save`
- `fs:allow-read-text-file`、`fs:allow-write-text-file`
- 不开放静态目录 scope。

## 5. 数据流

```text
用户操作
  ├─ 朗读页/书架页 → playerStore.start/startSegs → pump()
  │     ├─ 每段完成 → snapshotSink → resumeStore → settings 表
  │     └─ timeupdate → currentTime/duration → 句级高亮 / 进度条
  ├─ 播放条 → setSleepTimer → 到期 pause()
  ├─ 设置页 → saveAppPrefs → SQLite + localStorage 主题镜像
  ├─ 节点增删改/探测 → notifyShare → Rust /nodes.json
  └─ 数据区 → save/open 对话框 → configTransfer → nodes/settings 仓储
```

## 6. 错误处理

- 快照损坏/版本不符：忽略并清除，不阻塞启动。
- 续听目标书籍或章节不存在：隐藏入口并清空快照。
- 配置导入失败：toast 具体错误，现有数据不变。
- 文件写出失败：toast 错误，不标记导出成功。
- 睡眠定时到期时已暂停/空闲：只清空定时，不重复提示。
- 句级切分得到空数组：降级为整段高亮。
- 调度策略值非法：由 `normalizeAppPrefs` 回退默认。

## 7. 文件变更

**新增**
- `src/lib/sentences.ts` / `sentences.test.ts`
- `src/lib/estimate.ts` / `estimate.test.ts`
- `src/lib/snapshot.ts` / `snapshot.test.ts`
- `src/lib/configTransfer.ts` / `configTransfer.test.ts`
- `src/store/resumeStore.ts`
- `src/components/player/SentenceText.tsx`
- `src/hooks/useSleepCountdown.ts`

**修改**
- `src/types/models.ts`、`src/types/models.test.ts`
- `src/lib/pool.ts`、`src/lib/pool.test.ts`
- `src/store/playerStore.ts`、`settingsStore.ts`、`poolDeps.ts`
- `src/main.tsx`
- `src/pages/ReadPage.tsx`、`BooksPage.tsx`、`BookDetailPage.tsx`、`SettingsPage.tsx`
- `src/components/player/PlayerDock.tsx`
- `src/components/ui/*.tsx`（cn 导入）
- `src/lib/mediaSession.ts`
- `index.html`（主题脚本保持兼容）
- `package.json`、`src-tauri/Cargo.toml`、`src-tauri/src/lib.rs`、`src-tauri/tauri.conf.json`、`src-tauri/capabilities/default.json`
- `README.md`

## 8. 测试与验收

**自动化**
- `sentences.test.ts`：切分、字符区间、比例 0/0.5/1、空文本、无标点长句。
- `estimate.test.ts`：0 字、常见长度、超过 8000 字。
- `snapshot.test.ts`：序列化/反序列化、版本非法、缺字段、书籍来源。
- `configTransfer.test.ts`：导出不含 apiKey、导入校验、去重、已有节点保留 key、非法版本。
- `models.test.ts`：新字段默认值与非法值回退。
- `pool.test.ts`：自定义阈值/冷却生效；手选上限仍为 3。
- 命令：`npm test`、`npm run build`、`src-tauri` 下 `cargo check`。

**手动验收**
1. 播放时展开播放条，当前句随进度高亮并自动滚动。
2. 设置 15 分钟睡眠定时后，倒计时显示，到点自动暂停并提示。
3. ±10 秒按钮生效且不越界。
4. 朗读页显示字数与预计时长；超过 8000 字出现提示。
5. 修改失败阈值/冷却时长并重启，值仍保留且影响冷却。
6. 开启启动自动测试，重启后节点自动刷新。
7. 导出 JSON 不含 apiKey；导入后节点恢复、已有密钥保留、偏好恢复。
8. 朗读纯文本后退出，重开显示续听卡片；书籍显示续听卡片。
9. 关闭自动续听后不再出现入口。
10. 生产构建下 Blob 音频可播放（CSP 未误杀）。
11. 文件对话框导入/导出可用，未申请多余权限。

## 9. 兼容性与迁移

- `app_prefs` 为 JSON，新增字段由 `normalizeAppPrefs` 补齐，无需数据库迁移。
- `playback_snapshot` 为新键，首次读取返回 `null`。
- 不改 `identifier`，现有 SQLite 数据目录不变。
- 移除 `cn` 依赖不改变样式行为（两个实现均为 clsx + tailwind-merge 语义）。

## 10. 风险

- 句级高亮是时间估算，长句、数字、英文缩写可能偏差；作为视觉辅助而非精确字幕。
- `dialog`/`fs` 需同时更新 npm 与 Cargo 版本，版本不一致会导致 IPC 命令缺失。
- CSP 配置错误会阻断 Blob 音频或 IPC；需在生产构建手动验证。
- 导入大量节点后自动探测会带来网络请求峰值；沿用现有并发限制。
