# TTS Aggregator Desktop

TTS 聚合器桌面配套端（Tauri 2 + React + TypeScript + Vite）。对齐安卓版 `tts-aggregator-android`：多 TTS 节点管理、探测健康度、AUTO/GROUP/MANUAL 调度、长文本切分朗读、FOFA/ZoomEye 导入、局域网只读分享。

## 环境要求

- Node.js 18+（推荐 20+）
- Rust 工具链（rustup + MSVC 构建工具，Windows）
- npm

## 快速开始

```powershell
npm install
npm run tauri dev     # 开发模式（含 Rust 编译，首次较慢）
npm run tauri build   # 产出安装包
```

## 功能列表

- **朗读**：文本框输入或导入本地 TXT（UTF-8，失败回退 gb18030）；长文本按段落/句号切分，逐段合成排队播放，支持暂停/继续/下一段/停止，预合成下一段流水线
- **节点**：增删改、单个/全部探测（并发可配 1-8）、健康度/冷却/连败熔断、API Key、免 Key 节点识别、两代 API 版本自动探测
- **调度**：AUTO（按健康度依次尝试）、GROUP（组内轮询）、MANUAL（手选节点，连败 3 次熔断），失败自动切换并记日志
- **音色**：拉取 `/voices`，中文显示名映射、性别/语言过滤、搜索、试听、设为默认
- **日志**：调用记录（成功/失败/切换/触发冷却）、按结果过滤、一键清空
- **导入**：FOFA（CSV/JSON 文件 + API 在线搜索）、ZoomEye（JSON 文件 + API 在线搜索），TTS 关键词相关性排序、逐条勾选入库、来源溯源
- **局域网分享**：内嵌只读 HTTP 服务 `GET /nodes.json`，token 校验（query 或 X-Token 头）、可选仅本机监听，供同网段设备拉取节点配置

## 与安卓版差异

| 差异 | 说明 |
|------|------|
| 文本导入 | 仅支持本地 TXT 文件（webview 文件选择），无 EPUB |
| 分享方式 | 局域网 URL + token，无二维码 |
| 系统 TTS | 不支持（桌面程序无法注册为系统朗读引擎），朗读仅在应用内 |
| 播放实现 | HTML5 Audio + blob URL（节点返回 MP3 直接可播），无 PCM 解码 |

## 测试

```powershell
npm test              # 等价 npx vitest run，全部纯函数单测
npx tsc --noEmit      # 类型检查
cargo check --manifest-path src-tauri\Cargo.toml   # Rust 检查
```

## 目录结构

```
src/
  lib/          # 协议与纯逻辑（从 Kotlin 移植）
    api.ts          TTS 节点客户端（三级端点回退）
    pool.ts         调度器（AUTO/GROUP/MANUAL + 冷却 + 连败熔断）
    split.ts        长文本切分器
    encoding.ts     TXT 编码嗅探（UTF-8 → gb18030）
    voices.ts       音色显示名映射
    db.ts           SQLite 仓库层（nodes/logs/settings）
    importers/      FOFA/ZoomEye 文件解析 + API 搜索
  store/        # zustand 状态（nodes/voices/logs/player/settings）
  pages/        # 五个页面 + 导入面板
  types/        # 数据模型（与安卓同构，snake_case 枚举序号）
src-tauri/
  src/lib.rs   # SQLite/HTTP 插件 + 局域网分享 HTTP 服务
docs/superpowers/   # 设计规格与实现计划
```
