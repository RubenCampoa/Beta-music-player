# Beta Music Player

基于 React + Electron 开发的桌面音乐播放器，参考 Apple Music 的界面设计与歌词动效。

> 注：本项目在开发过程中使用了 Google Gemini 辅助编写代码。

## 功能特性

- **界面设计**：基于 Canvas 提取专辑封面颜色的动态流体背景，搭配高斯模糊面板。
- **歌词显示**：支持双行歌词（原文 + 中文翻译）、平滑滚动、景深模糊与发光效果。
- **动效设置**：可单独开启或关闭背景流体、歌词滚动、发光、景深模糊等动效，适应不同设备性能。
  > 提示：若运行觉得卡顿，请在「设置」中关闭部分或全部动效（优先关闭“Apple Music 动态流体光斑背景”即可大幅提升流畅度）。
- **网易云集成**：支持扫码登录、同步个人歌单与喜欢列表、浏览排行榜及 VIP 歌曲提示。
- **本地播放**：支持拖拽 MP3 / FLAC / WAV 文件播放，自动读取 ID3 封面与歌词，使用 IndexedDB 缓存。
- **快捷键**：支持空格键播放/暂停（输入框聚焦时自动禁用）。

## 依赖开源库

- [NeteaseCloudMusicApi](https://github.com/Binaryify/NeteaseCloudMusicApi) - 网易云音乐 API 服务
- [Electron](https://github.com/electron/electron) - 桌面端应用框架
- [React 18](https://github.com/facebook/react) & [TypeScript](https://github.com/microsoft/TypeScript) - 视图与类型系统
- [Vite](https://github.com/vitejs/vite) - 开发与构建工具
- [Framer Motion](https://github.com/framer/motion) - 动画库
- [Zustand](https://github.com/pmndrs/zustand) - 状态管理
- [Tailwind CSS](https://github.com/tailwindlabs/tailwindcss) - 样式框架
- [Lucide Icons](https://github.com/lucide-icons/lucide) - 图标库
- [Dexie.js](https://github.com/dexie/Dexie.js) - IndexedDB 封装

## 本地开发与打包

```bash
# 安装依赖
npm install

# 启动开发环境
npm run dev

# 打包应用
npm run build
```

## 开源协议

[MIT License](LICENSE)
