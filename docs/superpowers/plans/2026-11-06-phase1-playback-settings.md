# 阶段一：朗读播放体验与设置补齐 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 为桌面端补齐句级高亮、睡眠定时、±10 秒、字数估算、可配置调度参数、启动自动探测、配置导入导出与续听快照。

**架构：** 业务仍在前端 TypeScript 层；新增的纯函数放在 `src/lib`，状态放在 `src/store`，Tauri 只新增官方 dialog/fs 插件用于用户选择的文件读写。播放内核扩展睡眠定时与快照回调，UI 通过精确选择器订阅，避免 `timeupdate` 全页重渲染。

**技术栈：** Tauri 2、React 19、TypeScript 6、Zustand 5、Tailwind 4、shadcn/ui、Vitest 5、tauri-plugin-dialog/fs。

---

## 文件结构

**新增**
- `src/lib/sentences.ts`：句子切分与播放比例定位（纯函数）
- `src/lib/estimate.ts`：字数/时长估算（纯函数）
- `src/lib/snapshot.ts`：续听快照类型、校验与 JSON 解析（纯函数）
- `src/lib/configTransfer.ts`：配置导出/导入/节点合并（纯函数）
- `src/store/resumeStore.ts`：续听快照的读写状态
- `src/hooks/useSleepCountdown.ts`：睡眠定时倒计时展示
- `src/components/player/SentenceText.tsx`：句级高亮渲染
- `src/components/settings/DataSection.tsx`：配置导入导出 UI

**修改**
- `src/types/models.ts`：AppPrefs 新字段、`PlaySource`、`normalizeSynth`
- `src/lib/pool.ts`：调度策略注入
- `src/store/playerStore.ts`：睡眠定时、快照 sink、起始段
- `src/store/settingsStore.ts`：normalizeSynth、主题镜像、关闭续听时清空
- `src/store/poolDeps.ts`：注入策略
- `src/main.tsx`：快照加载、sink 注入、启动探测、默认睡眠
- `src/pages/ReadPage.tsx`：字数/时长、续听卡片、选择器
- `src/pages/BooksPage.tsx`：书籍续听卡片
- `src/pages/BookDetailPage.tsx`：选择器
- `src/pages/SettingsPage.tsx`：新分区
- `src/components/player/PlayerDock.tsx`：句级高亮、睡眠定时、±10 秒、选择器
- `src/lib/mediaSession.ts`：去重更新
- `src/lib/theme.ts`：主题镜像
- `src/components/ui/*.tsx`：cn 导入统一
- `src-tauri/*`、`package.json`、`README.md`

---

### 任务 1：配置模型与默认值

**文件：**
- 修改：`src/types/models.ts:1-130`
- 测试：`src/types/models.test.ts`

- [ ] **步骤 1：编写失败的测试**

将 `src/types/models.test.ts` 替换为：

```ts
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_APP_PREFS, normalizeAppPrefs, normalizeSynth,
} from './models';

describe('normalizeAppPrefs', () => {
  it('空值与非法输入回落默认', () => {
    expect(normalizeAppPrefs(null)).toEqual(DEFAULT_APP_PREFS);
    expect(normalizeAppPrefs('nope')).toEqual(DEFAULT_APP_PREFS);
    expect(normalizeAppPrefs({
      probeConcurrency: 99, theme: 'neon', playbackRate: 10, volume: -5,
      failThreshold: 4, cooldownMinutes: 7, autoTestOnLaunch: 'yes',
      sleepMinutes: 45, resumeLast: 'no',
    })).toEqual(DEFAULT_APP_PREFS);
  });

  it('旧版配置补齐新字段', () => {
    expect(normalizeAppPrefs({ probeConcurrency: 2 })).toEqual({
      ...DEFAULT_APP_PREFS,
      probeConcurrency: 2,
    });
  });

  it('合法值原样保留', () => {
    expect(normalizeAppPrefs({
      probeConcurrency: 8, theme: 'dark', playbackRate: 1.5, volume: 30,
      failThreshold: 5, cooldownMinutes: 30, autoTestOnLaunch: true,
      sleepMinutes: 15, resumeLast: false,
    })).toEqual({
      probeConcurrency: 8, theme: 'dark', playbackRate: 1.5, volume: 30,
      failThreshold: 5, cooldownMinutes: 30, autoTestOnLaunch: true,
      sleepMinutes: 15, resumeLast: false,
    });
  });
});

describe('normalizeSynth', () => {
  it('非法值回落并夹取范围', () => {
    expect(normalizeSynth(null)).toEqual({ voice: '', rate: 0, pitch: 0 });
    expect(normalizeSynth({ voice: 3, rate: 999, pitch: -999 }))
      .toEqual({ voice: '', rate: 100, pitch: -100 });
  });

  it('合法值四舍五入保留', () => {
    expect(normalizeSynth({ voice: 'zh-CN-XiaoxiaoNeural', rate: 12.6, pitch: -3.2 }))
      .toEqual({ voice: 'zh-CN-XiaoxiaoNeural', rate: 13, pitch: -3 });
  });
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npm test -- src/types/models.test.ts`
预期：FAIL，`normalizeSynth is not a function` 或类型错误。

- [ ] **步骤 3：修改 `src/types/models.ts`**

在文件顶部类型区加入：

```ts
export type PlaySource =
  | { kind: 'text' }
  | { kind: 'book'; bookId: string; chapterIdx: number };
```

将 `AppPrefs` 替换为：

```ts
export interface AppPrefs {
  probeConcurrency: number;
  theme: ThemeMode;
  playbackRate: number;
  volume: number;
  failThreshold: number;
  cooldownMinutes: number;
  autoTestOnLaunch: boolean;
  sleepMinutes: number;
  resumeLast: boolean;
}

export const FAIL_THRESHOLD_OPTIONS = [2, 3, 5, 10] as const;
export const COOLDOWN_MINUTES_OPTIONS = [1, 5, 10, 30, 60] as const;
export const SLEEP_MINUTES_OPTIONS = [0, 15, 30, 60] as const;
```

将 `DEFAULT_APP_PREFS` 替换为：

```ts
export const DEFAULT_APP_PREFS: AppPrefs = {
  probeConcurrency: 4,
  theme: 'system',
  playbackRate: 1,
  volume: 100,
  failThreshold: 3,
  cooldownMinutes: 10,
  autoTestOnLaunch: false,
  sleepMinutes: 0,
  resumeLast: true,
};
```

将 `normalizeAppPrefs` 替换为：

```ts
function pickOption(raw: unknown, options: readonly number[], fallback: number): number {
  return typeof raw === 'number' && options.includes(raw) ? raw : fallback;
}

function pickBool(raw: unknown, fallback: boolean): boolean {
  return typeof raw === 'boolean' ? raw : fallback;
}

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
    failThreshold: pickOption(o.failThreshold, FAIL_THRESHOLD_OPTIONS, DEFAULT_APP_PREFS.failThreshold),
    cooldownMinutes: pickOption(o.cooldownMinutes, COOLDOWN_MINUTES_OPTIONS, DEFAULT_APP_PREFS.cooldownMinutes),
    autoTestOnLaunch: pickBool(o.autoTestOnLaunch, DEFAULT_APP_PREFS.autoTestOnLaunch),
    sleepMinutes: pickOption(o.sleepMinutes, SLEEP_MINUTES_OPTIONS, DEFAULT_APP_PREFS.sleepMinutes),
    resumeLast: pickBool(o.resumeLast, DEFAULT_APP_PREFS.resumeLast),
  };
}

export function normalizeSynth(raw: unknown): SynthSettings {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Partial<SynthSettings>;
  const clamp = (v: unknown, fallback: number): number =>
    typeof v === 'number' && Number.isFinite(v)
      ? Math.max(-100, Math.min(100, Math.round(v)))
      : fallback;
  return {
    voice: typeof o.voice === 'string' ? o.voice : '',
    rate: clamp(o.rate, 0),
    pitch: clamp(o.pitch, 0),
  };
}
```

- [ ] **步骤 4：运行测试验证通过**

运行：`npm test -- src/types/models.test.ts`
预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add src/types/models.ts src/types/models.test.ts
git commit -m "feat: 扩展应用偏好与调度参数模型"
```

---

### 任务 2：调度策略接入

**文件：**
- 修改：`src/lib/pool.ts:1-68`
- 修改：`src/store/poolDeps.ts:8-30`
- 测试：`src/lib/pool.test.ts`

- [ ] **步骤 1：编写失败的测试**

将 `src/lib/pool.test.ts` 顶部导入改为：

```ts
import { DEFAULT_POLICY, synthesize, type PoolDeps, type PoolPolicy } from './pool';
```

将 `harness` 函数替换为：

```ts
function harness(
  nodes: TtsNode[],
  failUrls: string[] = [],
  config: Partial<PoolConfig> = {},
  policy: Partial<PoolPolicy> = {},
): Harness {
  const logs: CallLog[] = [];
  const upserts: TtsNode[] = [];
  const cfg: PoolConfig = { ...DEFAULT_POOL, ...config };
  const pol: PoolPolicy = { ...DEFAULT_POLICY, ...policy };
  let clock = 100000;
  const deps: PoolDeps = {
    getNodes: () => nodes.map((n) => upserts.filter((u) => u.id === n.id).pop() ?? n),
    getConfig: () => cfg,
    updateConfig: async (fn) => { Object.assign(cfg, fn(cfg)); },
    upsertNode: async (n) => { upserts.push(n); },
    insertLog: async (l) => { logs.push(l); },
    getPolicy: () => pol,
    synth: async (n) => {
      if (failUrls.includes(n.baseUrl)) throw new Error('v1/兼容端点均不可用');
      return new ArrayBuffer(4);
    },
    now: () => (clock += 10),
  };
  return { deps, logs, upserts, config: cfg };
}
```

在 `describe('AUTO')` 内追加两个测试：

```ts
it('自定义失败阈值 2 次即进入冷却，冷却时长使用策略值', async () => {
  const a = mkNode('a');
  const h = harness([a], [a.baseUrl], {}, { failThreshold: 2, cooldownMinutes: 5 });
  const prefs = { voice: '', rate: 0, pitch: 0, style: '' };
  await expect(synthesize(h.deps, 'x', prefs)).rejects.toThrow();
  await expect(synthesize(h.deps, 'x', prefs)).rejects.toThrow();
  const cooled = h.upserts.find((n) => n.id === 'a' && n.cooldownUntil > 0);
  expect(cooled).toBeTruthy();
  expect(cooled!.cooldownUntil).toBeGreaterThan(0);
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npm test -- src/lib/pool.test.ts`
预期：FAIL，`DEFAULT_POLICY` 不存在或 `getPolicy` 类型缺失。

- [ ] **步骤 3：修改 `src/lib/pool.ts`**

在常量区替换：

```ts
export const FAIL_LIMIT = 3;
export const TEXT_PREVIEW_LEN = 80;
export const SYNTH_RETRIES_PER_NODE = 1;

export interface PoolPolicy {
  failThreshold: number;
  cooldownMinutes: number;
}

export const DEFAULT_POLICY: PoolPolicy = { failThreshold: 3, cooldownMinutes: 10 };
```

在 `PoolDeps` 中加入：

```ts
  getPolicy(): PoolPolicy;
```

将 `attempt` 中的失败分支替换为：

```ts
    const policy = deps.getPolicy();
    const triggered = failCount >= policy.failThreshold && mode !== 'MANUAL';
    const cooldownUntil = triggered
      ? deps.now() + policy.cooldownMinutes * 60_000
      : node.cooldownUntil;
```

- [ ] **步骤 4：修改 `src/store/poolDeps.ts`**

在 `makePoolDeps` 返回对象中加入：

```ts
    getPolicy: () => {
      const p = useSettingsStore.getState().appPrefs;
      return { failThreshold: p.failThreshold, cooldownMinutes: p.cooldownMinutes };
    },
```

- [ ] **步骤 5：运行测试验证通过**

运行：`npm test -- src/lib/pool.test.ts`
预期：PASS，既有 AUTO/GROUP/MANUAL 用例全部通过。

- [ ] **步骤 6：Commit**

```bash
git add src/lib/pool.ts src/lib/pool.test.ts src/store/poolDeps.ts
git commit -m "feat: 支持可配置的失败阈值与冷却时长"
```

---

### 任务 3：句级切分与定位

**文件：**
- 创建：`src/lib/sentences.ts`
- 测试：`src/lib/sentences.test.ts`

- [ ] **步骤 1：编写失败的测试**

创建 `src/lib/sentences.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { sentenceIndexAt, splitSentences } from './sentences';

describe('splitSentences', () => {
  it('按中英文标点与换行切分并保留区间', () => {
    const text = '第一句。第二句！第三句?\n第四句;';
    expect(splitSentences(text).map((s) => s.text))
      .toEqual(['第一句。', '第二句！', '第三句?', '\n', '第四句;']);
    expect(splitSentences(text)[0]).toEqual({ text: '第一句。', start: 0, end: 4 });
  });

  it('无标点文本返回单句', () => {
    expect(splitSentences('没有标点')).toEqual([{ text: '没有标点', start: 0, end: 4 }]);
  });

  it('空白文本返回空数组', () => {
    expect(splitSentences('   \n\n')).toEqual([]);
  });
});

describe('sentenceIndexAt', () => {
  const sentences = splitSentences('一。二。三。');

  it('边界与中间比例', () => {
    expect(sentenceIndexAt(0, sentences)).toBe(0);
    expect(sentenceIndexAt(0.34, sentences)).toBe(1);
    expect(sentenceIndexAt(0.67, sentences)).toBe(2);
    expect(sentenceIndexAt(1, sentences)).toBe(2);
  });

  it('空数组返回 -1，越界比例钳制', () => {
    expect(sentenceIndexAt(0.5, [])).toBe(-1);
    expect(sentenceIndexAt(-1, sentences)).toBe(0);
    expect(sentenceIndexAt(2, sentences)).toBe(2);
  });
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npm test -- src/lib/sentences.test.ts`
预期：FAIL，模块不存在。

- [ ] **步骤 3：创建 `src/lib/sentences.ts`**

```ts
export interface SentenceRange {
  text: string;
  start: number;
  end: number;
}

const SENTENCE_END = /[。！？!?；;\n]/;

export function splitSentences(text: string): SentenceRange[] {
  const out: SentenceRange[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (!SENTENCE_END.test(text[i])) continue;
    let end = i + 1;
    while (end < text.length && SENTENCE_END.test(text[end])) end++;
    const raw = text.slice(start, end);
    if (raw.trim()) out.push({ text: raw, start, end });
    start = end;
    i = end - 1;
  }
  if (start < text.length) {
    const raw = text.slice(start);
    if (raw.trim()) out.push({ text: raw, start, end: text.length });
  }
  return out;
}

export function sentenceIndexAt(ratio: number, sentences: SentenceRange[]): number {
  if (sentences.length === 0) return -1;
  const r = Math.max(0, Math.min(1, ratio));
  if (r >= 1) return sentences.length - 1;
  const lengths = sentences.map((s) => s.text.length);
  const total = lengths.reduce((a, b) => a + b, 0);
  if (total <= 0) return 0;
  let target = total * r;
  for (let i = 0; i < lengths.length; i++) {
    if (target < lengths[i]) return i;
    target -= lengths[i];
  }
  return lengths.length - 1;
}
```

- [ ] **步骤 4：运行测试验证通过**

运行：`npm test -- src/lib/sentences.test.ts`
预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add src/lib/sentences.ts src/lib/sentences.test.ts
git commit -m "feat: 添加句级切分与播放比例定位"
```

---

### 任务 4：字数与预计时长

**文件：**
- 创建：`src/lib/estimate.ts`
- 测试：`src/lib/estimate.test.ts`

- [ ] **步骤 1：编写失败的测试**

创建 `src/lib/estimate.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { estimateReadingSeconds, fmtReadingDuration, LONG_TEXT_HINT } from './estimate';

describe('estimateReadingSeconds', () => {
  it('按 4.2 字/秒向上取整', () => {
    expect(estimateReadingSeconds(0)).toBe(0);
    expect(estimateReadingSeconds(42)).toBe(10);
    expect(estimateReadingSeconds(43)).toBe(11);
  });
});

describe('fmtReadingDuration', () => {
  it('分秒格式', () => {
    expect(fmtReadingDuration(0)).toBe('0 秒');
    expect(fmtReadingDuration(59)).toBe('59 秒');
    expect(fmtReadingDuration(60)).toBe('1 分钟');
    expect(fmtReadingDuration(294)).toBe('4 分 54 秒');
  });
});

it('长文阈值与 Android 一致', () => {
  expect(LONG_TEXT_HINT).toBe(8000);
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npm test -- src/lib/estimate.test.ts`
预期：FAIL，模块不存在。

- [ ] **步骤 3：创建 `src/lib/estimate.ts`**

```ts
export const CHARS_PER_SECOND = 4.2;
export const LONG_TEXT_HINT = 8000;

export function estimateReadingSeconds(chars: number): number {
  if (!Number.isFinite(chars) || chars <= 0) return 0;
  return Math.ceil(chars / CHARS_PER_SECOND);
}

export function fmtReadingDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  if (s < 60) return `${s} 秒`;
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return rest > 0 ? `${m} 分 ${rest} 秒` : `${m} 分钟`;
}
```

- [ ] **步骤 4：运行测试验证通过**

运行：`npm test -- src/lib/estimate.test.ts`
预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add src/lib/estimate.ts src/lib/estimate.test.ts
git commit -m "feat: 添加朗读字数与时长估算"
```

---

### 任务 5：播放快照模型

**文件：**
- 创建：`src/lib/snapshot.ts`
- 测试：`src/lib/snapshot.test.ts`

- [ ] **步骤 1：编写失败的测试**

创建 `src/lib/snapshot.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { parseSnapshotJson, type PlaybackSnapshot } from './snapshot';

const textSnap: PlaybackSnapshot = {
  version: 1,
  source: { kind: 'text' },
  segIndex: 3,
  text: '你好世界',
  updatedAt: 1700000000000,
};

describe('parseSnapshotJson', () => {
  it('合法快照原样解析', () => {
    expect(parseSnapshotJson(JSON.stringify(textSnap))).toEqual(textSnap);
  });

  it('空值与坏 JSON 返回 null', () => {
    expect(parseSnapshotJson(null)).toBeNull();
    expect(parseSnapshotJson('')).toBeNull();
    expect(parseSnapshotJson('{oops')).toBeNull();
  });

  it('版本或来源非法返回 null', () => {
    expect(parseSnapshotJson(JSON.stringify({ ...textSnap, version: 2 }))).toBeNull();
    expect(parseSnapshotJson(JSON.stringify({ ...textSnap, source: { kind: 'x' } }))).toBeNull();
    expect(parseSnapshotJson(JSON.stringify({ ...textSnap, segIndex: -1 }))).toBeNull();
    expect(parseSnapshotJson(JSON.stringify({ ...textSnap, text: '' }))).toBeNull();
  });

  it('书籍快照保留书籍字段', () => {
    const book: PlaybackSnapshot = {
      version: 1,
      source: { kind: 'book', bookId: 'b1', chapterIdx: 2 },
      segIndex: 4,
      text: '',
      bookTitle: '书名',
      chapterTitle: '第三章',
      chapterCount: 10,
      updatedAt: 1700000000000,
    };
    expect(parseSnapshotJson(JSON.stringify(book))).toEqual(book);
  });
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npm test -- src/lib/snapshot.test.ts`
预期：FAIL，模块不存在。

- [ ] **步骤 3：创建 `src/lib/snapshot.ts`**

```ts
import type { PlaySource } from '../types/models';

export interface PlaybackSnapshot {
  version: 1;
  source: PlaySource;
  segIndex: number;
  text: string;
  bookTitle?: string;
  chapterTitle?: string;
  chapterCount?: number;
  updatedAt: number;
}

function isSource(v: unknown): v is PlaySource {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  if (o.kind === 'text') return true;
  return o.kind === 'book'
    && typeof o.bookId === 'string' && o.bookId.length > 0
    && typeof o.chapterIdx === 'number' && Number.isInteger(o.chapterIdx) && o.chapterIdx >= 0;
}

export function parseSnapshot(raw: unknown): PlaybackSnapshot | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  if (o.version !== 1) return null;
  if (!isSource(o.source)) return null;
  if (typeof o.segIndex !== 'number' || !Number.isInteger(o.segIndex) || o.segIndex < 0) return null;
  if (typeof o.text !== 'string') return null;
  if (o.source.kind === 'text' && o.text.length === 0) return null;
  if (typeof o.updatedAt !== 'number' || !Number.isFinite(o.updatedAt)) return null;
  return {
    version: 1,
    source: o.source,
    segIndex: o.segIndex,
    text: o.text,
    bookTitle: typeof o.bookTitle === 'string' ? o.bookTitle : undefined,
    chapterTitle: typeof o.chapterTitle === 'string' ? o.chapterTitle : undefined,
    chapterCount: typeof o.chapterCount === 'number' ? o.chapterCount : undefined,
    updatedAt: o.updatedAt,
  };
}

export function parseSnapshotJson(raw: string | null): PlaybackSnapshot | null {
  if (!raw) return null;
  try {
    return parseSnapshot(JSON.parse(raw));
  } catch {
    return null;
  }
}
```

- [ ] **步骤 4：运行测试验证通过**

运行：`npm test -- src/lib/snapshot.test.ts`
预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add src/lib/snapshot.ts src/lib/snapshot.test.ts
git commit -m "feat: 添加播放快照模型与校验"
```

---

### 任务 6：续听状态存储

**文件：**
- 创建：`src/store/resumeStore.ts`

- [ ] **步骤 1：创建 `src/store/resumeStore.ts`**

```ts
import { create } from 'zustand';
import { parseSnapshotJson, type PlaybackSnapshot } from '../lib/snapshot';
import { deps } from './deps';

export const SNAPSHOT_KEY = 'playback_snapshot';

interface ResumeState {
  snapshot: PlaybackSnapshot | null;
  loaded: boolean;
  load(): Promise<void>;
  save(snapshot: PlaybackSnapshot): Promise<void>;
  clear(): Promise<void>;
}

let writeChain: Promise<void> = Promise.resolve();

function enqueue(value: string): Promise<void> {
  writeChain = writeChain
    .then(() => deps().settings.set(SNAPSHOT_KEY, value))
    .catch((e) => { console.warn('续听快照写入失败', e); });
  return writeChain;
}

export const useResumeStore = create<ResumeState>((set) => ({
  snapshot: null,
  loaded: false,
  async load() {
    const raw = await deps().settings.get(SNAPSHOT_KEY);
    set({ snapshot: parseSnapshotJson(raw), loaded: true });
  },
  async save(snapshot) {
    set({ snapshot });
    await enqueue(JSON.stringify(snapshot));
  },
  async clear() {
    set({ snapshot: null });
    await enqueue('');
  },
}));
```

串行写入避免章节切换时旧快照覆盖新快照。

- [ ] **步骤 2：类型检查**

运行：`npx tsc --noEmit`
预期：PASS。

- [ ] **步骤 3：Commit**

```bash
git add src/store/resumeStore.ts
git commit -m "feat: 添加续听快照存储"
```

---

### 任务 7：播放内核扩展

**文件：**
- 修改：`src/store/playerStore.ts`

- [ ] **步骤 1：修改类型与状态**

将文件顶部的 `PlaySource` 定义替换为从模型导入并重新导出：

```ts
import { create } from 'zustand';
import { toast } from 'sonner';
import { splitForReading } from '../lib/split';
import type { PlaySource } from '../types/models';

export type { PlaySource };

export type SegStatus = 'pending' | 'synthesizing' | 'playing' | 'done' | 'error';
export type PlayerStatus = 'idle' | 'running' | 'paused';

export interface Segment { text: string; status: SegStatus }

export interface SnapshotData {
  source: PlaySource;
  segIndex: number;
  text: string;
  finished: boolean;
}

export type SnapshotSink = (data: SnapshotData) => void;
```

在 `PlayerState` 中加入：

```ts
  sleepEndsAt: number | null;
  sleepMinutes: number;
  defaultSleepMinutes: number;
  setDefaultSleepMinutes(minutes: number): void;
  setSleepTimer(minutes: number): void;
  clearSleepTimer(): void;
  setSnapshotSink(fn: SnapshotSink): void;
  start(text: string, fromSeg?: number): Promise<void>;
```

- [ ] **步骤 2：加入模块级状态与辅助函数**

在 `let prefetch` 下方加入：

```ts
let snapshotSink: SnapshotSink | null = null;
let sleepTimeout: ReturnType<typeof setTimeout> | null = null;

function clearSleepTimeout(): void {
  if (sleepTimeout) {
    clearTimeout(sleepTimeout);
    sleepTimeout = null;
  }
}

function scheduleSleep(endsAt: number | null): void {
  clearSleepTimeout();
  if (endsAt === null) return;
  const delay = Math.max(0, endsAt - Date.now());
  sleepTimeout = setTimeout(() => {
    const s = usePlayerStore.getState();
    usePlayerStore.setState({ sleepEndsAt: null, sleepMinutes: 0 });
    if (s.status === 'running' || s.status === 'paused') {
      s.pause();
      toast('睡眠定时已结束');
    }
  }, delay);
}

function emitSnapshot(finished = false, segIndex = usePlayerStore.getState().index): void {
  const s = usePlayerStore.getState();
  if (!s.source || !snapshotSink) return;
  snapshotSink({
    source: s.source,
    segIndex,
    text: s.source.kind === 'text' ? s.text : '',
    finished,
  });
}
```

- [ ] **步骤 3：在 `pump` 中写入快照与播完回调**

在 `if (s.index >= s.segs.length) {` 内、`const src = ...` 之前加入：

```ts
      emitSnapshot(true, s.segs.length);
```

在每段完成后（`hooks.onSegDone?.(...)` 之前）加入：

```ts
    emitSnapshot(false);
```

- [ ] **步骤 4：扩展 store 初始状态与动作**

在 `usePlayerStore` 初始状态中加入：

```ts
  sleepEndsAt: null,
  sleepMinutes: 0,
  defaultSleepMinutes: 0,
```

在 `setPlaybackRate` 后加入：

```ts
  setDefaultSleepMinutes(minutes) {
    set({ defaultSleepMinutes: Math.max(0, minutes) });
  },
  setSleepTimer(minutes) {
    const safe = Math.max(0, minutes);
    const endsAt = safe > 0 ? Date.now() + safe * 60_000 : null;
    set({ sleepMinutes: safe, sleepEndsAt: endsAt });
    scheduleSleep(endsAt);
  },
  clearSleepTimer() {
    clearSleepTimeout();
    set({ sleepEndsAt: null, sleepMinutes: 0 });
  },
  setSnapshotSink(fn) {
    snapshotSink = fn;
  },
```

- [ ] **步骤 5：重写 `start` 支持从指定段开始并启动默认定时**

将 `start` 替换为：

```ts
  async start(text, fromSeg = 0) {
    resetPlayback();
    hooks = {};
    const segs = splitForReading(text).map((t) => ({ text: t, status: 'pending' as SegStatus }));
    if (segs.length === 0) {
      set({ error: '没有可朗读的文本' });
      return;
    }
    const from = Math.min(Math.max(fromSeg, 0), segs.length - 1);
    const minutes = get().defaultSleepMinutes;
    const endsAt = minutes > 0 ? Date.now() + minutes * 60_000 : null;
    set({
      text, status: 'running', source: { kind: 'text' }, error: null,
      currentTime: 0, duration: 0, index: from,
      segs: segs.map((s, i) => (i < from ? { ...s, status: 'done' as SegStatus } : s)),
      sleepMinutes: minutes, sleepEndsAt: endsAt,
    });
    scheduleSleep(endsAt);
    const token = ++runToken;
    void pump(token);
  },
```

在 `startSegs` 的 `set({...})` 之后加入同样的定时逻辑：

```ts
    const minutes = get().defaultSleepMinutes;
    const endsAt = minutes > 0 ? Date.now() + minutes * 60_000 : null;
    set({ sleepMinutes: minutes, sleepEndsAt: endsAt });
    scheduleSleep(endsAt);
```

- [ ] **步骤 6：暂停与停止写入快照**

将 `pause()` 改为：

```ts
  pause() {
    if (get().status !== 'running') return;
    emitSnapshot(false);
    audio.pause();
    set({ status: 'paused' });
  },
```

将 `stop()` 改为：

```ts
  stop() {
    emitSnapshot(false);
    clearSleepTimeout();
    resetPlayback();
    hooks = {};
    set({
      status: 'idle', segs: [], index: 0, error: null,
      currentTime: 0, duration: 0, source: null, sleepEndsAt: null, sleepMinutes: 0,
    });
  },
```

- [ ] **步骤 7：类型检查**

运行：`npx tsc --noEmit`
预期：PASS。若提示 `PlaySource` 重复定义，确认已删除旧定义、仅保留 import + export。

- [ ] **步骤 8：Commit**

```bash
git add src/store/playerStore.ts
git commit -m "feat: 播放内核支持睡眠定时、快照与断点起播"
```

---

### 任务 8：句级高亮组件与播放条

**文件：**
- 创建：`src/hooks/useSleepCountdown.ts`
- 创建：`src/components/player/SentenceText.tsx`
- 修改：`src/components/player/PlayerDock.tsx`

- [ ] **步骤 1：创建倒计时 Hook**

创建 `src/hooks/useSleepCountdown.ts`：

```ts
import { useEffect, useState } from 'react';

export function useSleepCountdown(endsAt: number | null): string | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!endsAt) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [endsAt]);
  if (!endsAt) return null;
  const left = Math.max(0, endsAt - now);
  const m = Math.floor(left / 60_000);
  const s = Math.floor((left % 60_000) / 1000);
  return `${m}:${String(s).padStart(2, '0')}`;
}
```

- [ ] **步骤 2：创建句级高亮组件**

创建 `src/components/player/SentenceText.tsx`：

```tsx
import { useEffect, useMemo, useRef } from 'react';
import { sentenceIndexAt, splitSentences } from '@/lib/sentences';
import { cn } from '@/lib/utils';

interface Props {
  text: string;
  progress: number;
  className?: string;
}

export function SentenceText({ text, progress, className }: Props) {
  const sentences = useMemo(() => splitSentences(text), [text]);
  const active = sentenceIndexAt(progress, sentences);
  const activeRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (sentences.length === 0) {
    return <span className={className}>{text}</span>;
  }

  return (
    <span className={className}>
      {sentences.map((s, i) => (
        <span
          key={s.start}
          ref={i === active ? activeRef : undefined}
          className={cn(
            'rounded px-0.5 transition-colors',
            i === active && 'bg-primary text-primary-foreground',
            i < active && 'text-muted-foreground',
          )}
        >
          {s.text}
        </span>
      ))}
    </span>
  );
}
```

- [ ] **步骤 3：重写 `PlayerDock.tsx`**

将文件替换为：

```tsx
import { useState } from 'react';
import {
  ChevronDown, ChevronUp, Pause, Play, RotateCcw, RotateCw, SkipBack, SkipForward, Timer, Volume2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { SentenceText } from '@/components/player/SentenceText';
import { RATE_OPTIONS } from '@/components/player/rates';
import { useSleepCountdown } from '@/hooks/useSleepCountdown';
import { fmtClock } from '@/lib/format';
import { useNowPlayingStore } from '@/store/nowPlayingStore';
import { usePlayerStore } from '@/store/playerStore';
import { useSettingsStore } from '@/store/settingsStore';
import { SLEEP_MINUTES_OPTIONS } from '@/types/models';

function CurrentSegmentText() {
  const seg = usePlayerStore((s) => s.segs[s.index]);
  const currentTime = usePlayerStore((s) => s.currentTime);
  const duration = usePlayerStore((s) => s.duration);
  if (!seg || !seg.text.trim()) {
    return <span className="text-muted-foreground">暂无朗读文本</span>;
  }
  const progress = duration > 0 ? currentTime / duration : 0;
  return <SentenceText text={seg.text} progress={progress} />;
}

function ProgressBar({ compact }: { compact: boolean }) {
  const currentTime = usePlayerStore((s) => s.currentTime);
  const duration = usePlayerStore((s) => s.duration);
  const disabled = duration <= 0;
  const value = Math.min(currentTime, duration || 0);
  return (
    <div className={`flex items-center gap-2 ${compact ? 'flex-1' : 'w-full'}`}>
      <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
        {disabled ? '--:--' : fmtClock(currentTime)}
      </span>
      <Slider
        disabled={disabled}
        value={[value]}
        max={Math.max(duration, 1)}
        step={0.5}
        onValueChange={([v]) => usePlayerStore.getState().seek(v)}
        className="flex-1"
      />
      <span className="w-10 shrink-0 text-xs tabular-nums text-muted-foreground">
        {disabled ? '--:--' : fmtClock(duration)}
      </span>
    </div>
  );
}

function Transport({ large }: { large: boolean }) {
  const status = usePlayerStore((s) => s.status);
  const idle = status === 'idle';
  const size = large ? 'default' : 'icon';
  const iconCls = large ? 'h-5 w-5' : 'h-4 w-4';
  const player = () => usePlayerStore.getState();
  return (
    <div className={`flex items-center ${large ? 'gap-4' : 'gap-1'}`}>
      <Button variant="ghost" size={size} disabled={idle} onClick={() => player().jumpTo(player().index - 1)} title="上一段">
        <SkipBack className={iconCls} />
      </Button>
      <Button variant="ghost" size={size} title="后退 10 秒" onClick={() => player().seek(player().currentTime - 10)}>
        <RotateCcw className={iconCls} />
      </Button>
      {status === 'running' ? (
        <Button size={size} onClick={() => player().pause()} title="暂停">
          <Pause className={iconCls} />
        </Button>
      ) : (
        <Button size={size} disabled={idle} onClick={() => void player().resume()} title="播放">
          <Play className={iconCls} />
        </Button>
      )}
      <Button variant="ghost" size={size} title="前进 10 秒" onClick={() => player().seek(player().currentTime + 10)}>
        <RotateCw className={iconCls} />
      </Button>
      <Button variant="ghost" size={size} disabled={idle} onClick={() => player().skipNext()} title="下一段">
        <SkipForward className={iconCls} />
      </Button>
    </div>
  );
}

function SleepTimerSelect() {
  const sleepMinutes = usePlayerStore((s) => s.sleepMinutes);
  const endsAt = usePlayerStore((s) => s.sleepEndsAt);
  const countdown = useSleepCountdown(endsAt);
  return (
    <div className="flex items-center gap-1">
      <Timer className="h-4 w-4 shrink-0 text-muted-foreground" />
      <Select
        value={String(sleepMinutes)}
        onValueChange={(v) => usePlayerStore.getState().setSleepTimer(Number(v))}
      >
        <SelectTrigger className="h-8 w-24"><SelectValue /></SelectTrigger>
        <SelectContent>
          {SLEEP_MINUTES_OPTIONS.map((m) => (
            <SelectItem key={m} value={String(m)}>{m === 0 ? '无定时' : `${m} 分钟`}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {countdown && <span className="w-10 text-xs tabular-nums text-muted-foreground">{countdown}</span>}
    </div>
  );
}

function VolumeAndRate() {
  const volume = usePlayerStore((s) => s.volume);
  const playbackRate = usePlayerStore((s) => s.playbackRate);
  const { appPrefs, saveAppPrefs } = useSettingsStore();
  return (
    <div className="flex items-center gap-3">
      <div className="flex w-28 items-center gap-1">
        <Volume2 className="h-4 w-4 shrink-0 text-muted-foreground" />
        <Slider
          value={[volume]}
          max={100}
          step={1}
          onValueChange={([v]) => {
            usePlayerStore.getState().setVolume(v);
            void saveAppPrefs({ ...appPrefs, volume: v });
          }}
          className="flex-1"
        />
      </div>
      <Select
        value={String(playbackRate)}
        onValueChange={(v) => {
          const rate = Number(v);
          usePlayerStore.getState().setPlaybackRate(rate);
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
  const source = usePlayerStore((s) => s.source);
  const isBook = source?.kind === 'book';
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
  const status = usePlayerStore((s) => s.status);
  const error = usePlayerStore((s) => s.error);
  const index = usePlayerStore((s) => s.index);
  const segCount = usePlayerStore((s) => s.segs.length);
  const now = useNowPlayingStore((s) => s.current);

  if (status === 'idle') return null;

  const segPos = segCount > 0
    ? `段 ${Math.min(index + 1, segCount)}/${segCount}`
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
          <div className="flex items-center justify-between gap-4">
            <span className="text-xs tabular-nums text-muted-foreground">
              {now ? `第 ${now.chapterIdx + 1}/${now.chapterCount} 章` : segPos}
            </span>
            <Transport large />
            <div className="flex items-center gap-3">
              <SleepTimerSelect />
              <VolumeAndRate />
            </div>
          </div>
          <div className="mt-5 max-h-40 overflow-y-auto rounded-[10px] bg-muted/60 px-4 py-3.5 text-[13.5px] leading-[1.9]">
            <CurrentSegmentText />
          </div>
          {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card shadow-[0_-4px_16px_rgba(0,0,0,0.08)]">
      {error && <p className="px-4 pt-1 text-xs text-destructive">{error}</p>}
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

- [ ] **步骤 4：类型检查**

运行：`npx tsc --noEmit`
预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add src/hooks/useSleepCountdown.ts src/components/player/SentenceText.tsx src/components/player/PlayerDock.tsx
git commit -m "feat: 播放条支持句级高亮、睡眠定时与前后十秒"
```

---

### 任务 9：朗读页字数、时长与续听

**文件：**
- 修改：`src/pages/ReadPage.tsx`

- [ ] **步骤 1：重写 `ReadPage.tsx`**

将文件替换为：

```tsx
import { useRef } from 'react';
import { History, Play, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { PageHeader } from '@/components/PageHeader';
import { readTextFile } from '@/lib/encoding';
import { estimateReadingSeconds, fmtReadingDuration, LONG_TEXT_HINT } from '@/lib/estimate';
import { fmtTimeFull } from '@/lib/format';
import { splitForReading } from '@/lib/split';
import { voiceDisplayName } from '@/lib/voices';
import { usePlayerStore } from '@/store/playerStore';
import { useResumeStore } from '@/store/resumeStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useVoicesStore } from '@/store/voicesStore';

export function ReadPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const text = usePlayerStore((s) => s.text);
  const status = usePlayerStore((s) => s.status);
  const segs = usePlayerStore((s) => s.segs);
  const index = usePlayerStore((s) => s.index);
  const error = usePlayerStore((s) => s.error);
  const setText = usePlayerStore((s) => s.setText);
  const start = usePlayerStore((s) => s.start);
  const jumpTo = usePlayerStore((s) => s.jumpTo);
  const { synth, saveSynth, appPrefs } = useSettingsStore();
  const { voices, load } = useVoicesStore();
  const snapshot = useResumeStore((s) => s.snapshot);
  const clearSnapshot = useResumeStore((s) => s.clear);
  const idle = status === 'idle';

  const chars = text.length;
  const seconds = estimateReadingSeconds(chars);
  const segments = idle ? (chars > 0 ? splitForReading(text).length : 0) : segs.length;
  const textSnapshot = snapshot?.source.kind === 'text' ? snapshot : null;
  const canResume = appPrefs.resumeLast && textSnapshot !== null;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="朗读"
        description="粘贴或导入文本，选择音色后开始朗读；支持音量/倍速与系统媒体键。"
        actions={
          <>
            <Button variant="outline" onClick={() => fileRef.current?.click()}>
              <Upload className="mr-1.5 h-4 w-4" />
              导入 TXT
            </Button>
            {idle && (
              <Button onClick={() => void start(text)} disabled={!text.trim()}>
                <Play className="mr-1.5 h-4 w-4" />
                开始朗读
              </Button>
            )}
          </>
        }
      />

      <input
        ref={fileRef}
        type="file"
        accept=".txt,text/plain"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (file) setText(await readTextFile(file));
          e.target.value = '';
        }}
      />

      {canResume && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
          <History className="h-4 w-4 text-primary" />
          <div className="min-w-0 flex-1 text-sm">
            <span className="font-medium">继续上次朗读</span>
            <span className="ml-2 text-muted-foreground">
              第 {Math.min(textSnapshot.segIndex + 1, splitForReading(textSnapshot.text).length)} 段 · {fmtTimeFull(textSnapshot.updatedAt)}
            </span>
          </div>
          <Button size="sm" onClick={() => void start(textSnapshot.text, textSnapshot.segIndex)}>
            继续
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void clearSnapshot()} title="忽略">
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="粘贴或输入要朗读的文本，或导入 TXT…"
          className="min-h-[260px] resize-none border-0 bg-transparent p-5 text-[15px] leading-relaxed shadow-none focus-visible:ring-0 dark:bg-transparent"
        />

        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-border bg-muted/40 px-5 py-3">
          <div className="flex items-center gap-2">
            <Label className="shrink-0 text-xs text-muted-foreground">音色</Label>
            <Select
              value={synth.voice || 'node-default'}
              onOpenChange={(open) => { if (open) void load(); }}
              onValueChange={(v) => void saveSynth({ ...synth, voice: v === 'node-default' ? '' : v })}
            >
              <SelectTrigger className="w-52"><SelectValue placeholder="节点默认音色" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="node-default">节点默认音色</SelectItem>
                {voices.map((v) => (
                  <SelectItem key={v.id} value={v.id}>{voiceDisplayName(v)}（{v.id}）</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Label className="shrink-0 text-xs text-muted-foreground">语速 {synth.rate}</Label>
            <Slider value={[synth.rate]} min={-100} max={100} step={1} className="w-24"
              onValueChange={([v]) => void saveSynth({ ...synth, rate: v })} />
          </div>
          <div className="flex items-center gap-2">
            <Label className="shrink-0 text-xs text-muted-foreground">音调 {synth.pitch}</Label>
            <Slider value={[synth.pitch]} min={-100} max={100} step={1} className="w-24"
              onValueChange={([v]) => void saveSynth({ ...synth, pitch: v })} />
          </div>
          <div className="ml-auto text-xs text-muted-foreground">
            {chars} 字 · 约 {fmtReadingDuration(seconds)}
            {segments > 0 && ` · ${segments} 段`}
          </div>
        </div>
      </div>

      {chars > LONG_TEXT_HINT && (
        <p className="text-sm text-muted-foreground">
          文本较长，将分 {splitForReading(text).length} 段合成；建议导入书库以获得更好的续听体验。
        </p>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      {segs.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="border-b border-border px-5 py-3 text-sm font-medium">
            段落 · 点击可跳转
          </div>
          <div className="max-h-96 divide-y divide-border overflow-y-auto">
            {segs.map((seg, i) => (
              <button
                key={i}
                onClick={() => jumpTo(i)}
                className={`flex w-full gap-3 px-5 py-3 text-left text-sm transition-colors hover:bg-accent ${
                  i === index ? 'border-l-2 border-primary bg-primary/5' : 'border-l-2 border-transparent'
                }`}
              >
                <span className="shrink-0 tabular-nums text-muted-foreground">{i + 1}</span>
                <span className={i === index ? '' : 'text-muted-foreground'}>{seg.text}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **步骤 2：类型检查**

运行：`npx tsc --noEmit`
预期：PASS。

- [ ] **步骤 3：Commit**

```bash
git add src/pages/ReadPage.tsx
git commit -m "feat: 朗读页显示字数时长并支持续听"
```

---

### 任务 10：书架与书籍详情续听

**文件：**
- 修改：`src/pages/BooksPage.tsx:69-147`
- 修改：`src/pages/BookDetailPage.tsx:31-35`

- [ ] **步骤 1：修改 `BooksPage.tsx`**

在 import 区加入：

```ts
import { History } from 'lucide-react';
import { useResumeStore } from '@/store/resumeStore';
import { useSettingsStore } from '@/store/settingsStore';
```

（若已有 lucide import，直接合并 `History`。）

在 `BooksPage` 函数内、`const nav = useNavigate();` 之后加入：

```ts
  const snapshot = useResumeStore((s) => s.snapshot);
  const clearSnapshot = useResumeStore((s) => s.clear);
  const resumeEnabled = useSettingsStore((s) => s.appPrefs.resumeLast);
  const bookSnapshot = resumeEnabled && snapshot?.source.kind === 'book' ? snapshot : null;
  const resumeSource = bookSnapshot?.source.kind === 'book' ? bookSnapshot.source : null;
  const resumeBook = resumeSource
    ? books.find((b) => b.id === resumeSource.bookId) ?? null
    : null;
```

在 `useEffect(() => { void reload(); }, [reload]);` 后加入：

```ts
  useEffect(() => {
    if (!resumeSource || books.length === 0) return;
    if (!books.some((b) => b.id === resumeSource.bookId)) {
      void clearSnapshot();
    }
  }, [books, resumeSource, clearSnapshot]);
```

在 `<PageHeader ... />` 之后、条件渲染书籍列表之前加入：

```tsx
      {bookSnapshot && resumeSource && resumeBook && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
          <History className="h-4 w-4 text-primary" />
          <div className="min-w-0 flex-1 text-sm">
            <span className="font-medium">继续上次收听</span>
            <span className="ml-2 text-muted-foreground">
              《{bookSnapshot.bookTitle ?? resumeBook.title}》第 {resumeSource.chapterIdx + 1} 章
            </span>
          </div>
          <Button
            size="sm"
            onClick={() => void playChapter(
              resumeSource.bookId,
              resumeSource.chapterIdx,
              bookSnapshot.segIndex,
            )}
          >
            继续
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void clearSnapshot()}>忽略</Button>
        </div>
      )}
```

- [ ] **步骤 2：修改 `BookDetailPage.tsx` 的订阅**

将：

```ts
  const player = usePlayerStore();
  const src = player.source;
  const currentChapter = src?.kind === 'book' && src.bookId === id ? src.chapterIdx : null;
  const playing = player.status !== 'idle';
```

替换为：

```ts
  const source = usePlayerStore((s) => s.source);
  const status = usePlayerStore((s) => s.status);
  const currentChapter = source?.kind === 'book' && source.bookId === id ? source.chapterIdx : null;
  const playing = status !== 'idle';
```

- [ ] **步骤 3：类型检查**

运行：`npx tsc --noEmit`
预期：PASS。

- [ ] **步骤 4：Commit**

```bash
git add src/pages/BooksPage.tsx src/pages/BookDetailPage.tsx
git commit -m "feat: 书架与详情页支持续听入口"
```

---

### 任务 11：配置导入导出纯函数

**文件：**
- 创建：`src/lib/configTransfer.ts`
- 测试：`src/lib/configTransfer.test.ts`

- [ ] **步骤 1：编写失败的测试**

创建 `src/lib/configTransfer.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import {
  buildConfigFile, mergeImportedNode, parseConfigFile,
} from './configTransfer';
import { DEFAULT_APP_PREFS, DEFAULT_SYNTH, type TtsNode } from '../types/models';

const node: TtsNode = {
  id: 'n1', baseUrl: 'https://a.example', label: 'A', keyless: true, apiKey: 'SECRET',
  health: 'OK', lastChecked: 100, defaultVoice: 'v', voiceCount: 2, failCount: 1,
  cooldownUntil: 5, disabled: false, apiVersion: 'V1', source: 'manual',
};

describe('buildConfigFile', () => {
  it('导出不含 apiKey 与 pool', () => {
    const file = buildConfigFile([node], DEFAULT_SYNTH, DEFAULT_APP_PREFS, 1700000000000);
    expect(file.version).toBe(1);
    expect(file.count).toBe(1);
    expect(JSON.stringify(file)).not.toContain('SECRET');
    expect(file.nodes[0]).toEqual({
      name: 'A', url: 'https://a.example', source: 'manual', health: 'OK',
      keyless: true, apiVersion: 'V1', defaultVoice: 'v', voiceCount: 2,
    });
  });
});

describe('parseConfigFile', () => {
  it('解析合法文件', () => {
    const raw = JSON.stringify(buildConfigFile([node], DEFAULT_SYNTH, DEFAULT_APP_PREFS, 1));
    expect(parseConfigFile(raw).nodes.length).toBe(1);
  });

  it('版本或结构非法抛错', () => {
    expect(() => parseConfigFile('{oops')).toThrow('JSON');
    expect(() => parseConfigFile(JSON.stringify({ version: 2, nodes: [] }))).toThrow('版本');
    expect(() => parseConfigFile(JSON.stringify({ version: 1, nodes: 'x' }))).toThrow('nodes');
  });
});

describe('mergeImportedNode', () => {
  const imported = {
    name: '新名字', url: 'https://a.example', source: 'fofa' as const, health: 'FAIL' as const,
    keyless: false, apiVersion: 'LEGACY' as const, defaultVoice: 'v2', voiceCount: 9,
  };

  it('已有节点保留 apiKey 与 disabled，更新其余字段并清零失败', () => {
    const merged = mergeImportedNode(node, imported);
    expect(merged.id).toBe('n1');
    expect(merged.apiKey).toBe('SECRET');
    expect(merged.disabled).toBe(false);
    expect(merged.label).toBe('新名字');
    expect(merged.health).toBe('FAIL');
    expect(merged.failCount).toBe(0);
    expect(merged.cooldownUntil).toBe(0);
  });

  it('新节点没有密钥且健康度使用导入值', () => {
    const merged = mergeImportedNode(undefined, imported);
    expect(merged.apiKey).toBeNull();
    expect(merged.health).toBe('FAIL');
    expect(merged.source).toBe('fofa');
  });
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npm test -- src/lib/configTransfer.test.ts`
预期：FAIL，模块不存在。

- [ ] **步骤 3：创建 `src/lib/configTransfer.ts`**

```ts
import {
  newId, normalizeBaseUrl, normalizeAppPrefs, normalizeSynth,
  type ApiVersion, type AppPrefs, type Health, type NodeSource,
  type SynthSettings, type TtsNode,
} from '../types/models';

export const CONFIG_VERSION = 1;

export interface ConfigNode {
  name: string;
  url: string;
  source: NodeSource;
  health: Health;
  keyless: boolean;
  apiVersion: ApiVersion;
  defaultVoice: string;
  voiceCount: number;
}

export interface ConfigFile {
  version: 1;
  exportedAt: string;
  count: number;
  settings: { synth: SynthSettings; appPrefs: AppPrefs };
  nodes: ConfigNode[];
}

const HEALTHS: Health[] = ['OK', 'FAIL', 'UNKNOWN'];
const VERSIONS: ApiVersion[] = ['V1', 'LEGACY', 'UNKNOWN'];
const SOURCES: NodeSource[] = ['manual', 'fofa', 'zoomeye'];

export function buildConfigFile(
  nodes: TtsNode[],
  synth: SynthSettings,
  appPrefs: AppPrefs,
  now: number = Date.now(),
): ConfigFile {
  const exported = nodes.map((n) => ({
    name: n.label,
    url: n.baseUrl,
    source: n.source,
    health: n.health,
    keyless: n.keyless,
    apiVersion: n.apiVersion,
    defaultVoice: n.defaultVoice,
    voiceCount: n.voiceCount,
  }));
  return {
    version: 1,
    exportedAt: new Date(now).toISOString(),
    count: exported.length,
    settings: { synth, appPrefs },
    nodes: exported,
  };
}

function parseNode(raw: unknown, index: number): ConfigNode {
  if (typeof raw !== 'object' || raw === null) throw new Error(`第 ${index + 1} 个节点格式错误`);
  const o = raw as Record<string, unknown>;
  const url = typeof o.url === 'string' ? normalizeBaseUrl(o.url) : '';
  if (!url) throw new Error(`第 ${index + 1} 个节点缺少 URL`);
  return {
    name: typeof o.name === 'string' ? o.name : url,
    url,
    source: SOURCES.includes(o.source as NodeSource) ? o.source as NodeSource : 'manual',
    health: HEALTHS.includes(o.health as Health) ? o.health as Health : 'UNKNOWN',
    keyless: typeof o.keyless === 'boolean' ? o.keyless : false,
    apiVersion: VERSIONS.includes(o.apiVersion as ApiVersion) ? o.apiVersion as ApiVersion : 'UNKNOWN',
    defaultVoice: typeof o.defaultVoice === 'string' ? o.defaultVoice : '',
    voiceCount: typeof o.voiceCount === 'number' && o.voiceCount >= 0 ? o.voiceCount : 0,
  };
}

export function parseConfigFile(raw: string): ConfigFile {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error('JSON 解析失败，请选择有效的配置文件');
  }
  if (typeof data !== 'object' || data === null) throw new Error('配置文件格式错误');
  const o = data as Record<string, unknown>;
  if (o.version !== CONFIG_VERSION) throw new Error('配置版本不兼容');
  if (!Array.isArray(o.nodes)) throw new Error('配置文件缺少 nodes 数组');
  const settings = (typeof o.settings === 'object' && o.settings !== null
    ? o.settings
    : {}) as Record<string, unknown>;
  return {
    version: 1,
    exportedAt: typeof o.exportedAt === 'string' ? o.exportedAt : new Date(0).toISOString(),
    count: o.nodes.length,
    settings: {
      synth: normalizeSynth(settings.synth),
      appPrefs: normalizeAppPrefs(settings.appPrefs),
    },
    nodes: o.nodes.map(parseNode),
  };
}

export function mergeImportedNode(existing: TtsNode | undefined, n: ConfigNode): TtsNode {
  if (existing) {
    return {
      ...existing,
      label: n.name || existing.label,
      health: n.health,
      apiVersion: n.apiVersion,
      defaultVoice: n.defaultVoice,
      voiceCount: n.voiceCount,
      failCount: 0,
      cooldownUntil: 0,
    };
  }
  return {
    id: newId(),
    baseUrl: n.url,
    label: n.name || n.url,
    keyless: n.keyless,
    apiKey: null,
    health: n.health,
    lastChecked: 0,
    defaultVoice: n.defaultVoice,
    voiceCount: n.voiceCount,
    failCount: 0,
    cooldownUntil: 0,
    disabled: false,
    apiVersion: n.apiVersion,
    source: n.source,
  };
}
```

- [ ] **步骤 4：运行测试验证通过**

运行：`npm test -- src/lib/configTransfer.test.ts`
预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add src/lib/configTransfer.ts src/lib/configTransfer.test.ts
git commit -m "feat: 添加配置导入导出与节点合并逻辑"
```

---

### 任务 12：设置页与数据区 UI

**文件：**
- 创建：`src/components/settings/DataSection.tsx`
- 修改：`src/pages/SettingsPage.tsx`

- [ ] **步骤 1：创建 `DataSection.tsx`**

```tsx
import { useState } from 'react';
import { Download, Upload } from 'lucide-react';
import { open, save } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  buildConfigFile, mergeImportedNode, parseConfigFile,
} from '@/lib/configTransfer';
import { normalizeBaseUrl } from '@/types/models';
import { deps } from '@/store/deps';
import { notifyShare } from '@/store/shareSync';
import { useNodesStore } from '@/store/nodesStore';
import { useSettingsStore } from '@/store/settingsStore';

function stamp(): string {
  const d = new Date();
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

export function DataSection() {
  const { synth, appPrefs, saveSynth, saveAppPrefs } = useSettingsStore();
  const [busy, setBusy] = useState<'export' | 'import' | null>(null);

  async function onExport(): Promise<void> {
    setBusy('export');
    try {
      const path = await save({
        defaultPath: `tts-aggregator-config-${stamp()}.json`,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (!path) return;
      const file = buildConfigFile(
        useNodesStore.getState().nodes,
        synth,
        appPrefs,
      );
      await writeTextFile(path, JSON.stringify(file, null, 2));
      toast.success('配置已导出（不含 API Key）');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function onImport(): Promise<void> {
    setBusy('import');
    try {
      const picked = await open({
        multiple: false,
        directory: false,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (!picked || Array.isArray(picked)) return;
      const file = parseConfigFile(await readTextFile(picked));
      const existing = new Map(
        useNodesStore.getState().nodes.map((n) => [normalizeBaseUrl(n.baseUrl), n]),
      );
      const merged = new Map<string, ReturnType<typeof mergeImportedNode>>();
      for (const item of file.nodes) {
        merged.set(item.url, mergeImportedNode(existing.get(item.url), item));
      }
      for (const node of merged.values()) {
        await deps().nodes.upsert(node);
      }
      await useNodesStore.getState().load();
      await saveSynth(file.settings.synth);
      await saveAppPrefs(file.settings.appPrefs);
      await notifyShare();
      void useNodesStore.getState().probeAll();
      toast.success(`已导入 ${file.nodes.length} 个节点并恢复偏好`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-base font-medium">数据</h2>
        <p className="text-sm text-muted-foreground">
          备份节点与偏好设置，不含 API Key 与分享 Token。
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => void onExport()} disabled={busy !== null}>
          <Download className="mr-1.5 h-4 w-4" />
          {busy === 'export' ? '导出中…' : '导出配置'}
        </Button>
        <Button variant="outline" onClick={() => void onImport()} disabled={busy !== null}>
          <Upload className="mr-1.5 h-4 w-4" />
          {busy === 'import' ? '导入中…' : '导入配置'}
        </Button>
      </div>
    </section>
  );
}
```

- [ ] **步骤 2：更新 `SettingsPage.tsx` 的分区**

在 import 区加入：

```ts
import { DataSection } from '@/components/settings/DataSection';
import { useNodesStore } from '@/store/nodesStore';
import {
  COOLDOWN_MINUTES_OPTIONS, FAIL_THRESHOLD_OPTIONS, SLEEP_MINUTES_OPTIONS,
} from '@/types/models';
```

将 `SectionKey` 与 `SECTIONS` 替换为：

```ts
type SectionKey = 'voice' | 'appearance' | 'schedule' | 'data' | 'share';

const SECTIONS: [SectionKey, string][] = [
  ['voice', '语音参数'],
  ['appearance', '外观与播放'],
  ['schedule', '调度与探测'],
  ['data', '数据'],
  ['share', '局域网分享'],
];
```

在「外观与播放」的 grid 末尾追加：

```tsx
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">默认睡眠定时</Label>
                  <Select
                    value={String(appPrefs.sleepMinutes)}
                    onValueChange={(v) => void saveAppPrefs({ ...appPrefs, sleepMinutes: Number(v) })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SLEEP_MINUTES_OPTIONS.map((m) => (
                        <SelectItem key={m} value={String(m)}>{m === 0 ? '关闭' : `${m} 分钟`}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={appPrefs.resumeLast}
                    onCheckedChange={(c) => void saveAppPrefs({ ...appPrefs, resumeLast: c === true })}
                  />
                  自动续听
                </label>
```

在 `SettingsPage` 顶部的 store 订阅区加入：

```ts
  const probing = useNodesStore((s) => s.probing);
```

将原来的「探测」section 整段替换为：

```tsx
          {active === 'schedule' && (
            <section className="space-y-4">
              <div>
                <h2 className="text-base font-medium">调度与探测</h2>
                <p className="text-sm text-muted-foreground">失败冷却策略与节点探测行为。</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">失败阈值</Label>
                  <Select
                    value={String(appPrefs.failThreshold)}
                    onValueChange={(v) => void saveAppPrefs({ ...appPrefs, failThreshold: Number(v) })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FAIL_THRESHOLD_OPTIONS.map((n) => (
                        <SelectItem key={n} value={String(n)}>{n} 次</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">冷却时长</Label>
                  <Select
                    value={String(appPrefs.cooldownMinutes)}
                    onValueChange={(v) => void saveAppPrefs({ ...appPrefs, cooldownMinutes: Number(v) })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {COOLDOWN_MINUTES_OPTIONS.map((n) => (
                        <SelectItem key={n} value={String(n)}>{n} 分钟</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-3">
                  <Label className="text-xs text-muted-foreground">并发数</Label>
                  <Input type="number" min={1} max={8} className="w-20"
                    value={appPrefs.probeConcurrency}
                    onChange={(e) => void saveAppPrefs({
                      ...appPrefs,
                      probeConcurrency: Math.max(1, Math.min(8, Number(e.target.value) || 1)),
                    })} />
                  <span className="text-sm text-muted-foreground">1-8</span>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={appPrefs.autoTestOnLaunch}
                    onCheckedChange={(c) => void saveAppPrefs({ ...appPrefs, autoTestOnLaunch: c === true })}
                  />
                  启动时自动测试节点
                </label>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={probing}
                onClick={() => void useNodesStore.getState().probeAll()}
              >
                立即测试全部节点
              </Button>
            </section>
          )}
```

在「分享」section 之前加入：

```tsx
          {active === 'data' && <DataSection />}
```

- [ ] **步骤 3：类型检查**

运行：`npx tsc --noEmit`
预期：PASS。

- [ ] **步骤 4：Commit**

```bash
git add src/components/settings/DataSection.tsx src/pages/SettingsPage.tsx
git commit -m "feat: 设置页增加调度参数与配置导入导出"
```

---

### 任务 13：启动引导、主题镜像与媒体会话

**文件：**
- 修改：`src/lib/theme.ts`
- 修改：`src/store/settingsStore.ts`
- 修改：`src/main.tsx`
- 修改：`src/lib/mediaSession.ts`

- [ ] **步骤 1：主题镜像**

在 `src/lib/theme.ts` 末尾加入：

```ts
export function mirrorTheme(theme: ThemeMode): void {
  try {
    localStorage.setItem('app_prefs', JSON.stringify({ theme }));
  } catch {
    /* 隐私模式或存储禁用时忽略 */
  }
}
```

- [ ] **步骤 2：更新 `settingsStore.ts`**

将 import 改为：

```ts
import {
  DEFAULT_APP_PREFS, DEFAULT_POOL, DEFAULT_SYNTH, defaultShare,
  normalizeAppPrefs, normalizeSynth,
  type AppPrefs, type PoolConfig, type ShareConfig, type SynthSettings,
} from '../types/models';
import { mirrorTheme } from '../lib/theme';
import { useResumeStore } from './resumeStore';
```

将 `load` 中 `synth` 一行改为：

```ts
      synth: normalizeSynth(await s.getJson('synth_settings', DEFAULT_SYNTH)),
```

在 `load` 的 `set({...})` 之后加入：

```ts
    mirrorTheme(get().appPrefs.theme);
```

在 import 区加入：

```ts
import { usePlayerStore } from './playerStore';
```

将 `saveAppPrefs` 替换为：

```ts
  async saveAppPrefs(appPrefs) {
    set({ appPrefs });
    mirrorTheme(appPrefs.theme);
    usePlayerStore.getState().setDefaultSleepMinutes(appPrefs.sleepMinutes);
    await deps().settings.setJson('app_prefs', appPrefs);
    if (!appPrefs.resumeLast) await useResumeStore.getState().clear();
  },
```

- [ ] **步骤 3：更新 `main.tsx`**

在 import 区加入：

```ts
import { useResumeStore } from './store/resumeStore';
import { useNowPlayingStore } from './store/nowPlayingStore';
import type { PlaybackSnapshot } from './lib/snapshot';
```

在 `await useSettingsStore.getState().load();` 之后加入：

```ts
  await useResumeStore.getState().load();
```

在 `usePlayerStore.getState().initPlayback(...)` 之后加入：

```ts
  usePlayerStore.getState().setDefaultSleepMinutes(bootPrefs.sleepMinutes);
  usePlayerStore.getState().setSnapshotSink((d) => {
    if (!useSettingsStore.getState().appPrefs.resumeLast) return;
    const now = useNowPlayingStore.getState().current;
    const snapshot: PlaybackSnapshot = {
      version: 1,
      source: d.source,
      segIndex: d.segIndex,
      text: d.source.kind === 'text' ? d.text : '',
      updatedAt: Date.now(),
    };
    if (d.source.kind === 'book' && now && now.bookId === d.source.bookId) {
      snapshot.bookTitle = now.title;
      snapshot.chapterTitle = now.chapterTitle;
      snapshot.chapterCount = now.chapterCount;
    }
    if (d.finished && d.source.kind === 'text') {
      void useResumeStore.getState().clear();
      return;
    }
    void useResumeStore.getState().save(snapshot);
  });
```

在 `usePlayerStore.getState().setSynth(...)` 之后加入：

```ts
  if (bootPrefs.autoTestOnLaunch) {
    void useNodesStore.getState().probeAll();
  }
```

- [ ] **步骤 4：优化 `mediaSession.ts`**

将 `store.subscribe(...)` 整段替换为：

```ts
  let last = '';
  store.subscribe((s) => {
    const key = `${s.status}|${s.index}|${s.segs.length}`;
    if (key === last) return;
    last = key;
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
```

- [ ] **步骤 5：类型检查**

运行：`npx tsc --noEmit`
预期：PASS。

- [ ] **步骤 6：Commit**

```bash
git add src/lib/theme.ts src/lib/mediaSession.ts src/store/settingsStore.ts src/main.tsx
git commit -m "feat: 启动恢复快照、自动探测与主题镜像"
```

---

### 任务 14：Tauri 插件、权限与 CSP

**文件：**
- 修改：`package.json`、`package-lock.json`
- 修改：`src-tauri/Cargo.toml`
- 修改：`src-tauri/src/lib.rs`
- 修改：`src-tauri/capabilities/default.json`
- 修改：`src-tauri/tauri.conf.json`

- [ ] **步骤 1：安装前端依赖**

运行：

```bash
npm install @tauri-apps/plugin-dialog@^2 @tauri-apps/plugin-fs@^2
```

预期：`package.json` 出现两个依赖。

- [ ] **步骤 2：更新 Cargo 依赖**

在 `src-tauri/Cargo.toml` 的 `[dependencies]` 中加入：

```toml
tauri-plugin-dialog = "2"
tauri-plugin-fs = "2"
```

- [ ] **步骤 3：注册插件**

在 `src-tauri/src/lib.rs` 的插件链中加入：

```rust
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
```

位置放在 `tauri_plugin_opener::init()` 之后即可。

- [ ] **步骤 4：更新权限**

将 `src-tauri/capabilities/default.json` 的 `permissions` 替换为：

```json
  "permissions": [
    "core:default",
    "opener:default",
    "dialog:allow-open",
    "dialog:allow-save",
    "fs:allow-read-text-file",
    "fs:allow-write-text-file",
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
```

执行后检查生成的 `src-tauri/gen/schemas/desktop-schema.json`，确认 `dialog:allow-open` / `dialog:allow-save`、`fs:allow-read-text-file` / `fs:allow-write-text-file` 均存在。若本机插件版本生成的标识符不同，以 schema 为准修正。

- [ ] **步骤 5：更新 Tauri 配置**

将 `src-tauri/tauri.conf.json` 的 `productName` 改为 `TTS Aggregator`，窗口配置改为：

```json
      {
        "title": "TTS Aggregator",
        "width": 1200,
        "height": 800,
        "minWidth": 960,
        "minHeight": 640
      }
```

将 `app.security` 替换为：

```json
    "security": {
      "csp": {
        "default-src": "'self'",
        "script-src": "'self'",
        "connect-src": "ipc: http://ipc.localhost ws://localhost:1420",
        "img-src": "'self' data: blob:",
        "media-src": "'self' blob:",
        "style-src": "'self' 'unsafe-inline'"
      }
    }
```

保留 `identifier` 不变。

- [ ] **步骤 6：验证 Rust 编译**

运行（在 `src-tauri` 目录）：`cargo check`
预期：编译成功。若权限标识符错误，按步骤 4 的说明用生成的 schema 修正。

- [ ] **步骤 7：Commit**

```bash
git add package.json package-lock.json src-tauri/Cargo.toml src-tauri/src/lib.rs src-tauri/capabilities/default.json src-tauri/tauri.conf.json
git commit -m "chore: 接入文件对话框插件并收紧 CSP"
```

---

### 任务 15：统一 cn 并清理依赖

**文件：**
- 修改：`src/components/ui/*.tsx`（14 个文件）
- 修改：`package.json`、`package-lock.json`

- [ ] **步骤 1：批量替换导入**

使用 Node 脚本（跨平台）：

```bash
node -e "const fs=require('fs');const d='src/components/ui';for(const f of fs.readdirSync(d)){if(!f.endsWith('.tsx'))continue;const p=d+'/'+f;const s=fs.readFileSync(p,'utf8');const n=s.replace(/from \"cn\"/g,'from \"@/lib/utils\"');if(n!==s)fs.writeFileSync(p,n);}"
```

- [ ] **步骤 2：确认没有残留**

运行：`git grep -n "from \"cn\"" -- src`
预期：无输出。

- [ ] **步骤 3：移除依赖**

运行：

```bash
npm uninstall cn
```

- [ ] **步骤 4：构建验证**

运行：`npm run build`
预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add src/components/ui package.json package-lock.json
git commit -m "refactor: 统一 cn 实现到本地工具函数"
```

---

### 任务 16：README 与全量验证

**文件：**
- 修改：`README.md`

- [ ] **步骤 1：更新 README 功能列表**

在「功能」列表的朗读条目后补充：

```markdown
- **朗读增强**：句级高亮、睡眠定时（0/15/30/60 分钟）、±10 秒、字数与预计时长。
- **续听**：纯文本与书籍均保留上次位置，启动后提供「继续上次」入口。
- **配置备份**：导出/导入 JSON（不含 API Key 与分享 Token）。
- **调度参数**：失败阈值与冷却时长可在设置页调整；可选启动自动测试。
```

在「技术栈」或「测试」小节补充 dialog/fs 插件说明。

- [ ] **步骤 2：运行全量测试**

运行：`npm test`
预期：全部 PASS，包含新增的 4 个测试文件与更新的模型/调度测试。

- [ ] **步骤 3：运行生产构建**

运行：`npm run build`
预期：PASS。

- [ ] **步骤 4：运行 Rust 检查**

运行（在 `src-tauri` 目录）：`cargo check`
预期：PASS。

- [ ] **步骤 5：手动验收**

按规格第 8 节逐项验证：

1. 句级高亮随播放推进并自动滚动。
2. 睡眠定时到点暂停并提示。
3. ±10 秒不越界。
4. 字数/时长显示，超 8000 字提示。
5. 调度参数重启后保留并生效。
6. 启动自动测试生效。
7. 导出不含 API Key，导入保留已有 Key 并恢复偏好。
8. 纯文本与书籍续听入口可用。
9. 关闭自动续听后入口消失。
10. 生产构建 Blob 音频可播放（CSP 正确）。
11. 文件对话框导入/导出可用。

- [ ] **步骤 6：Commit**

```bash
git add README.md
git commit -m "docs: 更新阶段一功能说明"
```

---

## 自检结果

- **规格覆盖度**：配置模型（任务 1）、调度策略（2）、句级高亮（3、8）、字数时长（4、9）、快照（5、6、7、13）、睡眠定时（7、8、12）、±10 秒（8）、续听入口（9、10）、设置页（12）、导入导出（11、12）、启动自动测试（13）、基础设施（14、15）、媒体会话与主题镜像（13）、README 与验证（16）。
- **占位符扫描**：无 TODO/待定；所有代码步骤均给出可执行实现。
- **类型一致性**：`PlaySource` 在任务 1 定义、任务 7 重新导出；`SnapshotData` 在任务 7 定义、任务 13 使用；`PoolPolicy` 在任务 2 定义并使用；`ConfigFile` 在任务 11 定义、任务 12 使用；`PlaybackSnapshot` 在任务 5 定义、任务 13 使用。
- **已知注意点**：Tauri 权限标识符以生成的 `desktop-schema.json` 为准；`BooksPage` 中书籍来源需先收窄类型再访问 `bookId`。
