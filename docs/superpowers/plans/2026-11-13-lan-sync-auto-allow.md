# 桌面端局域网同步「自动允许」实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 给桌面端局域网同步增加可持久化的「自动允许」开关，开启后收到的同步请求不再弹窗确认，直接合并。

**架构：** 状态与持久化放在 `lanSyncStore`；事件监听处按开关短路确认流程；设置页新增一行开关。顺带把前端 60 秒清理定时器改为 62 秒，让 Rust 侧 60 秒 `408` 先返回。

**技术栈：** React 18 + Zustand + Vitest + Tauri（Rust 侧不改）。

---

## 文件结构

- 修改 `src/store/lanSyncStore.ts`：新增 `autoAllow` 状态、`setAutoAllow`、自动确认分支、超时对齐。
- 修改 `src/components/settings/LanSyncSection.tsx`：新增开关行。
- 创建 `src/store/lanSyncStore.test.ts`：开关与自动确认的单元测试。

---

### 任务 1：开关状态与持久化

**文件：**
- 修改：`src/store/lanSyncStore.ts`
- 测试：`src/store/lanSyncStore.test.ts`（新建）

- [ ] **步骤 1：编写失败的测试**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn(async (cmd: string) => (cmd === 'lan_sync_status' ? null : undefined));
const saved: { key: string; value: unknown }[] = [];
let storedAutoAllow = false;
let handler: ((e: { payload: PendingRequest }) => void) | null = null;

vi.mock('@tauri-apps/api/core', () => ({ invoke: (cmd: string, args?: unknown) => invoke(cmd, args) }));
vi.mock('@tauri-apps/api/event', () => ({
  listen: async (_name: string, cb: (e: { payload: PendingRequest }) => void) => {
    handler = cb;
    return () => {};
  },
}));
vi.mock('@tauri-apps/plugin-http', () => ({ fetch: vi.fn() }));
vi.mock('./deps', () => ({
  deps: () => ({
    settings: {
      getJson: async (_key: string, fallback: unknown) => storedAutoAllow ?? fallback,
      setJson: async (key: string, value: unknown) => { saved.push({ key, value }); },
    },
  }),
}));
vi.mock('./nodesStore', () => ({
  useNodesStore: {
    getState: () => ({
      nodes: [],
      mergeSynced: async () => ({ added: 0, updated: 0, skipped: 0, total: 0 }),
    }),
  },
}));

import { useLanSyncStore, type PendingRequest } from './lanSyncStore';

describe('自动允许', () => {
  beforeEach(() => {
    storedAutoAllow = false;
    saved.length = 0;
    invoke.mockClear();
    useLanSyncStore.setState({ autoAllow: false, pending: null, phase: 'idle', message: null, result: null });
  });

  it('默认关闭，切换后写盘', async () => {
    await useLanSyncStore.getState().refresh();
    expect(useLanSyncStore.getState().autoAllow).toBe(false);
    await useLanSyncStore.getState().setAutoAllow(true);
    expect(useLanSyncStore.getState().autoAllow).toBe(true);
    expect(saved).toEqual([{ key: 'lan_sync_auto_allow', value: true }]);
  });
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npm test -- src/store/lanSyncStore.test.ts`
预期：FAIL，`setAutoAllow is not a function` / `autoAllow` 为 `undefined`。

- [ ] **步骤 3：实现状态与持久化**

在 `src/store/lanSyncStore.ts`：

```ts
import { deps } from './deps';

interface LanSyncState {
  // …原有字段
  autoAllow: boolean;
  setAutoAllow(v: boolean): Promise<void>;
}

export const useLanSyncStore = create<LanSyncState>((set, get) => ({
  // …原有字段
  autoAllow: false,

  async refresh() {
    try {
      const status = await invoke<SyncStatus | null>('lan_sync_status');
      const autoAllow = await deps().settings.getJson<boolean>('lan_sync_auto_allow', false);
      set({ status, autoAllow });
      // …原有其余逻辑保持不变
    } catch (e) {
      set({ message: errorText(e) });
    }
  },

  async setAutoAllow(v) {
    set({ autoAllow: v });
    await deps().settings.setJson('lan_sync_auto_allow', v);
  },
```

- [ ] **步骤 4：运行测试验证通过**

运行：`npm test -- src/store/lanSyncStore.test.ts`
预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add src/store/lanSyncStore.ts src/store/lanSyncStore.test.ts
git commit -m "feat(lan-sync): 自动允许开关状态与持久化"
```

---

### 任务 2：自动确认与超时对齐

**文件：**
- 修改：`src/store/lanSyncStore.ts`
- 测试：`src/store/lanSyncStore.test.ts`

- [ ] **步骤 1：编写失败的测试**

在 `describe('自动允许')` 内追加：

```ts
  it('开启后收到请求直接合并，不产生待确认状态', async () => {
    useLanSyncStore.setState({ autoAllow: true });
    await useLanSyncStore.getState().bind();
    handler?.({ payload: { requestId: 'r1', from: { name: 'Samsung', platform: 'android' }, nodes: [] } });
    await new Promise((r) => setTimeout(r, 0));
    expect(useLanSyncStore.getState().pending).toBeNull();
    expect(invoke).toHaveBeenCalledWith('lan_sync_resolve', expect.objectContaining({
      requestId: 'r1', accept: true,
    }));
    expect(useLanSyncStore.getState().message).toContain('已自动允许');
  });

  it('关闭后仍然进入待确认状态', async () => {
    useLanSyncStore.setState({ autoAllow: false });
    await useLanSyncStore.getState().bind();
    handler?.({ payload: { requestId: 'r2', from: { name: 'Samsung', platform: 'android' }, nodes: [] } });
    await new Promise((r) => setTimeout(r, 0));
    expect(useLanSyncStore.getState().pending?.requestId).toBe('r2');
    expect(invoke).not.toHaveBeenCalledWith('lan_sync_resolve', expect.anything());
  });
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npm test -- src/store/lanSyncStore.test.ts`
预期：FAIL，第一条 `pending` 仍为 `r1` 或 `invoke` 未调用。

- [ ] **步骤 3：实现自动确认**

```ts
  async applyRequest(pending: PendingRequest, auto: boolean): Promise<void> {
    try {
      const merged = mergeNodes(useNodesStore.getState().nodes, pending.nodes);
      await invoke('lan_sync_resolve', {
        requestId: pending.requestId,
        accept: true,
        nodes: toSyncedNodes(merged.nodes),
        applied: merged.result.total,
      });
      const result = await useNodesStore.getState().mergeSynced(pending.nodes);
      set({
        pending: null,
        phase: 'done',
        result,
        message: auto ? `已自动允许 ${pending.from.name} 的同步` : null,
      });
    } catch (e) {
      set({ pending: null, phase: 'error', message: errorText(e) });
    }
  },

  async accept() {
    const pending = get().pending;
    if (!pending) return;
    await get().applyRequest(pending, false);
  },

  bind() {
    return listen<PendingRequest>('lan-sync://request', (event) => {
      if (get().autoAllow) {
        void get().applyRequest(event.payload, true);
        return;
      }
      set({ pending: event.payload, phase: 'requesting' });
      setTimeout(() => {
        if (get().pending?.requestId === event.payload.requestId) {
          void get().reject();
          set({ message: '请求已超时' });
        }
      }, 62_000);
    });
  },
```

同时在 interface 中声明 `applyRequest(pending: PendingRequest, auto: boolean): Promise<void>;`，并删除原 `accept()` 的内联实现。

- [ ] **步骤 4：运行测试验证通过**

运行：`npm test -- src/store/lanSyncStore.test.ts`
预期：PASS（两个用例）。

- [ ] **步骤 5：Commit**

```bash
git add src/store/lanSyncStore.ts src/store/lanSyncStore.test.ts
git commit -m "feat(lan-sync): 自动允许时直接确认请求并对齐 60 秒超时"
```

---

### 任务 3：设置页开关

**文件：**
- 修改：`src/components/settings/LanSyncSection.tsx`

- [ ] **步骤 1：读数与写入**

```tsx
  const autoAllow = useLanSyncStore((s) => s.autoAllow);
  const setAutoAllow = useLanSyncStore((s) => s.setAutoAllow);
```

- [ ] **步骤 2：在「同步服务」卡片末尾加一行**

```tsx
        <SetRow
          title="自动允许同步请求"
          desc="开启后不再弹窗确认，仅建议在可信任的网络中使用。"
          control={<Switch label="自动允许同步请求" checked={autoAllow} onCheckedChange={(v) => void setAutoAllow(v)} />}
        />
```

位置：紧跟在 `服务状态` 那一行之后（`running` 条件块之前）。

- [ ] **步骤 3：验证**

运行：`npx tsc --noEmit && npm test`
预期：无类型错误，143+ 个用例全部通过。

- [ ] **步骤 4：真机验证**

1. `npm run tauri dev`，进入 设置 → 局域网同步，确认开关默认关闭。
2. 开启开关，重启应用，确认仍为开启。
3. 手机发起同步：桌面不弹窗，状态区出现「已自动允许 Samsung SM-S9210 的同步」。
4. 关闭开关，手机再发起：弹窗恢复。
5. 不确认并等待 62 秒：手机收到 `408` 并显示「对方 60 秒内未确认」。

- [ ] **步骤 5：Commit**

```bash
git add src/components/settings/LanSyncSection.tsx
git commit -m "feat(lan-sync): 设置页自动允许开关"
```

---

## 验收

- 开关默认关闭、可持久化、两端行为对称（配合安卓计划）。
- 自动允许路径不产生 `pending`，手动路径行为不变。
- `npm test`、`npx tsc --noEmit`、`cargo test`、`npm run build` 全绿。
