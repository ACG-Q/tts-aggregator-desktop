# 底部播放条与侧边栏智能伸缩 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 把散落在页面里的播放控制收敛为一个常驻底部的「迷你播放条 + 可展开大面板」，并让左侧导航栏支持手动折叠与窄窗口自动折叠。

**架构：** 新增 `PlayerDock`（唯一播放控制入口，订阅 `playerStore` 的播放状态）与 `sidebarStore`（折叠状态）。`playerStore` 与数据层不改。书籍详情页把「当前播放书籍 + 章节标题」写入 `nowPlayingStore`，播放条据此显示书名/章节。朗读页与详情页各自删掉重复的进度/音量/倍速控件。

**技术栈：** React 19、zustand（已有）、lucide-react 图标、项目已有 shadcn ui（Button/Select/Slider）。验证命令：`npm test`（vitest）与 `npm run build`（`tsc && vite build`）。无 lint 脚本。

---

## 文件结构

| 文件 | 职责 |
|------|------|
| 创建 `src/lib/sidebar.ts` | 纯函数 `resolveCollapsed`，决定侧栏是否折叠，可单测 |
| 创建 `src/lib/sidebar.test.ts` | 侧栏折叠逻辑单元测试 |
| 创建 `src/store/nowPlayingStore.ts` | 当前播放书籍上下文（书名、章节标题） |
| 创建 `src/components/player/PlayerDock.tsx` | 底部播放条：折叠态 + 展开态 |
| 修改 `src/App.tsx` | 侧栏三态伸缩；挂载 `PlayerDock`；主区为播放条留出底部空间 |
| 修改 `src/store/bookPlay.ts` | 章节开播时写入 `nowPlayingStore` |
| 修改 `src/pages/ReadPage.tsx` | 删除重复的进度/音量/倍速与播放按钮，保留「开始朗读」与段落列表 |
| 修改 `src/pages/BookDetailPage.tsx` | 删除内嵌播放器，写入 `nowPlayingStore`，保留续播入口 |

`PlayerControls.tsx` 在本计划中不再被任何页面引用（其控制已被 `PlayerDock` 取代）。删除它属于清理步骤，放在最后，避免中途破坏引用。

---

### 任务 1：侧栏折叠纯函数

**文件：**
- 创建：`src/lib/sidebar.ts`
- 测试：`src/lib/sidebar.test.ts`

- [ ] **步骤 1：编写失败的测试**

创建 `src/lib/sidebar.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { resolveCollapsed } from './sidebar';

describe('resolveCollapsed', () => {
  it('宽窗口 + 无手动偏好 → 展开', () => {
    expect(resolveCollapsed(1200, null, 768)).toBe(false);
  });

  it('窄窗口 + 无手动偏好 → 自动折叠', () => {
    expect(resolveCollapsed(700, null, 768)).toBe(true);
  });

  it('窄窗口 + 手动展开 → 手动优先，展开', () => {
    expect(resolveCollapsed(700, false, 768)).toBe(false);
  });

  it('宽窗口 + 手动折叠 → 手动优先，折叠', () => {
    expect(resolveCollapsed(1200, true, 768)).toBe(true);
  });

  it('正好等于阈值 → 不折叠', () => {
    expect(resolveCollapsed(768, null, 768)).toBe(false);
  });
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npx vitest run src/lib/sidebar.test.ts`
预期：FAIL，报错 `Failed to load ./sidebar`

- [ ] **步骤 3：编写最少实现代码**

创建 `src/lib/sidebar.ts`：

```ts
/**
 * 计算侧边栏是否应折叠。
 * 手动偏好（manual）一旦存在即覆盖自动判断；否则按窗口宽度与阈值自动决定。
 * 宽度等于阈值时不折叠（窄于阈值才折叠）。
 */
export function resolveCollapsed(
  windowWidth: number,
  manual: boolean | null,
  threshold: number,
): boolean {
  if (manual !== null) return manual;
  return windowWidth < threshold;
}
```

- [ ] **步骤 4：运行测试验证通过**

运行：`npx vitest run src/lib/sidebar.test.ts`
预期：PASS，5 passed

- [ ] **步骤 5：Commit**

```bash
git add src/lib/sidebar.ts src/lib/sidebar.test.ts
git commit -m "feat: 侧栏折叠决策纯函数 resolveCollapsed"
```

---

### 任务 2：侧栏状态 store

**文件：**
- 创建：`src/store/sidebarStore.ts`

- [ ] **步骤 1：编写实现**

创建 `src/store/sidebarStore.ts`：

```ts
import { create } from 'zustand';
import { resolveCollapsed } from '../lib/sidebar';

export const SIDEBAR_COLLAPSE_THRESHOLD = 768;

interface SidebarState {
  /** 用户手动折叠偏好；null 表示从未手动操作过，跟随自动判断 */
  manual: boolean | null;
  /** 当前窗口宽度，由组件在 resize 时写入 */
  windowWidth: number;
  setManual(v: boolean | null): void;
  setWindowWidth(w: number): void;
  /** 计算得到的是否折叠 */
  collapsed(): boolean;
  toggle(): void;
}

export const useSidebarStore = create<SidebarState>((set, get) => ({
  manual: null,
  windowWidth: typeof window === 'undefined' ? 1280 : window.innerWidth,
  setManual(manual) { set({ manual }); },
  setWindowWidth(windowWidth) { set({ windowWidth }); },
  collapsed() {
    return resolveCollapsed(get().windowWidth, get().manual, SIDEBAR_COLLAPSE_THRESHOLD);
  },
  toggle() {
    set({ manual: !get().collapsed() });
  },
}));
```

- [ ] **步骤 2：运行构建验证类型**

运行：`npm run build`
预期：无 `error TS`，`built in` 出现

- [ ] **步骤 3：Commit**

```bash
git add src/store/sidebarStore.ts
git commit -m "feat: 侧栏折叠状态 sidebarStore"
```

---

### 任务 3：现在播放上下文 store

**文件：**
- 创建：`src/store/nowPlayingStore.ts`

播放条需要显示「书名 + 章节标题」，但 `playerStore` 只存 `source: { bookId, chapterIdx }`，不含标题。此 store 由书籍详情页在开播时写入。

- [ ] **步骤 1：编写实现**

创建 `src/store/nowPlayingStore.ts`：

```ts
import { create } from 'zustand';

export interface NowPlaying {
  bookId: string;
  title: string;
  chapterTitle: string;
  chapterCount: number;
  chapterIdx: number;
}

interface NowPlayingState {
  current: NowPlaying | null;
  set(p: NowPlaying | null): void;
}

export const useNowPlayingStore = create<NowPlayingState>((set) => ({
  current: null,
  set(current) { set({ current }); },
}));
```

- [ ] **步骤 2：运行构建验证类型**

运行：`npm run build`
预期：无 `error TS`

- [ ] **步骤 3：Commit**

```bash
git add src/store/nowPlayingStore.ts
git commit -m "feat: nowPlayingStore 记录当前播放书籍上下文"
```

---

### 任务 4：书籍播放写入上下文

**文件：**
- 修改：`src/store/bookPlay.ts`

- [ ] **步骤 1：在 playChapter 内写入 nowPlaying**

在 `src/store/bookPlay.ts` 中，`import` 区加入：

```ts
import { useNowPlayingStore } from './nowPlayingStore';
```

在 `const player = usePlayerStore.getState();` 之后、`player.stop();` 之前插入：

```ts
if (book) {
  useNowPlayingStore.getState().set({
    bookId,
    title: book.title,
    chapterTitle: chapter.title,
    chapterCount: book.chapterCount,
    chapterIdx,
  });
}
```

依赖说明：`chapter` 类型为 `BookChapter`（来自 `deps().books.getChapter`），含 `title` 字段；`book` 类型为 `Book`，含 `title` 与 `chapterCount` 字段。

- [ ] **步骤 2：运行测试与构建**

运行：`npm test`；然后 `npm run build`
预期：测试全绿（无回归）；构建无 `error TS`

- [ ] **步骤 3：Commit**

```bash
git add src/store/bookPlay.ts
git commit -m "feat: 书籍播放时写入 nowPlaying 上下文"
```

---

### 任务 5：底部播放条组件

**文件：**
- 创建：`src/components/player/PlayerDock.tsx`

这是本计划最大的一步。组件只在 `player.status !== 'idle'` 时渲染。折叠态是一行，展开态是一个覆盖在底部之上的面板。

- [ ] **步骤 1：编写实现**

创建 `src/components/player/PlayerDock.tsx`：

```tsx
import { useState } from 'react';
import {
  ChevronDown, ChevronUp, Pause, Play, RotateCcw, RotateCw, SkipBack, SkipForward, Square, Volume2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { fmtClock } from '@/lib/format';
import { RATE_OPTIONS } from '@/components/player/PlayerControls';
import { useNowPlayingStore } from '@/store/nowPlayingStore';
import { usePlayerStore } from '@/store/playerStore';
import { useSettingsStore } from '@/store/settingsStore';

function ProgressBar({ compact }: { compact: boolean }) {
  const player = usePlayerStore();
  const disabled = player.duration <= 0;
  const value = Math.min(player.currentTime, player.duration || 0);
  return (
    <div className={`flex items-center gap-2 ${compact ? 'flex-1' : 'w-full'}`}>
      <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
        {disabled ? '--:--' : fmtClock(player.currentTime)}
      </span>
      <Slider
        disabled={disabled}
        value={[value]}
        max={Math.max(player.duration, 1)}
        step={0.5}
        onValueChange={([v]) => player.seek(v)}
        className="flex-1"
      />
      <span className="w-10 shrink-0 text-xs tabular-nums text-muted-foreground">
        {disabled ? '--:--' : fmtClock(player.duration)}
      </span>
    </div>
  );
}

function Transport({ large }: { large: boolean }) {
  const player = usePlayerStore();
  const idle = player.status === 'idle';
  const size = large ? 'default' : 'icon';
  const iconCls = large ? 'h-5 w-5' : 'h-4 w-4';
  return (
    <div className={`flex items-center ${large ? 'gap-4' : 'gap-1'}`}>
      <Button variant="ghost" size={size} disabled={idle} onClick={() => player.jumpTo(player.index - 1)} title="上一段">
        <SkipBack className={iconCls} />
      </Button>
      <Button variant="ghost" size={size} title="后退 15 秒" onClick={() => player.seek(player.currentTime - 15)}>
        <RotateCcw className={iconCls} />
      </Button>
      {player.status === 'running' ? (
        <Button size={size} onClick={player.pause} title="暂停">
          <Pause className={iconCls} />
        </Button>
      ) : (
        <Button size={size} disabled={idle} onClick={() => void player.resume()} title="播放">
          <Play className={iconCls} />
        </Button>
      )}
      <Button variant="ghost" size={size} title="前进 15 秒" onClick={() => player.seek(player.currentTime + 15)}>
        <RotateCw className={iconCls} />
      </Button>
      <Button variant="ghost" size={size} disabled={idle} onClick={player.skipNext} title="下一段">
        <SkipForward className={iconCls} />
      </Button>
    </div>
  );
}

function VolumeAndRate() {
  const player = usePlayerStore();
  const { appPrefs, saveAppPrefs } = useSettingsStore();
  return (
    <div className="flex items-center gap-3">
      <div className="flex w-28 items-center gap-1">
        <Volume2 className="h-4 w-4 shrink-0 text-muted-foreground" />
        <Slider
          value={[player.volume]}
          max={100}
          step={1}
          onValueChange={([v]) => {
            player.setVolume(v);
            void saveAppPrefs({ ...appPrefs, volume: v });
          }}
          className="flex-1"
        />
      </div>
      <Select
        value={String(player.playbackRate)}
        onValueChange={(v) => {
          const rate = Number(v);
          player.setPlaybackRate(rate);
          void saveAppPrefs({ ...appPrefs, playbackRate: rate });
        }}
      >
        <SelectTrigger className="w-16"><SelectValue /></SelectTrigger>
        <SelectContent>
          {RATE_OPTIONS.map((r) => (<SelectItem key={r} value={String(r)}>{r}x</SelectItem>))}
        </SelectContent>
      </Select>
    </div>
  );
}

function BookMeta({ large }: { large: boolean }) {
  const now = useNowPlayingStore((s) => s.current);
  const src = usePlayerStore((s) => s.source);
  const isBook = src?.kind === 'book';
  const cover = now?.title.slice(0, 1) ?? '文';
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div
        className={`${large ? 'h-20 w-20 text-2xl' : 'h-10 w-10 text-base'} grid shrink-0 place-items-center rounded-lg bg-primary/15 font-semibold text-primary`}
      >
        {cover}
      </div>
      <div className="min-w-0">
        <div className={`${large ? 'text-lg' : 'text-sm'} truncate font-medium`}>
          {isBook && now ? now.title : '文本朗读'}
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {isBook && now ? now.chapterTitle : '粘贴或导入的文本'}
        </div>
      </div>
    </div>
  );
}

export function PlayerDock() {
  const [expanded, setExpanded] = useState(false);
  const player = usePlayerStore();
  const now = useNowPlayingStore((s) => s.current);

  if (player.status === 'idle') return null;

  const err = player.error;
  const segPos = player.segs.length > 0
    ? `段 ${Math.min(player.index + 1, player.segs.length)}/${player.segs.length}`
    : '';

  if (expanded) {
    return (
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card shadow-[0_-8px_30px_rgba(0,0,0,0.12)]">
        <div className="mx-auto max-w-4xl px-6 py-5">
          <div className="mb-4 flex items-start justify-between">
            <BookMeta large />
            <Button variant="ghost" size="icon" onClick={() => setExpanded(false)} title="收起">
              <ChevronDown className="h-5 w-5" />
            </Button>
          </div>
          <div className="mb-3"><ProgressBar compact={false} /></div>
          <div className="flex items-center justify-between">
            <span className="text-xs tabular-nums text-muted-foreground">
              {now ? `第 ${now.chapterIdx + 1}/${now.chapterCount} 章` : segPos}
            </span>
            <Transport large />
            <VolumeAndRate />
          </div>
          {err && <p className="mt-3 text-sm text-destructive">{err}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card shadow-[0_-4px_16px_rgba(0,0,0,0.08)]">
      {err && <p className="px-4 pt-1 text-xs text-destructive">{err}</p>}
      <div className="flex h-16 items-center gap-4 px-4">
        <BookMeta large={false} />
        <div className="hidden flex-col items-center gap-0.5 sm:flex">
          <Transport large={false} />
          <span className="text-[10px] tabular-nums text-muted-foreground">{segPos}</span>
        </div>
        <ProgressBar compact />
        <div className="hidden md:block"><VolumeAndRate /></div>
        <Button variant="ghost" size="icon" onClick={() => setExpanded(true)} title="展开">
          <ChevronUp className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **步骤 2：运行构建验证类型**

运行：`npm run build`
预期：无 `error TS`。若 `RATE_OPTIONS` 导入报错，确认 `PlayerControls.tsx` 仍导出该常量。

- [ ] **步骤 3：Commit**

```bash
git add src/components/player/PlayerDock.tsx
git commit -m "feat: 底部播放条 PlayerDock（折叠+展开双态）"
```

---

### 任务 6：App 挂载播放条 + 侧栏伸缩

**文件：**
- 修改：`src/App.tsx`

- [ ] **步骤 1：加入 import 与 resize 监听**

在 `src/App.tsx` 顶部 import 区加入：

```tsx
import { useEffect } from 'react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { PlayerDock } from '@/components/player/PlayerDock';
import { useSidebarStore } from '@/store/sidebarStore';
```

- [ ] **步骤 2：改造侧栏与主区**

把 `export default function App() { ... }` 的函数体整体替换为：

```tsx
export default function App() {
  const collapsed = useSidebarStore((s) => s.collapsed());
  const setWindowWidth = useSidebarStore((s) => s.setWindowWidth);
  const toggle = useSidebarStore((s) => s.toggle);

  useEffect(() => {
    const onResize = () => setWindowWidth(window.innerWidth);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [setWindowWidth]);

  return (
    <HashRouter>
      <div className="flex h-screen overflow-hidden bg-background text-foreground">
        <ThemeController />
        <aside
          className={`flex shrink-0 flex-col border-r bg-card transition-[width] duration-200 ${
            collapsed ? 'w-14' : 'w-52'
          }`}
        >
          <div className="flex h-14 items-center justify-between border-b px-3">
            {!collapsed && <span className="text-base font-semibold tracking-tight">TTS Aggregator</span>}
            <button
              onClick={toggle}
              title={collapsed ? '展开侧栏' : '折叠侧栏'}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </button>
          </div>
          <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-2">
            {NAV_ITEMS.map((item) => (
              <NavRow key={item.to} item={item} collapsed={collapsed} />
            ))}
          </nav>
          {!collapsed && (
            <div className="border-t px-4 py-3 text-xs text-muted-foreground">
              节点池 · SQLite 本地库
            </div>
          )}
        </aside>
        <main className="flex-1 overflow-y-auto px-8 py-8">
          <Routes>
            <Route path="/" element={<ReadPage />} />
            <Route path="/books" element={<BooksPage />} />
            <Route path="/books/:id" element={<BookDetailPage />} />
            <Route path="/nodes" element={<NodesPage />} />
            <Route path="/voices" element={<VoicesPage />} />
            <Route path="/logs" element={<LogsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
          <div className="h-20" />
        </main>
        <PlayerDock />
        <Toaster position="bottom-right" richColors />
      </div>
    </HashRouter>
  );
}
```

说明：`<div className="h-20" />` 是给底部播放条预留的占位高度，防止内容被遮挡。

- [ ] **步骤 3：改造 NavRow 支持折叠**

把现有 `NavRow` 函数整体替换为：

```tsx
function NavRow({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const playing = usePlayerStore((s) => s.status !== 'idle');
  const source = usePlayerStore((s) => s.source);
  const playerSource = source?.kind;
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      title={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
          collapsed && 'justify-center px-0',
          isActive
            ? 'bg-primary/10 font-medium text-primary'
            : 'text-muted-foreground hover:bg-accent hover:text-foreground',
        )
      }
    >
      <Icon className="h-4 w-4 shrink-0" />
      {!collapsed && <span>{item.label}</span>}
      {item.to === '/' && playing && playerSource !== 'book' && <PlayingDot />}
      {item.to === '/books' && playing && playerSource === 'book' && <PlayingDot />}
    </NavLink>
  );
}
```

- [ ] **步骤 4：运行测试与构建**

运行：`npm test`；然后 `npm run build`
预期：测试全绿；构建无 `error TS`

- [ ] **步骤 5：Commit**

```bash
git add src/App.tsx
git commit -m "feat: 侧栏手动/自动折叠并挂载底部播放条"
```

---

### 任务 7：朗读页去重

**文件：**
- 修改：`src/pages/ReadPage.tsx`

删除已被播放条接管的重复控件，保留「开始朗读」入口、文本编辑区、音色/语速/音调参数和段落列表。

- [ ] **步骤 1：精简 import**

把 `src/pages/ReadPage.tsx` 第 1-15 行的 import 区整体替换为：

```tsx
import { useRef } from 'react';
import { Play, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { PageHeader } from '@/components/PageHeader';
import { readTextFile } from '@/lib/encoding';
import { voiceDisplayName } from '@/lib/voices';
import { usePlayerStore } from '@/store/playerStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useVoicesStore } from '@/store/voicesStore';
```

- [ ] **步骤 2：删除变量与吸底播放按钮**

把第 20-23 行（`const { synth, ... }` 到 `const busy = ...`）替换为：

```tsx
  const { synth, saveSynth } = useSettingsStore();
  const { voices, load } = useVoicesStore();
  const idle = player.status === 'idle';
```

把第 96-114 行（吸底工具条右侧的 `ml-auto` 播放按钮组）整段删除。

- [ ] **步骤 3：删除重复进度/音量/倍速块**

删除第 118-158 行（`{/* 进度/音量/倍速 */}` 到该 JSX 块结束）。

- [ ] **步骤 4：运行测试与构建**

运行：`npm test`；然后 `npm run build`
预期：测试全绿；构建无 `error TS`。若 tsc 报未使用变量，说明第 2 步的解构未改全，按报错删掉多余变量。

- [ ] **步骤 5：Commit**

```bash
git add src/pages/ReadPage.tsx
git commit -m "refactor: 朗读页播放控制收敛到底部播放条"
```

---

### 任务 8：书籍详情页去重并写入上下文

**文件：**
- 修改：`src/pages/BookDetailPage.tsx`

- [ ] **步骤 1：精简 import**

把第 1-21 行 import 区中这几行删除：

```tsx
import { PlayerControls } from '@/components/player/PlayerControls';
```

并加入：

```tsx
import { useNowPlayingStore } from '@/store/nowPlayingStore';
```

- [ ] **步骤 2：加载 TOC 时写入章节标题，并卸载时清理**

把第 43 行的 TOC 加载 effect 替换为：

```tsx
  useEffect(() => { void deps().books.getToc(id).then(setToc); }, [id]);

  useEffect(() => {
    const cur = useNowPlayingStore.getState().current;
    if (cur && cur.bookId === id && book) {
      useNowPlayingStore.getState().set({
        ...cur,
        title: book.title,
        chapterCount: book.chapterCount,
      });
    }
    return () => { useNowPlayingStore.getState().set(null); };
  }, [id, book]);
```

- [ ] **步骤 3：删除内嵌播放器面板**

把第 108-130 行（`{/* 右：播放器 */}` 到该块结束）整体替换为：

```tsx
        {/* 右：提示 */}
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
            <p>点击左侧目录中的任意章节即可开始朗读，播放控制在底部播放条。</p>
            <p className="mt-2">当前章节进度会在播放时自动保存，下次可从断点继续。</p>
          </div>
        </div>
```

并把第 111-122 行的「继续听 / 从第一章开始」按钮组移到顶栏右侧（改名/删除按钮之前），以保留续播入口：

```tsx
        {!playing && (
          <Button onClick={() => startFrom(book, hasProgress)}>
            {hasProgress ? `继续听 第 ${book.lastChapter + 1} 章` : '从头开始听'}
          </Button>
        )}
```

- [ ] **步骤 4：运行测试与构建**

运行：`npm test`；然后 `npm run build`
预期：测试全绿；构建无 `error TS`

- [ ] **步骤 5：Commit**

```bash
git add src/pages/BookDetailPage.tsx
git commit -m "refactor: 详情页播放控制移至底部播放条并写入 nowPlaying"
```

---

### 任务 9：删除废弃的 PlayerControls

**文件：**
- 删除：`src/components/player/PlayerControls.tsx`

注意：本文件仍导出 `RATE_OPTIONS`，被 `PlayerDock` 使用。删除前先把常量迁出。

- [ ] **步骤 1：创建共享常量文件**

创建 `src/components/player/rates.ts`：

```ts
export const RATE_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2];
```

- [ ] **步骤 2：把 PlayerDock 的导入改指向新文件**

在 `src/components/player/PlayerDock.tsx` 中，把

```tsx
import { RATE_OPTIONS } from '@/components/player/PlayerControls';
```

改为：

```tsx
import { RATE_OPTIONS } from '@/components/player/rates';
```

- [ ] **步骤 3：确认无残留引用后删除文件**

运行：`npm run build`
预期：无 `error TS`，证明无其它文件仍引用 `PlayerControls`

然后删除文件：

```bash
git rm src/components/player/PlayerControls.tsx
```

- [ ] **步骤 4：运行测试与构建**

运行：`npm test`；然后 `npm run build`
预期：测试全绿；构建无 `error TS`

- [ ] **步骤 5：Commit**

```bash
git add src/components/player/rates.ts
git commit -m "refactor: 抽出 RATE_OPTIONS 并删除废弃的 PlayerControls"
```

（`PlayerControls.tsx` 的删除已在上一步 `git rm` 完成，随本 commit 一并入库。）

---

## 自检记录

- **规格覆盖度：** 播放条折叠态/展开态（任务 5）、侧栏三态与手动优先（任务 1、2、6）、nowPlaying 上下文（任务 3、4、8）、朗读页与详情页去重（任务 7、8）、错误显示与 `duration<=0` 占位（任务 5 的 `ProgressBar`/`err` 分支）均有对应任务。
- **占位符扫描：** 无「待定/TODO/后续实现」；所有代码步骤给出完整代码块。
- **类型一致性：** `resolveCollapsed(width, manual, threshold)` 在任务 1 定义、任务 2 引用一致；`NowPlaying` 字段在任务 3 定义、任务 4 写入、任务 5 读取一致；`RATE_OPTIONS` 在任务 9 迁移后引用路径一致。
