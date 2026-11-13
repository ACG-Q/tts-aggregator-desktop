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

- **朗读**：文本框输入或导入本地 TXT（UTF-8，失败回退 gb18030）；长文本按段落/句号切分，逐段合成排队播放，支持暂停/继续/下一段/停止，预合成下一段流水线，支持音量/倍速即时调节与系统媒体键控制
- **节点**：增删改、单个/全部探测（并发可配 1-8）、健康度/冷却/连败熔断、API Key、免 Key 节点识别、两代 API 版本自动探测
- **调度**：AUTO（按健康度依次尝试）、GROUP（组内轮询）、MANUAL（手选节点，连败 3 次熔断），失败自动切换并记日志
- **音色**：拉取 `/voices`，中文显示名映射、性别/语言过滤、搜索、试听、设为默认
- **日志**：调用记录（成功/失败/切换/触发冷却）、按结果过滤、一键清空
- **导入**：FOFA（CSV/JSON 文件 + API 在线搜索）、ZoomEye（JSON 文件 + API 在线搜索），TTS 关键词相关性排序、逐条勾选入库、来源溯源
- **局域网分享**：内嵌只读 HTTP 服务 `GET /nodes.json`，token 校验（query 或 X-Token 头）、可选仅本机监听，供同网段设备拉取节点配置
- **局域网同步**：与安卓端双向合并节点（mDNS 自动发现、二维码/配对串配对），可开启「自动允许同步请求」免确认；只同步节点，不传 API Key 与偏好设置
- **书架（小说听书）**：导入本地 TXT，内置多级目录解析（第X卷/篇/部 + 第X章/回/节/集 + 「1、」「1.」编号行；中文/阿拉伯/罗马数字），按卷分组章节树点播、断点续听（书/章/段三级进度）、章末自动连播、全书播完提示、书级倍速覆盖
- **朗读增强**：句级高亮随播放推进并自动滚动，睡眠定时（0/15/30/60 分钟），±10 秒跳转，实时字数与预计时长，超长文本分段提示
- **续听**：纯文本与书籍均保留上次位置，启动后在朗读页/书架提供「继续上次」入口；关闭自动续听后入口隐藏
- **配置备份**：通过原生文件对话框导出/导入 JSON 配置（节点 + 音色 + 偏好），不含 API Key 与分享 Token；导入时按 URL 去重并保留已有密钥
- **调度参数**：失败阈值（2/3/5/10 次）与冷却时长（1/5/10/30/60 分钟）可在设置页调整，可选启动时自动测试全部节点

## 与安卓版差异

| 差异 | 说明 |
|------|------|
| 文本导入 | 仅支持本地 TXT 文件（webview 文件选择），无 EPUB |
| 扫码 | 桌面端展示二维码与配对串，自身不调用摄像头 |
| 系统 TTS | 不支持（桌面程序无法注册为系统朗读引擎），朗读仅在应用内 |
| 播放实现 | HTML5 Audio + blob URL（节点返回 MP3 直接可播），无 PCM 解码 |
| UI 技术栈 | Tailwind CSS v4 + shadcn/ui（明/暗双主题，跟随系统） |

## 测试

```powershell
npm test              # 等价 npx vitest run，全部纯函数单测
npx tsc --noEmit      # 类型检查
cargo check --manifest-path src-tauri\Cargo.toml   # Rust 检查
```

## 发布

版本号统一维护在 `package.json`、`src-tauri/Cargo.toml`、`src-tauri/tauri.conf.json`，由脚本同步改写：

```powershell
.\scripts\release.ps1 1.0.0         # 更新版本号、提交、打 tag 并推送
.\scripts\release.ps1 1.0.0 -NoPush # 只生成本地提交与 tag
```

推送 tag 后由 `.github/workflows/release.yml` 在 Windows runner 上构建 NSIS 与 MSI 安装包，按 `.github/cliff.toml` 生成分类变更记录并创建 GitHub Release。

## 目录结构

```
src/
  lib/          # 协议与纯逻辑（从 Kotlin 移植）
    api.ts          TTS 节点客户端（三级端点回退）
    pool.ts         调度器（AUTO/GROUP/MANUAL + 冷却 + 连败熔断）
    split.ts        长文本切分器
    encoding.ts     TXT 编码嗅探（UTF-8 → gb18030）
    voices.ts       音色显示名映射
    db.ts           SQLite 仓库层（nodes/logs/settings/books/chapters）
    toc.ts          书籍目录解析
    format.ts       时间/进度格式化
    sentences.ts    句级切分与播放比例定位
    estimate.ts     字数与预计时长估算
    snapshot.ts     续听快照校验
    configTransfer.ts  配置导入导出与节点合并
    audition.ts     试听互斥播放
    importers/      FOFA/ZoomEye 文件解析 + API 搜索
  store/        # zustand 状态（nodes/voices/logs/player/settings/bookPlay）
  pages/        # 六个页面 + 导入面板（书架/朗读/节点/音色/日志/设置）
  types/        # 数据模型（与安卓同构，snake_case 枚举序号）
src-tauri/
  src/lib.rs   # SQLite/HTTP/dialog/fs 插件 + 局域网分享 HTTP 服务
docs/design/        # 设计规格
.github/workflows/  # 发布流水线（NSIS/MSI + Release）
scripts/            # 发版脚本
```
