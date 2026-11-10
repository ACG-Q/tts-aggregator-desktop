# 配色、数据页、音色页与语音预生成设计

日期：2026-11-10
状态：待评审
范围：`tts-aggregator-desktop` 桌面端

## 背景

上一轮「沉静阅读室」界面重构已完成并验收，但对照 `demo.html` 与手机端仍有四处缺口：

1. 缺少 demo 的三套配色（墨绿 / 青瓷 / 胡桃）。
2. 设置 → 数据页缺少数据库统计与「清空调用日志」。
3. 音色页是 869 条的分页列表，缺少搜索优先、最近常用、筛选与风格选择，使用困难。
4. 连续朗读时合成等待造成明显停顿；同时 LEGACY 节点在长文本下 `GET /tts?text=` 发送失败。

本设计只解决以上四项，不引入无关重构。

## 目标与非目标

目标：

- 配色与主题正交：三套配色 × 深/浅/跟随系统，共 6 种组合。
- 数据页补齐 demo 中的数据库统计与危险操作。
- 音色页参考手机端 `VoicePicker` 的功能设计，采用搜索优先的单列列表。
- 朗读时预生成后续段落，消除连续播放的合成停顿。
- 修复 LEGACY 节点长文本请求失败。

非目标：

- 不做整章预合成、不做磁盘音频缓存（本轮只做内存窗口）。
- 不改动节点调度、探测、日志记录的核心逻辑。
- 不为配色新增独立主题编辑器。
- 不重做书架、节点、日志页面。

## 1. 配色

### 数据模型

```ts
export type PaletteId = 'ink' | 'celadon' | 'walnut';

export interface AppPrefs {
  // ...existing
  palette: PaletteId;
}
```

- `DEFAULT_APP_PREFS.palette = 'ink'`。
- `normalizeAppPrefs` 用白名单校验，非法值回退 `ink`。
- 配色随 `app_prefs` 存储，导入导出走现有 `configTransfer`，无需新增字段处理。

### 样式令牌

配色只改变主色系，背景、纸面、正文色保持不变：

| 配色 | 深色 `--primary` | 浅色 `--primary` | 语义 |
| --- | --- | --- | --- |
| `ink` | 现状 `#8fb59a` | 现状 `#4f7259` | 墨绿 · 纸白 |
| `celadon` | `#7fa8a1` | `#3f726b` | 青瓷 · 瓷青 |
| `walnut` | `#b99a74` | `#7b5c3b` | 胡桃 · 书房 |

- 每套配色同时覆盖 `--primary`、`--primary-foreground`、`--ring`、`--highlight`。
- 选择器：`html[data-palette="celadon"]` 为深色值，`html[data-palette="celadon"]:not(.dark)` 为浅色值；`walnut` 同理。
- 不覆盖 `--accent`：现有 `--accent` 是中性悬停表面色，语义与 demo 的装饰金色不同。

### 应用与防闪屏

- `src/lib/theme.ts` 新增 `applyPalette(palette: PaletteId): void`，写 `document.documentElement.dataset.palette`。
- `ThemeController` 读取 `appPrefs.palette` 并在变化时应用。
- `index.html` 首屏脚本从 `localStorage.app_prefs` 同时读取 `theme` 与 `palette`，在 React 挂载前设置 `.dark` 与 `data-palette`，避免刷新闪色。
- `mirrorTheme` 调整为 `mirrorPrefs({ theme, palette })`（保留旧名兼容则不必，内部调用点仅 `settingsStore`，直接重命名）。
- `settingsStore.saveAppPrefs` 调用 `mirrorPrefs`。

### 入口

- 侧栏底部、主题切换上方新增 `PaletteSwitch`：
  - 展开态（232px）：34px 高按钮，左侧显示当前配色色块与名称，点击打开向上弹层。
  - 窄栏态（72px）：调色盘图标按钮，弹层出现在按钮右侧，与现有主题弹层一致。
  - 弹层三选项：色块 + 名称 + 副标题（墨绿·纸白 / 青瓷·瓷青 / 胡桃·书房），当前项带对勾。
- 设置 → 外观新增「界面配色」行：三个色块按钮，复用同一组配色元数据，便于发现。

### 验收

- 切换配色后主色、焦点环、选中高亮同步变化，背景不变。
- 刷新后配色保持；深/浅/跟随系统切换不改变配色。
- 导入包含 `palette` 的配置文件后正确恢复；缺失或非法值回退墨绿。

## 2. 数据页补全

在 `src/components/settings/DataSection.tsx` 中：

### 数据库统计

- 在「配置迁移」卡片下方新增「数据库」卡片。
- 一行：标题「数据库」，描述「书库、章节与朗读进度」，右侧徽标 `N 本书 · M 章`。
- 数据来源：挂载时调用 `deps().books.list()`，书籍数取数组长度，章节数取 `chapterCount` 求和。
- 加载中显示 `—`，失败时显示 `—` 并 `toast.error`，不阻塞其他设置项。

### 危险操作

- 新增危险卡片，标题用 `text-destructive`。
- 一行：标题「清空调用日志」，描述「删除全部调用记录，不影响节点与书库」，右侧 destructive 按钮。
- 点击打开 `AlertDialog` 二次确认；确认后调用 `useLogsStore.getState().clear()`，然后 toast「已清空全部日志」。
- 清空为不可恢复操作，按钮与确认按钮均使用 destructive 样式。

### 验收

- 真实库下显示正确的书数与章节总数。
- 清空后日志页变为空，节点与书架数据不受影响。

## 3. 音色页重做（搜索优先）

### 数据模型

```ts
export interface SynthSettings {
  rate: number;
  pitch: number;
  voice: string;
  style: string; // 新增，默认 ''
}
```

- `DEFAULT_SYNTH.style = ''`；`normalizeSynth` 校验为非空字符串或 `''`。
- `currentPrefs()` 返回 `style: synth.style`，替换现有硬编码的 `style: ''`。
- 设置页试听、朗读页、音量/语速不变。
- 导入导出沿用 `normalizeSynth`，旧文件缺少 `style` 时回退 `''`。

### 页面结构

1. **工具条（吸顶）**
   - 搜索框：匹配 `voiceDisplayName(v)` 与 `v.id`，不区分大小写。
   - 语言 chips：全部 / 中文 / 英语 / 日语 / 韩语 / 其他，按 locale 前缀归类，其余语言归「其他」。
   - 性别分段：全部 / 女 / 男。
   - 筛选变化时重置「加载更多」计数。
2. **当前默认**
   - 始终置顶（有搜索时也显示），展示名称、ID、`默认` 徽标；若 `synth.style` 非空，显示风格名。
3. **最近常用**（仅无搜索且无筛选时）
   - localStorage 键 `voice_recent`，存音色 ID 数组，最多 8 个，最近在前。
   - 在「设为默认」或「试听」成功时记录；已删除/不存在的 ID 读取时忽略。
   - 以行内快捷列表呈现，点击即试听，附带「设为默认」。
4. **列表**
   - 无搜索且语言筛选为「全部」：按语言分组，中文优先，其余按数量降序；组内按名称排序。
   - 有搜索或筛选：平铺显示「N 个结果」。
   - 每行：首字头像、名称、ID、`语言 · 性别 · N 种风格`、试听/停止、设为默认、展开箭头（无风格时不显示箭头）。
5. **风格展开**
   - 展开显示 chips：「默认」+ 全部风格。
   - 点击 chip：选中该风格并立即试听；选中项带选中态。
   - 行内「设为默认」按钮在选中风格后变为「设为默认（风格名）」，保存 `voice` + `style`。
   - 未选风格时保存 `style: ''`。
6. **加载方式**
   - 移除 `Pagination`，改为每次渲染 60 条 +「加载更多」。
   - 切换搜索/筛选时重置到 60 条。

### 抽成可测单元

新增 `src/lib/voiceFilter.ts`：

- `languageBucket(locale): LangBucket`（zh/en/ja/ko/other）。
- `filterVoices(voices, { query, language, gender }): Voice[]`。
- `groupByLanguage(voices): { bucket, label, voices }[]`（中文优先，其余按数量降序）。
- `readRecentVoices(storage): string[]` / `pushRecentVoice(storage, id)`（最大 8，去重前置）。

页面只负责渲染与交互，过滤/分组/最近逻辑全部在纯函数中，配单元测试。

### 验收

- 869 条音色下，输入关键字 1 秒内出现匹配结果。
- 语言/性别筛选组合正确；无结果显示空状态。
- 最近常用在设为默认后立即出现，刷新后保留。
- 选择风格后设为默认，朗读与设置页试听都使用该风格。
- 窄窗口下工具条与行布局不溢出。

## 4. 语音预生成与长文本修复

### 分段上限

- `splitForReading` 默认 `maxLen: 800 → 150`。
- 目的：让 LEGACY 节点的 `GET /tts?text=` URL 保持在可发送长度内。
- 同步更新 `split.test.ts`；`estimate.ts` 只按总字数估算，不依赖分段数量，无需改动。

### 预取窗口

新增 `src/lib/prefetch.ts`，提供可注入合成函数的窗口调度器：

```ts
interface PrefetchOptions {
  size: number;        // 预取段数，默认 3
  synth: (text: string) => Promise<ArrayBuffer>;
  onState?: (index: number, state: 'start' | 'ok' | 'fail') => void;
}

class PrefetchWindow {
  ensure(startIndex: number, segs: { text: string }[]): void;
  take(index: number): Promise<ArrayBuffer> | null;
  release(index: number): void;
  clear(): void;
}
```

行为：

- `ensure(i, segs)`：确保 `i+1 … i+size` 都有合并在途任务；串行执行，避免节点限流。
- 命中规则：`take(i)` 返回已存在（完成或在途）的 Promise，并把它从窗口移除，由调用方 await。
- 失败：删除该索引的缓存，`onState(index, 'fail')`，不影响其他段。
- `clear()`：递增内部 token，清空缓存，旧的在途任务完成后丢弃结果。
- 同一个索引不会重复发起合成。

### playerStore 改造

- 删除模块级单段 `prefetch`，改为每个播放会话持有一个 `PrefetchWindow`。
- `pump` 取第 i 段时：
  1. `const cached = window.take(i)`；有则直接 await。
  2. 无则走现有 `synthFn`，并在开始后调用 `window.ensure(i, segs)`。
- 预取中的段状态显示为 `synthesizing`；失败时回退为 `pending`（由 `onState` 回调更新 store）。
- 段播放完成：`window.release(i)` 释放内存。
- `resetPlayback()` / 新会话开始：`window.clear()`，并确保旧会话的异步结果不会写入新会话。
- 暂停不清理窗口（恢复后可直接使用）；停止/跳段/换音色清理。

### 内存与并发

- 窗口最多 3 段，MP3 量级为几 MB，可接受。
- 串行合成：同一时刻最多 1 个预取请求在跑，加上当前段最多 2 个并发，低于现有节点压力。
- 150 字一段的音频通常 20–40 秒，3 段窗口足以覆盖 5–15 秒的合成延迟。

### 验收

- 连续 10 段以上朗读，段与段之间无合成停顿（首次除外）。
- 中途停止或换音色后，不会播放旧窗口的音频。
- 预取失败时当前段仍按原逻辑重试，日志记录正确。
- 312 字以上长文本在 LEGACY 节点下可以成功合成。

## 测试计划

单元测试：

- `normalizeAppPrefs`：palette 合法值、缺失、非法值回退。
- `theme.applyPalette`：写入 `data-palette`。
- `voiceFilter`：搜索、语言归类、性别过滤、分组顺序、最近常用去重与上限。
- `splitForReading`：默认上限 150、超长句切分、段落优先。
- `prefetch`：窗口命中、串行顺序、失败移除、clear 后旧任务不写回。
- `normalizeSynth`：style 缺失/非法回退。

构建与验收：

- `npm test` 全绿，`npm run build` 通过。
- 真机 `npm run tauri dev` 验证：三套配色深浅切换与持久化、数据页统计与清空日志、音色页搜索/筛选/最近/风格、连续朗读无停顿、长文本合成成功。

## 风险与取舍

- **风格兼容性**：部分节点不支持 `style` 参数，传入后可能被忽略或报错。设置页保留「默认风格」作为回退；文档中说明。
- **分段变短**：请求数增加，日志条目变多；由预取与串行调度吸收，不改变调度策略。
- **预取失败**：窗口只做加速，不作为唯一来源；失败后当前段仍走原有重试链路。
- **最近常用仅存本地**：不随配置导出；换机后为空，可接受。

## 涉及文件

- `src/types/models.ts`：`PaletteId`、`AppPrefs.palette`、`SynthSettings.style`、默认值与归一化。
- `src/lib/theme.ts`、`src/components/ThemeController.tsx`、`index.html`：配色应用与首屏防闪。
- `src/index.css`：配色令牌。
- `src/App.tsx`：`PaletteSwitch`。
- `src/pages/SettingsPage.tsx`：外观配色行、风格提示、试听使用 `synth.style`。
- `src/components/settings/DataSection.tsx`：数据库统计与危险操作。
- `src/pages/VoicesPage.tsx`、`src/lib/voiceFilter.ts`：音色页重做。
- `src/lib/split.ts`、`src/lib/prefetch.ts`、`src/store/playerStore.ts`、`src/store/poolDeps.ts`：分段与预取。
- 对应测试文件。
