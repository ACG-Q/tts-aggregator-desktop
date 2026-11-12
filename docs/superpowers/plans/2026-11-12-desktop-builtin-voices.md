# 桌面端内置音色库统一 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 把安卓端的 `voices.json` 内置音色库引入桌面端，离线可用、中文名与简介与安卓一致。

**架构：** JSON 放到 `src/assets/` 并通过动态 `import()` 懒加载成独立 chunk；`builtinVoices.ts` 负责加载与「远端列表补中文翻译」；`voicesStore` 增加来源状态与无节点兜底；音色页在展开区展示简介。

**技术栈：** React 18 + TypeScript + Vite + Zustand + Vitest

**规格：** `docs/superpowers/specs/2026-11-12-desktop-builtin-voices-design.md`

---

## 文件结构

| 文件 | 职责 |
| --- | --- |
| `src/assets/voices.json`（新建） | 与安卓完全一致的内置音色数据，整份覆盖同步 |
| `src/types/models.ts`（修改） | `Voice` 增加可选 `nameZh` / `introZh` |
| `src/lib/voices.ts`（修改） | `parseVoices` 解析中文名/简介；`voiceDisplayName` 优先 `nameZh` |
| `src/lib/builtinVoices.ts`（新建） | 懒加载内置库 + `mergeVoiceTranslations` 翻译合并 |
| `src/lib/builtinVoices.test.ts`（新建） | 加载与合并规则测试 |
| `src/lib/voiceFilter.ts`（修改） | 搜索命中中文名与简介 |
| `src/store/voicesStore.ts`（修改） | 来源状态、内置兜底、拉取后合并并缓存 |
| `src/store/voicesStore.test.ts`（新建） | store 三条路径测试 |
| `src/pages/VoicesPage.tsx`（修改） | 展开区显示简介、内置库来源提示 |

---

### 任务 1：内置数据文件与类型字段

**文件：**
- 创建：`src/assets/voices.json`（从安卓仓库复制）
- 修改：`src/types/models.ts:26-33`
- 修改：`src/lib/voices.ts:38-56`
- 测试：`src/lib/voices.test.ts`

- [ ] **步骤 1：复制数据文件（不要用文本编辑器，避免编码损坏）**

在 `tts-aggregator-desktop` 目录执行（PowerShell）：

```powershell
New-Item -ItemType Directory -Force src\assets | Out-Null
Copy-Item ..\tts-aggregator-android\app\src\main\assets\voices.json src\assets\voices.json
(Get-Item src\assets\voices.json).Length
```

预期：输出约 `352881`。

- [ ] **步骤 2：编写失败的测试**

在 `src/lib/voices.test.ts` 的 `parseVoices` describe 内追加：

```ts
  it('解析内置中文名与简介', () => {
    const [v] = parseVoices([
      { short_name: 'zh-CN-XiaoxiaoNeural', display_name: 'Xiaoxiao', name_zh: '晓晓', intro_zh: '普通话女声。' },
      { short_name: 'x', display_name: 'X' },
    ]);
    expect(v).toMatchObject({ nameZh: '晓晓', introZh: '普通话女声。' });
    expect(parseVoices([{ short_name: 'x' }])[0].nameZh).toBeUndefined();
  });
```

同时在 `voiceDisplayName` describe 内追加：

```ts
  it('nameZh 优先于 localName 与映射表', () => {
    expect(voiceDisplayName({
      id: 'zh-CN-XiaoxiaoNeural', name: 'Xiaoxiao Dragon HD', localName: '晓晓', nameZh: '晓晓（内置）',
    })).toBe('晓晓（内置）');
  });
```

- [ ] **步骤 3：运行测试验证失败**

```powershell
npm test -- src/lib/voices.test.ts
```

预期：FAIL，`nameZh` 为 `undefined` / 返回值不是 `晓晓（内置）`。

- [ ] **步骤 4：修改类型与解析**

`src/types/models.ts` 的 `Voice` 改为：

```ts
export interface Voice {
  id: string;
  name: string;
  localName: string;
  gender: string;
  locale: string;
  styles: string[] | null;
  nameZh?: string;
  introZh?: string;
}
```

`src/lib/voices.ts` 中 `parseVoices` 的 `out.push({...})` 前加：

```ts
    const nameZh = typeof o.name_zh === 'string'
      ? o.name_zh
      : (typeof o.nameZh === 'string' ? o.nameZh : undefined);
    const introZh = typeof o.intro_zh === 'string'
      ? o.intro_zh
      : (typeof o.introZh === 'string' ? o.introZh : undefined);
```

并把两个字段加入 push 的对象：

```ts
      styles: Array.isArray(o.style_list) ? o.style_list.map(String) : null,
      nameZh,
      introZh,
```

`voiceDisplayName` 开头加：

```ts
  if (v.nameZh) return v.nameZh;
```

（`Pick<Voice, 'id' | 'name' | 'localName'>` 需改为 `Pick<Voice, 'id' | 'name' | 'localName' | 'nameZh'>`。）

- [ ] **步骤 5：运行测试验证通过**

```powershell
npm test -- src/lib/voices.test.ts
npx tsc --noEmit
```

预期：voices 测试全绿，tsc 无输出。

- [ ] **步骤 6：Commit**

```powershell
git add src/assets/voices.json src/types/models.ts src/lib/voices.ts src/lib/voices.test.ts
git commit -m "feat(voices): 引入安卓内置音色数据与中文名字段"
```

---

### 任务 2：内置库懒加载与翻译合并

**文件：**
- 创建：`src/lib/builtinVoices.ts`
- 测试：`src/lib/builtinVoices.test.ts`

- [ ] **步骤 1：编写失败的测试**

创建 `src/lib/builtinVoices.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { loadBuiltinVoices, mergeVoiceTranslations } from './builtinVoices';
import type { Voice } from '../types/models';

const voice = (id: string, name: string, localName = '', extra: Partial<Voice> = {}): Voice => ({
  id, name, localName, gender: '', locale: 'zh-CN', styles: null, ...extra,
});

describe('loadBuiltinVoices', () => {
  it('加载安卓内置库并缓存', async () => {
    const first = await loadBuiltinVoices();
    const second = await loadBuiltinVoices();
    expect(first.length).toBeGreaterThan(300);
    expect(second).toBe(first);
    expect(first.find((v) => v.id === 'zh-CN-XiaoxiaoNeural')?.nameZh).toBe('晓晓');
  });
});

describe('mergeVoiceTranslations', () => {
  it('按 id 补全缺失的中文名与简介', () => {
    const builtin = [voice('a', 'Alpha', '阿尔法', { nameZh: '阿尔法', introZh: '简介 A' })];
    const [remote] = mergeVoiceTranslations([voice('a', 'Alpha')], builtin);
    expect(remote).toMatchObject({ nameZh: '阿尔法', introZh: '简介 A' });
  });

  it('id 不匹配时按基础人名匹配', () => {
    const builtin = [voice('b1', 'Beta Dragon HD', '贝塔', { nameZh: '贝塔', introZh: '简介 B' })];
    const [remote] = mergeVoiceTranslations([voice('b2', 'Beta Latest')], builtin);
    expect(remote.nameZh).toBe('贝塔');
  });

  it('远端已有翻译不被覆盖', () => {
    const builtin = [voice('a', 'Alpha', '', { nameZh: '内置', introZh: '内置简介' })];
    const [remote] = mergeVoiceTranslations(
      [voice('a', 'Alpha', '', { nameZh: '远端', introZh: '远端简介' })],
      builtin,
    );
    expect(remote).toMatchObject({ nameZh: '远端', introZh: '远端简介' });
  });

  it('内置库为空时原样返回', () => {
    const remote = [voice('a', 'Alpha')];
    expect(mergeVoiceTranslations(remote, [])).toBe(remote);
  });
});
```

- [ ] **步骤 2：运行测试验证失败**

```powershell
npm test -- src/lib/builtinVoices.test.ts
```

预期：FAIL，`Failed to resolve import "./builtinVoices"`。

- [ ] **步骤 3：实现 builtinVoices.ts**

```ts
// 内置音色库来源：tts-aggregator-android/app/src/main/assets/voices.json。
// 同步时整份覆盖，不要手改 JSON 内容。
import type { Voice } from '../types/models';
import { parseVoices } from './voices';

let cache: Voice[] | null = null;
let loading: Promise<Voice[]> | null = null;

/** 懒加载内置音色库；Vite 会把 voices.json 拆成独立 chunk。 */
export async function loadBuiltinVoices(): Promise<Voice[]> {
  if (cache) return cache;
  if (loading) return loading;
  loading = (async () => {
    try {
      const mod = await import('../assets/voices.json');
      cache = parseVoices(mod.default);
    } catch (e) {
      console.error('读取内置音色失败', e);
      cache = [];
    } finally {
      loading = null;
    }
    return cache;
  })();
  return loading;
}

/** 基础人名：去掉 Neural / 系列后缀，用于跨 id 匹配内置翻译。 */
function baseName(v: Voice): string {
  return (v.localName || v.name).trim().split(/\s+/)[0] ?? '';
}

/**
 * 远端列表补中文翻译：先按 id 精确匹配，再按基础人名匹配；
 * 远端已有的翻译优先保留（与安卓 VoiceRepository 一致）。
 */
export function mergeVoiceTranslations(remote: Voice[], builtin: Voice[]): Voice[] {
  if (builtin.length === 0) return remote;
  const byId = new Map(builtin.map((v) => [v.id, v]));
  const byBase = new Map<string, Voice>();
  for (const v of builtin) {
    const key = baseName(v);
    if (key && !byBase.has(key)) byBase.set(key, v);
  }
  return remote.map((voice) => {
    if (voice.nameZh && voice.introZh) return voice;
    const match = byId.get(voice.id) ?? byBase.get(baseName(voice));
    if (!match) return voice;
    return {
      ...voice,
      nameZh: voice.nameZh || match.nameZh || undefined,
      introZh: voice.introZh || match.introZh || undefined,
    };
  });
}
```

- [ ] **步骤 4：运行测试验证通过**

```powershell
npm test -- src/lib/builtinVoices.test.ts
```

预期：5 个用例全绿。

- [ ] **步骤 5：Commit**

```powershell
git add src/lib/builtinVoices.ts src/lib/builtinVoices.test.ts
git commit -m "feat(voices): 内置音色懒加载与翻译合并"
```

---

### 任务 3：搜索命中中文名与简介

**文件：**
- 修改：`src/lib/voiceFilter.ts:37-45`
- 测试：`src/lib/voiceFilter.test.ts`

- [ ] **步骤 1：编写失败的测试**

在 `src/lib/voiceFilter.test.ts` 的 `filterVoices` describe 内追加（沿用文件里已有的 `voice()` 构造器）：

```ts
  it('搜索命中中文名与简介', () => {
    const list = [
      voice('zh-CN-XiaoxiaoNeural', 'Xiaoxiao', 'zh-CN', 'Female', null, { nameZh: '晓晓', introZh: '普通话女声' }),
      voice('zh-CN-YunxiNeural', 'Yunxi', 'zh-CN', 'Male'),
    ];
    expect(filterVoices(list, { query: '晓晓', language: 'all', gender: '' }))
      .toHaveLength(1);
    expect(filterVoices(list, { query: '普通话', language: 'all', gender: '' }))
      .toHaveLength(1);
  });
```

同类文件顶部的 `voice()` 辅助函数改为支持附加字段：

```ts
function voice(
  id: string, name: string, locale: string, gender = 'Female',
  styles: string[] | null = null, extra: Partial<Voice> = {},
): Voice {
  return { id, name, localName: '', gender, locale, styles, ...extra };
}
```

- [ ] **步骤 2：运行测试验证失败**

```powershell
npm test -- src/lib/voiceFilter.test.ts
```

预期：FAIL，返回长度 0。

- [ ] **步骤 3：扩展搜索字段**

`src/lib/voiceFilter.ts` 最后一行匹配改为：

```ts
    return voiceDisplayName(v).toLowerCase().includes(q)
      || v.id.toLowerCase().includes(q)
      || (v.introZh?.toLowerCase().includes(q) ?? false);
```

（`voiceDisplayName` 已优先 `nameZh`，因此中文名自动覆盖。）

- [ ] **步骤 4：运行测试验证通过**

```powershell
npm test -- src/lib/voiceFilter.test.ts
npx tsc --noEmit
```

预期：全绿，tsc 无输出。

- [ ] **步骤 5：Commit**

```powershell
git add src/lib/voiceFilter.ts src/lib/voiceFilter.test.ts
git commit -m "feat(voices): 搜索支持中文简介"
```

---

### 任务 4：Store 内置兜底与来源状态

**文件：**
- 修改：`src/store/voicesStore.ts`
- 测试：`src/store/voicesStore.test.ts`（新建）

- [ ] **步骤 1：编写失败的测试**

创建 `src/store/voicesStore.test.ts`：

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Voice } from '../types/models';

const state = vi.hoisted(() => ({
  builtin: [] as Voice[],
  cache: [] as Voice[],
  nodes: [] as { id: string; baseUrl: string; health: string }[],
  fetched: null as Voice[] | null,
  saved: [] as Voice[],
}));

vi.mock('../lib/builtinVoices', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/builtinVoices')>();
  return { ...actual, loadBuiltinVoices: async () => state.builtin };
});

vi.mock('./deps', () => ({
  deps: () => ({
    nodes: { getAll: async () => state.nodes },
    api: { fetchVoices: async () => state.fetched },
    settings: {
      getJson: async () => state.cache,
      setJson: async (_key: string, value: Voice[]) => { state.saved = value; },
    },
  }),
}));

import { useVoicesStore } from './voicesStore';

const voice = (id: string, extra: Partial<Voice> = {}): Voice => ({
  id, name: id, localName: '', gender: '', locale: 'zh-CN', styles: null, ...extra,
});

describe('voicesStore 内置音色', () => {
  beforeEach(() => {
    state.builtin = [voice('builtin-1', { nameZh: '内置一', introZh: '简介' })];
    state.cache = [];
    state.nodes = [];
    state.fetched = null;
    state.saved = [];
    useVoicesStore.setState({ voices: [], loading: false, error: null, source: null });
  });

  it('缓存为空时载入内置库', async () => {
    await useVoicesStore.getState().initCache();
    expect(useVoicesStore.getState().voices).toHaveLength(1);
    expect(useVoicesStore.getState().source).toBe('builtin');
  });

  it('无节点时保留内置库并提示', async () => {
    await useVoicesStore.getState().initCache();
    await useVoicesStore.getState().load();
    expect(useVoicesStore.getState().voices[0].id).toBe('builtin-1');
    expect(useVoicesStore.getState().error).toContain('内置音色库');
  });

  it('拉取成功后合并翻译、标记 remote 并写缓存', async () => {
    state.nodes = [{ id: 'n1', baseUrl: 'https://n.example.com', health: 'OK' }];
    state.fetched = [voice('zh-CN-XiaoxiaoNeural', { name: 'Xiaoxiao' })];
    state.builtin = [voice('zh-CN-XiaoxiaoNeural', { name: 'Xiaoxiao', nameZh: '晓晓', introZh: '普通话女声' })];
    await useVoicesStore.getState().load();
    const s = useVoicesStore.getState();
    expect(s.source).toBe('remote');
    expect(s.voices[0]).toMatchObject({ nameZh: '晓晓', introZh: '普通话女声' });
    expect(state.saved[0].nameZh).toBe('晓晓');
  });
});
```

- [ ] **步骤 2：运行测试验证失败**

```powershell
npm test -- src/store/voicesStore.test.ts
```

预期：FAIL，`source` 不存在 / 无内置兜底。

- [ ] **步骤 3：实现 store**

`src/store/voicesStore.ts` 完整替换为：

```ts
import { create } from 'zustand';
import { loadBuiltinVoices, mergeVoiceTranslations } from '../lib/builtinVoices';
import { parseVoices, voiceDisplayName } from '../lib/voices';
import type { TtsNode, Voice } from '../types/models';
import { deps } from './deps';

export type VoicesSource = 'builtin' | 'cache' | 'remote';

const BUILTIN_HINT = '当前显示内置音色库，添加节点后可获取节点实际列表';

interface VoicesState {
  voices: Voice[];
  loading: boolean;
  error: string | null;
  source: VoicesSource | null;
  initCache(): Promise<void>;
  load(force?: boolean, source?: TtsNode): Promise<void>;
}

export const useVoicesStore = create<VoicesState>((set, get) => ({
  voices: [],
  loading: false,
  error: null,
  source: null,
  async initCache() {
    const cached = await deps().settings.getJson<Voice[]>('voices_cache', []);
    if (cached.length) {
      if (get().voices.length === 0) set({ voices: cached, source: 'cache' });
      return;
    }
    if (get().voices.length > 0) return;
    const builtin = await loadBuiltinVoices();
    if (builtin.length) set({ voices: builtin, source: 'builtin' });
  },
  async load(force = false, source) {
    if (get().loading) return;
    const { voices, source: current } = get();
    // 内置库只是兜底，进入页面时仍应尝试拉取节点真实列表
    if (!force && voices.length > 0 && current !== 'builtin') return;
    set({ loading: true, error: null });
    try {
      const nodes = await deps().nodes.getAll();
      const node = source ?? nodes.find((n) => n.health === 'OK') ?? nodes[0];
      if (!node) {
        const builtin = await loadBuiltinVoices();
        if (builtin.length) {
          set({ voices: builtin, source: 'builtin', error: BUILTIN_HINT });
        } else {
          set({ error: '没有可用节点，请先在“节点”页添加并探测' });
        }
        return;
      }
      const list = await deps().api.fetchVoices(node.baseUrl);
      if (!list || list.length === 0) {
        set({ error: `拉取音色失败：${node.baseUrl}` });
        return;
      }
      const merged = mergeVoiceTranslations(list, await loadBuiltinVoices());
      set({ voices: merged, source: 'remote' });
      await deps().settings.setJson('voices_cache', merged);
    } finally {
      set({ loading: false });
    }
  },
}));

export { voiceDisplayName, parseVoices };
```

- [ ] **步骤 4：运行测试验证通过**

```powershell
npm test -- src/store/voicesStore.test.ts
npx tsc --noEmit
```

预期：3 个用例全绿，tsc 无输出。

- [ ] **步骤 5：Commit**

```powershell
git add src/store/voicesStore.ts src/store/voicesStore.test.ts
git commit -m "feat(voices): 无节点时回退内置音色库"
```

---

### 任务 5：音色页简介与来源提示

**文件：**
- 修改：`src/pages/VoicesPage.tsx:43-47, 108-141, 146-147, 279`

- [ ] **步骤 1：展开区显示简介**

`VoiceRow` 中 `const hasStyles = styles.length > 0;` 之后加：

```ts
  const hasIntro = Boolean(v.introZh);
```

展开按钮的 `disabled` 与可见条件改为：

```tsx
          disabled={!hasStyles && !hasIntro}
          onClick={() => setOpen((x) => !x)}
          className={cn(
            'grid h-6 w-6 place-items-center rounded-md text-faint hover:bg-surface-3 hover:text-foreground',
            !hasStyles && !hasIntro && 'invisible',
          )}
```

展开区改为（保留原风格按钮与「设为默认」逻辑）：

```tsx
      {open && (hasStyles || hasIntro) && (
        <div className="mt-2.5 border-t border-line pl-0 pt-2.5 md:pl-12">
          {hasIntro && (
            <p className="mb-2 text-[11.5px] leading-relaxed text-muted-foreground">{v.introZh}</p>
          )}
          {hasStyles && (
            <div className="flex flex-wrap items-center gap-1.5">
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
      )}
```

- [ ] **步骤 2：来源提示**

`const { voices, loading, error, load } = useVoicesStore();` 改为：

```ts
  const { voices, loading, error, load, source } = useVoicesStore();
```

筛选栏计数处改为：

```tsx
          <span className="text-[11px] text-faint num">
            {shown.length} 个{source === 'builtin' ? ' · 内置库' : ''}
          </span>
```

空状态文案改为：

```tsx
          {voices.length ? '没有匹配的音色，试试换个关键词或语言' : '还没有音色，请先添加节点并探测'}
```

（保持不变；内置库存在时不会走到这一分支。）

- [ ] **步骤 3：类型检查与测试**

```powershell
npx tsc --noEmit
npm test
```

预期：tsc 无输出，全部测试通过。

- [ ] **步骤 4：构建验证（确认 JSON 独立 chunk）**

```powershell
npm run build
```

预期：构建成功，`dist/assets/` 中出现包含 `voices` 的独立 `.js` chunk（体积约 300 KB 以上），主 chunk 体积不显著增长。

- [ ] **步骤 5：Commit**

```powershell
git add src/pages/VoicesPage.tsx
git commit -m "feat(voices): 展开显示音色简介与内置库标识"
```

---

### 任务 6：真机验收

**文件：** 无（仅运行与目视）

- [ ] **步骤 1：启动开发态**

```powershell
npm run tauri dev
```

- [ ] **步骤 2：无节点场景**

在「节点」页停用全部节点（或使用无节点配置），进入「音色」页：
预期：列表显示内置音色、筛选栏出现「· 内置库」、顶部提示「当前显示内置音色库，添加节点后可获取节点实际列表」。

- [ ] **步骤 3：有节点场景**

重新启用节点后点「重新拉取」：
预期：列表为节点实际音色，中文名与安卓端一致；展开任意带简介的音色可见中文简介；搜索「晓晓」「普通话」可命中。

- [ ] **步骤 4：全量回归**

```powershell
npm test
cd src-tauri; cargo test
```

预期：前端 132+ 测试全绿，Rust `test result: ok`。

---

## 自检记录

- 规格覆盖：数据同步（任务 1）、类型与解析（1）、内置加载与合并（2）、搜索（3）、store 兜底与来源（4）、简介展示（5）、构建与真机（5、6）——无遗漏。
- 占位符：无 TODO / 待定；每个代码步骤均给出可粘贴代码。
- 类型一致性：`VoicesSource` 在任务 4 定义并在任务 5 使用；`loadBuiltinVoices` / `mergeVoiceTranslations` 签名在任务 2 定义，任务 4 直接调用；`nameZh` / `introZh` 均为可选字段，任务 1 定义、2/3/5 消费。
