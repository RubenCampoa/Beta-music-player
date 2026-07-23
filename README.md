# 🎵 Beta Music Player

<p align="center">
  <img src="./public/icon.png" width="128" height="128" alt="Beta Music Player Logo" />
</p>

<p align="center">
  <b>基于 React 18 + Electron + TypeScript 构建的高颜值、全景沉浸式 Windows 桌面音乐播放器</b>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Release-v1.0.1-brightgreen.svg" alt="Version" />
  <img src="https://img.shields.io/badge/Platform-Windows_x64-blue.svg" alt="Platform" />
  <img src="https://img.shields.io/badge/Electron-31.x-4B8BF5.svg" alt="Electron" />
  <img src="https://img.shields.io/badge/React-18.x-61DAFB.svg" alt="React" />
  <img src="https://img.shields.io/badge/License-MIT-green.svg" alt="License" />
</p>

---

> 💡 **设计灵感**：参考 Apple Music 的现代感界面设计与流体动态光斑背景，结合高精度的双行全景歌词视听体验。

---

## ✨ 核心功能特性

### 🎨 极致视觉与全景歌词体验
- **Apple Music 动态流体背景**：基于 HTML5 Canvas 提取专辑封面主色调，呈现高品质的响应式流体光斑渐变与毛玻璃（Glassmorphism）高斯模糊面板。
- **全景双行歌词**：支持歌词原文与中文翻译同步显示、平滑行间平移、发光渐变以及阶梯式景深模糊效果。
- **灵活的动效开关**：提供完整的性能调节选项，在设置中可自由切换流体背景、歌词平移、发光与景深模糊，完美兼容各种硬件配置。

### 🎵 强大的本地音乐管理
- **ID3 标签与专辑封面解析**：拖拽或导入本地 `MP3` / `FLAC` / `WAV` / `AAC` 音频文件时，自动提取文件内置的真实歌名、歌手、专辑及封面图片（支持转换为 DataURL），告别“未知歌手”与占位图。
- **IndexedDB 持久化资料库**：基于 Dexie.js 实现本地资料库高效缓存与全量管理。

### 🌐 深入的网易云音乐生态集成
- **网易云扫码登录**：支持通过网易云音乐 App 扫码快捷安全登录。
- **云端双向红心同步**：登录后自动同步云端“我喜欢的音乐”全量列表（`likelist`），在播放器内点赞或取消收藏可实时双向同步至网易云官方账号。
- **全网全局音乐搜索**：全网关键词极速搜索单曲，展示专属搜索视图、专辑封面与 VIP 标识。
- **权威音乐排行榜与分类探索**：全新“浏览”页面，内置网易云热歌榜、飙升榜、新歌榜、原创榜、ACG 榜、欧美金曲榜及热门曲风分类。

### 💻 纯正的 Windows 桌面级体验
- **零配置开箱即用**：打包后的 `.exe` 程序内置后台静默 Api 引擎，他人无需配置 Node.js 开发环境，解压双击即可独立运行。
- **系统托盘与常驻播放**：支持最小化至 Windows 任务栏右下角系统托盘，后台续播无间断；提供快捷托盘右键菜单（显示、播放/暂停、上一首、下一首、退出）。
- **全局硬件媒体按键**：支持键盘物理媒体按键（播放/暂停、切歌）全局响应。
- **搜索栏历史记录**：自动保存历史搜索词，提供下拉历史快捷标签、单条删除与一键清空。
- **智能 GPU 性能调度**：窗口最小化或后台运行时自动挂起 Canvas 动画渲染循环，降低 GPU/CPU 占用。

---

## 🛠️ 技术栈

- **桌面端核心框架**：[Electron](https://github.com/electron/electron) 31.x
- **前端框架**：[React 18](https://github.com/facebook/react) & [TypeScript](https://github.com/microsoft/TypeScript)
- **构建工具**：[Vite](https://github.com/vitejs/vite) 5.x & [vite-plugin-electron](https://github.com/electron-vite/vite-plugin-electron)
- **状态管理**：[Zustand](https://github.com/pmndrs/zustand)
- **动画引擎**：[Framer Motion](https://github.com/framer/motion)
- **样式方案**：Tailwind CSS (Vanilla CSS 增强)
- **本地存储**：IndexedDB ([Dexie.js](https://github.com/dexie/Dexie.js))
- **ID3 解析**：[jsmediatags](https://github.com/aadsm/jsmediatags)
- **后端 Api 框架**：[@neteasecloudmusicapienhanced/api](https://github.com/Binaryify/NeteaseCloudMusicApi)

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

## 📋 版本更新历史 (Changelog)

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
- 实现 Apple Music 动态流体光斑背景与双行全景歌词

---

## 📄 开源协议

本项目采用 [MIT License](LICENSE) 开源协议。
