# 桌面端 UI/UX 全量打磨 + 小说有声朗读 设计规格

日期：2026-10-16
状态：设计已批准（对话中逐节确认），待用户书面审查
范围：子项目 #1 `tts-aggregator-desktop` 的 UI 层重写与新业务「小说书架」

## 0. 背景与目标

#1 桌面端功能已交付（HEAD `d7c23c5`，5 项手动验收待用户执行）。ui-ux-suite 审计总分 **5.1/10**，60 项发现；对比度实测多处不达 WCAG 4.5:1（`.muted` 2.34:1、accent 徽章 2.42:1、主按钮白字 3.3:1 等）。代码走读另发现业务/UX 缺陷：朗读文本切页即丢、无进度条/seek/段落跳转、无音量、试听无停止、全原生 alert/confirm、无暗色模式、设置页默认音色为手输文本框、日志跨天无日期、大表无分页。

本期目标：
1. UI 层全量迁移到 **Tailwind CSS v4 + shadcn/ui**（方案二），修复全部对比度失败，补齐暗色模式、焦点管理、图标体系与克制动效。
2. 新增**小说有声朗读（书架版）**：多本 TXT 导入、内置多级目录解析（卷/篇→章/节）、章节点播与顺序连播、断点续听。
3. 播放体验补齐：文本持久化、进度条+段内 seek、段落跳转、音量、播放倍速、MediaSession 媒体键、试听停止。

## 1. 范围

**做**：§2–§7 全部；逐页迁移每步可运行；master 直提约 10 个 commit。
**不做（范围外，明确否决）**：EPUB、睡眠定时、书源在线下载、多播放队列、节点排序、系统托盘、全局快捷键、撤销删除、虚拟滚动库、next-themes。

## 2. 技术栈与依赖

保留：React 19、react-router-dom 7、zustand 5、Vite 8、vitest 5、Tauri 2 插件族（sql/http/opener）、全部现有业务层（`lib/api|pool|split|importers|encoding|db` 的节点/日志/分享逻辑不动）。

新增依赖（均 MIT、维护活跃；AGENTS.md 依赖审查）：

| 包 | 用途 | 理由 |
|---|---|---|
| `tailwindcss` + `@tailwindcss/vite` | 样式系统 v4 | 方案二核心；`@theme` 令牌，无 config 文件 |
| shadcn/ui（CLI 生成，源码入仓）+ `@radix-ui/react-*` 按需 | 组件基座 | 无运行时黑盒；a11y（focus/ESC/aria）内置 |
| `lucide-react` | 图标族 | shadcn 默认图标，tree-shake，全局一致 |
| `sonner` | Toast | shadcn 官方推荐，`aria-live` 内置 |
| `class-variance-authority`、`clsx`、`tailwind-merge` | shadcn 基座工具 | 变体类与类合并标准件 |
| `tw-animate-css` | 入场/退场关键帧 | shadcn v4 标配；不兼容时随手移除（动效降级为手写 transition） |

**已知风险**：`@tailwindcss/vite` 对 Vite 8 的兼容性需在计划任务 0 验证；不兼容则回退 `@tailwindcss/postcss` + `postcss.config`（功能等价）。

**过渡策略**：迁移期 `src/styles.css` 与 Tailwind 并存，逐页替换类名；终批删除 `styles.css` 与其中全部旧类。

## 3. 设计系统（基座）

- **令牌**：shadcn 语义 token（`--background/foreground/card/card-foreground/muted/muted-foreground/primary/destructive/border/ring` 等）；primary 定为绿系且白字对比 ≥4.5:1（亮色取 `#15803D` 级别，dark 取亮绿+深色前景）；`radius` 与现风格一致（~10–14px）。
- **对比度硬性验收**：亮/暗两主题下所有文本对 ≥4.5:1（实现时用 `uiux_check_contrast` 复检并记录）；徽章/按钮/表头/muted 全覆盖。
- **暗色模式**：自写轻量主题 provider——`appPrefs.theme: 'system'|'light'|'dark'`；`system` 跟随 `matchMedia` 实时切换；应用 `html.dark` class 策略；`index.html` 内联脚本按 `prefers-color-scheme` 预应用防闪烁，bootstrap 读到设置后校正。
- **间距/字号**：4/8px 网格；桌面密度维持（基准 14px，不盲从 16px 建议），muted/label ≥13px。
- **焦点**：全局 `focus-visible` ring（radix 默认 + `--ring` token）。
- **动效**：150–200ms ease-out（toast 滑入、dialog 淡入缩放、seg 状态过渡）；`prefers-reduced-motion` 降级为无动画。
- **AppPrefs 扩展**：`{ probeConcurrency: number; theme: 'system'|'light'|'dark'; playbackRate: number }`，默认 `{4,'system',1}`。

## 4. 小说书架（新业务）

### 4.1 数据（SQLite 扩展，`lib/db.ts` SCHEMA 追加）

```sql
CREATE TABLE IF NOT EXISTS books (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  imported_at INTEGER NOT NULL,
  last_chapter INTEGER NOT NULL DEFAULT 0,
  last_segment INTEGER NOT NULL DEFAULT 0,
  playback_rate REAL NOT NULL DEFAULT 1.0
);
CREATE TABLE IF NOT EXISTS chapters (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL,
  idx INTEGER NOT NULL,            -- 全书可播单元顺序，0-based
  volume TEXT NOT NULL DEFAULT '', -- 卷/篇名，无层级则 ''
  title TEXT NOT NULL,             -- 叶标题（含节时为“第X章 第Y节 …”拼接展示名）
  content TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chapters_book ON chapters(book_id, idx);
```

正文直接入库（TEXT，10MB 级无压力，免外部文件路径失效）。`BooksRepo`：`getAll/getById/importText/delete/rename/setProgress/setRate`，与现有 Repo 同风格（纯行映射函数可单测）。

### 4.2 目录解析 `lib/toc.ts`（核心，重点单测）

- 输入全文 → 输出 `PlayableUnit[] { title; volume; content }` + 统计 `{ volumeCount; chapterCount }`。
- 逐行扫描（兼容 `\r\n`）；标题必须**独立成行**（允许前导空白）。
- 三级匹配器（行首）：
  - **卷**：`第[0-9〇零一二三四五六七八九十百千万]+[卷篇部辑]` 或 `卷[数字]+`；
  - **章**：`第[数字|中文数字|全角数字|罗马数字 ivxlIVXL]+[章回]` + 可选标题文字；
  - **节**：`第[数字|中文数字]+节`。
- 中文数字解析 `parseCnNum`（一~十百千、〇零、混合如 三百二十五）独立导出并单测。
- 组装规则：卷变更→后续单元 `volume` 更新；无节时每章一单元；有节时每节一单元（title 拼接“第X章 第Y节”，章自身前言内容若非空则作为独立单元“第X章”）；首个标题前的正文作为单元「开头」。
- **兜底**：零命中 → 整本单单元（title=书名）；命中 1 章照常；剔除 content.trim() 为空的单元。
- 解析在主线程同步执行 + 导入中 loading 态（10MB 级 <1s，不引 Worker）。

### 4.3 书架 UI（新页面，侧栏项「书架」，位于「朗读」之后）

- **书架列表**：书名、导入时间、「N 卷 M 章」、进度（第 X 章 · 已听 Y%，Y% = 已播完单元数/总单元数，粗粒度不含段内）、倍速；操作：打开、改名（inline）、删除（AlertDialog 确认）。
- **导入**：按钮选 TXT（复用 `readTextFile`）→ 解析入库 → sonner toast「《书名》已导入，N 卷 M 章」；解析异常 toast 报错。
- **书籍视图**：左侧章节树（卷分组折叠 → 单元列表，当前播放高亮），点单元即从该单元开头播放；右侧复用播放器控制区。
- **续听**：打开书时若 `last_chapter/last_segment > 0` → AlertDialog「继续上次（第X章）/ 从头开始 / 取消」。
- **进度回写**：每段播放完成 `setProgress(bookId, chapterIdx, segIdx)`（段粒度直写，无需 debounce）。
- **连播**：当前单元播完自动加载下一单元（idx+1），全书播完 toast「本书已播完」并回写末尾进度。
- 与粘贴朗读共存：播放器单例互斥（新播放自动停旧）；书架播放时侧栏「书架」项带播放指示点。

### 4.4 播放倍速

`audio.playbackRate`；范围 0.5–2.0 步进 0.1。文本模式用全局 `appPrefs.playbackRate`；书模式默认用 `books.playback_rate` 并在调整时回写该书。

## 5. 播放体验增强（朗读页与书架共用）

- **文本持久化**：`playerStore.text` 承载粘贴模式文本，切页/返回不丢；「清空」按钮显式清除。
- **进度条**：基于已有 `currentTime/duration`，可拖动 seek（段内）；时间显示 mm:ss。
- **段落跳转**：段列表行可点击 → `jumpTo(i)`（runToken 轮换 + index=i + pump）。
- **音量**：0–100 存 `appPrefs`，`audio.volume` 联动，控制区 Slider。
- **试听停止**：音色页共享单例 Audio；`auditioning` 期间按钮变「停止」；再试听/停止均先停旧。
- **MediaSession**：metadata（书名/章名或「TTS Aggregator」）+ handlers：play/pause/stop/nexttrack(=skipNext)。
- **侧栏指示**：player running 时对应路由项显示动画小点（CSS，尊重 reduced-motion）。

## 6. 数据页可用性

- **分页**：手写零依赖 `Pagination`（prev/next + 页码，页码 >5 折叠为 …）；日志 100/页（拉取上限提至 `LOG_KEEP` 500 客户端分页）、音色 50/页（过滤后分页，过滤变化重置页码）。
- **日志时间**：当天 `HH:mm:ss`，跨天 `MM-DD HH:mm:ss`。
- **节点页**：工具栏加搜索框（label/URL 包含匹配，大小写不敏感）；删除改 AlertDialog。
- **设置页**：默认音色文本框改 `<select>`（voices + 「节点默认」；`synth.voice` 不在列表时追加「当前: {id}」项，onFocus 拉取与朗读页一致）；新增主题三档切换（system/light/dark）；倍速默认值设置项。
- **aria**：radix 组件补齐大半；遗留手工控件（file input、checkbox/radio）补 `aria-label`。

## 7. 迁移与提交批次（master 直提）

| # | Commit | 内容 |
|---|---|---|
| 1 | chore: Tailwind v4 + shadcn 基座与主题 provider | 依赖、tokens、globals、sonner、防闪烁脚本、AppPrefs 扩展 |
| 2 | feat: App 壳与导航迁移 | shadcn 侧栏 + lucide 图标 + 播放指示 + 路由 |
| 3 | feat: 朗读页迁移与播放体验 | 文本持久化、进度条/seek、段跳转、音量、倍速、MediaSession |
| 4 | feat: 小说书架数据层与目录解析 | books/chapters 表、BooksRepo、toc.ts + 单测 |
| 5 | feat: 书架页 UI | 导入/列表/章节树/续听/删除/改名 |
| 6 | feat: 节点页与 ImportPanel 迁移 | 搜索、AlertDialog |
| 7 | feat: 音色页迁移 | 分页、试听停止 |
| 8 | feat: 日志页迁移 | 分页、跨天时间 |
| 9 | feat: 设置页迁移 | 音色下拉、主题切换、倍速默认 |
| 10 | chore: 收尾 | 删 styles.css、对比度复检、README 增补、全量验证 |

每批完成后 `vitest run` + `tsc`（build）保持全绿；批次 1 后 dev 运行可见壳，批次 2 后逐页可走查。

## 8. 测试与验收

**自动化（vitest）**：
- `toc.test.ts`：中文数字/罗马/全角解析、卷章节三级、无卷两级、节拼接、前言单元、零命中兜底、空章剔除、`\r\n`。
- `db.test.ts` 扩展：books 行映射与 Repo SQL 参数（沿用现有 SqlExec mock 风格）。
- player 书模式逻辑（store 层）：连播推进、进度回写、互斥停止（能纯函数化的部分进 lib，store 只接线）。
- `format.test.ts`：跨天时间格式化、百分比进度。
- 现有 14 个测试文件全量回归。

**验证命令**：`npm run test`、`npm run build`（tsc+vite）全绿；lint 若无配置则不新增（对齐现状）。

**手动验收清单（计划任务 N）**：
1. 亮/暗/跟随系统三档切换，全页走查无闪白、无破版；对比度复检记录。
2. 导入真实 TXT（多卷多章样例 + 无目录样例）→ 章节树正确、兜底正确；改名/删除。
3. 点章播放、顺序连播跨章、停止后重开续听提示、进度百分比正确。
4. 文本模式切页返回文本仍在；seek/段跳转/音量/倍速生效；媒体键 play/pause/next 生效。
5. 日志跨天时间、分页；音色分页与试听停止；节点搜索。
6. 全程 `vitest`/`build` 绿；`git status` 仅 `?? docs/`。

## 9. 风险与回滚

- Tailwind×Vite8 兼容性 → §2 回退 PostCSS 方案。
- shadcn 生成物与 React 19 类型 → CLI 用最新版；类型报错随批修复。
- 迁移期双样式并存视觉割裂 → 逐页切换、旧类随页删除，不整页回退。
- 回滚粒度 = 单 commit revert（master 直提，无分支合并风险）。
