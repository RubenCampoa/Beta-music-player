# 🎵 Beta Music Player

<p align="center">
  <img src="./public/icon.png" width="128" height="128" alt="Beta Music Player Logo" />
</p>

<p align="center">
  <b>基于 React 18 + Electron + TypeScript 构建的高颜值、全景沉浸式 Windows 桌面音乐播放器（由高中生和AI辅助开发）</b>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Release-v1.0.8-brightgreen.svg" alt="Version" />
  <img src="https://img.shields.io/badge/Platform-Windows_x64-blue.svg" alt="Platform" />
  <img src="https://img.shields.io/badge/Electron-31.x-4B8BF5.svg" alt="Electron" />
  <img src="https://img.shields.io/badge/React-18.x-61DAFB.svg" alt="React" />
  <img src="https://img.shields.io/badge/License-MIT-green.svg" alt="License" />
</p>

---

> 💡 **设计灵感**：参考主流音乐 App 的现代感界面设计与流体动态光斑背景，结合高精度的双行全景歌词视听体验。

---

## ✨ 核心功能特性

### 🎨 极致视觉与全景歌词体验
- **动态流体背景**：基于 HTML5 Canvas 提取专辑封面主色调，呈现高品质的响应式流体光斑渐变与毛玻璃（Glassmorphism）高斯模糊面板。
- **逐字歌词（YRC / QRC / KRC）**：支持网易云、QQ 音乐与酷狗概念版逐字歌词，全屏歌词自动逐字点亮，海浪式非线性果冻动效，直连媒体时钟精准同步、慢歌不抖动。
- **全景歌词与前奏倒计时**：三平台歌词同步显示，平滑行间平移、发光渐变、阶梯式景深模糊；前奏阶段三个圆点依次点亮倒计时（主流音乐 App 风格）。
- **歌词切换时间微调**：全屏歌词音量条下方可对每首歌独立调整歌词行切换偏移（-2000ms ~ +2000ms），换歌自动恢复默认。
- **桌面歌词**：独立置顶透明小窗，双行歌词 + 翻译，支持锁定穿透、拖动、配色与字号调节；性能优化后仅在歌词切换时重绘。
- **灵活的动效开关**：提供完整的性能调节选项，在设置中可自由切换流体背景、歌词平移、发光与景深模糊；「注意事项」页提供一键性能预设，完美兼容各种硬件配置。

### 🎵 强大的本地音乐管理
- **ID3 标签与专辑封面解析**：拖拽或导入本地 `MP3` / `FLAC` / `WAV` / `AAC` 音频文件时，自动提取文件内置的真实歌名、歌手、专辑及封面图片（支持转换为 DataURL），告别“未知歌手”与占位图。
- **IndexedDB 持久化资料库**：基于 Dexie.js 实现本地资料库高效缓存与全量管理。

### 🎵 深入的三平台音乐生态（网易云 + QQ 音乐 + 酷狗概念版）
- **网易云扫码登录**：支持通过网易云音乐 App 扫码快捷安全登录；登录后自动同步云端"我喜欢的音乐"全量列表，播放器内红心收藏实时双向同步。
- **QQ 音乐扫码登录**：独立 Web 窗口登录，登录后支持 VIP 音源播放与歌词翻译（外文歌双语显示）。
- **酷狗概念版双登录方式**：支持酷狗概念版二维码登录与微信扫码登录；微信登录完成后通过 KuGouMusicApi 换取并验证 API 凭据。
- **全网全局音乐搜索**：三平台关键词极速搜索单曲，展示专属搜索视图、专辑封面与 VIP 标识。
- **权威音乐排行榜与分类探索**：网易云与 QQ 音乐权威榜单，并接入酷狗热门歌单与 TOP 曲库。

### 💻 纯正的 Windows 桌面级体验
- **零配置开箱即用**：打包后的 `.exe` 程序内置后台静默 Api 引擎，他人无需配置 Node.js 开发环境，解压双击即可独立运行。
- **系统托盘与常驻播放**：支持最小化至 Windows 任务栏右下角系统托盘，后台续播无间断；提供快捷托盘右键菜单（显示、播放/暂停、上一首、下一首、退出）。
- **全局硬件媒体按键**：支持键盘物理媒体按键（播放/暂停、切歌）全局响应。
- **搜索栏历史记录**：自动保存历史搜索词，提供下拉历史快捷标签、单条删除与一键清空。
- **智能 GPU 性能调度**：窗口最小化或后台运行时自动挂起 Canvas 动画渲染循环，降低 GPU/CPU 占用。

---

## 🛠️ 技术栈

### 🖥️ 桌面端与核心基础架构 (Desktop & Core Framework)
- **[React](https://github.com/facebook/react) 18.3.1** 与 **[react-dom](https://www.npmjs.com/package/react-dom)** — 声明式 UI 核心框架，负责现代化单页 Web 界面渲染。
- **[TypeScript](https://github.com/microsoft/TypeScript) 5.5.4** — 强类型语言，保障前端及三平台 API 的类型安全与编译校验。
- **[Electron](https://github.com/electron/electron) 31.3.1** — 跨平台桌面端原生容器，支持系统托盘常驻、无边框毛玻璃窗口与全局硬件按键播控。
- **[Vite](https://github.com/vitejs/vite) 5.4.1** — 极速构建与热重载工具，配合 [vite-plugin-electron](https://github.com/electron-vite/vite-plugin-electron) (0.28) 与 [vite-plugin-electron-renderer](https://www.npmjs.com/package/vite-plugin-electron-renderer) 实现主/渲染进程无缝开发与编译。
- **[electron-builder](https://github.com/electron-userland/electron-builder) 24.13.3** — 桌面应用打包分发工具，支持生成 Portable 免安装绿色版与 NSIS 标准 Windows 安装包。

### 🎶 三平台音乐 API 引擎与后端中间件 (Music APIs & Backend)
- [@neteasecloudmusicapienhanced/api](https://github.com/Binaryify/NeteaseCloudMusicApi) — 增强版网易云音乐接口引擎，提供搜索、权威榜单、VIP 音源解析及二维码扫码登录。
- [@sansenjian/qq-music-api](https://www.npmjs.com/package/@sansenjian/qq-music-api) (v2.4.0) — QQ 音乐核心服务引擎，提供 QQ 音乐榜单、搜索、凭证绑定及音频流地址解析。
- [KuGouMusicApi](https://github.com/MakcRe/KuGouMusicApi) (v1.6.0) — 酷狗概念版搜索、歌单、扫码登录、音频流与 KRC 逐字歌词服务，依赖固定到可复现提交。
- [Express](https://expressjs.com/) (v4.19.2) 与 [CORS](https://github.com/expressjs/cors) (v2.8.5) — 内置轻量 Node.js 服务，无感知拉起三平台 API 本地代理（监听 3000 / 3200 / 3400 端口）。

### 🎨 UI 美学系统与流畅动效 (UI, Design & Animations)
- [Lucide React](https://lucide.dev/) (v0.428.0) — Apple 风格矢量 Icon 图标库，提供播控、红心收藏、歌单及系统设置图标。
- [Framer Motion](https://github.com/framer/motion) (v11.3.24) — 高性能声明式动画库，驱动全屏歌词果冻缓动、窗口平滑展开与流体高斯模糊背景。
- [TailwindCSS](https://tailwindcss.com/) (v3.4.10) 与 PostCSS / Autoprefixer — 原子化 CSS 框架，打造现代高斯毛玻璃（Glassmorphism）与流体光斑视觉效果。

### 🗄️ 状态管理与本地持久化 (State Management & Storage)
- [Zustand](https://github.com/pmndrs/zustand) (v4.5.4) — 轻量级状态管理库（配合 `shallow` 浅比较器），全量同步全平台播放状态、音源、歌词及 `qqLikeMids` / `neteaseLikeIds` 实时收藏状态。
- [Dexie.js](https://github.com/dexie/Dexie.js) (v4.0.8) — 基于 IndexedDB 的本地数据库封装库，管理本地音频导入、离线资料库与历史播放记录。
- [jsmediatags](https://github.com/aadsm/jsmediatags) (v3.9.7) — 本地音频 MP3 / FLAC 文件 ID3 标签与嵌入专辑封面（Cover Artwork）的前端二进制解析库。

### 🛠️ 开发与构建并发工具 (Tooling & Concurrently)
- [Concurrently](https://github.com/open-cli-tools/concurrently) (v8.2.2) — 命令行并发运行工具，通过单条 `npm run dev` 同时拉起 API 服务代理与 Vite 前端热更新。
- [@vitejs/plugin-react](https://www.npmjs.com/package/@vitejs/plugin-react) (v4.3.1) — React 快速刷新（Fast Refresh）官方插件。

---

## 🚀 本地开发与打包构建

### 准备条件
确保安装了 [Node.js](https://nodejs.org/) (建议 v18+) 与 npm。

```bash
# 1. 克隆项目仓库
git clone https://github.com/YourUsername/musicplayer.git
cd musicplayer

# 2. 安装项目依赖
npm install

# 3. 启动开发模式 (同时启动前端与后台 Api)
npm run dev

# 4. 构建 Windows 可执行程序 (.exe)
npm run build
```

打包成功后，可在 `release/` 目录下找到生成的可执行程序：
- `Beta Music Player Setup 1.0.1.exe`（安装包）
- `Beta Music Player 1.0.1.exe`（免安装便携版）

---

## ⚠️ 注意事项

> **酷狗音乐概念版测试模式**：目前酷狗音乐概念版属于测试模式，可能会存在一系列问题，例如无法正常获取歌词翻译、音源需要验证（20028）等。若遇到问题，欢迎前往 [GitHub Issues](https://github.com/RubenCampoa/Beta-music-player/issues) 提交 Issue；若并非 API 问题，后续会着手修复。

## 📋 版本更新历史 (Changelog)

### v1.0.8 (2026-08-07)

**逐字歌词与全屏歌词动效**
- 新增网易云逐字歌词（YRC）支持：支持逐字歌词的歌曲全屏歌词自动逐字点亮，采用行级联动的海浪式非线性果冻动画，快歌不闪现。
- 逐字波浪性能优化：逐字组件 memo 化，慢歌长句每帧仅更新正在唱的一个字，消除逐字卡顿。
- 歌词时间轴改读实时媒体时钟（直连 `<audio>.currentTime` + 指数平滑），消除慢歌逐字抖动与墙钟外推漂移。
- 高亮歌词光晕增强：逐字与非逐字激活行白光/玫红光更亮一档，随点亮进度平滑淡入。
- 逐字与逐行亮度统一：未点亮字/非激活行同为 60% 白，点亮后同为纯白，两模式视觉亮度一致。
- 前奏三点倒计时（主流音乐 App 风格）改进：仅网易云模式显示；消失时机锚定真实开唱时间（不再受歌词行提前激活影响）。
- 新增「歌词切换时间微调」：位于全屏歌词音量条下方，按每首歌独立调整歌词行切换偏移（-2000ms ~ +2000ms，正值提前、负值延后），播放下一首自动恢复默认 0ms。

**QQ 音乐歌词兼容**
- QQ 歌词元数据过滤升级：识别并移除标题行（兼容全角连字符、无空格、括号副标题如「甲乙丙丁 (你我怎么两清) - 李佳薇」）与词/曲/编曲等人员行，以及 `[ti:]/[ar:]/[al:]` 前置 meta 行；歌词列表与三点倒计时不再被 time=0 的脏行干扰。

**窗口行为**
- 移除自定义最小化/恢复动画，恢复 Windows 系统默认窗口行为（无边框透明窗口下系统最小化动画不可拦截，原生处理最稳定）。

**检查更新**
- 修复版本比较逻辑：仅当 GitHub 最新标签严格高于本地版本才提示更新，不再将旧标签误报为新版本。
- 版本号统一从 `package.json` 读取（`APP_VERSION`），移除三处硬编码。
- 区分 GitHub API 限流（403/429）、发布缺失（404）与网络失败，不再把请求失败误报为"已是最新版本"。
- 启动自动检查增加 6 小时节流，降低未认证 API 配额（60 次/小时）消耗。

**注意事项与设置**
- 「性能与卡顿优化建议」更新为：仅开启「全景流体模糊背景」并关闭设置中全部歌词动效；新增「一键设置」按钮，一键应用该推荐配置。

**依赖治理**
- `@neteasecloudmusicapienhanced/api` 从 `"latest"` 固定为 `4.38.0`，保证构建可复现并防止依赖升级破坏 postinstall 补丁（网易云 YRC / QQ 翻译 / QQ cookie）。

**安全加固**
- 恢复 `webSecurity` 与全部窗口沙箱，注入内容安全策略（CSP，dev/prod 分级）。
- `app-audio` 本地音频协议加入扩展名与路径白名单校验，URL 重构为 `app-audio://local/` 规避 Windows/中文路径解析问题。
- 本地 API 仅绑定 127.0.0.1，不再暴露到局域网；修复 QQ 服务端口占用导致的崩溃。
- 本地音乐文件读取改为主进程 IPC（`read-audio-file`）并复用白名单校验。
- QQ 封面 CDN 跨域响应头注入，修复流体背景封面取色失败。

**QQ 音乐识别与播放修复**
- VIP 判定改为以"播放受限"为准（`pay_play`）：安和桥等仅高品质付费歌曲不再误标 VIP；榜单歌曲接入权威付费信息校验。
- 严格匹配防同名翻唱/DJ 版错配，避免免费/VIP 状态与歌曲解析错误。
- 修复内容安全策略误拦截 http 音源导致的"音源播放失败"问题。

**播放器交互**
- 播放进度条支持拖拽滑动：拖动实时预览、松手定位，修复拖动不跟手与卡顿（禁用拖动中宽度过渡）。

### v1.0.7 (2026-08-06)

**QQ 音乐深度集成与多平台支持**
- 彻底修复 QQ 音乐模式下登录界面与提示错乱，支持 QQ 音乐与网易云音乐独立 Web 窗口登录与账号绑定。
- 修复 QQ 音乐封面错乱及破损，支持无效全零 `albummid` 自动降级、歌手写真回退与图片加载 `onError` 容错。
- 修复 QQ 音乐热门推荐歌单歌曲重复，接入巅峰热歌榜、飙升榜、新歌榜等权威榜单独立映射。

**播放性能与音频解耦优化**
- 重构切歌与播放机制，取消预设空音源打断，实现单次原子化状态更新，彻底解决所有歌曲需手动暂停再播放的缺陷。
- 解耦音源加载与歌词拉取，歌词后台静默非阻塞加载，加入 `<audio>` 播放器 `onStalled` / `onWaiting` 智能恢复机制。

**收藏状态与交互细节**
- 修复底栏爱心收藏按钮状态延迟、需刷新页面才变色的缺陷，实现秒级实时红心切换。

### v1.0.6 (2026-08-06)

**界面与动效优化**
- 修复浅色主题下播放器进度条与拖动圆点对比度不足、几乎不可见的问题。
- 重做全屏歌词液态背景，加入实时流动的液体光团与高光带，不再只是封面放大模糊。
- 升级歌词切换为非线性果冻缓动，并优化歌词滚动弹簧效果，减少切换顿挫。
- 增加主窗口、最大化/还原、最小化及全屏进出过渡动画，恢复全屏前的窗口尺寸。
- 优化窗口圆角、半透明毛玻璃和全屏歌词交互状态，提升整体视觉一致性。

**首页推荐与播放交互**
- 修复首页"播放全部"偶尔先播放预制歌曲的问题，首页推荐仅使用真实网易云推荐数据。
- 修复"查看全部 / 完整歌单"直接播放歌曲的问题，现在会正确进入每日推荐歌单页面。
- 首页推荐封面新增悬停抬升、回正和播放提示动画，点击封面即可播放对应歌曲。
- 登录弹窗打开时隐藏底部播放栏，避免登录页面残留播放控件或歌曲信息。

**搜索、品牌与打包**
- 修复搜索历史下拉层透明、被主页内容覆盖和无法点击的问题，支持回填、删除与清空操作。
- 统一应用名称、窗口标题、任务栏/托盘身份和安装包可执行文件名为 Beta Music Player。
- 统一运行时、安装包和快捷方式使用当前应用图标。

### v1.0.5 (2026-08-02)

**新功能与界面升级**
- 新增纯歌词全屏模式与经典双栏歌词模式切换。
- 重构桌面悬浮歌词界面，支持长歌词自动横向滚动显示，不再被省略号截断。
- 优化歌词切换动画、歌词滚动和视觉效果。

**网易云 VIP 播放修复**
- 补充网易云会员状态校验，正确识别 VIP 账号。
- 优化 VIP 音源解析，增加官方播放 URL、下载 URL 和多级回退链路。
- 音源解析与歌词加载解耦，音源获取成功后立即播放。
- 增加短期音源缓存，重复播放同一音质歌曲时减少等待。
- 修复音源解析失败时播放器停留在 0:00 且无提示的问题。
- 登录 Cookie 仅发送到内置本地 API，避免泄露给公共镜像服务。

**播放器与稳定性优化**
- 调整 API 请求超时和容灾策略，减少 VIP 歌曲解析等待。
- 按歌曲 ID 与音质分别缓存音源 URL。
- 增加音频加载失败提示，便于重新登录或检查本地 API。
- 改进音频源切换逻辑，减少播放开始时的卡顿。

### v1.0.4 (2026-07-31)
- 修复本地 API 端口挂载与离线 fallback。
- 优化全屏歌词滚屏平滑度。

### v1.0.1 (2026-07-23)
- 🎵 支持本地 MP3/FLAC 音频 ID3 标签与嵌入封面提取
- 🖥️ 新增 Windows 系统托盘与关闭至托盘后台播放功能
- 🎹 增加键盘硬件媒体按键 (Media Keys) 全局监听控制
- 🔍 顶部搜索框关联网易云全网搜索与高清封面自动获取
- 🏷️ 搜索框新增历史搜索记录下拉面板（支持持久化、删除与清空）
- ❤️ 增加网易云“我喜欢的音乐”云端双向红心同步与本地收藏管理
- 🧭 解耦“现在就听”与“浏览”视图，推出排行榜与曲风探索专区
- ⚡ 优化动画渲染，窗口最小化时挂起 Canvas 动画循环

### v1.0.0 (2026-07-23)
- 初始正式版本发布
- 实现动态流体光斑背景与双行全景歌词

---

## 📄 开源协议

本项目采用 [MIT License](LICENSE) 开源协议。
