# 更新日志 (CHANGELOG)

## [v1.0.5] - 2026-08-02

### ✨ 核心新特性与界面升级
- **全新【纯歌词全屏】与【双栏模式】一键切换**：歌词容器突破 `h-[480px]` 限制，纵向铺满整个窗口高度。新增顶部模式切换按钮，支持经典左右双栏与纯歌词超大巨幕全屏模式。
- **桌面悬浮歌词重构 (Desktop Floating Lyrics)**：
  - 废除了拖沓生硬的左右横向跑马灯动画，升级为**智能自动折行居中 (Auto-Wrap & Center)**。
  - 引入网易云/QQ音乐同款**垂直向上平滑滑动切换 (Vertical Smooth Slide)**，搭配 Apple `cubic-bezier(0.16, 1, 0.3, 1)` 0.35s 贝塞尔曲线，歌词换行体验自然细腻。

### 🐞 视觉与动效修复 (UI & Animation Fixes)
- **消除高亮歌词矩形硬边框 (Glow Matrix Clipping)**：剥离 `transform-gpu` 离屏图层隔离，添加 `p-2 -m-2` 负边距内衬缓冲区，使歌词霓虹光晕自然无界扩散。
- **彻底解决歌词右侧溢出裁剪**：调大右侧留白边距（`pr-14 md:pr-20`）并开启 `break-words` 智能长词换行，防止超长歌词在容器右边界被直角截断。
- **前奏/未开始句清晰度优化**：修复前奏阶段（`activeIndex === -1`）歌词全暗全糊问题，自动高亮第一句歌词（`0.85` 透明度 + `0px` 模糊），确保前奏随时清晰可读。
- **750ms 丝滑平滑滚动引擎**：基于 `requestAnimationFrame` + `easeOutQuart` 四次方减速缓动曲线（`1 - Math.pow(1 - progress, 4)`），替代浏览器原生硬切 `scrollTo`。

### 🎵 网易云 VIP 鉴权与音源解封 (NetEase VIP & Streaming)
- **修复 VIP 歌曲 HTTPS 握手失败**：保留网易云官方 CDN 原生 HTTP 播放链接（`http://m801.music.126.net/...`），彻底解决因强制 `https:` 导致 443 端口 SSL 握手失败 (`ERR_SSL_PROTOCOL_ERROR`) 的隐蔽 Bug。
- **HTTP 请求头 + Query 双重 Cookie 绑定**：在 `fetchApi` 中完整补充 `headers: { Cookie: this.cookie }`，确保 100% 正确透传 VIP 用户凭证，获取 FLAC 无损与 320k 极高音质专享 CDN 链接。
- **构建四重 VIP 音源解封管道 (Unblock Pipeline)**：结合官方 VIP Cookie 鉴权、经典高码率接口与 Meting 智能 Unblock 解封音源（`https://api.i-meto.com`），即使无 VIP 账号亦可顺畅播放受限歌曲。

---

## [v1.0.4] - 2026-07-31
- 修复本地 API 端口挂载与离线 fallback。
- 优化全屏歌词滚屏平滑度。

## [v1.0.0] - 2026-07-30
- 初始版本发布，支持 React 18 + Electron 桌面播放器基础架构。
