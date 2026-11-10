# 配色、数据页、音色页与语音预生成实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 为桌面端补齐三套配色、数据页统计与清空日志、搜索优先的音色页（含风格），并用内存窗口预取消除连续朗读停顿。

**架构：** 配色作为 `AppPrefs.palette` 与主题正交；音色页把过滤/分组/最近常用抽到纯函数 `lib/voiceFilter.ts`；预取抽到可注入的 `lib/prefetch.ts`，playerStore 只负责调度；分段上限降到 150 字以兼容 LEGACY 节点的 GET 请求。

**技术栈：** React 19、TypeScript、Zustand、Tailwind 4、Vitest、Tauri 2。

**规格：** `docs/superpowers/specs/2026-11-10-palette-voices-prefetch-design.md`

---

## 文件结构

| 文件 | 职责 |
| --- | --- |
| `src/types/models.ts` | `PaletteId`、`AppPrefs.palette`、`SynthSettings.style`、默认值与归一化 |
| `src/lib/palette.ts` | 配色元数据、`applyPalette` |
| `src/lib/theme.ts` | 主题解析与 `mirrorPrefs` |
| `src/components/ThemeController.tsx` | 应用主题与配色 |
| `index.html` | 首屏防闪：读 localStorage 设置 `.dark` 与 `data-palette` |
| `src/index.css` | 青瓷/胡桃令牌 |
| `src/App.tsx` | 侧栏 `PaletteSwitch` |
| `src/pages/SettingsPage.tsx` | 外观配色行、风格选择行、试听使用 `synth.style` |
| `src/components/settings/DataSection.tsx` | 数据库统计与清空日志 |
| `src/lib/voiceFilter.ts` | 音色过滤、分组、最近常用 |
| `src/lib/voices.ts` | 风格中文名 |
| `src/pages/VoicesPage.tsx` | 搜索优先的音色页 |
| `src/lib/split.ts` | 默认分段 150 字 |
| `src/lib/prefetch.ts` | 预取窗口 |
| `src/store/playerStore.ts` | 接入预取窗口 |
| `src/store/poolDeps.ts` | `style` 贯通 |
| 对应 `*.test.ts` | 单元测试 |

---

## 任务 1：配色数据模型与主题应用

**文件：**
- 修改：`src/types/models.ts:43-59`、`src/types/models.ts:107-165`
- 创建：`src/lib/palette.ts`
- 修改：`src/lib/theme.ts`
- 修改：`src/store/settingsStore.ts`
- 修改：`src/components/ThemeController.tsx`
- 修改：`index.html`
- 创建：`src/lib/palette.test.ts`、`src/types/models.test.ts`

- [x] **步骤 1：编写失败测试**

创建 `src/lib/palette.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { PALETTES, applyPalette, isPaletteId } from './palette';

describe('palette', () => {
  it('三套配色元数据完整', () => {
    expect(PALETTES.map((p) => p.id)).toEqual(['ink', 'celadon', 'walnut']);
    for (const p of PALETTES) {
      expect(p.label.length).toBeGreaterThan(0);
      expect(p.swatch).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('isPaletteId 只接受白名单', () => {
    expect(isPaletteId('ink')).toBe(true);
    expect(isPaletteId('celadon')).toBe(true);
    expect(isPaletteId('walnut')).toBe(true);
    expect(isPaletteId('blue')).toBe(false);
    expect(isPaletteId(null)).toBe(false);
  });

  it('applyPalette 写入 data-palette', () => {
    const root = { dataset: {} } as unknown as HTMLElement;
    applyPalette('walnut', root);
    expect(root.dataset.palette).toBe('walnut');
  });
});
```

创建 `src/types/models.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_APP_PREFS, DEFAULT_SYNTH, normalizeAppPrefs, normalizeSynth } from './models';

describe('normalizeAppPrefs', () => {
  it('合法 palette 保留', () => {
    expect(normalizeAppPrefs({ palette: 'celadon' }).palette).toBe('celadon');
    expect(normalizeAppPrefs({ palette: 'walnut' }).palette).toBe('walnut');
  });

  it('缺失或非法 palette 回退墨绿', () => {
    expect(normalizeAppPrefs({}).palette).toBe('ink');
    expect(normalizeAppPrefs({ palette: 'blue' }).palette).toBe('ink');
    expect(normalizeAppPrefs(null).palette).toBe(DEFAULT_APP_PREFS.palette);
  });
});

describe('normalizeSynth', () => {
  it('style 合法字符串保留', () => {
    expect(normalizeSynth({ style: 'cheerful' }).style).toBe('cheerful');
  });

  it('style 缺失或非法回退空串', () => {
    expect(normalizeSynth({}).style).toBe('');
    expect(normalizeSynth({ style: 42 }).style).toBe('');
    expect(normalizeSynth(null)).toEqual(DEFAULT_SYNTH);
  });
});
```

- [x] **步骤 2：运行测试验证失败**

运行：`npm test -- src/lib/palette.test.ts src/types/models.test.ts`
预期：FAIL，报错 `Failed to resolve import "./palette"` 或缺少 `palette` 属性。

- [x] **步骤 3：实现调色板元数据**

创建 `src/lib/palette.ts`：

```ts
import type { PaletteId } from '../types/models';

export interface PaletteMeta {
  id: PaletteId;
  label: string;
  hint: string;
  swatch: string;
}

export const PALETTES: PaletteMeta[] = [
  { id: 'ink', label: '墨绿', hint: '墨绿 · 纸白', swatch: '#4f7259' },
  { id: 'celadon', label: '青瓷', hint: '青瓷 · 瓷青', swatch: '#3f726b' },
  { id: 'walnut', label: '胡桃', hint: '胡桃 · 书房', swatch: '#7b5c3b' },
];

const IDS = new Set<string>(PALETTES.map((p) => p.id));

export function isPaletteId(value: unknown): value is PaletteId {
  return typeof value === 'string' && IDS.has(value);
}

export function applyPalette(palette: PaletteId, root: HTMLElement = document.documentElement): void {
  root.dataset.palette = palette;
}
```

- [x] **步骤 4：扩展数据模型**

在 `src/types/models.ts` 中：

```ts
export type PaletteId = 'ink' | 'celadon' | 'walnut';

export interface SynthSettings { rate: number; pitch: number; voice: string; style: string }

export interface AppPrefs {
  probeConcurrency: number;
  theme: ThemeMode;
  palette: PaletteId;
  playbackRate: number;
  volume: number;
  failThreshold: number;
  cooldownMinutes: number;
  autoTestOnLaunch: boolean;
  sleepMinutes: number;
  resumeLast: boolean;
}
```

默认值：

```ts
export const DEFAULT_SYNTH: SynthSettings = { rate: 0, pitch: 0, voice: '', style: '' };
export const DEFAULT_APP_PREFS: AppPrefs = {
  probeConcurrency: 4,
  theme: 'system',
  palette: 'ink',
  playbackRate: 1,
  volume: 100,
  failThreshold: 3,
  cooldownMinutes: 10,
  autoTestOnLaunch: false,
  sleepMinutes: 0,
  resumeLast: true,
};
```

`normalizeAppPrefs` 增加：

```ts
palette: isPaletteId(o.palette) ? o.palette : DEFAULT_APP_PREFS.palette,
```

文件顶部导入：

```ts
import { isPaletteId } from '../lib/palette';
```

`normalizeSynth` 增加：

```ts
style: typeof o.style === 'string' ? o.style : '',
```

- [x] **步骤 5：主题镜像与首屏应用**

修改 `src/lib/theme.ts`，把 `mirrorTheme` 替换为：

```ts
export function mirrorPrefs(prefs: { theme: ThemeMode; palette: PaletteId }): void {
  try {
    localStorage.setItem('app_prefs', JSON.stringify({ theme: prefs.theme, palette: prefs.palette }));
  } catch {
    /* 隐私模式或存储禁用时忽略 */
  }
}
```

导入 `PaletteId`：

```ts
import type { PaletteId, ThemeMode } from '../types/models';
```

修改 `src/store/settingsStore.ts`：

```ts
import { mirrorPrefs } from '../lib/theme';
```

`load()` 结尾：

```ts
const prefs = get().appPrefs;
mirrorPrefs({ theme: prefs.theme, palette: prefs.palette });
```

`saveAppPrefs` 中：

```ts
mirrorPrefs({ theme: appPrefs.theme, palette: appPrefs.palette });
```

修改 `src/components/ThemeController.tsx`：

```tsx
import { applyTheme, resolveTheme, watchSystemTheme } from '@/lib/theme';
import { applyPalette } from '@/lib/palette';
import { useSettingsStore } from '@/store/settingsStore';

export function ThemeController() {
  const theme = useSettingsStore((s) => s.appPrefs.theme);
  const palette = useSettingsStore((s) => s.appPrefs.palette);
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
  );
  useEffect(() => watchSystemTheme(setSystemDark), []);
  useEffect(() => {
    applyTheme(resolveTheme(theme, systemDark));
  }, [theme, systemDark]);
  useEffect(() => {
    applyPalette(palette);
  }, [palette]);
  return null;
}
```

修改 `index.html` 的首屏脚本：

```html
<script>
  (function () {
    try {
      var raw = localStorage.getItem('app_prefs');
      var prefs = raw ? JSON.parse(raw) : {};
      var theme = prefs.theme || 'system';
      var palette = prefs.palette || 'ink';
      var dark = theme === 'dark'
        || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      document.documentElement.classList.toggle('dark', dark);
      document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
      document.documentElement.dataset.palette = palette;
    } catch (e) {
      /* 解析失败：保持默认墨绿浅色 */
    }
  })();
</script>
```

- [x] **步骤 6：运行测试验证通过**

运行：`npm test -- src/lib/palette.test.ts src/types/models.test.ts`
预期：PASS。

- [x] **步骤 7：类型检查**

运行：`npx tsc --noEmit`
预期：通过（若 `configTransfer.test.ts` 等因 `DEFAULT_SYNTH` 新增字段报错，属于类型补齐，下一步统一修复）。

- [x] **步骤 8：Commit**

```bash
git add src/types/models.ts src/lib/palette.ts src/lib/palette.test.ts src/types/models.test.ts src/lib/theme.ts src/store/settingsStore.ts src/components/ThemeController.tsx index.html
git commit -m "feat(theme): 增加配色数据模型与主题应用"
```

---

## 任务 2：配色令牌与侧栏入口

**文件：**
- 修改：`src/index.css:48-77`（`.dark` 块之后）
- 修改：`src/App.tsx:1-11`、`src/App.tsx:70-190`、`src/App.tsx:330-345`
- 修改：`src/pages/SettingsPage.tsx`（外观区）

- [x] **步骤 1：增加配色令牌**

在 `src/index.css` 的 `.dark { ... }` 块之后加入：

```css
html[data-palette='celadon'] {
  --primary: #7fa8a1;
  --primary-foreground: #0f1a19;
  --ring: #7fa8a1;
  --highlight: rgba(127, 168, 161, 0.16);
}

html[data-palette='celadon']:not(.dark) {
  --primary: #3f726b;
  --primary-foreground: #f6faf8;
  --ring: #3f726b;
  --highlight: rgba(63, 114, 107, 0.11);
}

html[data-palette='walnut'] {
  --primary: #b99a74;
  --primary-foreground: #1c140d;
  --ring: #b99a74;
  --highlight: rgba(185, 154, 116, 0.18);
}

html[data-palette='walnut']:not(.dark) {
  --primary: #7b5c3b;
  --primary-foreground: #fbf7f1;
  --ring: #7b5c3b;
  --highlight: rgba(123, 92, 59, 0.11);
}
```

- [x] **步骤 2：在 App.tsx 增加 PaletteSwitch**

`src/App.tsx` 顶部补充导入：

```tsx
import { Check, ChevronDown, Headphones, Menu, Monitor, Moon, PanelLeftClose, PanelLeftOpen, Sun } from 'lucide-react';
import { PALETTES, type PaletteMeta } from '@/lib/palette';
import type { PaletteId, ThemeMode } from '@/types/models';
```

在 `ThemeSwitch` 函数之前加入：

```tsx
function PaletteOptions({ onPick, current }: { onPick: (id: PaletteId) => void; current: PaletteId }) {
  return (
    <>
      {PALETTES.map((p: PaletteMeta) => (
        <button
          key={p.id}
          type="button"
          onClick={() => onPick(p.id)}
          className={cn(
            'flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors',
            current === p.id
              ? 'bg-primary/10 text-foreground'
              : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground',
          )}
        >
          <span
            className="h-3.5 w-3.5 shrink-0 rounded-full border border-black/10"
            style={{ background: p.swatch }}
          />
          <span className="min-w-0">
            <span className="block text-[11.5px] font-medium">{p.label}</span>
            <span className="block text-[9.5px] text-faint">{p.hint}</span>
          </span>
          {current === p.id && <Check className="ml-auto h-3.5 w-3.5 text-primary" />}
        </button>
      ))}
    </>
  );
}

function PaletteSwitch({ rail }: { rail: boolean }) {
  const appPrefs = useSettingsStore((s) => s.appPrefs);
  const saveAppPrefs = useSettingsStore((s) => s.saveAppPrefs);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = PALETTES.find((p) => p.id === appPrefs.palette) ?? PALETTES[0];

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const pick = (id: PaletteId) => {
    void saveAppPrefs({ ...appPrefs, palette: id });
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={`配色：${current.label}`}
        aria-label="选择配色"
        aria-expanded={open}
        className={cn(
          'flex w-full items-center gap-2 rounded-[9px] border border-line bg-surface-2 text-muted-foreground hover:border-line-strong hover:text-foreground',
          rail ? 'h-[34px] justify-center' : 'h-[34px] px-2.5',
        )}
      >
        <span
          className="h-3.5 w-3.5 shrink-0 rounded-full border border-black/10"
          style={{ background: current.swatch }}
        />
        {!rail && <span className="text-[11.5px]">{current.label}</span>}
        {!rail && <ChevronDown className="ml-auto h-3.5 w-3.5" />}
      </button>
      {open && (
        <div
          className={cn(
            'absolute z-[70] rounded-xl border border-line bg-popover p-1.5 shadow-xl',
            rail
              ? 'bottom-0 left-[calc(100%+10px)] w-44'
              : 'bottom-[calc(100%+8px)] left-0 w-full',
          )}
        >
          <div className="px-2 pb-1.5 pt-1 text-[9.5px] uppercase tracking-[0.14em] text-faint">显示配色</div>
          <PaletteOptions onPick={pick} current={appPrefs.palette} />
        </div>
      )}
    </div>
  );
}
```

在侧栏底部，把：

```tsx
<div className={cn('mt-auto flex flex-col gap-2.5 border-t border-line py-3.5', rail ? 'px-3' : 'px-3.5')}>
  <ThemeSwitch rail={rail} />
```

改为：

```tsx
<div className={cn('mt-auto flex flex-col gap-2.5 border-t border-line py-3.5', rail ? 'px-3' : 'px-3.5')}>
  <PaletteSwitch rail={rail} />
  <ThemeSwitch rail={rail} />
```

- [x] **步骤 3：设置页增加配色行**

在 `src/pages/SettingsPage.tsx` 中导入：

```tsx
import { PALETTES } from '@/lib/palette';
```

在「主题」`SetCard` 的第一个 `SetRow` 之后加入：

```tsx
<SetRow
  stacked
  title="界面配色"
  desc="主色系与主题相互独立，配色不会改变明暗。"
  control={
    <div className="flex flex-wrap gap-2">
      {PALETTES.map((p) => (
        <button
          key={p.id}
          type="button"
          aria-pressed={appPrefs.palette === p.id}
          onClick={() => void saveAppPrefs({ ...appPrefs, palette: p.id })}
          className={cn(
            'flex items-center gap-2 rounded-[10px] border bg-surface-2 px-3 py-2 text-[11px] transition-colors',
            appPrefs.palette === p.id
              ? 'border-primary text-foreground shadow-[0_0_0_2px_var(--highlight)]'
              : 'border-line text-muted-foreground hover:border-line-strong hover:text-foreground',
          )}
        >
          <span className="h-3.5 w-3.5 rounded-full border border-black/10" style={{ background: p.swatch }} />
          {p.label}
          {appPrefs.palette === p.id && <Check className="h-3 w-3 text-primary" />}
        </button>
      ))}
    </div>
  }
/>
```

- [x] **步骤 4：运行构建验证**

运行：`npm run build`
预期：通过。

- [x] **步骤 5：人工检查**

运行：`npm run tauri dev`，进入任意页面。
预期：侧栏出现「墨绿」按钮，切换三套配色后主色/选中态同步变化；刷新后保持；切深色/浅色只改明暗。

- [x] **步骤 6：Commit**

```bash
git add src/index.css src/App.tsx src/pages/SettingsPage.tsx
git commit -m "feat(theme): 三套配色令牌与侧栏配色入口"
```

---

## 任务 3：数据页统计与清空日志

**文件：**
- 修改：`src/components/settings/DataSection.tsx`

- [x] **步骤 1：补充导入与状态**

`src/components/settings/DataSection.tsx` 顶部：

```tsx
import { useEffect, useState, type ReactNode } from 'react';
import { Database, Download, Upload } from 'lucide-react';
import { open, save } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  buildConfigFile, mergeImportedNode, parseConfigFile,
} from '@/lib/configTransfer';
import { normalizeBaseUrl } from '@/types/models';
import { deps } from '@/store/deps';
import { notifyShare } from '@/store/shareSync';
import { useLogsStore } from '@/store/logsStore';
import { useNodesStore } from '@/store/nodesStore';
import { useSettingsStore } from '@/store/settingsStore';
```

组件内新增：

```tsx
const [stats, setStats] = useState<{ books: number; chapters: number } | null>(null);
const [clearing, setClearing] = useState(false);

useEffect(() => {
  let alive = true;
  void deps().books.list()
    .then((books) => {
      if (!alive) return;
      setStats({
        books: books.length,
        chapters: books.reduce((sum, b) => sum + b.chapterCount, 0),
      });
    })
    .catch((e: unknown) => {
      console.warn('读取数据库统计失败', e);
    });
  return () => { alive = false; };
}, []);

async function onClearLogs(): Promise<void> {
  setClearing(true);
  try {
    await useLogsStore.getState().clear();
    toast.success('已清空全部日志');
  } catch (e) {
    toast.error(e instanceof Error ? e.message : String(e));
  } finally {
    setClearing(false);
  }
}
```

- [x] **步骤 2：渲染数据库卡片与危险操作**

在「配置迁移」卡片之后、`</section>` 之前加入：

```tsx
<div className="mb-3.5 rounded-[13px] border border-line bg-card px-[18px] py-1">
  <div className="pb-0.5 pt-3.5 text-[12px] font-semibold">数据库</div>
  <Row
    title="本地数据库"
    desc="书库、章节与朗读进度。"
    control={
      <Badge variant="secondary" className="num gap-1.5 px-2.5 py-1 text-[11px]">
        <Database className="h-3.5 w-3.5" />
        {stats ? `${stats.books} 本书 · ${stats.chapters} 章` : '—'}
      </Badge>
    }
  />
</div>

<div className="mb-3.5 rounded-[13px] border border-line bg-card px-[18px] py-1">
  <div className="pb-0.5 pt-3.5 text-[12px] font-semibold text-destructive">危险操作</div>
  <Row
    title="清空调用日志"
    desc="删除全部调用记录，不影响节点与书库。"
    control={
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="destructive" disabled={clearing}>
            {clearing ? '清空中…' : '清空日志'}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>清空全部调用日志？</AlertDialogTitle>
            <AlertDialogDescription>
              此操作不可恢复。节点、书库与朗读进度不会被删除。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void onClearLogs()}>
              确认清空
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    }
  />
</div>
```

- [x] **步骤 3：构建验证**

运行：`npm run build`
预期：通过。

- [x] **步骤 4：人工检查**

运行：`npm run tauri dev`，进入 设置 → 数据。
预期：显示真实书数与章节数；清空日志需二次确认，确认后日志页为空。

- [x] **步骤 5：Commit**

```bash
git add src/components/settings/DataSection.tsx
git commit -m "feat(settings): 数据页增加数据库统计与清空日志"
```

---

## 任务 4：音色风格贯通

**文件：**
- 修改：`src/store/poolDeps.ts:36-40`
- 修改：`src/pages/SettingsPage.tsx:150-260`
- 修改：`src/pages/ReadPage.tsx:135-145`

- [x] **步骤 1：poolDeps 使用 synth.style**

`src/store/poolDeps.ts`：

```ts
export function currentPrefs(): SynthPrefs {
  const s = useSettingsStore.getState().synth;
  return { voice: s.voice, rate: s.rate, pitch: s.pitch, style: s.style };
}
```

- [x] **步骤 2：设置页试听与风格行**

`src/pages/SettingsPage.tsx` 试听调用改为：

```ts
const { bytes } = await synthesizeText('你好，这是一段试听。', {
  voice: synth.voice, rate: synth.rate, pitch: synth.pitch, style: synth.style,
});
```

在组件内计算当前音色：

```tsx
const voiceStyles = voices.find((v) => v.id === synth.voice)?.styles ?? [];
```

在「朗读音色」`SetRow` 之后加入：

```tsx
<SetRow
  title="风格"
  desc={voiceStyles.length
    ? `当前 ${synth.style || '默认风格'}，部分节点可能忽略该参数。`
    : '当前音色没有可选风格。'}
  control={
    <Select
      value={synth.style || 'default-style'}
      onValueChange={(v) => void saveSynth({ ...synth, style: v === 'default-style' ? '' : v })}
      disabled={voiceStyles.length === 0}
    >
      <SelectTrigger className="w-[190px]"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="default-style">默认风格</SelectItem>
        {voiceStyles.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
      </SelectContent>
    </Select>
  }
/>
```

音色变更时清空风格：

```tsx
onValueChange={(v) => void saveSynth({ ...synth, voice: v === 'node-default' ? '' : v, style: '' })}
```

- [x] **步骤 3：朗读页音色变更清空风格**

`src/pages/ReadPage.tsx`：

```tsx
onValueChange={(v) => void saveSynth({ ...synth, voice: v === 'node-default' ? '' : v, style: '' })}
```

- [x] **步骤 4：运行测试与构建**

运行：`npm test -- src/lib/configTransfer.test.ts src/types/models.test.ts`
预期：PASS。

运行：`npm run build`
预期：通过。

- [x] **步骤 5：Commit**

```bash
git add src/store/poolDeps.ts src/pages/SettingsPage.tsx src/pages/ReadPage.tsx
git commit -m "feat(synth): 音色风格贯通设置与朗读"
```

---

## 任务 5：音色过滤与最近常用纯函数

**文件：**
- 修改：`src/lib/voices.ts`
- 创建：`src/lib/voiceFilter.ts`
- 创建：`src/lib/voiceFilter.test.ts`

- [x] **步骤 1：编写失败测试**

创建 `src/lib/voiceFilter.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import type { Voice } from '../types/models';
import {
  filterVoices, groupByLanguage, languageBucket, pushRecentVoice, readRecentVoices,
} from './voiceFilter';

function voice(id: string, name: string, locale: string, gender = 'Female', styles: string[] | null = null): Voice {
  return { id, name, localName: '', gender, locale, styles };
}

const VOICES: Voice[] = [
  voice('zh-CN-XiaoxiaoNeural', 'Xiaoxiao', 'zh-CN', 'Female', ['cheerful', 'sad']),
  voice('zh-CN-YunxiNeural', 'Yunxi', 'zh-CN', 'Male'),
  voice('en-US-AriaNeural', 'Aria', 'en-US'),
  voice('ja-JP-NanamiNeural', 'Nanami', 'ja-JP'),
  voice('de-DE-KatjaNeural', 'Katja', 'de-DE'),
];

describe('languageBucket', () => {
  it('按 locale 前缀归类', () => {
    expect(languageBucket('zh-CN')).toBe('zh');
    expect(languageBucket('en-US')).toBe('en');
    expect(languageBucket('ja-JP')).toBe('ja');
    expect(languageBucket('ko-KR')).toBe('ko');
    expect(languageBucket('de-DE')).toBe('other');
  });
});

describe('filterVoices', () => {
  it('按名称或 ID 搜索，忽略大小写', () => {
    expect(filterVoices(VOICES, { query: 'aria', language: 'all', gender: '' })).toHaveLength(1);
    expect(filterVoices(VOICES, { query: 'YUNXI', language: 'all', gender: '' })).toHaveLength(1);
  });

  it('语言与性别组合筛选', () => {
    expect(filterVoices(VOICES, { query: '', language: 'zh', gender: 'Female' })[0].id)
      .toBe('zh-CN-XiaoxiaoNeural');
    expect(filterVoices(VOICES, { query: '', language: 'other', gender: '' })[0].id)
      .toBe('de-DE-KatjaNeural');
  });
});

describe('groupByLanguage', () => {
  it('中文优先，其余按数量降序', () => {
    const groups = groupByLanguage(VOICES);
    expect(groups[0].bucket).toBe('zh');
    expect(groups[0].voices).toHaveLength(2);
    expect(groups.map((g) => g.bucket)).toEqual(['zh', 'en', 'ja', 'other']);
  });
});

describe('recent voices', () => {
  function fakeStorage(initial: string | null = null) {
    let value = initial;
    return {
      getItem: () => value,
      setItem: (_k: string, v: string) => { value = v; },
    };
  }

  it('读取时过滤非法值并去重', () => {
    const s = fakeStorage(JSON.stringify(['a', 'a', 3, 'b']));
    expect(readRecentVoices(s)).toEqual(['a', 'b']);
  });

  it('写入后最近在前且最多 8 个', () => {
    const s = fakeStorage(JSON.stringify(['a', 'b']));
    expect(pushRecentVoice(s, 'c')).toEqual(['c', 'a', 'b']);
    const many = Array.from({ length: 10 }, (_, i) => `v${i}`);
    const s2 = fakeStorage(JSON.stringify(many));
    expect(pushRecentVoice(s2, 'x')).toHaveLength(8);
    expect(pushRecentVoice(s2, 'x')[0]).toBe('x');
  });

  it('重复写入不产生重复项', () => {
    const s = fakeStorage(JSON.stringify(['a', 'b']));
    expect(pushRecentVoice(s, 'b')).toEqual(['b', 'a']);
  });
});
```

- [x] **步骤 2：运行测试验证失败**

运行：`npm test -- src/lib/voiceFilter.test.ts`
预期：FAIL，报错 `Failed to resolve import "./voiceFilter"`。

- [x] **步骤 3：实现 voiceFilter**

创建 `src/lib/voiceFilter.ts`：

```ts
import type { Voice } from '../types/models';
import { voiceDisplayName } from './voices';

export type LanguageBucket = 'zh' | 'en' | 'ja' | 'ko' | 'other';

export const LANGUAGE_OPTIONS: { value: LanguageBucket | 'all'; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'zh', label: '中文' },
  { value: 'en', label: '英语' },
  { value: 'ja', label: '日语' },
  { value: 'ko', label: '韩语' },
  { value: 'other', label: '其他' },
];

export const LANGUAGE_LABELS: Record<LanguageBucket, string> = {
  zh: '中文',
  en: '英语',
  ja: '日语',
  ko: '韩语',
  other: '其他语言',
};

export interface VoiceFilterInput {
  query: string;
  language: LanguageBucket | 'all';
  gender: '' | 'Female' | 'Male';
}

export function languageBucket(locale: string): LanguageBucket {
  const l = locale.toLowerCase();
  if (l.startsWith('zh')) return 'zh';
  if (l.startsWith('en')) return 'en';
  if (l.startsWith('ja')) return 'ja';
  if (l.startsWith('ko')) return 'ko';
  return 'other';
}

export function filterVoices(voices: Voice[], filter: VoiceFilterInput): Voice[] {
  const q = filter.query.trim().toLowerCase();
  return voices.filter((v) => {
    if (filter.language !== 'all' && languageBucket(v.locale) !== filter.language) return false;
    if (filter.gender && v.gender !== filter.gender) return false;
    if (!q) return true;
    return voiceDisplayName(v).toLowerCase().includes(q) || v.id.toLowerCase().includes(q);
  });
}

export interface VoiceGroup {
  bucket: LanguageBucket;
  label: string;
  voices: Voice[];
}

export function groupByLanguage(voices: Voice[]): VoiceGroup[] {
  const map = new Map<LanguageBucket, Voice[]>();
  for (const v of voices) {
    const bucket = languageBucket(v.locale);
    const list = map.get(bucket);
    if (list) list.push(v);
    else map.set(bucket, [v]);
  }
  const groups: VoiceGroup[] = [...map.entries()].map(([bucket, list]) => ({
    bucket,
    label: LANGUAGE_LABELS[bucket],
    voices: [...list].sort((a, b) =>
      voiceDisplayName(a).localeCompare(voiceDisplayName(b)) || a.locale.localeCompare(b.locale)),
  }));
  return groups.sort((a, b) => {
    if (a.bucket === 'zh') return -1;
    if (b.bucket === 'zh') return 1;
    return b.voices.length - a.voices.length || a.bucket.localeCompare(b.bucket);
  });
}

export const RECENT_KEY = 'voice_recent';
const RECENT_LIMIT = 8;

interface ReadableStorage {
  getItem(key: string): string | null;
}

interface WritableStorage extends ReadableStorage {
  setItem(key: string, value: string): void;
}

export function readRecentVoices(storage: ReadableStorage): string[] {
  try {
    const raw = storage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.filter((x): x is string => typeof x === 'string'))].slice(0, RECENT_LIMIT);
  } catch {
    return [];
  }
}

export function pushRecentVoice(storage: WritableStorage, id: string): string[] {
  const next = [id, ...readRecentVoices(storage).filter((x) => x !== id)].slice(0, RECENT_LIMIT);
  try {
    storage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* 存储禁用时只返回内存结果 */
  }
  return next;
}
```

- [x] **步骤 4：风格中文名**

在 `src/lib/voices.ts` 末尾加入：

```ts
const STYLE_NAME_ZH: Record<string, string> = {
  assistant: '助手',
  chat: '闲聊',
  customerservice: '客服',
  newscast: '新闻',
  affectionate: '亲切',
  angry: '生气',
  calm: '平静',
  cheerful: '愉快',
  disgruntled: '不满',
  fearful: '恐惧',
  gentle: '温柔',
  lyrical: '抒情',
  sad: '悲伤',
  serious: '严肃',
  poetry: '诗歌',
  hopeful: '希望',
  shouting: '喊叫',
  terrified: '惊恐',
  unfriendly: '冷淡',
  whispering: '耳语',
  excited: '兴奋',
  friendly: '友好',
  empathetic: '共情',
  narration: '旁白',
  'documentary-narration': '纪录片旁白',
  'sports-commentary': '体育解说',
};

export function styleDisplayName(style: string): string {
  return STYLE_NAME_ZH[style] ?? style;
}
```

- [x] **步骤 5：运行测试验证通过**

运行：`npm test -- src/lib/voiceFilter.test.ts src/lib/voices.test.ts`
预期：PASS。

- [x] **步骤 6：Commit**

```bash
git add src/lib/voiceFilter.ts src/lib/voiceFilter.test.ts src/lib/voices.ts
git commit -m "feat(voices): 音色过滤、分组与最近常用纯函数"
```

---

## 任务 6：音色页重做

**文件：**
- 重写：`src/pages/VoicesPage.tsx`

- [x] **步骤 1：编写新页面**

用以下内容完整替换 `src/pages/VoicesPage.tsx`：

```tsx
import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, Pause, Play, RefreshCw, Search, Volume2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/PageHeader';
import { playAudition, stopAudition } from '@/lib/audition';
import { styleDisplayName, voiceDisplayName } from '@/lib/voices';
import {
  LANGUAGE_OPTIONS, filterVoices, groupByLanguage, pushRecentVoice, readRecentVoices,
  type LanguageBucket,
} from '@/lib/voiceFilter';
import { synthesizeText } from '@/store/poolDeps';
import { useSettingsStore } from '@/store/settingsStore';
import { useVoicesStore } from '@/store/voicesStore';
import type { Voice } from '@/types/models';

const PAGE_SIZE = 60;

const GENDER_OPTIONS: { value: '' | 'Female' | 'Male'; label: string }[] = [
  { value: '', label: '全部' },
  { value: 'Female', label: '女' },
  { value: 'Male', label: '男' },
];

function genderLabel(gender: string): string {
  if (gender === 'Female') return '女';
  if (gender === 'Male') return '男';
  return gender;
}

function VoiceRow({ v, isDefault, defaultStyle, auditioningKey, onAudition, onSetDefault }: {
  v: Voice;
  isDefault: boolean;
  defaultStyle: string;
  auditioningKey: string | null;
  onAudition: (style: string) => void;
  onSetDefault: (style: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState(isDefault ? defaultStyle : '');
  const styles = v.styles ?? [];
  const busy = auditioningKey === `${v.id}:${style}`;
  const hasStyles = styles.length > 0;

  return (
    <div className="px-4 py-3 transition-colors hover:bg-surface-2">
      <div className="grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-3 md:grid-cols-[36px_minmax(0,210px)_1fr_auto_auto_24px]">
        <div className="grid h-9 w-9 place-items-center rounded-[9px] border border-line bg-surface-2 text-[13px] font-semibold text-muted-foreground">
          {voiceDisplayName(v).slice(0, 1) || '音'}
        </div>
        <div className="min-w-0">
          <div className="truncate text-[12.5px] font-semibold">{voiceDisplayName(v)}</div>
          <div className="truncate font-mono text-[10px] text-faint">{v.id}</div>
        </div>
        <div className="hidden min-w-0 flex-wrap gap-1.5 md:flex">
          <span className="inline-flex h-[21px] items-center rounded-md border border-line bg-surface-2 px-1.5 text-[10px] text-muted-foreground">{v.locale}</span>
          <span className="inline-flex h-[21px] items-center rounded-md border border-line bg-surface-2 px-1.5 text-[10px] text-muted-foreground">{genderLabel(v.gender)}</span>
          <span className="inline-flex h-[21px] items-center rounded-md border border-line bg-surface-2 px-1.5 text-[10px] text-muted-foreground">
            {hasStyles ? `${styles.length} 种风格` : '无风格'}
          </span>
        </div>
        <div className="hidden w-14 justify-center md:flex">
          {isDefault
            ? <Badge className="bg-primary/12 text-primary hover:bg-primary/12">默认</Badge>
            : <span className="text-[10px] text-faint">—</span>}
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onAudition(style)}
            className={cn(busy && 'border-primary text-primary')}
          >
            {busy
              ? <><Pause className="mr-1 h-3.5 w-3.5" />停止</>
              : <><Play className="mr-1 h-3.5 w-3.5" />试听</>}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={isDefault && style === defaultStyle}
            onClick={() => onSetDefault(style)}
            className="hidden sm:inline-flex"
          >
            <Volume2 className="mr-1 h-3.5 w-3.5" />
            {isDefault && style === defaultStyle ? '当前默认' : '设为默认'}
          </Button>
        </div>
        <button
          type="button"
          aria-label={open ? '收起风格' : '展开风格'}
          aria-expanded={open}
          disabled={!hasStyles}
          onClick={() => setOpen((x) => !x)}
          className={cn(
            'hidden h-6 w-6 place-items-center rounded-md text-faint hover:bg-surface-3 hover:text-foreground md:grid',
            !hasStyles && 'invisible',
          )}
        >
          <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
        </button>
      </div>

      {open && hasStyles && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-line pl-0 pt-2.5 md:pl-12">
          <span className="text-[10px] text-faint">风格</span>
          {['', ...styles].map((s) => (
            <button
              key={s || 'default'}
              type="button"
              aria-pressed={style === s}
              onClick={() => {
                setStyle(s);
                onAudition(s);
              }}
              className={cn(
                'inline-flex h-[24px] items-center rounded-full border px-2 text-[10.5px] transition-colors',
                style === s
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-line bg-surface-2 text-muted-foreground hover:border-line-strong hover:text-foreground',
              )}
            >
              {s ? styleDisplayName(s) : '默认'}
              {style === s && <Check className="ml-1 h-3 w-3" />}
            </button>
          ))}
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={() => onSetDefault(style)}
          >
            <Volume2 className="mr-1 h-3.5 w-3.5" />
            设为默认{style ? `（${styleDisplayName(style)}）` : ''}
          </Button>
        </div>
      )}
    </div>
  );
}

export function VoicesPage() {
  const { voices, loading, error, load } = useVoicesStore();
  const { synth, saveSynth } = useSettingsStore();
  const [q, setQ] = useState('');
  const [language, setLanguage] = useState<LanguageBucket | 'all'>('all');
  const [gender, setGender] = useState<'' | 'Female' | 'Male'>('');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [auditioning, setAuditioning] = useState<string | null>(null);
  const [recent, setRecent] = useState<string[]>(() => readRecentVoices(localStorage));

  useEffect(() => { void load(); }, []);

  const shown = useMemo(
    () => filterVoices(voices, { query: q, language, gender }),
    [voices, q, language, gender],
  );
  const visible = shown.slice(0, limit);
  const searching = q.trim().length > 0 || language !== 'all' || gender !== '';
  const groups = useMemo(() => groupByLanguage(visible), [visible]);
  const recentVoices = useMemo(
    () => recent
      .map((id) => voices.find((v) => v.id === id))
      .filter((v): v is Voice => Boolean(v))
      .slice(0, 8),
    [recent, voices],
  );
  const defaultVoice = voices.find((v) => v.id === synth.voice);

  function resetLimit(): void {
    setLimit(PAGE_SIZE);
  }

  function record(id: string): void {
    setRecent(pushRecentVoice(localStorage, id));
  }

  async function audition(v: Voice, style: string): Promise<void> {
    const key = `${v.id}:${style}`;
    if (auditioning === key) {
      stopAudition();
      setAuditioning(null);
      return;
    }
    stopAudition();
    setAuditioning(key);
    try {
      const { bytes } = await synthesizeText('你好，这是一段试听。', {
        voice: v.id, rate: synth.rate, pitch: synth.pitch, style,
      });
      await playAudition(bytes);
      record(v.id);
    } catch (e) {
      toast.error(`试听失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setAuditioning(null);
    }
  }

  function setDefault(v: Voice, style: string): void {
    void saveSynth({ ...synth, voice: v.id, style });
    record(v.id);
    toast.success(`默认音色已设为 ${voiceDisplayName(v)}${style ? ` · ${styleDisplayName(style)}` : ''}`);
  }

  return (
    <div>
      <PageHeader
        eyebrow="Voices · 音色"
        title="音色库"
        description="搜索、试听并设置默认音色；带风格的音色可以连同风格一起保存。"
        actions={
          <Button variant="outline" onClick={() => void load(true)} disabled={loading}>
            <RefreshCw className={cn('mr-1.5 h-4 w-4', loading && 'animate-spin')} />
            {loading ? '拉取中…' : '重新拉取'}
          </Button>
        }
      />

      <div className="sticky top-[54px] z-20 -mx-1 mb-3.5 rounded-[13px] border border-line bg-card/95 p-3 backdrop-blur md:top-0">
        <div className="relative mb-2.5">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
          <Input
            placeholder="搜索音色名或 ID"
            className="h-9 w-full pl-8"
            value={q}
            onChange={(e) => { setQ(e.target.value); resetLimit(); }}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1.5">
            {LANGUAGE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                aria-pressed={language === opt.value}
                onClick={() => { setLanguage(opt.value); resetLimit(); }}
                className={cn(
                  'inline-flex h-[26px] items-center rounded-full border px-2.5 text-[10.5px] transition-colors',
                  language === opt.value
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-line bg-surface-2 text-muted-foreground hover:border-line-strong hover:text-foreground',
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="ml-auto flex gap-0.5 rounded-[9px] border border-line bg-surface-2 p-[3px]">
            {GENDER_OPTIONS.map((opt) => (
              <button
                key={opt.value || 'all'}
                type="button"
                aria-pressed={gender === opt.value}
                onClick={() => { setGender(opt.value); resetLimit(); }}
                className={cn(
                  'h-[24px] rounded-md px-2.5 text-[10.5px] transition-colors',
                  gender === opt.value
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <span className="text-[11px] text-faint num">{shown.length} 个</span>
        </div>
      </div>

      {error && (
        <p className="mb-3 rounded-[10px] border border-destructive/30 bg-destructive/8 px-4 py-2.5 text-[12px] text-destructive">
          {error}
        </p>
      )}

      <div className="mb-3.5 flex flex-wrap items-center gap-3 rounded-[13px] border border-primary/25 bg-primary/[0.06] px-4 py-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[9px] border border-primary/25 bg-primary/10 text-primary">
          <Volume2 className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <div className="text-[9.5px] uppercase tracking-[0.14em] text-faint">当前默认</div>
          <div className="truncate text-[13px] font-semibold">
            {defaultVoice ? voiceDisplayName(defaultVoice) : '节点默认音色'}
          </div>
          <div className="truncate font-mono text-[10px] text-faint">{synth.voice || '由节点决定'}</div>
        </div>
        {synth.style && <Badge variant="secondary">风格 · {styleDisplayName(synth.style)}</Badge>}
        <Badge className="ml-auto bg-primary/12 text-primary hover:bg-primary/12">默认</Badge>
      </div>

      {!searching && recentVoices.length > 0 && (
        <div className="mb-3.5">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[11px] font-semibold text-muted-foreground">最近常用</span>
            <span className="text-[10px] text-faint">试听或设为默认后记录</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {recentVoices.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => void audition(v, synth.voice === v.id ? synth.style : '')}
                className="inline-flex h-[30px] items-center gap-1.5 rounded-full border border-line bg-card px-3 text-[11.5px] hover:border-primary/40"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                {voiceDisplayName(v)}
                {auditioning?.startsWith(`${v.id}:`) && <Pause className="h-3 w-3 text-primary" />}
              </button>
            ))}
          </div>
        </div>
      )}

      {visible.length > 0 ? (
        <div className="overflow-hidden rounded-[13px] border border-line bg-card">
          {searching ? (
            <div className="divide-y divide-line">
              {visible.map((v) => (
                <VoiceRow
                  key={v.id}
                  v={v}
                  isDefault={synth.voice === v.id}
                  defaultStyle={synth.style}
                  auditioningKey={auditioning}
                  onAudition={(style) => void audition(v, style)}
                  onSetDefault={(style) => setDefault(v, style)}
                />
              ))}
            </div>
          ) : (
            groups.map((g) => (
              <div key={g.bucket}>
                <div className="flex items-center justify-between border-b border-line bg-surface-2 px-4 py-2">
                  <span className="text-[11px] font-semibold">{g.label}</span>
                  <span className="text-[10.5px] text-faint num">{g.voices.length} 个</span>
                </div>
                <div className="divide-y divide-line">
                  {g.voices.map((v) => (
                    <VoiceRow
                      key={v.id}
                      v={v}
                      isDefault={synth.voice === v.id}
                      defaultStyle={synth.style}
                      auditioningKey={auditioning}
                      onAudition={(style) => void audition(v, style)}
                      onSetDefault={(style) => setDefault(v, style)}
                    />
                  ))}
                </div>
              </div>
            ))
          )}
          {limit < shown.length && (
            <div className="border-t border-line p-3 text-center">
              <Button variant="outline" onClick={() => setLimit((x) => x + PAGE_SIZE)}>
                加载更多（剩余 {shown.length - limit}）
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-[13px] border border-line bg-card py-16 text-center text-[12px] text-muted-foreground">
          {voices.length ? '没有匹配的音色，试试换个关键词或语言' : '还没有音色，请先添加节点并探测'}
        </div>
      )}
    </div>
  );
}
```

- [x] **步骤 2：运行构建**

运行：`npm run build`
预期：通过。若报 `Pagination` 未使用等错误，确认旧导入已全部删除。

- [x] **步骤 3：人工检查**

运行：`npm run tauri dev`，进入音色页。
预期：
- 869 条音色按语言分组，中文在最前。
- 输入关键字即时过滤；语言/性别 chips 组合正确。
- 展开带风格的音色，点风格 chip 会试听；「设为默认（风格名）」保存后，顶部当前默认显示风格。
- 设为默认后该音色出现在最近常用，刷新后仍在。
- 窄窗口（960px）下不横向溢出。

- [x] **步骤 4：Commit**

```bash
git add src/pages/VoicesPage.tsx
git commit -m "feat(voices): 重做音色页为搜索优先列表"
```

---

## 任务 7：分段上限降到 150

**文件：**
- 修改：`src/lib/split.ts:1`
- 修改：`src/lib/split.test.ts`

- [x] **步骤 1：补充失败测试**

在 `src/lib/split.test.ts` 末尾加入：

```ts
it('默认段长不超过 150', () => {
  const text = 'あ'.repeat(400);
  const segs = splitForReading(text);
  expect(segs.length).toBeGreaterThan(1);
  for (const s of segs) expect(s.length).toBeLessThanOrEqual(150);
  expect(segs.join('')).toBe(text);
});

it('默认按句号切分且不超长', () => {
  const text = '这是一句测试文本。'.repeat(40);
  const segs = splitForReading(text);
  for (const s of segs) expect(s.length).toBeLessThanOrEqual(150);
  expect(segs.join('')).toBe(text);
});
```

- [x] **步骤 2：运行测试验证失败**

运行：`npm test -- src/lib/split.test.ts`
预期：FAIL，`expected ... to be less than or equal to 150`。

- [x] **步骤 3：修改默认值**

`src/lib/split.ts` 第一行：

```ts
export function splitForReading(raw: string, maxLen = 150): string[] {
```

- [x] **步骤 4：运行测试验证通过**

运行：`npm test -- src/lib/split.test.ts`
预期：PASS（显式传 800 的旧用例保持不变）。

- [x] **步骤 5：Commit**

```bash
git add src/lib/split.ts src/lib/split.test.ts
git commit -m "fix(synth): 朗读分段上限降至 150 字以兼容 LEGACY 节点"
```

---

## 任务 8：预取窗口

**文件：**
- 创建：`src/lib/prefetch.ts`
- 创建：`src/lib/prefetch.test.ts`

- [x] **步骤 1：编写失败测试**

创建 `src/lib/prefetch.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { PrefetchWindow } from './prefetch';

function bytes(n: number): ArrayBuffer {
  return new Uint8Array([n]).buffer;
}

async function flush(): Promise<void> {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
}

describe('PrefetchWindow', () => {
  it('按顺序预取窗口内的后续段', async () => {
    const calls: string[] = [];
    const w = new PrefetchWindow({
      size: 3,
      synth: async (text) => {
        calls.push(text);
        return bytes(text.length);
      },
    });
    w.ensure(0, [{ text: 'a' }, { text: 'b' }, { text: 'c' }, { text: 'd' }, { text: 'e' }]);
    await w.whenIdle();
    expect(calls).toEqual(['b', 'c', 'd']);
  });

  it('take 命中后移除，第二次返回 null', async () => {
    const w = new PrefetchWindow({ size: 2, synth: async () => bytes(1) });
    w.ensure(0, [{ text: 'a' }, { text: 'b' }, { text: 'c' }]);
    const first = w.take(1);
    expect(first).not.toBeNull();
    expect(w.take(1)).toBeNull();
    await expect(first!).resolves.toBeInstanceOf(ArrayBuffer);
  });

  it('不重复预取同一索引', async () => {
    const calls: string[] = [];
    const w = new PrefetchWindow({
      size: 2,
      synth: async (text) => { calls.push(text); return bytes(1); },
    });
    w.ensure(0, [{ text: 'a' }, { text: 'b' }, { text: 'c' }]);
    w.ensure(0, [{ text: 'a' }, { text: 'b' }, { text: 'c' }]);
    await w.whenIdle();
    expect(calls).toEqual(['b', 'c']);
  });

  it('失败时移除缓存并回调 fail', async () => {
    const states: string[] = [];
    const w = new PrefetchWindow({
      size: 1,
      synth: async () => { throw new Error('boom'); },
      onState: (index, state) => states.push(`${index}:${state}`),
    });
    w.ensure(0, [{ text: 'a' }, { text: 'b' }]);
    await w.whenIdle();
    expect(states).toEqual(['1:start', '1:fail']);
    expect(w.take(1)).toBeNull();
  });

  it('clear 后丢弃旧任务结果', async () => {
    let release: (b: ArrayBuffer) => void = () => {};
    const w = new PrefetchWindow({
      size: 1,
      synth: () => new Promise((resolve) => { release = resolve; }),
    });
    w.ensure(0, [{ text: 'a' }, { text: 'b' }]);
    await flush();
    w.clear();
    release(bytes(1));
    await flush();
    expect(w.take(1)).toBeNull();
  });
});
```

- [x] **步骤 2：运行测试验证失败**

运行：`npm test -- src/lib/prefetch.test.ts`
预期：FAIL，`Failed to resolve import "./prefetch"`。

- [x] **步骤 3：实现 PrefetchWindow**

创建 `src/lib/prefetch.ts`：

```ts
export type PrefetchState = 'start' | 'ok' | 'fail';

export interface PrefetchOptions {
  synth: (text: string) => Promise<ArrayBuffer>;
  onState?: (index: number, state: PrefetchState) => void;
  size?: number;
}

interface SegmentText {
  text: string;
}

export class PrefetchWindow {
  private readonly size: number;
  private readonly synth: (text: string) => Promise<ArrayBuffer>;
  private readonly onState?: (index: number, state: PrefetchState) => void;
  private entries = new Map<number, Promise<ArrayBuffer>>();
  private token = 0;
  private chain: Promise<void> = Promise.resolve();

  constructor(options: PrefetchOptions) {
    this.size = Math.max(1, options.size ?? 3);
    this.synth = options.synth;
    this.onState = options.onState;
  }

  ensure(start: number, segments: SegmentText[]): void {
    const token = this.token;
    for (let offset = 1; offset <= this.size; offset += 1) {
      const index = start + offset;
      const seg = segments[index];
      if (!seg || this.entries.has(index)) continue;
      this.entries.set(index, this.enqueue(index, seg.text, token));
    }
  }

  take(index: number): Promise<ArrayBuffer> | null {
    const task = this.entries.get(index);
    if (!task) return null;
    this.entries.delete(index);
    return task;
  }

  release(index: number): void {
    this.entries.delete(index);
  }

  clear(): void {
    this.token += 1;
    this.entries.clear();
    this.chain = Promise.resolve();
  }

  whenIdle(): Promise<void> {
    return this.chain;
  }

  private enqueue(index: number, text: string, token: number): Promise<ArrayBuffer> {
    const task = this.chain.then(async () => {
      if (token !== this.token) throw new Error('prefetch-cancelled');
      this.onState?.(index, 'start');
      try {
        const buf = await this.synth(text);
        if (token !== this.token) throw new Error('prefetch-cancelled');
        this.onState?.(index, 'ok');
        return buf;
      } catch (e) {
        if (token === this.token) {
          this.entries.delete(index);
          this.onState?.(index, 'fail');
        }
        throw e;
      }
    });
    this.chain = task.then(() => undefined, () => undefined);
    task.catch(() => { /* 由 take 或调用方处理 */ });
    return task;
  }
}
```

- [x] **步骤 4：运行测试验证通过**

运行：`npm test -- src/lib/prefetch.test.ts`
预期：PASS。

- [x] **步骤 5：Commit**

```bash
git add src/lib/prefetch.ts src/lib/prefetch.test.ts
git commit -m "feat(player): 增加可取消的预取窗口"
```

---

## 任务 9：playerStore 接入预取窗口

**文件：**
- 修改：`src/store/playerStore.ts:1-70`、`src/store/playerStore.ts:124-230`

- [x] **步骤 1：替换模块级预取状态**

删除：

```ts
let prefetch: { index: number; promise: Promise<ArrayBuffer> } | null = null;
```

新增导入与实例：

```ts
import { PrefetchWindow } from '../lib/prefetch';
```

```ts
const prefetchWindow = new PrefetchWindow({
  size: 3,
  synth: (text) => (synthFn ? synthFn(text) : Promise.reject(new Error('朗读器未初始化'))),
  onState: (index, state) => {
    const s = usePlayerStore.getState();
    if (s.status === 'idle') return;
    const seg = s.segs[index];
    if (!seg) return;
    if (state === 'start' && seg.status === 'pending') {
      usePlayerStore.setState({
        segs: s.segs.map((x, j) => (j === index ? { ...x, status: 'synthesizing' as const } : x)),
      });
    } else if (state === 'fail' && seg.status === 'synthesizing') {
      usePlayerStore.setState({
        segs: s.segs.map((x, j) => (j === index ? { ...x, status: 'pending' as const } : x)),
      });
    }
  },
});
```

- [x] **步骤 2：改写 pump 的取音逻辑**

把 pump 中这段：

```ts
      if (!synthFn) throw new Error('朗读器未初始化');
      let p: Promise<ArrayBuffer>;
      if (prefetch && prefetch.index === i) {
        p = prefetch.promise;
        prefetch = null;
      } else {
        p = synthFn(seg.text);
      }
      const nextIdx = i + 1;
      const nextText = store.getState().segs[nextIdx]?.text;
      if (synthFn && nextText && (!prefetch || prefetch.index !== nextIdx)) {
        store.setState({
          segs: store.getState().segs.map((x, j) =>
            j === nextIdx && x.status === 'pending' ? { ...x, status: 'synthesizing' as const } : x),
        });
        prefetch = { index: nextIdx, promise: synthFn(nextText) };
        prefetch.promise.catch(() => { /* 到位时统一处理失败 */ });
      }
      buf = await p;
```

替换为：

```ts
      if (!synthFn) throw new Error('朗读器未初始化');
      const prefetched = prefetchWindow.take(i);
      const p = prefetched ?? synthFn(seg.text);
      prefetchWindow.ensure(i, store.getState().segs);
      try {
        buf = await p;
      } catch (e) {
        if (!prefetched || token !== runToken) throw e;
        // 预取失败不影响正常朗读：轮到该段时直接再合成一次
        buf = await synthFn(seg.text);
      }
```

同时把这一段的起点 `let buf: ArrayBuffer | null = null;` 保持不变，外层 `try/catch` 继续负责最终失败处理。

- [x] **步骤 3：取消时不再写错误**

pump 的 catch 块：

```ts
    } catch (e) {
      if (token !== runToken) return;
      store.setState({ error: `第 ${i + 1} 段失败：${e instanceof Error ? e.message : String(e)}` });
      buf = null;
    }
```

段播放完成处，把：

```ts
    prefetch = null;
```

改为：

```ts
    prefetchWindow.release(i);
```

`resetPlayback()` 中把：

```ts
  prefetch = null;
```

改为：

```ts
  prefetchWindow.clear();
```

- [x] **步骤 4：运行测试与构建**

运行：`npm test -- src/lib/prefetch.test.ts src/lib/split.test.ts`
预期：PASS。

运行：`npm run build`
预期：通过。

- [x] **步骤 5：人工检查**

运行：`npm run tauri dev`，粘贴 300 字以上文本并开始朗读。
预期：
- 段落列表里后续 3 段显示「合成中」。
- 段与段之间没有明显空白等待。
- 中途停止或点击另一段跳转，不会播放旧音频。
- 长文本在 LEGACY 节点下合成成功（日志出现成功记录，文本长度超过 312 字）。

- [x] **步骤 6：Commit**

```bash
git add src/store/playerStore.ts
git commit -m "feat(player): 播放时窗口预取后续三段"
```

---

## 任务 10：全量验证与收尾

**文件：**
- 修改：`docs/superpowers/plans/2026-11-10-palette-voices-prefetch.md`（勾选进度）

- [x] **步骤 1：全量测试**

运行：`npm test`
预期：全部测试文件通过，无失败、无跳过。

- [x] **步骤 2：生产构建**

运行：`npm run build`
预期：`tsc` 与 `vite build` 均通过。

- [x] **步骤 3：真机验收**

运行：`npm run tauri dev`，逐项确认：
- 侧栏配色切换三套 × 深/浅/跟随系统，刷新保持。
- 设置 → 数据：书数/章节数正确；清空日志二次确认生效。
- 音色页：搜索、语言、性别、最近常用、风格试听与保存。
- 连续朗读 10 段以上无合成停顿；312 字以上长文本成功。
- 960px 与 900px 宽度下布局正常。

- [x] **步骤 4：关闭进程并检查工作区**

```bash
git status --short
```

预期：只有本轮计划文件（若有未跟踪旧文档，保持原样，不要加入提交）。

- [x] **步骤 5：Commit**

```bash
git add docs/superpowers/plans/2026-11-10-palette-voices-prefetch.md
git commit -m "docs(plan): 勾选配色、数据、音色与预取验收进度"
```

---

## 执行记录（2026-11-10）

- 全部 10 个任务已实现，逐任务提交。
- 真机（`npm run tauri dev` + CDP）验收：三套配色与深/浅互不影响且刷新保持；数据页显示真实书数/章节数与清空日志二次确认；音色页搜索、语言/性别筛选、风格就地展开与设为默认；400+ 字文本按 150 字分段并触发窗口预取（日志连续 4 条成功，单次 5–12 秒）。
- 计划外修正：`voiceFilter.ts` 增加 `sortVoicesByLanguage`，保证分页切片后中文仍排在最前，分组标题显示该语言总数而非当前切片数；音色行在 960px 宽度下隐藏标签列改为四列布局，消除标签竖排换行。
