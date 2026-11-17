# 音色选择器、关于页与跨平台构建文档设计

日期：2026-11-17

## 背景

v1.0.1 之后仍有三处缺失：

1. 朗读页与设置页的音色下拉直接平铺近千条音色，同名版本重复、中文名不完整、缺少分组与筛选。
2. 应用没有「关于」入口。
3. README 只覆盖 Windows 自编译，缺少 Linux / macOS 与 macOS 证书流程。

## 音色选择器

### 参考实现

安卓端 `VoicePickerSheet.kt`、`VoiceQuery.kt`、`Formatters.kt`：

- 不合并同名版本，用 `variantTag` 生成「晓晓（高清闪速）」这类标签消歧。
- 筛选维度为常用 / 全部 / 中文 / 英语 / 其余语言。
- 有最近记录时默认「常用」，否则默认「中文」。
- 搜索覆盖全部音色，中文结果置顶；列表按语言分组，中文组置顶。

### 桌面端方案

新增纯函数模块 `src/lib/voiceQuery.ts`，与 UI 解耦、可单测：

- `localeLang` / `localeRegion`：兼容 `zh-CN`、`iu-Cans-CA`、`zh-CN-guangxi`。
- `variantTag(id)`：识别多语种、方言、高清闪速、闪速、高清、2.1 等版本后缀。
- `voiceLabel(voices, voice)`：只在同一语言内比较重名；重名时追加版本标签，标记仍冲突时追加「版本标签 · 语言 · 地区」，最后回落 ID。跨语言同名不添加语言后缀，由行内元信息与分组区分。
- `VoiceFilter`：`frequent | all | chinese | language(code)`。
- `defaultFilter(recentIds)`、`filterVoices`、`languageOptions`、`searchVoices`、`groupVoicesByLanguage`、`recentVoiceIds`、`withRecent`。

新增 `src/components/voice/VoicePicker.tsx`：右侧抽屉（宽 440px，窄屏占满），包含搜索框、筛选 chips、按语言分组的列表、当前选中标记。朗读页与设置页用它替换原有 `Select`；只负责选择，不内嵌试听。

音色页的行标题同样改用 `voiceLabel`，保证两处命名一致。

### 翻译合并修复

`mergeVoiceTranslations` 的匹配顺序改为：

1. ID 精确匹配。
2. 去掉 `:变体后缀` 后再按 ID 匹配。
3. 规范化基础名匹配：NFD 去变音符、转小写、移除非字母数字。

由此修复 `vi-VN-HoaiMy` 因 `Hoài My` 带变音符与空格而匹配不到内置翻译的问题。

## 关于页

作为「设置」内的一个分区，键为 `about`，不新增路由。内容：

- 应用图标、名称、版本号（Tauri `getVersion()`，失败回落 `package.json`）。
- 一句话介绍与功能摘要。
- 仓库、Release、问题反馈链接，使用 `opener` 插件在系统浏览器打开。
- 技术栈与数据存放位置。
- 未签名构建提示。

## README 跨平台构建

「快速开始」拆分为：

- Windows：保留现有 MSVC / WebView2 流程。
- macOS：Xcode Command Line Tools、Rust target、`.app` / `.dmg` 产物；证书章节覆盖 Apple Developer Program、CSR、Developer ID Application、钥匙串安装、签名环境变量、`notarytool` 公证、`stapler` 装订，以及个人自用的右键打开 / 移除隔离标记。
- Linux：webkit2gtk 4.1、构建依赖、AppImage / deb / rpm 产物。

注明 CI 当前只产出 Windows 安装包，其余平台需本地构建。

## 测试

- `voiceQuery.test.ts`：版本后缀、重名消歧层级、默认筛选、语言分组顺序、最近记录去重与截断；并验证内置 958 条音色在同一语言内的标签互不重复。
- `builtinVoices.test.ts`：补充变音符与空格的基础名匹配用例。
- 验证命令：`npm test`、`npx tsc --noEmit`。
