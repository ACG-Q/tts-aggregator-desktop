# 桌面端 UI/UX 全量打磨 + 小说有声朗读书架 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。用户已明确要求：全程不使用子代理，内联执行（executing-plans）。

**目标：** 用 Tailwind v4 + shadcn/ui 重写桌面端全部 UI（修复对比度失败、统一明暗主题），并新增「小说有声朗读书架」：TXT 导入 → 内置多级目录解析（卷/篇/章）→ 断点续听连续播放。

**架构：** 前端 UI 层全面迁移到 Tailwind tokens + shadcn 组件；播放内核 playerStore 升级为支持音量/倍速/段落跳转/播放来源（text|book）与完成钩子；新增 SQLite 表 books/chapters + BooksRepo + 纯函数目录解析器 lib/toc.ts；书架页经 bookPlay.ts 将「章节完成→写进度→自动下一章」接入播放钩子。Rust 侧零改动。

**技术栈：** React 19、react-router-dom 7（HashRouter）、zustand 5、Tailwind CSS v4（@tailwindcss/vite）、shadcn/ui（new-york 风格 + Radix）、lucide-react、sonner、cva + clsx + tailwind-merge、vitest 5。

**规格：** `docs/superpowers/specs/2026-10-16-desktop-ui-ux-novel-audiobook-design.md`（已批准）。本计划相对规格的落地调整：AppPrefs 增加 `volume` 字段（规格 §5 要求音量持久化）；书架导航项在任务 5 加入（任务 2 只迁存量 5 页，避免占位页面）。

**执行环境：** 仓库根 `C:\Users\LiuJi\Desktop\project-07\tts-aggregator-desktop`（Windows PowerShell，禁止 `&&`，多命令用 `;` 分隔或分开执行）。每步验证：`npm test` 与 `npm run build`（build = `tsc --noEmit` 全量类型检查 + vite 打包，以 `Build succeeded` 结尾即 0 错误）。`docs/` 保持 untracked，永不 `git add`。

---

## 文件结构总览

| 文件 | 动作 | 职责 |
|------|------|------|
| `package.json` | 修改 | 新依赖：tailwindcss、@tailwindcss/vite、clsx、tailwind-merge、tw-animate-css、lucide-react、sonner + shadcn CLI 自动装的 Radix 包 |
| `vite.config.ts` | 修改 | tailwindcss 插件 + `@` 别名 |
| `tsconfig.json` | 修改 | `baseUrl` + `paths`（`@/*` → `./src/*`） |
| `index.html` | 修改 | 标题 + 主题防闪烁内联脚本（读 localStorage `app_prefs`） |
| `components.json` | 创建 | shadcn CLI 配置（new-york、cssVariables、iconLibrary lucide） |
| `src/index.css` | 创建 | Tailwind v4 入口 + shadcn 设计令牌（绿色 primary、中性灰、oklch） |
| `src/styles.css` | 删除（任务 10） | 旧手写 tokens，迁移期保留 |
| `src/lib/utils.ts` | 创建 | shadcn `cn()` 工具 |
| `src/lib/theme.ts` | 创建 | resolveTheme/applyTheme/watchSystemTheme（主题方案，不用 next-themes） |
| `src/types/models.ts` | 修改 | AppPrefs 扩展（theme/playbackRate/volume）+ normalizeAppPrefs + Book/BookChapter 类型 |
| `src/types/models.test.ts` | 创建 | normalizeAppPrefs 单测 |
| `src/lib/theme.test.ts` | 创建 | resolveTheme 单测 |
| `src/store/settingsStore.ts` | 修改 | load 时 normalizeAppPrefs 合并旧存储 |
| `src/nav.tsx` | 创建 | NAV_ITEMS 导航配置（lucide 图标） |
| `src/components/ThemeController.tsx` | 创建 | 订阅 appPrefs.theme + 系统媒体查询，应用 dark class |
| `src/components/Pagination.tsx` | 创建（任务 7） | 通用分页（音色 50/页、日志 100/页复用） |
| `src/components/player/PlayerControls.tsx` | 创建 | 播放控制条（播放/暂停/停止/下一段/进度条/音量/倍速） |
| `src/components/player/SegmentList.tsx` | 创建 | 段落列表（可点击跳转） |
| `src/store/playerStore.ts` | 重写 | 音量/倍速/段落跳转/seek/播放来源 source/完成钩子 hooks |
| `src/lib/mediaSession.ts` | 创建 | 系统媒体键（play/pause/nexttrack）+ playbackState |
| `src/lib/format.ts` | 创建 | fmtClock（mm:ss）/fmtTimeFull（跨天）/progressPercent |
| `src/lib/format.test.ts` | 创建 | 上述纯函数单测 |
| `src/lib/toc.ts` | 创建 | parseToc（多级目录解析）+ parseCnNum（中文数字） |
| `src/lib/toc.test.ts` | 创建 | 目录解析单测（TDD 先行） |
| `src/lib/db.ts` | 修改 | books/chapters 建表 + BooksRepo + 行映射；LOG_QUERY_LIMIT 300→500 |
| `src/store/deps.ts` | 修改 | Deps 增加 `books: BooksRepo` |
| `src/store/bookPlay.ts` | 创建 | playChapter：钩子接线（段落写进度、章末自动下一章、全书完成 toast） |
| `src/lib/audition.ts` | 创建（任务 7） | 试听互斥播放器（新试听自动停旧） |
| `src/components/book/ChapterTree.tsx` | 创建 | 按卷分组可折叠章节树 |
| `src/pages/BooksPage.tsx` | 创建 | 书架页（导入/列表/续听/章节树/删除/改名） |
| `src/pages/*.tsx` | 重写 | ReadPage/NodesPage/VoicesPage/LogsPage/SettingsPage/ImportPanel 迁移 shadcn |
| `src/App.tsx` | 重写 | 侧栏外壳 + 路由（任务 2/5 两次修改） |
| `src/main.tsx` | 修改 | index.css 导入、player initPlayback、mediaSession 绑定、books repo 注入 |
| `README.md` | 修改 | 书架功能 + UI 栈说明（任务 10） |

---

## 任务 1：Tailwind v4 + shadcn 基座（主题/令牌/别名/AppPrefs 扩展）

**文件：**
- 修改：`package.json`（npm install）
- 修改：`vite.config.ts`、`tsconfig.json`、`index.html`
- 创建：`components.json`、`src/index.css`、`src/lib/utils.ts`、`src/lib/theme.ts`、`src/types/models.test.ts`、`src/lib/theme.test.ts`
- 修改：`src/types/models.ts`、`src/store/settingsStore.ts`、`src/main.tsx`
- 创建：`src/components/ui/*`（shadcn CLI 生成）

- [ ] **步骤 1.1：安装依赖**

```powershell
npm install tailwindcss @tailwindcss/vite clsx tailwind-merge tw-animate-css lucide-react sonner
```

预期：`added N packages`，无 peer dependency 报错。若 `@tailwindcss/vite` 报与 Vite 8 不兼容（安装失败或后续构建报错），立即报告用户并回退方案：改用 `@tailwindcss/postcss` + `postcss.config.js`（`plugins: { '@tailwindcss/postcss': {} }`），其余步骤不变。

- [ ] **步骤 1.2：重写 vite.config.ts**

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
// @ts-expect-error type error without @types/node package
import process from "node:process";
// @ts-expect-error type error without @types/node package
import { fileURLToPath, URL } from "node:url";
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [react(), tailwindcss()],

  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },

  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));
```

- [ ] **步骤 1.3：修改 tsconfig.json（加 baseUrl + paths）**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM"],
    "module": "ESNext",
    "skipLibCheck": true,

    /* Bundler mode */
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    },

    /* Linting */
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **步骤 1.4：修改 index.html（标题 + 防闪烁脚本）**

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>TTS Aggregator</title>
    <script>
      (function () {
        try {
          var raw = localStorage.getItem('app_prefs');
          var theme = raw ? (JSON.parse(raw).theme || 'system') : 'system';
          var dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
          document.documentElement.classList.toggle('dark', dark);
          document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
        } catch (e) {
          /* 非 JSON 或首次启动：保持浅色 */
        }
      })();
    </script>
  </head>

  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **步骤 1.5：创建 components.json（shadcn CLI 配置）**

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/index.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "iconLibrary": "lucide"
}
```

- [ ] **步骤 1.6：创建 src/index.css（Tailwind v4 + shadcn 令牌）**

```css
@import "tailwindcss";
@import "tw-animate-css";

@custom-variant dark (&:is(.dark *));

:root {
  --radius: 0.625rem;
  --background: oklch(0.985 0 0);
  --foreground: oklch(0.145 0 0);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.145 0 0);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.145 0 0);
  --primary: oklch(0.448 0.119 151.328);
  --primary-foreground: oklch(0.985 0 0);
  --secondary: oklch(0.97 0 0);
  --secondary-foreground: oklch(0.205 0 0);
  --muted: oklch(0.97 0 0);
  --muted-foreground: oklch(0.556 0 0);
  --accent: oklch(0.97 0 0);
  --accent-foreground: oklch(0.205 0 0);
  --destructive: oklch(0.577 0.245 27.325);
  --destructive-foreground: oklch(0.985 0 0);
  --border: oklch(0.922 0 0);
  --input: oklch(0.922 0 0);
  --ring: oklch(0.448 0.119 151.328);
  --success: oklch(0.448 0.119 151.328);
  --warning: oklch(0.48 0.11 65);
}

.dark {
  --background: oklch(0.145 0 0);
  --foreground: oklch(0.985 0 0);
  --card: oklch(0.205 0 0);
  --card-foreground: oklch(0.985 0 0);
  --popover: oklch(0.205 0 0);
  --popover-foreground: oklch(0.985 0 0);
  --primary: oklch(0.7 0.14 151.328);
  --primary-foreground: oklch(0.145 0 0);
  --secondary: oklch(0.269 0 0);
  --secondary-foreground: oklch(0.985 0 0);
  --muted: oklch(0.269 0 0);
  --muted-foreground: oklch(0.708 0 0);
  --accent: oklch(0.269 0 0);
  --accent-foreground: oklch(0.985 0 0);
  --destructive: oklch(0.704 0.191 22.216);
  --destructive-foreground: oklch(0.985 0 0);
  --border: oklch(1 0 0 / 10%);
  --input: oklch(1 0 0 / 15%);
  --ring: oklch(0.7 0.14 151.328);
  --success: oklch(0.7 0.14 151.328);
  --warning: oklch(0.75 0.12 75);
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-success: var(--success);
  --color-warning: var(--warning);
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground antialiased;
  }
}
```

对比度依据（审计实测换算）：light muted-foreground ≈ #737373 on 白 4.7:1 ✓；primary green-700 #15803D + 白字 ≈ 4.9:1 ✓；dark muted-foreground ≈ #a1a1aa on #252525 ≈ 5.6:1 ✓；dark primary 浅绿 + 近黑字 ✓。success/warning 仅作徽章底色/文字（绿底绿字、琥珀底深字），徽章文字用对应深浅色对 15%/20% 透明底复检（任务 10 统一复测）。

- [ ] **步骤 1.7：创建 src/lib/utils.ts**

```ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```

- [ ] **步骤 1.8：编写失败的测试 src/types/models.test.ts**

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_APP_PREFS, normalizeAppPrefs } from './models';

describe('normalizeAppPrefs', () => {
  it('空值与非法输入回落默认', () => {
    expect(normalizeAppPrefs(null)).toEqual(DEFAULT_APP_PREFS);
    expect(normalizeAppPrefs('nope')).toEqual(DEFAULT_APP_PREFS);
    expect(normalizeAppPrefs({ probeConcurrency: 99, theme: 'neon', playbackRate: 10, volume: -5 }))
      .toEqual(DEFAULT_APP_PREFS);
  });

  it('旧版仅 probeConcurrency 的配置补齐新字段', () => {
    expect(normalizeAppPrefs({ probeConcurrency: 2 })).toEqual({
      probeConcurrency: 2, theme: 'system', playbackRate: 1, volume: 100,
    });
  });

  it('合法值原样保留', () => {
    expect(normalizeAppPrefs({ probeConcurrency: 8, theme: 'dark', playbackRate: 1.5, volume: 30 }))
      .toEqual({ probeConcurrency: 8, theme: 'dark', playbackRate: 1.5, volume: 30 });
  });
});
```

- [ ] **步骤 1.9：运行测试验证失败**

```powershell
npm test
```

预期：FAIL，`normalizeAppPrefs` 未导出（模块无导出成员）。

- [ ] **步骤 1.10：修改 src/types/models.ts（AppPrefs 扩展 + Book 类型 + normalizeAppPrefs）**

将原 `export interface AppPrefs { probeConcurrency: number }` 与 `export const DEFAULT_APP_PREFS: AppPrefs = { probeConcurrency: 4 };` 两处替换为：

```ts
export type ThemeMode = 'system' | 'light' | 'dark';

export interface AppPrefs {
  probeConcurrency: number;
  theme: ThemeMode;
  playbackRate: number;
  volume: number;
}

export interface Book {
  id: string;
  title: string;
  importedAt: number;
  lastChapter: number;
  lastSegment: number;
  playbackRate: number;
}

export interface BookChapter {
  id: string;
  bookId: string;
  idx: number;
  volume: string;
  title: string;
  content: string;
}
```

在 `DEFAULT_SYNTH` 之后替换 `DEFAULT_APP_PREFS`，并在其后新增 `normalizeAppPrefs`：

```ts
export const DEFAULT_APP_PREFS: AppPrefs = {
  probeConcurrency: 4,
  theme: 'system',
  playbackRate: 1,
  volume: 100,
};

export function normalizeAppPrefs(raw: unknown): AppPrefs {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Partial<AppPrefs>;
  return {
    probeConcurrency:
      typeof o.probeConcurrency === 'number' && o.probeConcurrency >= 1 && o.probeConcurrency <= 8
        ? o.probeConcurrency
        : DEFAULT_APP_PREFS.probeConcurrency,
    theme: o.theme === 'light' || o.theme === 'dark' || o.theme === 'system'
      ? o.theme
      : DEFAULT_APP_PREFS.theme,
    playbackRate:
      typeof o.playbackRate === 'number' && o.playbackRate >= 0.5 && o.playbackRate <= 2
        ? o.playbackRate
        : DEFAULT_APP_PREFS.playbackRate,
    volume:
      typeof o.volume === 'number' && o.volume >= 0 && o.volume <= 100
        ? o.volume
        : DEFAULT_APP_PREFS.volume,
  };
}
```

- [ ] **步骤 1.11：运行测试验证通过**

```powershell
npm test
```

预期：PASS（models 3 个用例 + 既有 split/pool/importers 等全部通过）。

- [ ] **步骤 1.12：编写失败的测试 src/lib/theme.test.ts**

```ts
import { describe, expect, it } from 'vitest';
import { resolveTheme } from './theme';

describe('resolveTheme', () => {
  it('system 模式跟随系统', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });

  it('显式模式覆盖系统', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });
});
```

- [ ] **步骤 1.13：运行测试验证失败**

```powershell
npx vitest run src/lib/theme.test.ts
```

预期：FAIL，找不到模块 `./theme`。

- [ ] **步骤 1.14：创建 src/lib/theme.ts**

```ts
import type { ThemeMode } from '../types/models';

export type ResolvedTheme = 'light' | 'dark';

export function resolveTheme(mode: ThemeMode, systemDark: boolean): ResolvedTheme {
  if (mode === 'system') return systemDark ? 'dark' : 'light';
  return mode;
}

export function applyTheme(resolved: ResolvedTheme): void {
  document.documentElement.classList.toggle('dark', resolved === 'dark');
  document.documentElement.style.colorScheme = resolved;
}

export function watchSystemTheme(cb: (dark: boolean) => void): () => void {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const handler = (): void => cb(mq.matches);
  mq.addEventListener('change', handler);
  return () => mq.removeEventListener('change', handler);
}
```

- [ ] **步骤 1.15：运行测试验证通过**

```powershell
npx vitest run src/lib/theme.test.ts
```

预期：PASS。

- [ ] **步骤 1.16：修改 src/store/settingsStore.ts（load 合并 normalize）**

`load()` 中 `appPrefs` 一行替换为 normalize 版本，并在 import 中追加 `normalizeAppPrefs`：

```ts
import {
  DEFAULT_APP_PREFS, DEFAULT_POOL, DEFAULT_SYNTH, defaultShare, normalizeAppPrefs,
  type AppPrefs, type PoolConfig, type ShareConfig, type SynthSettings,
} from '../types/models';
```

```ts
appPrefs: normalizeAppPrefs(await s.getJson<Partial<AppPrefs>>('app_prefs', {})),
```

- [ ] **步骤 1.17：修改 src/main.tsx（导入 Tailwind 入口）**

import 区在 `import App from './App';` 之后插入一行：

```ts
import './index.css';
```

保持原 `import './styles.css';` 不变（迁移期新旧并存，styles.css 后加载、局部覆盖；任务 10 删除）。

- [ ] **步骤 1.18：生成 shadcn 组件**

```powershell
npx shadcn@latest add button card dialog alert-dialog select slider tabs table badge input label checkbox separator sonner -y -o
```

预期：`components/ui/` 下生成 14 个组件并自动安装 @radix-ui/* 依赖。若 CLI 交互卡住或 React 19 兼容报错，报告用户。

- [ ] **步骤 1.19：重写 src/components/ui/sonner.tsx（去 next-themes 依赖）**

CLI 生成的 sonner.tsx 引用 `next-themes`（本项目不装）。整体替换为：

```tsx
import { Toaster as Sonner, type ToasterProps } from 'sonner';

const Toaster = ({ ...props }: ToasterProps) => {
  const theme = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
  return (
    <Sonner
      theme={theme}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg',
          description: 'group-[.toast]:text-muted-foreground',
          actionButton: 'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
          cancelButton: 'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground',
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
```

- [ ] **步骤 1.20：全量验证**

```powershell
npm test
```

预期：全部 PASS。

```powershell
npm run build
```

预期：`Build succeeded`，`dist/` 产出。（此步 build 会同时验证 vite tailwind 插件与 @/ 别名是否在 Vite 8 下可用；若失败且错误指向 @tailwindcss/vite，执行步骤 1.1 的 postcss 回退方案后重跑。）

- [ ] **步骤 1.21：Commit**

```powershell
git add package.json package-lock.json vite.config.ts tsconfig.json index.html components.json src/index.css src/lib/utils.ts src/lib/theme.ts src/lib/theme.test.ts src/types/models.ts src/types/models.test.ts src/store/settingsStore.ts src/main.tsx src/components/ui/
```

```powershell
git commit -m "feat: 引入 Tailwind v4 与 shadcn/ui 基座（主题令牌/路径别名/AppPrefs 扩展）"
```

## 任务 2：应用外壳（lucide 侧栏 + ThemeController + Sonner）

**文件：**
- 创建：`src/components/ThemeController.tsx`、`src/nav.tsx`
- 修改：`src/App.tsx`（整体重写，HashRouter 保留在 App 内）

- [ ] **步骤 2.1：创建 src/components/ThemeController.tsx**

```tsx
import { useEffect, useState } from 'react';
import { applyTheme, resolveTheme, watchSystemTheme } from '@/lib/theme';
import { useSettingsStore } from '@/store/settingsStore';

export function ThemeController() {
  const theme = useSettingsStore((s) => s.appPrefs.theme);
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
  );
  useEffect(() => watchSystemTheme(setSystemDark), []);
  useEffect(() => {
    applyTheme(resolveTheme(theme, systemDark));
  }, [theme, systemDark]);
  return null;
}
```

- [ ] **步骤 2.2：创建 src/nav.tsx**

```tsx
import { AudioLines, FileClock, ListMusic, Server, Settings } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: '朗读', icon: AudioLines },
  { to: '/nodes', label: '节点', icon: Server },
  { to: '/voices', label: '音色', icon: ListMusic },
  { to: '/logs', label: '日志', icon: FileClock },
  { to: '/settings', label: '设置', icon: Settings },
];
```

（书架项 `Library` 图标在任务 5 插入到朗读之后。）

- [ ] **步骤 2.3：重写 src/App.tsx**

```tsx
import { HashRouter, NavLink, Route, Routes } from 'react-router-dom';
import { NAV_ITEMS, type NavItem } from '@/nav';
import { cn } from '@/lib/utils';
import { ThemeController } from '@/components/ThemeController';
import { Toaster } from '@/components/ui/sonner';
import { usePlayerStore } from '@/store/playerStore';
import { LogsPage } from './pages/LogsPage';
import { NodesPage } from './pages/NodesPage';
import { ReadPage } from './pages/ReadPage';
import { SettingsPage } from './pages/SettingsPage';
import { VoicesPage } from './pages/VoicesPage';

function NavRow({ item }: { item: NavItem }) {
  const playing = usePlayerStore((s) => s.status !== 'idle');
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
          isActive
            ? 'bg-primary/10 font-medium text-primary'
            : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
        )
      }
    >
      <Icon className="h-4 w-4" />
      <span>{item.label}</span>
      {item.to === '/' && playing && <PlayingDot />}
    </NavLink>
  );
}

function PlayingDot() {
  return (
    <span className="ml-auto h-2 w-2 animate-pulse rounded-full bg-primary" aria-label="正在播放" />
  );
}

export default function App() {
  return (
    <HashRouter>
      <div className="flex h-screen overflow-hidden bg-background text-foreground">
        <ThemeController />
        <aside className="flex w-52 shrink-0 flex-col border-r bg-card">
          <div className="flex h-14 items-center border-b px-4">
            <span className="text-base font-semibold tracking-tight">TTS Aggregator</span>
          </div>
          <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-2">
            {NAV_ITEMS.map((item) => (
              <NavRow key={item.to} item={item} />
            ))}
          </nav>
          <div className="border-t px-4 py-3 text-xs text-muted-foreground">
            节点池 · SQLite 本地库
          </div>
        </aside>
        <main className="flex-1 overflow-y-auto p-6">
          <Routes>
            <Route path="/" element={<ReadPage />} />
            <Route path="/nodes" element={<NodesPage />} />
            <Route path="/voices" element={<VoicesPage />} />
            <Route path="/logs" element={<LogsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </main>
        <Toaster position="bottom-right" richColors />
      </div>
    </HashRouter>
  );
}
```

- [ ] **步骤 2.4：构建验证**

```powershell
npm run build
```

预期：`Build succeeded`。（页面此时视觉新旧混合属正常：外壳已是 Tailwind，五页仍旧类名由 styles.css 兜底。）

- [ ] **步骤 2.5：Commit**

```powershell
git add src/App.tsx src/nav.tsx src/components/ThemeController.tsx
git commit -m "feat: 应用外壳改版——lucide 侧栏导航、主题控制器与 Sonner 通知"
```

---

## 任务 3：播放内核 + 朗读页（音量/倍速/跳段/进度条/媒体键）

**文件：**
- 创建：`src/lib/format.ts`、`src/lib/format.test.ts`、`src/lib/mediaSession.ts`、`src/components/player/PlayerControls.tsx`、`src/components/player/SegmentList.tsx`
- 重写：`src/store/playerStore.ts`、`src/pages/ReadPage.tsx`
- 修改：`src/main.tsx`

- [ ] **步骤 3.1：编写失败的测试 src/lib/format.test.ts**

```ts
import { describe, expect, it } from 'vitest';
import { fmtClock, fmtTimeFull, progressPercent } from './format';

describe('fmtClock', () => {
  it('补零分秒', () => {
    expect(fmtClock(0)).toBe('00:00');
    expect(fmtClock(9)).toBe('00:09');
    expect(fmtClock(65)).toBe('01:05');
    expect(fmtClock(600)).toBe('10:00');
    expect(fmtClock(-3)).toBe('00:00');
  });
});

describe('progressPercent', () => {
  it('已播完单元数 / 总单元数 四舍五入', () => {
    expect(progressPercent(0, 10)).toBe(0);
    expect(progressPercent(5, 10)).toBe(50);
    expect(progressPercent(9, 10)).toBe(90);
    expect(progressPercent(10, 10)).toBe(100);
    expect(progressPercent(3, 0)).toBe(0);
    expect(progressPercent(99, 10)).toBe(100);
  });
});

describe('fmtTimeFull', () => {
  it('跨天完整时间（含日期与时间分隔符）', () => {
    const s = fmtTimeFull(Date.UTC(2026, 0, 2, 3, 4, 5));
    expect(s).toMatch(/\d{4}/);
    expect(s).toContain(':');
  });
});
```

- [ ] **步骤 3.2：运行测试验证失败**

```powershell
npx vitest run src/lib/format.test.ts
```

预期：FAIL，找不到 `./format`。

- [ ] **步骤 3.3：创建 src/lib/format.ts**

```ts
export function fmtClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function fmtTimeFull(t: number): string {
  return new Date(t).toLocaleString('zh-CN', { hour12: false });
}

export function progressPercent(doneUnits: number, totalUnits: number): number {
  if (totalUnits <= 0) return 0;
  return Math.min(100, Math.round((doneUnits / totalUnits) * 100));
}
```

- [ ] **步骤 3.4：运行测试验证通过**

```powershell
npx vitest run src/lib/format.test.ts
```

预期：PASS。

- [ ] **步骤 3.5：整体重写 src/store/playerStore.ts**

```ts
import { create } from 'zustand';
import { splitForReading } from '../lib/split';

export type SegStatus = 'pending' | 'synthesizing' | 'playing' | 'done' | 'error';
export type PlayerStatus = 'idle' | 'running' | 'paused';
export type PlaySource =
  | { kind: 'text' }
  | { kind: 'book'; bookId: string; chapterIdx: number };
export interface Segment { text: string; status: SegStatus }

export interface PlayerHooks {
  onSegDone?: (segIdx: number, source: PlaySource) => void;
  onFinished?: (source: PlaySource) => void;
}

export type SynthFn = (segText: string) => Promise<ArrayBuffer>;

interface PlayerState {
  status: PlayerStatus;
  segs: Segment[];
  index: number;
  error: string | null;
  currentTime: number;
  duration: number;
  text: string;
  volume: number;
  playbackRate: number;
  source: PlaySource | null;
  initPlayback(volume: number, rate: number): void;
  setSynth(fn: SynthFn): void;
  setHooks(h: PlayerHooks): void;
  setText(t: string): void;
  setVolume(v: number): void;
  setPlaybackRate(r: number): void;
  start(text: string): Promise<void>;
  startSegs(segTexts: string[], source: PlaySource, fromSeg?: number): Promise<void>;
  pause(): void;
  resume(): Promise<void>;
  stop(): void;
  skipNext(): void;
  jumpTo(i: number): void;
  seek(t: number): void;
}

const audio = new Audio();
let synthFn: SynthFn | null = null;
let runToken = 0;
let resolveEnded: (() => void) | null = null;
let currentUrl: string | null = null;
let hooks: PlayerHooks = {};
let prefetch: Promise<ArrayBuffer> | null = null;
let prefetchText: string | null = null;

function revokeUrl(): void {
  if (currentUrl) {
    URL.revokeObjectURL(currentUrl);
    currentUrl = null;
  }
}

audio.addEventListener('timeupdate', () => {
  usePlayerStore.setState({
    currentTime: audio.currentTime,
    duration: Number.isFinite(audio.duration) ? audio.duration : 0,
  });
});
audio.addEventListener('ended', () => {
  const r = resolveEnded;
  resolveEnded = null;
  r?.();
});

async function pump(token: number): Promise<void> {
  const store = usePlayerStore;
  while (token === runToken) {
    const s = store.getState();
    if (s.status !== 'running') return;
    if (s.index >= s.segs.length) {
      const allError = s.segs.length > 0 && s.segs.every((x) => x.status === 'error');
      const src = s.source ?? { kind: 'text' as const };
      store.setState({ status: 'idle', source: null, error: allError ? '朗读失败：所有段合成均失败，详见日志' : null });
      hooks.onFinished?.(src);
      hooks = {};
      return;
    }
    const i = s.index;
    const seg = s.segs[i];
    if (seg.status === 'done') {
      store.setState({ index: i + 1 });
      continue;
    }
    store.setState({
      segs: store.getState().segs.map((x, j) => (j === i ? { ...x, status: 'synthesizing' } : x)),
    });
    let buf: ArrayBuffer | null = null;
    try {
      if (!synthFn) throw new Error('朗读器未初始化');
      const p = synthFn(seg.text);
      const nextText = store.getState().segs[i + 1]?.text;
      if (synthFn && nextText && prefetchText !== nextText) {
        prefetchText = nextText;
        prefetch = synthFn(nextText).catch(() => null as unknown as ArrayBuffer);
      }
      buf = await p;
    } catch (e) {
      store.setState({ error: `第 ${i + 1} 段失败：${e instanceof Error ? e.message : String(e)}` });
      buf = null;
    }
    if (token !== runToken) return;
    if (!buf || buf.byteLength === 0) {
      const cur = store.getState();
      if (cur.index !== i) return;
      store.setState({
        segs: cur.segs.map((x, j) => (j === i ? { ...x, status: 'error' } : x)),
        index: i + 1,
      });
      continue;
    }
    revokeUrl();
    currentUrl = URL.createObjectURL(new Blob([buf], { type: 'audio/mpeg' }));
    audio.src = currentUrl;
    audio.currentTime = 0;
    audio.playbackRate = store.getState().playbackRate;
    store.setState({
      segs: store.getState().segs.map((x, j) => (j === i ? { ...x, status: 'playing' } : x)),
      currentTime: 0,
      duration: 0,
    });
    try {
      await new Promise<void>((resolve, reject) => {
        resolveEnded = resolve;
        audio.onerror = () => reject(new Error('音频播放失败'));
        audio.play().catch((e: unknown) => reject(e instanceof Error ? e : new Error(String(e))));
      });
    } catch (e) {
      if (token !== runToken) return;
      store.setState({ status: 'paused', error: e instanceof Error ? e.message : String(e) });
      return;
    }
    if (token !== runToken) return;
    revokeUrl();
    audio.removeAttribute('src');
    store.setState({
      segs: store.getState().segs.map((x, j) => (j === i ? { ...x, status: 'done' } : x)),
      index: i + 1,
      error: null,
    });
    hooks.onSegDone?.(i, store.getState().source ?? { kind: 'text' });
    prefetch = null;
    prefetchText = null;
  }
}

function resetPlayback(): void {
  runToken++;
  audio.pause();
  revokeUrl();
  audio.removeAttribute('src');
  const r = resolveEnded;
  resolveEnded = null;
  r?.();
  prefetch = null;
  prefetchText = null;
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  status: 'idle',
  segs: [],
  index: 0,
  error: null,
  currentTime: 0,
  duration: 0,
  text: '',
  volume: 100,
  playbackRate: 1,
  source: null,

  initPlayback(volume, rate) {
    audio.volume = volume / 100;
    audio.playbackRate = rate;
    set({ volume, playbackRate: rate });
  },
  setSynth(fn) {
    synthFn = fn;
  },
  setHooks(h) {
    hooks = h;
  },
  setText(t) {
    set({ text: t });
  },
  setVolume(v) {
    const clamped = Math.min(100, Math.max(0, v));
    audio.volume = clamped / 100;
    set({ volume: clamped });
  },
  setPlaybackRate(r) {
    audio.playbackRate = r;
    set({ playbackRate: r });
  },

  async start(text) {
    resetPlayback();
    hooks = {};
    const segs = splitForReading(text).map((t) => ({ text: t, status: 'pending' as SegStatus }));
    if (segs.length === 0) {
      set({ error: '没有可朗读的文本' });
      return;
    }
    set({
      text, status: 'running', source: { kind: 'text' }, error: null,
      currentTime: 0, duration: 0, index: 0, segs,
    });
    const token = ++runToken;
    void pump(token);
  },

  async startSegs(segTexts, source, fromSeg = 0) {
    resetPlayback();
    if (segTexts.length === 0) {
      set({ error: '没有可朗读的内容' });
      return;
    }
    const from = Math.min(Math.max(fromSeg, 0), segTexts.length - 1);
    set({
      status: 'running', source, error: null, text: '', currentTime: 0, duration: 0,
      index: from,
      segs: segTexts.map((t, i) => ({ text: t, status: i < from ? 'done' : 'pending' as SegStatus })),
    });
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
    if (audio.src) {
      const ok = await audio.play().then(() => true).catch(() => false);
      if (ok) return;
    }
    const token = ++runToken;
    void pump(token);
  },

  stop() {
    resetPlayback();
    hooks = {};
    set({ status: 'idle', segs: [], index: 0, error: null, currentTime: 0, duration: 0, source: null });
  },

  skipNext() {
    const s = get();
    if (s.status === 'idle' || s.segs.length === 0) return;
    get().jumpTo(s.index + 1);
  },

  jumpTo(i) {
    const s = get();
    if (s.status === 'idle' || s.segs.length === 0) return;
    if (i < 0) return;
    resetPlayback();
    set({ index: Math.min(i, s.segs.length), status: 'running', error: null, currentTime: 0, duration: 0 });
    const token = ++runToken;
    void pump(token);
  },

  seek(t) {
    if (audio.src) audio.currentTime = Math.max(0, Math.min(t, audio.duration || t));
  },
}));
```

行为约定（与旧版一致性）：暂停后恢复会从当前段落开头重新合成播放（旧版同语义）；`jumpTo` 越过最后一段等价于「本段/本章播完」（触发 onFinished，书模式由此自动进下一章）；全段失败时置 idle + 汇总错误。播放内核无法在 vitest（node 环境、无 DOM Audio）自动化，验证依赖 `npm run build` + 任务内人工冒烟说明（见步骤 3.12）。

- [ ] **步骤 3.6：创建 src/lib/mediaSession.ts**

```ts
import type { usePlayerStore } from '../store/playerStore';

type PlayerApi = typeof usePlayerStore;

export function bindMediaSession(store: PlayerApi): void {
  if (!('mediaSession' in navigator)) return;
  const ms = navigator.mediaSession;
  try {
    ms.setActionHandler('play', () => { void store.getState().resume(); });
    ms.setActionHandler('pause', () => store.getState().pause());
    ms.setActionHandler('stop', () => store.getState().stop());
    ms.setActionHandler('nexttrack', () => store.getState().skipNext());
  } catch {
    /* 部分平台不支持的 action 忽略 */
  }
  store.subscribe((s) => {
    ms.playbackState = s.status === 'running' ? 'playing' : s.status === 'paused' ? 'paused' : 'none';
    if (s.segs.length > 0) {
      try {
        ms.metadata = new MediaMetadata({
          title: `TTS Aggregator · 第 ${Math.min(s.index + 1, s.segs.length)}/${s.segs.length} 段`,
          artist: 'TTS Aggregator',
        });
      } catch {
        /* MediaMetadata 不可用忽略 */
      }
    }
  });
}
```

- [ ] **步骤 3.7：创建 src/components/player/PlayerControls.tsx**

```tsx
import { Pause, Play, SkipForward, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { fmtClock } from '@/lib/format';
import { usePlayerStore } from '@/store/playerStore';
import { useSettingsStore } from '@/store/settingsStore';

export const RATE_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export function PlayerControls({ onStart, startDisabled }: {
  onStart?: () => void;
  startDisabled?: boolean;
}) {
  const player = usePlayerStore();
  const { appPrefs, saveAppPrefs } = useSettingsStore();
  const idle = player.status === 'idle';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {onStart && idle && (
          <Button onClick={onStart} disabled={startDisabled}>
            <Play className="mr-1 h-4 w-4" />
            开始朗读
          </Button>
        )}
        {player.status === 'running' && (
          <Button variant="outline" onClick={player.pause}>
            <Pause className="mr-1 h-4 w-4" />
            暂停
          </Button>
        )}
        {player.status === 'paused' && (
          <Button onClick={() => void player.resume()}>
            <Play className="mr-1 h-4 w-4" />
            继续
          </Button>
        )}
        <Button variant="outline" onClick={player.skipNext} disabled={idle}>
          <SkipForward className="mr-1 h-4 w-4" />
          下一段
        </Button>
        <Button variant="destructive" onClick={player.stop} disabled={idle}>
          <Square className="mr-1 h-4 w-4" />
          停止
        </Button>
        {player.segs.length > 0 && (
          <span className="text-sm text-muted-foreground">
            进度 {Math.min(player.index + 1, player.segs.length)}/{player.segs.length} 段
            {player.duration > 0 && ` · ${fmtClock(player.currentTime)} / ${fmtClock(player.duration)}`}
          </span>
        )}
        {player.error && <span className="text-sm text-destructive">{player.error}</span>}
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex min-w-52 flex-1 items-center gap-3">
          <Label className="shrink-0 text-xs text-muted-foreground">进度</Label>
          <Slider
            disabled={player.duration <= 0}
            value={[Math.min(player.currentTime, player.duration || 0)]}
            max={Math.max(player.duration, 1)}
            step={0.5}
            onValueChange={([v]) => player.seek(v)}
            className="flex-1"
          />
        </div>
        <div className="flex w-40 items-center gap-3">
          <Label className="shrink-0 text-xs text-muted-foreground">音量</Label>
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
        <div className="flex items-center gap-2">
          <Label className="shrink-0 text-xs text-muted-foreground">倍速</Label>
          <Select
            value={String(player.playbackRate)}
            onValueChange={(v) => {
              const rate = Number(v);
              player.setPlaybackRate(rate);
              void saveAppPrefs({ ...appPrefs, playbackRate: rate });
            }}
          >
            <SelectTrigger className="w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RATE_OPTIONS.map((r) => (
                <SelectItem key={r} value={String(r)}>{r}x</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **步骤 3.8：创建 src/components/player/SegmentList.tsx**

```tsx
import { cn } from '@/lib/utils';
import { usePlayerStore } from '@/store/playerStore';

export function SegmentList() {
  const { segs, index } = usePlayerStore();
  if (segs.length === 0) return null;
  return (
    <div className="max-h-80 overflow-y-auto rounded-md border">
      {segs.map((seg, i) => (
        <button
          key={i}
          onClick={() => usePlayerStore.getState().jumpTo(i)}
          className={cn(
            'flex w-full gap-2 border-b px-3 py-1.5 text-left text-sm last:border-b-0 hover:bg-accent',
            i === index && 'bg-primary/10',
            seg.status === 'playing' && 'text-primary',
            seg.status === 'error' && 'text-destructive',
            seg.status === 'done' && 'text-muted-foreground',
          )}
        >
          <span className="w-8 shrink-0 text-right text-xs text-muted-foreground">{i + 1}</span>
          <span className="truncate">{seg.text}</span>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **步骤 3.9：重写 src/pages/ReadPage.tsx**

```tsx
import { useRef } from 'react';
import { Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { PlayerControls } from '@/components/player/PlayerControls';
import { SegmentList } from '@/components/player/SegmentList';
import { readTextFile } from '@/lib/encoding';
import { voiceDisplayName } from '@/lib/voices';
import { usePlayerStore } from '@/store/playerStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useVoicesStore } from '@/store/voicesStore';

export function ReadPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const player = usePlayerStore();
  const { synth, saveSynth } = useSettingsStore();
  const { voices, load } = useVoicesStore();

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <h1 className="text-xl font-semibold">朗读</h1>

      <Card>
        <CardContent className="space-y-3 pt-6">
          <Textarea
            rows={8}
            placeholder="粘贴或输入要朗读的文本，或导入 TXT…"
            value={player.text}
            onChange={(e) => player.setText(e.target.value)}
          />
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <Upload className="mr-1 h-4 w-4" />
              导入 TXT
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".txt,text/plain"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) player.setText(await readTextFile(file));
                e.target.value = '';
              }}
            />
            <div className="grow" />
            <span className="text-sm text-muted-foreground">{player.text.length} 字</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">合成参数</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">音色</Label>
              <Select
                value={synth.voice}
                onOpenChange={(open) => { if (open) void load(); }}
                onValueChange={(v) => void saveSynth({ ...synth, voice: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="节点默认音色" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="node-default">节点默认音色</SelectItem>
                  {voices.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {voiceDisplayName(v)}（{v.id}）
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">语速 {synth.rate}</Label>
              <Slider
                value={[synth.rate]} min={-100} max={100} step={1}
                onValueChange={([v]) => void saveSynth({ ...synth, rate: v })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">音调 {synth.pitch}</Label>
              <Slider
                value={[synth.pitch]} min={-100} max={100} step={1}
                onValueChange={([v]) => void saveSynth({ ...synth, pitch: v })}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <PlayerControls onStart={() => void player.start(player.text)} startDisabled={!player.text.trim()} />
        </CardContent>
      </Card>

      {player.segs.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <SegmentList />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
```

注意：音色 Select 里空字符串无法作为 Radix Select 的 value，用哨兵值 `node-default` 表示「节点默认」（落库仍存 `''`——`onValueChange` 需要转换：`saveSynth({ ...synth, voice: v === 'node-default' ? '' : v })`）。请把上面 onValueChange 改为：

```tsx
onValueChange={(v) => void saveSynth({ ...synth, voice: v === 'node-default' ? '' : v })}
```

同时 `value` 改为 `synth.voice || 'node-default'`。

- [ ] **步骤 3.10：修改 src/main.tsx（initPlayback + mediaSession）**

import 区追加：

```ts
import { bindMediaSession } from './lib/mediaSession';
```

在 `await useSettingsStore.getState().load();` 之后插入：

```ts
const bootPrefs = useSettingsStore.getState().appPrefs;
usePlayerStore.getState().initPlayback(bootPrefs.volume, bootPrefs.playbackRate);
bindMediaSession(usePlayerStore);
```

（现有 `setSynth(async (text) => { const result = await synthesizeText(text); return result.bytes; })` 保留不动——与新 playerStore 的 `SynthFn` 签名一致。）

- [ ] **步骤 3.11：全量验证**

```powershell
npm test
npm run build
```

预期：全部 PASS + `Build succeeded`。

- [ ] **步骤 3.12：人工冒烟清单（不入 commit，验证后继续）**

`npm run tauri dev` 下确认：粘贴文本开始朗读、暂停/继续（从段首重播）、下一段、段落列表点击跳转、音量/倍速即时生效且重启后保留、系统媒体键可用。若有 `tauri dev` 环境问题只记录不阻塞 commit（自动化验证已过）。

- [ ] **步骤 3.13：Commit**

```powershell
git add src/lib/format.ts src/lib/format.test.ts src/lib/mediaSession.ts src/store/playerStore.ts src/components/player/ src/pages/ReadPage.tsx src/main.tsx
git commit -m "feat: 播放内核升级——音量/倍速/段落跳转/进度条与媒体会话"
```

## 任务 4：书架数据层（books/chapters 表 + 目录解析 TDD）

**文件：**
- 创建：`src/lib/toc.test.ts`、`src/lib/toc.ts`
- 修改：`src/lib/db.ts`（SCHEMA + BooksRepo；LOG_QUERY_LIMIT 顺延任务 8，本任务不动）

- [ ] **步骤 4.1：编写失败的测试 src/lib/toc.test.ts**

```ts
import { describe, expect, it } from 'vitest';
import { parseCnNum, parseToc } from './toc';

describe('parseCnNum', () => {
  it('阿拉伯数字与常用中文数字', () => {
    expect(parseCnNum('12')).toBe(12);
    expect(parseCnNum('三')).toBe(3);
    expect(parseCnNum('十')).toBe(10);
    expect(parseCnNum('十二')).toBe(12);
    expect(parseCnNum('二十五')).toBe(25);
    expect(parseCnNum('一百零八')).toBe(108);
    expect(parseCnNum('二千零二十四')).toBe(2024);
    expect(parseCnNum('三万五千')).toBe(35000);
  });
});

describe('parseToc', () => {
  const book = [
    '第一章 初见',
    '林凡走出车站。',
    '第二章 重逢',
    '老友相视一笑。',
    '第二卷 风云',
    '第三章 风起',
    '山雨欲来。',
    '第X章 尾声',
    '终。',
  ].join('\n');

  it('章节切分与内容归属', () => {
    const units = parseToc(book);
    expect(units.map((u) => u.title)).toEqual(['第一章 初见', '第二章 重逢', '第三章 风起', '第X章 尾声']);
    expect(units[0].content).toContain('林凡');
    expect(units[0].content).not.toContain('重逢');
  });

  it('卷标题只影响其后章节的 volume 归属', () => {
    const units = parseToc(book);
    expect(units.map((u) => u.volume)).toEqual(['', '', '第二卷 风云', '第二卷 风云']);
  });

  it('无足够章节标题时整体作为全文单章', () => {
    const units = parseToc('你好。\n世界。');
    expect(units).toEqual([{ volume: '', title: '全文', content: '你好。\n世界。' }]);
  });

  it('支持 1、 与 1. 编号行', () => {
    const units = parseToc('1、开始\n甲\n2. 继续\n乙');
    expect(units.map((u) => u.title)).toEqual(['1、开始', '2. 继续']);
  });

  it('空文本返回空数组', () => {
    expect(parseToc('   \n\n  ')).toEqual([]);
  });
});
```

- [ ] **步骤 4.2：运行测试验证失败**

```powershell
npx vitest run src/lib/toc.test.ts
```

预期：FAIL，找不到 `./toc`。

- [ ] **步骤 4.3：创建 src/lib/toc.ts**

```ts
export interface TocEntry {
  volume: string;
  title: string;
  content: string;
}

const NUM_MAP: Record<string, number> = {
  〇: 0, 零: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
};

export function parseCnNum(s: string): number {
  if (/^[0-9]+$/.test(s)) return Number(s);
  if (s.includes('万')) {
    const [t, o] = s.split('万');
    return (parseCnNum(t) || 1) * 10000 + (o ? parseCnNum(o) : 0);
  }
  if (s.includes('千')) {
    const [t, o] = s.split('千');
    return (parseCnNum(t) || 1) * 1000 + (o ? parseCnNum(o) : 0);
  }
  if (s.includes('百')) {
    const [t, o] = s.split('百');
    return (parseCnNum(t) || 1) * 100 + (o ? parseCnNum(o) : 0);
  }
  if (s.includes('十')) {
    const [t, o] = s.split('十');
    return (t ? NUM_MAP[t] ?? 0 : 1) * 10 + (o ? NUM_MAP[o] ?? 0 : 0);
  }
  let n = 0;
  for (const ch of s) {
    const d = NUM_MAP[ch];
    if (d === undefined) return Number.NaN;
    n = n * 10 + d;
  }
  return n;
}

const CN_OR_DIGIT = '[0-9〇零一二三四五六七八九十百千万IVXLCivxlc]+';
const KIND_PATTERNS: { kind: 'volume' | 'chapter'; re: RegExp }[] = [
  { kind: 'volume', re: new RegExp(`^\\s*第${CN_OR_DIGIT}\\s*[卷篇章部]`) },
  { kind: 'chapter', re: new RegExp(`^\\s*第${CN_OR_DIGIT}\\s*[章回节集]`) },
  { kind: 'chapter', re: /^\s*[0-9]{1,4}\s*[、.．]\s*\S/ },
];

export function parseToc(raw: string): TocEntry[] {
  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  const heads: { line: number; kind: 'volume' | 'chapter'; title: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t || t.length > 50) continue;
    for (const p of KIND_PATTERNS) {
      if (p.re.test(t)) {
        heads.push({ line: i, kind: p.kind, title: t });
        break;
      }
    }
  }
  const chapterHeads = heads.filter((h) => h.kind === 'chapter');
  if (chapterHeads.length < 2) {
    const all = raw.replace(/\r\n/g, '\n').trim();
    return all ? [{ volume: '', title: '全文', content: all }] : [];
  }
  const out: TocEntry[] = [];
  let volume = '';
  for (let h = 0; h < heads.length; h++) {
    const head = heads[h];
    if (head.kind === 'volume') {
      volume = head.title;
      continue;
    }
    const next = heads[h + 1];
    const content = lines.slice(head.line + 1, next ? next.line : lines.length).join('\n').trim();
    out.push({ volume, title: head.title, content });
  }
  return out;
}
```

说明：卷级判定为「第X卷/篇/章/部」中的**卷/篇/部** + 含「篇章部」的卷式头；章级为「第X章/回/节/集」与「数字、/数字.」行。注意「第X章」同时含章字——KIND_PATTERNS 中卷正则 `第…[卷篇章部]` 会先命中「第X章」（章 ∈ 篇章部）。**修正：卷正则必须排除「章」单独出现的常见章头。** 将卷正则改为仅匹配 `卷|篇|部`：

```ts
{ kind: 'volume', re: new RegExp(`^\\s*第${CN_OR_DIGIT}\\s*[卷篇部]`) },
```

（测试数据「第二卷 风云」由卷正则命中，「第一章/第二章」由章正则命中，无歧义。）

- [ ] **步骤 4.4：运行测试验证通过**

```powershell
npx vitest run src/lib/toc.test.ts
```

预期：PASS（5 + 3 用例）。若 `第X章 尾声` 未识别，检查 CN_OR_DIGIT 是否包含罗马字符 `IVXLCivxlc`。

- [ ] **步骤 4.5：修改 src/lib/db.ts（books/chapters 建表 + BooksRepo）**

SCHEMA 数组末尾（`settings` 建表语句之后）追加三条：

```ts
  `CREATE TABLE IF NOT EXISTS books (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    imported_at INTEGER NOT NULL,
    last_chapter INTEGER NOT NULL DEFAULT 0,
    last_segment INTEGER NOT NULL DEFAULT 0,
    playback_rate REAL NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS chapters (
    id TEXT PRIMARY KEY,
    book_id TEXT NOT NULL,
    idx INTEGER NOT NULL,
    volume TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT ''
  )`,
  `CREATE INDEX IF NOT EXISTS idx_chapters_book ON chapters(book_id, idx)`,
```

import 区追加 `newId` 与书架类型：

```ts
import {
  API_VERSION_ORDINAL, HEALTH_ORDINAL, MODE_ORDINAL, newId,
  type ApiVersion, type Book, type BookChapter, type CallLog, type CallMode, type Health, type TtsNode,
} from '../types/models';
```

import 区追加 `TocEntry`（toc 纯函数类型，db 只依赖其形状）：

```ts
import type { TocEntry } from './toc';
```

文件末尾追加书架仓储：

```ts
// ---------- 书架 ----------

export interface BookRow {
  id: string; title: string; imported_at: number;
  last_chapter: number; last_segment: number; playback_rate: number;
}

export function rowToBook(r: BookRow): Book {
  return {
    id: r.id, title: r.title, importedAt: r.imported_at,
    lastChapter: r.last_chapter, lastSegment: r.last_segment, playbackRate: r.playback_rate,
  };
}

export function bookRow(b: Book): unknown[] {
  return [b.id, b.title, b.importedAt, b.lastChapter, b.lastSegment, b.playbackRate];
}

export interface BookTocItem {
  idx: number;
  volume: string;
  title: string;
}

export interface BooksRepo {
  getAll(): Promise<Book[]>;
  getToc(bookId: string): Promise<BookTocItem[]>;
  getChapter(bookId: string, idx: number): Promise<BookChapter | null>;
  hasChapter(bookId: string, idx: number): Promise<boolean>;
  importBook(title: string, units: TocEntry[]): Promise<Book>;
  delete(id: string): Promise<void>;
  rename(id: string, title: string): Promise<void>;
  setProgress(id: string, chapter: number, segment: number): Promise<void>;
  setRate(id: string, rate: number): Promise<void>;
}

export function createBooksRepo(db: SqlExec): BooksRepo {
  return {
    async getAll() {
      const rows = await db.select<BookRow>('SELECT * FROM books ORDER BY imported_at DESC');
      return rows.map(rowToBook);
    },
    async getToc(bookId) {
      return db.select<BookTocItem>(
        'SELECT idx, volume, title FROM chapters WHERE book_id = ? ORDER BY idx ASC',
        [bookId],
      );
    },
    async getChapter(bookId, idx) {
      const rows = await db.select<{
        id: string; book_id: string; idx: number; volume: string; title: string; content: string;
      }>('SELECT * FROM chapters WHERE book_id = ? AND idx = ?', [bookId, idx]);
      if (!rows.length) return null;
      const r = rows[0];
      return { id: r.id, bookId: r.book_id, idx: r.idx, volume: r.volume, title: r.title, content: r.content };
    },
    async hasChapter(bookId, idx) {
      const rows = await db.select<{ n: number }>(
        'SELECT COUNT(*) AS n FROM chapters WHERE book_id = ? AND idx = ?',
        [bookId, idx],
      );
      return (rows[0]?.n ?? 0) > 0;
    },
    async importBook(title, units) {
      if (units.length === 0) throw new Error('未识别到任何内容');
      const book: Book = {
        id: newId(), title, importedAt: Date.now(),
        lastChapter: 0, lastSegment: 0, playbackRate: 0,
      };
      await db.execute(
        'INSERT INTO books (id, title, imported_at, last_chapter, last_segment, playback_rate) VALUES (?,?,?,?,?,?)',
        bookRow(book),
      );
      for (let i = 0; i < units.length; i++) {
        await db.execute(
          'INSERT INTO chapters (id, book_id, idx, volume, title, content) VALUES (?,?,?,?,?,?)',
          [newId(), book.id, i, units[i].volume, units[i].title, units[i].content],
        );
      }
      return book;
    },
    async delete(id) {
      await db.execute('DELETE FROM chapters WHERE book_id = ?', [id]);
      await db.execute('DELETE FROM books WHERE id = ?', [id]);
    },
    async rename(id, title) {
      await db.execute('UPDATE books SET title = ? WHERE id = ?', [title, id]);
    },
    async setProgress(id, chapter, segment) {
      await db.execute('UPDATE books SET last_chapter = ?, last_segment = ? WHERE id = ?', [chapter, segment, id]);
    },
    async setRate(id, rate) {
      await db.execute('UPDATE books SET playback_rate = ? WHERE id = ?', [rate, id]);
    },
  };
}
```

`last_segment` 语义：**该章内下一个待播分段的下标**（0-based；等于分段总数表示本章已播完）。`playback_rate = 0` 表示「跟随全局默认倍速」。

- [ ] **步骤 4.6：全量验证（含既有 db 行映射测试不受影响）**

```powershell
npm test
npm run build
```

预期：全部 PASS + `Build succeeded`。（BooksRepo 依赖 tauri plugin-sql，vitest node 环境无法实例化——与既有 NodesRepo/LogsRepo 相同策略：仓库层不写单测，行映射纯函数已可测。）

- [ ] **步骤 4.7：Commit**

```powershell
git add src/lib/toc.ts src/lib/toc.test.ts src/lib/db.ts
git commit -m "feat: 书架数据层——books/chapters 表与内置多级目录解析"
```

---

## 任务 5：书架页（导入/目录树/断点续听/删除/改名）

**文件：**
- 修改：`src/store/deps.ts`、`src/main.tsx`、`src/nav.tsx`、`src/App.tsx`
- 创建：`src/store/bookPlay.ts`、`src/components/book/ChapterTree.tsx`、`src/pages/BooksPage.tsx`

- [ ] **步骤 5.1：修改 src/store/deps.ts（注入 books）**

```ts
import type { Api } from '../lib/api';
import type { BooksRepo, LogsRepo, NodesRepo, SettingsRepo, SqlExec } from '../lib/db';

export interface Deps {
  db: SqlExec;
  api: Api;
  nodes: NodesRepo;
  logs: LogsRepo;
  settings: SettingsRepo;
  books: BooksRepo;
}
```

- [ ] **步骤 5.2：修改 src/main.tsx（创建 books repo）**

import 追加：

```ts
import { createBooksRepo, createLogsRepo, createNodesRepo, createSettingsRepo, openDb } from './lib/db';
```

（替换原 import 行即可。）`setDeps({...})` 对象追加一行：

```ts
books: createBooksRepo(db),
```

- [ ] **步骤 5.3：创建 src/store/bookPlay.ts**

```ts
import { toast } from 'sonner';
import { splitForReading } from '../lib/split';
import { deps } from './deps';
import { usePlayerStore } from './playerStore';

export async function playChapter(bookId: string, chapterIdx: number, fromSeg = 0): Promise<void> {
  const chapter = await deps().books.getChapter(bookId, chapterIdx);
  if (!chapter) {
    toast.error('章节不存在');
    return;
  }
  const segs = splitForReading(chapter.content);
  if (segs.length === 0) {
    toast.error('本章没有可朗读的内容');
    return;
  }
  const books = await deps().books.getAll();
  const book = books.find((b) => b.id === bookId);
  const player = usePlayerStore.getState();
  if (book && book.playbackRate > 0) player.setPlaybackRate(book.playbackRate);
  player.setHooks({
    onSegDone: (segIdx) => {
      void deps().books.setProgress(bookId, chapterIdx, Math.min(segIdx + 1, segs.length));
    },
    onFinished: async () => {
      const next = chapterIdx + 1;
      const has = await deps().books.hasChapter(bookId, next);
      if (has) {
        await playChapter(bookId, next, 0);
        return;
      }
      await deps().books.setProgress(bookId, chapterIdx, segs.length);
      toast('本书已播完');
    },
  });
  await usePlayerStore.getState().startSegs(segs, { kind: 'book', bookId, chapterIdx }, fromSeg);
}
```

- [ ] **步骤 5.4：修改 src/nav.tsx（插入书架项）**

import 追加 `Library`：

```tsx
import { AudioLines, FileClock, Library, ListMusic, Server, Settings } from 'lucide-react';
```

`NAV_ITEMS` 在朗读之后插入：

```ts
{ to: '/books', label: '书架', icon: Library },
```

- [ ] **步骤 5.5：修改 src/App.tsx（路由 + 播放指示细化）**

import 追加：

```tsx
import { BooksPage } from './pages/BooksPage';
```

`NavRow` 中播放指示改为区分来源（替换原 `{item.to === '/' && playing && <PlayingDot />}`）：

```tsx
{item.to === '/' && playing && playerSource !== 'book' && <PlayingDot />}
{item.to === '/books' && playing && playerSource === 'book' && <PlayingDot />}
```

`NavRow` 内读取来源：

```tsx
const source = usePlayerStore((s) => s.source);
const playing = usePlayerStore((s) => s.status !== 'idle');
const playerSource = source?.kind;
```

Routes 中插入：

```tsx
<Route path="/books" element={<BooksPage />} />
```

- [ ] **步骤 5.6：创建 src/components/book/ChapterTree.tsx**

```tsx
import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { BookTocItem } from '@/lib/db';

export function ChapterTree({ items, currentIdx, onPick }: {
  items: BookTocItem[];
  currentIdx: number | null;
  onPick: (idx: number) => void;
}) {
  const groups = useMemo(() => {
    const map = new Map<string, BookTocItem[]>();
    for (const it of items) {
      const key = it.volume || '';
      const arr = map.get(key) ?? [];
      arr.push(it);
      map.set(key, arr);
    }
    return [...map.entries()];
  }, [items]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  function toggle(volume: string): void {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(volume)) next.delete(volume);
      else next.add(volume);
      return next;
    });
  }

  if (items.length === 0) {
    return <div className="py-8 text-center text-sm text-muted-foreground">本书没有章节</div>;
  }

  return (
    <div className="space-y-1">
      {groups.map(([volume, chs]) => (
        <div key={volume || '__root'}>
          {volume && (
            <button
              className="flex w-full items-center gap-1 rounded px-2 py-1 text-left text-sm font-medium hover:bg-accent"
              onClick={() => toggle(volume)}
            >
              {collapsed.has(volume)
                ? <ChevronRight className="h-4 w-4" />
                : <ChevronDown className="h-4 w-4" />}
              {volume}
              <span className="ml-auto text-xs text-muted-foreground">{chs.length} 章</span>
            </button>
          )}
          {(!volume || !collapsed.has(volume)) && (
            <ul className={cn('space-y-0.5', volume && 'ml-4')}>
              {chs.map((ch) => (
                <li key={ch.idx}>
                  <button
                    onClick={() => onPick(ch.idx)}
                    className={cn(
                      'w-full truncate rounded px-2 py-1 text-left text-sm hover:bg-accent',
                      currentIdx === ch.idx && 'bg-primary/10 font-medium text-primary',
                    )}
                  >
                    {ch.title}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **步骤 5.7：创建 src/pages/BooksPage.tsx**

```tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pencil, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ChapterTree } from '@/components/book/ChapterTree';
import { PlayerControls } from '@/components/player/PlayerControls';
import { readTextFile } from '@/lib/encoding';
import type { BookTocItem } from '@/lib/db';
import { parseToc } from '@/lib/toc';
import { playChapter } from '@/store/bookPlay';
import { deps } from '@/store/deps';
import { usePlayerStore } from '@/store/playerStore';
import type { Book } from '@/types/models';

export function BooksPage() {
  const [books, setBooks] = useState<Book[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [toc, setToc] = useState<BookTocItem[]>([]);
  const [resumeFor, setResumeFor] = useState<Book | null>(null);
  const [deleteFor, setDeleteFor] = useState<Book | null>(null);
  const [renameFor, setRenameFor] = useState<Book | null>(null);
  const [renameText, setRenameText] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const player = usePlayerStore();
  const currentChapter =
    player.source?.kind === 'book' && player.source.bookId === selected
      ? player.source.chapterIdx
      : null;

  const reload = useCallback(async () => {
    setBooks(await deps().books.getAll());
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  useEffect(() => {
    if (!selected) {
      setToc([]);
      return;
    }
    void deps().books.getToc(selected).then(setToc);
  }, [selected, books]);

  async function onImport(file: File): Promise<void> {
    setBusy(true);
    try {
      const raw = await readTextFile(file);
      const units = parseToc(raw);
      if (units.length === 0) {
        toast.error('没有识别到任何内容');
        return;
      }
      const title = file.name.replace(/\.txt$/i, '');
      await deps().books.importBook(title, units);
      toast.success(`已入库《${title}》，共 ${units.length} 章`);
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function openBook(b: Book): void {
    setSelected(b.id);
    if (b.lastChapter > 0 || b.lastSegment > 0) setResumeFor(b);
    else void playChapter(b.id, 0, 0);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">书架</h1>
        <Button onClick={() => fileRef.current?.click()} disabled={busy}>
          <Upload className="mr-1 h-4 w-4" />
          {busy ? '导入中…' : '导入 TXT'}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".txt,text/plain"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onImport(f);
            e.target.value = '';
          }}
        />
      </div>

      {books.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            还没有书。导入 TXT 小说，自动解析卷/章目录后即可连续听书。
          </CardContent>
        </Card>
      )}

      {books.map((b) => (
        <Card key={b.id} className={selected === b.id ? 'border-primary' : ''}>
          <CardContent className="flex items-center gap-3 pt-6">
            <button className="min-w-0 flex-1 text-left" onClick={() => openBook(b)}>
              <div className="truncate font-medium">{b.title}</div>
              <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                <span>{new Date(b.importedAt).toLocaleDateString('zh-CN')}</span>
                {b.playbackRate > 0 && <Badge variant="secondary">{b.playbackRate}x</Badge>}
              </div>
            </button>
            <Button variant="ghost" size="icon" title="改名" onClick={() => { setRenameFor(b); setRenameText(b.title); }}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" title="删除" onClick={() => setDeleteFor(b)}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </CardContent>
        </Card>
      ))}

      {selected && (
        <Card>
          <CardContent className="pt-6">
            <PlayerControls />
            <div className="mt-4">
              <ChapterTree
                items={toc}
                currentIdx={currentChapter}
                onPick={(idx) => void playChapter(selected, idx, 0)}
              />
            </div>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={!!resumeFor} onOpenChange={(o) => { if (!o) setResumeFor(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>继续上次进度？</AlertDialogTitle>
            <AlertDialogDescription>
              《{resumeFor?.title}》上次听到第 {(resumeFor?.lastChapter ?? 0) + 1} 章。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>从头开始</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (resumeFor) void playChapter(resumeFor.id, resumeFor.lastChapter, resumeFor.lastSegment);
                setResumeFor(null);
              }}
            >
              继续播放
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteFor} onOpenChange={(o) => { if (!o) setDeleteFor(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除《{deleteFor?.title}》？</AlertDialogTitle>
            <AlertDialogDescription>书与全部章节内容将被删除，不可恢复。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!deleteFor) return;
                void deps().books.delete(deleteFor.id).then(() => {
                  if (selected === deleteFor.id) { setSelected(null); usePlayerStore.getState().stop(); }
                  return reload();
                });
                setDeleteFor(null);
              }}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!renameFor} onOpenChange={(o) => { if (!o) setRenameFor(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>重命名书名</DialogTitle>
          </DialogHeader>
          <Input value={renameText} onChange={(e) => setRenameText(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameFor(null)}>取消</Button>
            <Button
              onClick={() => {
                if (!renameFor || !renameText.trim()) return;
                void deps().books.rename(renameFor.id, renameText.trim()).then(reload);
                setRenameFor(null);
              }}
            >
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

注意「从头开始」路径：AlertDialogCancel 关闭后需显式从头播。修正 `AlertDialogCancel` 为受控行为——给「从头开始」加 `onClick`：

```tsx
<AlertDialogCancel
  onClick={() => {
    if (resumeFor) {
      void deps().books.setProgress(resumeFor.id, 0, 0).then(() => playChapter(resumeFor.id, 0, 0));
    }
    setResumeFor(null);
  }}
>
  从头开始
</AlertDialogCancel>
```

- [ ] **步骤 5.8：全量验证**

```powershell
npm test
npm run build
```

预期：全部 PASS + `Build succeeded`。

- [ ] **步骤 5.9：人工冒烟清单**

导入带「第X章/第X卷/1、」标题的 TXT：章节树按卷分组；点章即播；播放中切章；停止后重开弹续听框；删除/改名生效；跨章自动连播到全书结束 toast。

- [ ] **步骤 5.10：Commit**

```powershell
git add src/store/deps.ts src/store/bookPlay.ts src/main.tsx src/nav.tsx src/App.tsx src/components/book/ChapterTree.tsx src/pages/BooksPage.tsx
git commit -m "feat: 书架页——TXT 入库、目录树播放与断点续听"
```

## 任务 6：节点页 + 导入面板迁移到 shadcn

**文件：**
- 重写：`src/pages/NodesPage.tsx`、`src/pages/ImportPanel.tsx`
- 业务逻辑（nodesStore/importers/pool 配置写入）零改动，仅 UI 层替换：confirm() → AlertDialog、手写 dialog → Dialog、table/tabs/badge → shadcn、新增节点搜索框（Hick's Law：先过滤再操作）。

- [ ] **步骤 6.1：重写 src/pages/NodesPage.tsx**

```tsx
import { useEffect, useState } from 'react';
import { Plus, RefreshCw, Search } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { useNodesStore } from '@/store/nodesStore';
import { useSettingsStore } from '@/store/settingsStore';
import { isCoolingDown, type CallMode, type TtsNode } from '@/types/models';
import { ImportPanel } from './ImportPanel';

const MODES: [CallMode, string, string][] = [
  ['AUTO', '自动', '按健康度依次尝试，失败自动切换'],
  ['GROUP', '组', '组内轮询，成功后换下一个'],
  ['MANUAL', '手选', '只用选中节点，连败 3 次后停止'],
];

function healthBadge(n: TtsNode) {
  if (n.disabled) return <Badge className="bg-muted text-muted-foreground hover:bg-muted">已禁用</Badge>;
  if (isCoolingDown(n, Date.now())) return <Badge className="bg-warning/20 text-warning hover:bg-warning/20">冷却中</Badge>;
  if (n.health === 'OK') return <Badge className="bg-success/15 text-success hover:bg-success/15">正常</Badge>;
  if (n.health === 'FAIL') return <Badge variant="destructive">失败</Badge>;
  return <Badge variant="secondary">未测</Badge>;
}

const emptyForm = { baseUrl: '', label: '', apiKey: '' };

export function NodesPage() {
  const st = useNodesStore();
  const { pool, updatePool, appPrefs, saveAppPrefs } = useSettingsStore();
  const [showForm, setShowForm] = useState<null | 'add' | 'edit'>(null);
  const [editOrig, setEditOrig] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [deleteFor, setDeleteFor] = useState<TtsNode | null>(null);

  useEffect(() => { void st.load(); }, []);

  const shown = st.nodes.filter(
    (n) => !q || n.label.includes(q) || n.baseUrl.toLowerCase().includes(q.toLowerCase()),
  );

  function openAdd(): void {
    setForm(emptyForm);
    setEditOrig('');
    setErr(null);
    setShowForm('add');
  }

  function openEdit(n: TtsNode): void {
    setForm({ baseUrl: n.baseUrl, label: n.label, apiKey: n.apiKey ?? '' });
    setEditOrig(n.baseUrl);
    setErr(null);
    setShowForm('edit');
  }

  async function submit(): Promise<void> {
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
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">节点</h1>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 pt-6">
          <Button onClick={openAdd}>
            <Plus className="mr-1 h-4 w-4" />
            添加节点
          </Button>
          <Button variant="outline" onClick={() => void st.probeAll()} disabled={st.probing}>
            <RefreshCw className="mr-1 h-4 w-4" />
            {st.probing ? (st.probeProgress ?? '探测中…') : '全部探测'}
          </Button>
          <span className="text-sm text-muted-foreground">共 {st.nodes.length} 个</span>
          <div className="ml-auto flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input placeholder="搜索备注 / URL" value={q} onChange={(e) => setQ(e.target.value)} className="w-56" />
            <Label className="text-xs text-muted-foreground">探测并发</Label>
            <Input
              type="number" min={1} max={8} className="w-16"
              value={appPrefs.probeConcurrency}
              onChange={(e) => void saveAppPrefs({
                ...appPrefs,
                probeConcurrency: Math.max(1, Math.min(8, Number(e.target.value) || 1)),
              })}
            />
          </div>
        </CardContent>
      </Card>

      <ImportPanel />

      <Card>
        <CardContent className="pt-6">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {MODES.map(([mode, label, desc]) => (
              <Button
                key={mode}
                variant={pool.mode === mode ? 'default' : 'outline'}
                size="sm"
                title={desc}
                onClick={() => void updatePool((c) => ({ ...c, mode }))}
              >
                {label}
              </Button>
            ))}
            <span className="text-sm text-muted-foreground">{MODES.find(([m]) => m === pool.mode)?.[2]}</span>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>状态</TableHead>
                <TableHead>节点</TableHead>
                <TableHead>API</TableHead>
                <TableHead>音色</TableHead>
                <TableHead>组</TableHead>
                <TableHead>手选</TableHead>
                <TableHead>来源</TableHead>
                <TableHead className="w-64">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((n) => (
                <TableRow key={n.id}>
                  <TableCell>{healthBadge(n)}</TableCell>
                  <TableCell>
                    <div className="font-medium">{n.label || '—'}</div>
                    <div className="font-mono text-xs text-muted-foreground">{n.baseUrl}</div>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Badge variant="outline">{n.apiVersion}</Badge>
                      {n.keyless && <Badge className="bg-success/15 text-success hover:bg-success/15">免Key</Badge>}
                    </div>
                  </TableCell>
                  <TableCell>{n.voiceCount || '—'}</TableCell>
                  <TableCell>
                    <Checkbox
                      checked={pool.groupIds.includes(n.id)}
                      onCheckedChange={() => void updatePool((c) => ({
                        ...c,
                        groupIds: c.groupIds.includes(n.id)
                          ? c.groupIds.filter((x) => x !== n.id)
                          : [...c.groupIds, n.id],
                      }))}
                    />
                  </TableCell>
                  <TableCell>
                    <Checkbox
                      checked={pool.manualId === n.id}
                      onCheckedChange={() => void updatePool((c) => ({ ...c, manualId: n.id, manualFailCount: 0 }))}
                    />
                  </TableCell>
                  <TableCell className="text-muted-foreground">{n.source}</TableCell>
                  <TableCell>
                    <div className="flex flex-nowrap gap-1">
                      <Button variant="outline" size="sm" onClick={() => void st.reprobe(n)}>测试</Button>
                      <Button variant="outline" size="sm" onClick={() => openEdit(n)}>编辑</Button>
                      <Button variant="outline" size="sm" onClick={() => void st.setDisabled([n.id], !n.disabled)}>
                        {n.disabled ? '启用' : '禁用'}
                      </Button>
                      <Button variant="outline" size="sm" className="text-destructive" onClick={() => setDeleteFor(n)}>删</Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {shown.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                    {st.nodes.length ? '没有匹配的节点' : '还没有节点，点击“添加节点”'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!showForm} onOpenChange={(o) => { if (!o) setShowForm(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{showForm === 'add' ? '添加节点' : '编辑节点'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>节点 URL</Label>
              <Input placeholder="https://tts.example.com" value={form.baseUrl}
                onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>备注名</Label>
              <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>API Key（免 Key 节点留空）</Label>
              <Input type="password" value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} />
            </div>
            {err && <div className="text-sm text-destructive">{err}</div>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(null)}>取消</Button>
            <Button onClick={() => void submit()}>保存并探测</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteFor} onOpenChange={(o) => { if (!o) setDeleteFor(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除 {deleteFor?.baseUrl}？</AlertDialogTitle>
            <AlertDialogDescription>节点及其探测状态将被删除，可通过重新导入恢复。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (deleteFor) void st.remove([deleteFor.id]); setDeleteFor(null); }}>
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
```

（手选列沿用原 radio 单选语义，UI 改为 Checkbox 组内互斥由 store 的 manualId 唯一性保证——单选视觉差异可接受，逻辑等价：点击即 `manualId = n.id`。）

- [ ] **步骤 6.2：重写 src/pages/ImportPanel.tsx**

```tsx
import { useRef, useState } from 'react';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { Check, Upload } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { decodeTextBuffer } from '@/lib/encoding';
import { buildBaseUrl, dedupeByBaseUrl, rankRelevance, type HostRecord } from '@/lib/importers/hosts';
import { parseFofaCsv, parseFofaJson } from '@/lib/importers/fofa-file';
import { searchFofa, searchZoomeye } from '@/lib/importers/search';
import { parseZoomeyeJson } from '@/lib/importers/zoomeye-file';
import { deps } from '@/store/deps';
import { useNodesStore } from '@/store/nodesStore';

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
    <Card>
      <CardContent className="space-y-3 pt-6">
        <Tabs value={tab} onValueChange={(v) => { setTab(v as Tab); setRecords(null); setErr(null); }}>
          <TabsList>
            {TABS.map(([t, label]) => (
              <TabsTrigger key={t} value={t}>{label}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {tab.endsWith('-file') && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <Upload className="mr-1 h-4 w-4" />
              选择文件
            </Button>
            <span className="text-sm text-muted-foreground">支持 FOFA 导出的 CSV/JSON、ZoomEye 导出的 JSON</span>
            <input ref={fileRef} type="file" accept=".csv,.json" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFilePicked(f); e.target.value = ''; }} />
          </div>
        )}

        {tab === 'fofa-api' && (
          <div className="flex gap-2">
            <Input placeholder="email" aria-label="FOFA email" value={fofa.email} onChange={(e) => setFofa({ ...fofa, email: e.target.value })} />
            <Input placeholder="api key" aria-label="FOFA api key" value={fofa.key} onChange={(e) => setFofa({ ...fofa, key: e.target.value })} />
            <Input placeholder="查询语法" aria-label="FOFA 查询语法" className="grow" value={fofa.query} onChange={(e) => setFofa({ ...fofa, query: e.target.value })} />
            <Button disabled={busy} onClick={() => void runApiSearch()}>{busy ? '搜索中…' : '搜索'}</Button>
          </div>
        )}

        {tab === 'zoomeye-api' && (
          <div className="flex gap-2">
            <Input placeholder="API-KEY" aria-label="ZoomEye API-KEY" value={ze.apiKey} onChange={(e) => setZe({ ...ze, apiKey: e.target.value })} />
            <Input placeholder="关键词" aria-label="ZoomEye 关键词" className="grow" value={ze.query} onChange={(e) => setZe({ ...ze, query: e.target.value })} />
            <Button disabled={busy} onClick={() => void runApiSearch()}>{busy ? '搜索中…' : '搜索'}</Button>
          </div>
        )}

        {err && <div className="text-sm text-destructive">{err}</div>}

        {records && records.length > 0 && (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                命中 {records.length} 条，已勾选 {checked.size} 条（含 tts/speech/voice 关键词的默认勾选）
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setChecked(new Set(records.map((_, i) => i)))}>全选</Button>
                <Button variant="outline" size="sm" onClick={() => setChecked(new Set())}>全不选</Button>
                <Button size="sm" disabled={busy || checked.size === 0} onClick={() => void doImport()}>
                  <Check className="mr-1 h-4 w-4" />
                  {busy ? '导入中…' : `导入 ${checked.size} 条并探测`}
                </Button>
              </div>
            </div>
            <div className="max-h-72 space-y-1 overflow-y-auto rounded-md border p-2">
              {records.map((r, i) => (
                <label key={i} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-accent">
                  <Checkbox checked={checked.has(i)}
                    onCheckedChange={() => {
                      const next = new Set(checked);
                      if (next.has(i)) next.delete(i); else next.add(i);
                      setChecked(next);
                    }} />
                  <span className="font-mono text-muted-foreground">{r.ip}:{r.port}</span>
                  <span className="grow truncate">{r.title || '—'}</span>
                  {rankRelevance(r) > 0 && <Badge className="bg-success/15 text-success hover:bg-success/15">TTS 相关</Badge>}
                </label>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **步骤 6.3：构建验证 + Commit**

```powershell
npm run build
git add src/pages/NodesPage.tsx src/pages/ImportPanel.tsx
git commit -m "feat: 节点页与导入面板迁移到 shadcn（搜索/确认弹窗）"
```

预期：`Build succeeded` 后提交成功。

---

## 任务 7：音色页（50 条分页 + 试听互斥）

**文件：**
- 创建：`src/components/Pagination.tsx`、`src/lib/audition.ts`
- 重写：`src/pages/VoicesPage.tsx`

- [ ] **步骤 7.1：创建 src/components/Pagination.tsx**

```tsx
import { Button } from '@/components/ui/button';

export function Pagination({ page, pageSize, total, onPage }: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;
  return (
    <div className="flex items-center justify-end gap-2 pt-3">
      <span className="text-xs text-muted-foreground">
        第 {page + 1}/{pages} 页 · 共 {total} 条
      </span>
      <Button variant="outline" size="sm" disabled={page <= 0} onClick={() => onPage(page - 1)}>上一页</Button>
      <Button variant="outline" size="sm" disabled={page >= pages - 1} onClick={() => onPage(page + 1)}>下一页</Button>
    </div>
  );
}
```

- [ ] **步骤 7.2：创建 src/lib/audition.ts**

```ts
let current: HTMLAudioElement | null = null;

export function stopAudition(): void {
  if (current) {
    current.pause();
    current = null;
  }
}

export async function playAudition(bytes: ArrayBuffer): Promise<void> {
  stopAudition();
  const url = URL.createObjectURL(new Blob([bytes], { type: 'audio/mpeg' }));
  const a = new Audio(url);
  current = a;
  a.onended = () => {
    URL.revokeObjectURL(url);
    if (current === a) current = null;
  };
  await a.play();
}
```

- [ ] **步骤 7.3：重写 src/pages/VoicesPage.tsx**

```tsx
import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Pagination } from '@/components/Pagination';
import { playAudition, stopAudition } from '@/lib/audition';
import { voiceDisplayName } from '@/lib/voices';
import { synthesizeText } from '@/store/poolDeps';
import { useSettingsStore } from '@/store/settingsStore';
import { useVoicesStore } from '@/store/voicesStore';

const PAGE_SIZE = 50;

export function VoicesPage() {
  const { voices, loading, error, load } = useVoicesStore();
  const { synth, saveSynth } = useSettingsStore();
  const [q, setQ] = useState('');
  const [gender, setGender] = useState('');
  const [locale, setLocale] = useState('');
  const [auditioning, setAuditioning] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  useEffect(() => { void load(); }, []);

  const locales = useMemo(() => [...new Set(voices.map((v) => v.locale).filter(Boolean))], [voices]);
  const shown = voices.filter((v) =>
    (!gender || v.gender === gender)
    && (!locale || v.locale === locale)
    && (!q || voiceDisplayName(v).includes(q) || v.id.toLowerCase().includes(q.toLowerCase())));
  const pageItems = shown.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  async function audition(id: string): Promise<void> {
    if (auditioning === id) {
      stopAudition();
      setAuditioning(null);
      return;
    }
    stopAudition();
    setAuditioning(id);
    try {
      const { bytes } = await synthesizeText('你好，这是一段试听。', { voice: id, rate: synth.rate, pitch: synth.pitch, style: '' });
      await playAudition(bytes);
    } catch (e) {
      toast.error(`试听失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setAuditioning(null);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">音色</h1>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 pt-6">
          <Button variant="outline" onClick={() => void load(true)} disabled={loading}>
            <RefreshCw className="mr-1 h-4 w-4" />
            {loading ? '拉取中…' : '重新拉取'}
          </Button>
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="搜索音色名 / ID" className="w-64 pl-8" value={q}
              onChange={(e) => { setQ(e.target.value); setPage(0); }} />
          </div>
          <Select value={gender || 'all-gender'} onValueChange={(v) => { setGender(v === 'all-gender' ? '' : v); setPage(0); }}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all-gender">全部性别</SelectItem>
              <SelectItem value="Female">女</SelectItem>
              <SelectItem value="Male">男</SelectItem>
            </SelectContent>
          </Select>
          <Select value={locale || 'all-locale'} onValueChange={(v) => { setLocale(v === 'all-locale' ? '' : v); setPage(0); }}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all-locale">全部语言</SelectItem>
              {locales.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
          <span className="ml-auto text-sm text-muted-foreground">{shown.length} 个</span>
        </CardContent>
        {error && <CardContent className="pt-0 text-sm text-destructive">{error}</CardContent>}
      </Card>

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>名称</TableHead>
                <TableHead>ID</TableHead>
                <TableHead>性别</TableHead>
                <TableHead>语言</TableHead>
                <TableHead>风格</TableHead>
                <TableHead className="w-40">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageItems.map((v) => (
                <TableRow key={v.id}>
                  <TableCell className="font-medium">{voiceDisplayName(v)}</TableCell>
                  <TableCell className="font-mono text-muted-foreground">{v.id}</TableCell>
                  <TableCell>{v.gender === 'Female' ? '女' : v.gender === 'Male' ? '男' : v.gender || '—'}</TableCell>
                  <TableCell>{v.locale || '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{v.styles?.length ? v.styles.join(' / ') : '—'}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="outline" size="sm" disabled={auditioning !== null && auditioning !== v.id}
                        onClick={() => void audition(v.id)}>
                        {auditioning === v.id ? '停止试听' : '试听'}
                      </Button>
                      <Button variant="outline" size="sm" disabled={synth.voice === v.id}
                        onClick={() => void saveSynth({ ...synth, voice: v.id })}>
                        {synth.voice === v.id ? '当前默认' : '设为默认'}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {pageItems.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                    {voices.length ? '没有匹配的音色' : '还没有音色，请先添加节点并探测'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <Pagination page={page} pageSize={PAGE_SIZE} total={shown.length} onPage={setPage} />
        </CardContent>
      </Card>
    </div>
  );
}
```

（试听互斥语义：新试听前 `stopAudition()` 停旧；按钮点击正在试听的音色 = 停止。）

- [ ] **步骤 7.4：构建验证 + Commit**

```powershell
npm run build
git add src/components/Pagination.tsx src/lib/audition.ts src/pages/VoicesPage.tsx
git commit -m "feat: 音色页 50 条分页与试听互斥"
```

---

## 任务 8：日志页（跨天时间 + 100 条分页）

**文件：**
- 修改：`src/lib/db.ts`（LOG_QUERY_LIMIT 300→500，让 500 条保留全部可翻页；db.test.ts 未引用该常量，安全）
- 重写：`src/pages/LogsPage.tsx`

- [ ] **步骤 8.1：修改 src/lib/db.ts**

```ts
export const LOG_QUERY_LIMIT = 500;
```

- [ ] **步骤 8.2：重写 src/pages/LogsPage.tsx**

```tsx
import { useEffect, useState } from 'react';
import { RefreshCw, Trash2 } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Pagination } from '@/components/Pagination';
import { fmtTimeFull } from '@/lib/format';
import { useLogsStore } from '@/store/logsStore';
import type { LogFilter } from '@/types/models';

const PAGE_SIZE = 100;

const FILTERS: [LogFilter, string][] = [
  ['ALL', '全部'], ['OK', '成功'], ['FAIL', '失败'], ['SWITCH', '切换'],
];

export function LogsPage() {
  const { logs, filter, loading, load, clear } = useLogsStore();
  const [page, setPage] = useState(0);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => { void load(); }, []);

  const pageItems = logs.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">调用日志</h1>

      <Card>
        <CardContent className="flex items-center justify-between pt-6">
          <Tabs value={filter} onValueChange={(v) => { setPage(0); void load(v as LogFilter); }}>
            <TabsList>
              {FILTERS.map(([f, label]) => (
                <TabsTrigger key={f} value={f}>{label}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              <RefreshCw className="mr-1 h-4 w-4" />
              {loading ? '刷新中…' : '刷新'}
            </Button>
            <Button variant="outline" size="sm" className="text-destructive" onClick={() => setConfirmClear(true)}>
              <Trash2 className="mr-1 h-4 w-4" />
              清空
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>时间</TableHead>
                <TableHead>结果</TableHead>
                <TableHead>节点</TableHead>
                <TableHead>模式</TableHead>
                <TableHead>尝试</TableHead>
                <TableHead>耗时</TableHead>
                <TableHead>长度</TableHead>
                <TableHead>内容预览</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageItems.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{fmtTimeFull(l.time)}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {l.success
                        ? <Badge className="bg-success/15 text-success hover:bg-success/15">成功</Badge>
                        : <Badge variant="destructive">失败</Badge>}
                      {l.triggeredCooldown && <Badge className="bg-warning/20 text-warning hover:bg-warning/20">触发冷却</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-muted-foreground">{l.nodeUrl}</TableCell>
                  <TableCell>{l.mode}</TableCell>
                  <TableCell>{l.attempt}</TableCell>
                  <TableCell>{l.latencyMs}ms</TableCell>
                  <TableCell>{l.textLen}</TableCell>
                  <TableCell title={l.error ?? undefined} className="max-w-md truncate text-muted-foreground">
                    {l.error ? `⚠ ${l.error} · ` : ''}{l.textPreview}{l.fromNode ? `（从 ${l.fromNode} 切换）` : ''}
                  </TableCell>
                </TableRow>
              ))}
              {logs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">暂无日志</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <Pagination page={page} pageSize={PAGE_SIZE} total={logs.length} onPage={setPage} />
        </CardContent>
      </Card>

      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>清空全部日志？</AlertDialogTitle>
            <AlertDialogDescription>所有调用记录将被删除，不可恢复。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => void clear()}>清空</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
```

- [ ] **步骤 8.3：验证 + Commit**

```powershell
npm test
npm run build
git add src/lib/db.ts src/pages/LogsPage.tsx
git commit -m "feat: 日志页跨天时间显示与 100 条分页"
```

预期：全部 PASS + `Build succeeded`（fmtTimeFull 用 `toLocaleString`，跨天记录自然带日期）。

## 任务 9：设置页（主题三档 + 音色下拉 + 默认倍速）

**文件：**
- 重写：`src/pages/SettingsPage.tsx`
- 新增行为：主题三档选择（跟随系统/浅色/深色，写 appPrefs.theme）；默认倍速滑杆（appPrefs.playbackRate）；音色从手写输入框改为下拉（保留「节点默认」哨兵值）；alert() 改 toast。

- [ ] **步骤 9.1：重写 src/pages/SettingsPage.tsx**

```tsx
import { useEffect, useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { voiceDisplayName } from '@/lib/voices';
import { useSettingsStore } from '@/store/settingsStore';
import { useVoicesStore } from '@/store/voicesStore';
import { notifyShare } from '@/store/shareSync';
import type { ThemeMode } from '@/types/models';

const THEME_OPTIONS: [ThemeMode, string][] = [
  ['system', '跟随系统'], ['light', '浅色'], ['dark', '深色'],
];

export function SettingsPage() {
  const { synth, saveSynth, appPrefs, saveAppPrefs, share, saveShare } = useSettingsStore();
  const { voices } = useVoicesStore();
  const [copied, setCopied] = useState(false);
  const [ip, setIp] = useState('');
  const [running, setRunning] = useState(false);

  useEffect(() => {
    void invoke<string>('share_local_ip').then(setIp).catch(() => setIp('127.0.0.1'));
    void invoke<boolean>('share_status').then(setRunning).catch(() => setRunning(false));
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
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  function shareUrl(): string {
    const host = share.localhostOnly ? '127.0.0.1' : ip || '127.0.0.1';
    return `http://${host}:${share.port}/nodes.json?token=${share.token}`;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-xl font-semibold">设置</h1>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-sm font-medium">
            <span>默认语音参数</span>
            <span className="font-normal text-muted-foreground">作用于朗读与试听</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">默认音色</Label>
              <Select
                value={synth.voice || 'node-default'}
                onOpenChange={(open) => { if (open) void useVoicesStore.getState().load(); }}
                onValueChange={(v) => void saveSynth({ ...synth, voice: v === 'node-default' ? '' : v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="node-default">节点默认音色</SelectItem>
                  {voices.map((v) => (
                    <SelectItem key={v.id} value={v.id}>{voiceDisplayName(v)}（{v.id}）</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">语速 {synth.rate}</Label>
              <Slider value={[synth.rate]} min={-100} max={100} step={1}
                onValueChange={([v]) => void saveSynth({ ...synth, rate: v })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">音调 {synth.pitch}</Label>
              <Slider value={[synth.pitch]} min={-100} max={100} step={1}
                onValueChange={([v]) => void saveSynth({ ...synth, pitch: v })} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">外观与播放</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">主题</Label>
            <Select value={appPrefs.theme} onValueChange={(v) => void saveAppPrefs({ ...appPrefs, theme: v as ThemeMode })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {THEME_OPTIONS.map(([mode, label]) => (
                  <SelectItem key={mode} value={mode}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">默认倍速 {appPrefs.playbackRate}x</Label>
            <Slider value={[appPrefs.playbackRate]} min={0.5} max={2} step={0.25}
              onValueChange={([v]) => void saveAppPrefs({ ...appPrefs, playbackRate: v })} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">探测</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-3">
          <Label className="text-xs text-muted-foreground">并发数</Label>
          <Input type="number" min={1} max={8} className="w-20"
            value={appPrefs.probeConcurrency}
            onChange={(e) => void saveAppPrefs({
              ...appPrefs,
              probeConcurrency: Math.max(1, Math.min(8, Number(e.target.value) || 1)),
            })} />
          <span className="text-sm text-muted-foreground">全部探测时同时发起的请求数（1-8）</span>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-sm font-medium">
            <span>局域网分享</span>
            <Button variant={running ? 'destructive' : 'default'} size="sm" onClick={() => void toggleShare()}>
              {running ? '停止分享' : '开启分享'}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <Label className="text-xs text-muted-foreground">端口</Label>
            <Input type="number" min={1} max={65535} className="w-24"
              value={share.port}
              onChange={(e) => void saveShare({ ...share, port: Number(e.target.value) || 8787 })} />
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={share.localhostOnly}
                onCheckedChange={(c) => void saveShare({ ...share, localhostOnly: c === true })} />
              仅本机 (127.0.0.1)
            </label>
            <Button variant="outline" size="sm" onClick={() => void saveShare({ ...share, token: crypto.randomUUID() })}>
              重置 Token
            </Button>
          </div>
          <div className="flex gap-2">
            <Input className="grow font-mono text-xs" readOnly value={shareUrl()} onFocus={(e) => e.target.select()} />
            <Button variant="outline" onClick={() => {
              void navigator.clipboard.writeText(shareUrl());
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}>
              {copied ? <Check className="mr-1 h-4 w-4" /> : <Copy className="mr-1 h-4 w-4" />}
              {copied ? '已复制' : '复制'}
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            同一局域网的设备访问该地址即可拉取节点列表（只读，需 token）。
            {running ? `当前监听 0.0.0.0:${share.port}` : '未开启'}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **步骤 9.2：构建验证 + Commit**

```powershell
npm run build
git add src/pages/SettingsPage.tsx
git commit -m "feat: 设置页迁移 shadcn（主题三档/音色下拉/默认倍速）"
```

---

## 任务 10：收尾（删除旧样式表 + 文档 + 对比度复检 + 全量验证）

**文件：**
- 删除：`src/styles.css`
- 修改：`src/main.tsx`（移除 styles.css 导入）、`README.md`

- [ ] **步骤 10.1：删除旧样式表**

```powershell
git rm src/styles.css
```

`src/main.tsx` 中删除 `import './styles.css';` 一行。

- [ ] **步骤 10.2：遗留类名扫描（必须 0 命中）**

```powershell
Select-String -Path src\*.tsx,src\pages\*.tsx,src\components\*.tsx,src\components\ui\*.tsx -Pattern 'className="(page-title|card|btn|muted|badge|input|row|field|dialog|tabs|seg|table|sidebar|layout|brand|content|slider-row|mono|grow)'
```

预期：无输出。若命中，逐处改为 Tailwind 类（语义映射：card→Card、btn→Button、muted→text-muted-foreground、mono→font-mono）。

- [ ] **步骤 10.3：更新 README.md**

「功能列表」末尾追加一条：

```markdown
- **书架（小说听书）**：导入本地 TXT，内置多级目录解析（第X卷/篇/部 + 第X章/回/节/集 + 「1、」「1.」编号行；中文/阿拉伯/罗马数字），按卷分组章节树点播、断点续听（书/章/段三级进度）、章末自动连播、全书播完提示、书级倍速覆盖
```

「功能列表」第一条「朗读」句末追加：`，支持音量/倍速即时调节与系统媒体键控制`。「与安卓版差异」表格追加一行：

```markdown
| UI 技术栈 | Tailwind CSS v4 + shadcn/ui（明/暗双主题，跟随系统） |
```

「目录结构」`src/lib/` 列表追加 `toc.ts 书籍目录解析`、`format.ts 时间/进度格式化`、`audition.ts 试听互斥播放`；`src/store/` 追加 `bookPlay.ts 书籍播放接线`；`pages/` 描述改为 `六个页面 + 导入面板（书架/朗读/节点/音色/日志/设置）`。

- [ ] **步骤 10.4：对比度复检（uiux-suite MCP）**

对以下前景/背景对调用 `ui-ux-suite_uiux_check_contrast`（浅色组）：

```json
[
  { "fg": "#737373", "bg": "#FFFFFF", "context": "light muted-foreground on background" },
  { "fg": "#FFFFFF", "bg": "#15803D", "context": "light primary button text" },
  { "fg": "#15803D", "bg": "#FFFFFF", "context": "light primary text/links" },
  { "fg": "#1F2937", "bg": "#FFFFFF", "context": "light destructive text on card" }
]
```

深色组：

```json
[
  { "fg": "#B4B4B4", "bg": "#252525", "context": "dark muted-foreground on card" },
  { "fg": "#121212", "bg": "#67E8A0", "context": "dark primary button text" },
  { "fg": "#F5F5F5", "bg": "#333333", "context": "dark foreground on card" }
]
```

预期：正文对 ≥ 4.5:1（AA）、按钮文字 ≥ 4.5:1。若任何一对不达标，调整 `src/index.css` 对应 oklch 值后重测，并在 commit message 里说明调整。徽章类（success/warning 15%/20% 透明底）用实际叠色近似值（如 #E8F5EE 上的 #15803D）补测一组；若 AA 不足但为非文本徽章小标签（≥3:1 Large/Non-text），记录结论即可。

- [ ] **步骤 10.5：全量验证**

```powershell
npm test
```

预期：全部 PASS（split/pool/importers/db/models/theme/toc/format 等）。

```powershell
npm run build
```

预期：`Build succeeded`。

```powershell
git status --short
```

预期：仅 `?? docs/`（untracked，永不提交）。工作树无其他残留。

- [ ] **步骤 10.6：Commit + 汇总**

```powershell
git add src/main.tsx README.md
git commit -m "chore: 移除旧样式表并更新文档（书架功能/UI 栈说明）"
```

```powershell
git log --oneline -12
```

预期：近 12 条含本计划 10 个 commit（feat × 9 + chore × 1）及此前历史。向用户汇报：10 批完成、验证全绿、待用户 `npm run tauri dev` 手动验收清单（主题切换三档、书架导入/续听/连播、节点搜索、音色分页试听、日志跨天时间、对比度观感）。

---

## 自检记录（writing-plans 清单）

1. **规格覆盖度**：§1 全局主题（任务 1/2/9）✓；§2 设计令牌与对比度（任务 1 + 10.4 复检）✓；§3 壳与导航（任务 2/5）✓；§4 朗读页与播放体验（任务 3）✓；§5 书架（任务 4/5，含 AppPrefs volume/playbackRate）✓；§6 节点/导入（任务 6）✓；§7 音色分页试听（任务 7）✓；§8 日志跨天+分页（任务 8）✓；§9 设置（任务 9）✓；§10 收尾（任务 10）✓。范围外项（EPUB/睡眠定时/多队列/节点排序/托盘/快捷键/撤销/虚拟滚动）均未引入。
2. **占位符扫描**：无「待定/TODO/类似任务 N」；每个代码步骤均为完整文件或完整替换块；命令均为可直接执行的 PowerShell 语句。
3. **类型一致性**：AppPrefs{probeConcurrency,theme,playbackRate,volume} 在任务 1 定义、3/9 消费一致；PlayerHooks/onFinished(source) 签名任务 3 定义、5 消费一致；BookTocItem 任务 4 定义（db.ts）导出、5 消费；playChapter(bookId,chapterIdx,fromSeg) 任务 5 内定义与调用一致；`node-default` 哨兵值任务 3/9 一致；BooksRepo 接口任务 4 定义、5 通过 deps().books 调用的方法名逐一核对（getAll/getToc/getChapter/hasChapter/importBook/delete/rename/setProgress）一致。




