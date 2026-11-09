# 沉静阅读室 UI 重构 实现计划

> **面向 AI 代理的工作者：** 必需子技能：superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans。步骤使用复选框跟踪进度。

**目标：** 按已批准的 `demo.html` 原型，把 `tts-aggregator-desktop` 的全部界面重构为「沉静阅读室」视觉，保留全部业务逻辑。

**架构：** 以 `src/index.css` 的设计令牌为唯一颜色/圆角来源，先在 `App.tsx` 落地外壳（232/72px 侧栏、移动抽屉、底部播放条偏移），再逐页替换布局与视觉。原型 `C:\Users\LiuJi\Desktop\project-07\demo.html` 是视觉与交互的唯一参照。

**技术栈：** React 19、Tailwind 4、shadcn/ui、Zustand、Tauri 2。

---

### 任务 1：设计令牌

**文件：** 修改 `src/index.css`

- [x] 写入深/浅色两套「墨绿纸感」令牌（背景、卡片、描边、主色、纸面、辅助色）。
- [x] 在 `@theme inline` 暴露 `paper / surface-2 / surface-3 / line / line-strong / faint / highlight`。
- [x] 设置中文字体栈、选区与滚动条样式、圆角基准。

### 任务 2：应用外壳

**文件：** 修改 `src/App.tsx`、`src/components/PageHeader.tsx`

- [x] 侧栏：品牌区（耳机图标 + TTS Aggregator / READING ROOM）、导航、底部主题三选一 + 收起按钮。
- [x] 折叠态：72px 窄栏，主题按钮弹出三选一菜单（点击外部/Esc 关闭），与展开态一致。
- [x] 移动端（<768px）：顶部 54px 栏 + 汉堡按钮，侧栏改为滑出抽屉 + 遮罩。
- [x] 主区：1180px 最大宽度、38/40px 内边距、底部留出播放条空间。
- [x] `PageHeader` 增加可选 `eyebrow`，与原型排版一致。

### 任务 3：播放条

**文件：** 修改 `src/components/player/PlayerDock.tsx`

- [x] 收起态：68px 细条，左侧封面与标题，中部走带，右侧倍速/定时/展开；`left` 随侧栏宽度，移动端为 0。
- [x] 展开态：纸面色块展示当前句，进度条、走带、睡眠定时与音量/倍速。
- [x] 保持现有 store 调用与行为不变。

### 任务 4：朗读页

**文件：** 修改 `src/pages/ReadPage.tsx`

- [x] 820px 单栏：页头 eyebrow、继续上次朗读条、纸面编辑区、三列参数卡、段落列表。
- [x] 保留导入、开始朗读、续听、段落跳转、长文提示、错误提示逻辑。

### 任务 5：书架与书籍详情

**文件：** 修改 `src/pages/BooksPage.tsx`、`src/pages/BookDetailPage.tsx`、`src/components/book/ChapterTree.tsx`

- [x] 书架：顶部统计 4 卡、封面网格、进度条与悬停播放按钮；导入/重命名/删除逻辑不变。
- [x] 详情：封面 + 标题 + 主进度、左侧章节树、右侧章节预览纸面。

### 任务 6：节点 / 音色 / 日志

**文件：** 修改 `src/pages/NodesPage.tsx`、`src/pages/VoicesPage.tsx`、`src/pages/LogsPage.tsx`

- [x] 三页统一：eyebrow 页头、统计卡、工具栏、表格/列表、空态与加载态。
- [x] 保留探测、批量导入、默认音色、试听、筛选、清空日志等全部逻辑。

### 任务 7：设置页

**文件：** 修改 `src/pages/SettingsPage.tsx`、`src/components/settings/DataSection.tsx`

- [x] 左侧二级导航 + 右侧分组卡片；主题用三张预览卡。
- [x] 保留全部设置项、分享服务、数据导出导入逻辑。

### 任务 8：验证

- [x] `npm test` 全绿。
- [x] `npm run build` 通过。
- [x] Playwright 截图核对：1440 / 960 / 800 / 375，深浅主题，侧栏展开/折叠，播放条展开。
