# 桌面端内置音色库统一（采用安卓 voices.json）设计

日期：2026-11-12
状态：已确认，待实现

## 背景

桌面端没有内置音色数据：音色列表完全依赖节点 `/voices` 拉取，中文名靠 `src/lib/voices.ts` 中手写的
`VOICE_NAME_ZH` / `VOICE_SERIES_ZH` 映射表推导，也没有音色简介。

安卓端有一份 `app/src/main/assets/voices.json`（约 352 KB，300+ 条），字段为
`short_name / display_name / local_name / gender / locale / style_list / name_zh / intro_zh`，
覆盖中文名与中文简介。

目标是两端使用同一份内置音色数据：桌面端无节点或离线时仍可浏览音色，有节点时用内置数据补全中文名与简介。

## 目标

- 桌面端内置音色数据与安卓 `voices.json` 完全一致，后续可整份覆盖同步。
- 无节点 / 离线时音色页展示内置音色库，而不是空白加错误提示。
- 有节点时展示节点实际支持的音色，并用内置数据补全 `nameZh` / `introZh`。
- 列表主行保持现有信息密度，简介不改变行高。

## 非目标

- 不改变节点 `/voices` 请求协议与调度逻辑。
- 不把内置音色写入节点上下文，不参与「设为默认」时的可用性校验。
- 不删除现有手写映射表，仅作为兜底。

## 方案

选用：**`src/assets/voices.json` + 动态 import 懒加载**。

- JSON 进入 Vite 资源图，`await import()` 使其中单独成 chunk，首屏不付出体积成本。
- 相比 `public/ + fetch`，无需处理 base 路径与 Tauri 下的加载失败重试，类型也更强。
- 相比静态 import 进主包，避免把已 633 KB 的主 chunk 再放大。

## 设计

### 数据文件

- 从安卓仓库复制 `app/src/main/assets/voices.json` 到桌面 `src/assets/voices.json`，字段原样保留。
- 复制使用文件拷贝，不经文本编辑工具，避免中文编码损坏。
- 来源路径记录在 `builtinVoices.ts` 顶部注释中（JSON 内不加注释），便于后续同步。

### 类型与解析

`src/types/models.ts`：

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

- 新字段可选，兼容已有 `voices_cache` 与数据库记录。
- `parseVoices` 同时读取 `name_zh` / `intro_zh`（节点若返回同名驼峰字段也可用）。

### 内置库与合并

新增 `src/lib/builtinVoices.ts`：

- `loadBuiltinVoices(): Promise<Voice[]>`：模块级缓存，首次调用动态 import JSON 并映射为 `Voice`。
- `mergeVoiceTranslations(remote, builtin): Voice[]`：与安卓实现一致
  - 先按 `short_name`（id）精确匹配；
  - 再按基础人名（`display_name` 去掉系列后缀）匹配；
  - 只补空缺的 `nameZh` / `introZh`，远端已有翻译优先保留。

### Store 行为

`src/store/voicesStore.ts`：

- `initCache()`：读取 `voices_cache`；若为空，则载入内置库填充 `voices`，并标记来源 `builtin`。
- `load()`：拉取节点音色成功后，`mergeVoiceTranslations(remote, builtin)` 后再 `set` 与写缓存。
- 无可用节点时不再清空列表：保留内置库，`error` 置为「当前为内置音色库，添加节点后可获取节点实际列表」，
  `source` 标记为 `builtin`。
- 新增 `source: 'builtin' | 'cache' | 'remote'`，供页面显示提示，不影响其它逻辑。

### 展示

- `voiceDisplayName`：优先 `nameZh`；缺失时回退现状（`localName` + 映射表）。映射表保留。
- `filterVoices`：匹配字段增加 `nameZh`、`introZh`。
- 音色行展开区（现为「风格」）顶部增加一行 `introZh`；只有简介没有风格的音色也可展开，
  展开按钮的可见条件改为 `hasStyles || hasIntro`。列表主行结构、行高与列宽不变。

### 错误处理

- JSON 加载失败：记录一次 `console.error`，返回空数组，`store` 回退到原有「没有可用节点」提示，
  不阻塞页面渲染。
- 合并函数对缺失字段保持原值，不做非空断言。

## 测试

- `parseVoices`：解析 `name_zh` / `intro_zh`；缺失时字段为 `undefined`。
- `mergeVoiceTranslations`：id 命中、基础人名命中、已有翻译不被覆盖、无匹配时原样返回。
- `voiceDisplayName`：有 `nameZh` 时优先返回。
- `filterVoices`：中文名与简介可被搜索命中。
- `voicesStore`：缓存为空时载入内置库；无节点时保留内置库并给出提示；拉取成功后合并翻译并写缓存。
- 手工验证：`npm test`、`npx tsc --noEmit`、`npm run build`（确认 JSON 独立 chunk）；
  真机确认无节点时列表可用、有节点时中文名与简介正确显示。
