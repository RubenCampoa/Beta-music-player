# Beta Music Player · Android

基于 Kotlin + Jetpack Compose 的安卓端音乐播放器，与桌面端（React + Electron）共享网易云音乐生态。

## ✨ 特性

- **液态玻璃（Liquid Glass）UI**：集成 [AndroidLiquidGlass (Backdrop)](https://github.com/Kyant0/AndroidLiquidGlass) `io.github.kyant0:backdrop:2.0.0`，底部导航、迷你播放条、播放页控件均使用 `rememberLayerBackdrop` + `drawBackdrop`（`vibrancy` / `blur` / `lens` 效果）实现
- **核心播放闭环**：网易云扫码登录 → 搜索歌曲 → 歌单/搜索结果播放 → 双行全景歌词（原文+翻译自动滚动）→ 红心双向同步
- **封面光斑背景**：当前播放歌曲封面模糊 + 深色渐变，桌面端同款沉浸氛围
- **播放模式**：顺序 / 单曲循环 / 随机，Media3 ExoPlayer 驱动

## 🛠 技术栈

| 组件 | 选型 |
| --- | --- |
| 语言 / UI | Kotlin 2.1.0 / Jetpack Compose (Material3) |
| 构建 | Gradle 8.11.1 + AGP 8.8.0，compileSdk 35 / minSdk 26 / targetSdk 35 |
| 液态玻璃 | io.github.kyant0:backdrop:2.0.0 |
| 播放 | Media3 ExoPlayer 1.10.1 |
| 网络 | Retrofit 2.12 + OkHttp 4.12 + kotlinx-serialization（连接自建 api-enhanced） |
| 图片 | Coil 3.5 |
| 持久化 | DataStore Preferences |

> 说明：AGP 9 默认启用 built-in Kotlin（内置 2.2.10），但 backdrop 2.0.0 需要 Kotlin 2.3.21 元数据，
> 故在 `gradle.properties` 中设置 `android.builtInKotlin=false` + `android.newDsl=false` 退出内置 Kotlin，
> 使用外部 KGP 2.3.21（AGP 10 起将强制迁移，届时升级即可）。

## 🚀 构建

前置：JDK 17+、Android SDK（platform 37）。

```bash
cd android
# 首次构建会下载依赖，耗时较长
./gradlew :app:assembleDebug      # debug APK：app/build/outputs/apk/debug/
./gradlew :app:assembleRelease    # release APK（本机使用 debug 签名，便于直接安装）
./gradlew check                   # lint + 单元测试
```

Gradle 发行版下载地址在 `gradle/wrapper/gradle-wrapper.properties`（默认腾讯镜像，
如网络可达官方源可改回 `https://services.gradle.org/distributions/gradle-9.5.0-bin.zip`）。
`local.properties` 需配置本机 SDK 路径（`sdk.dir`），该文件不入库。

## 📁 结构

```
android/app/src/main/java/com/beta/musicplayer/
├── data/
│   ├── model/       # Song / Playlist / UserProfile / LyricLine
│   ├── remote/      # NeteaseApiService（Retrofit + 镜像 failover）
│   ├── local/       # PreferencesRepository（DataStore）
│   └── util/        # LRC 解析 / 格式化（移植自桌面端）
├── player/          # MusicPlayer（Media3 ExoPlayer 封装）
└── ui/
    ├── components/  # 玻璃组件、歌词视图、歌曲行、背景层
    ├── MainScreen.kt        # 主框架 + 液态玻璃底部导航 + 迷你播放条
    ├── ListenNowView.kt     # 现在收听
    ├── SearchView.kt        # 搜索
    ├── BrowseView.kt        # 我的歌单
    ├── MeView.kt            # 我的（登录 / 红心）
    ├── PlayerSheet.kt       # 全屏播放页（歌词 + 玻璃滑块）
    └── MainViewModel.kt     # UI 状态与业务逻辑
```

## 🔌 API 说明

Android 端仅连接自己部署的 [api-enhanced](https://github.com/NeteaseCloudMusicApiEnhanced/api-enhanced) 服务，避免把网易云登录 cookie 发往公共镜像。

开发机已附带服务入口，在项目根目录运行：

```bash
npm run start-api
```

它会监听 `0.0.0.0:3000`。Android 模拟器默认使用 `http://10.0.2.2:3000/`；真机请在“我的 → 扫码登录”里填写电脑的局域网 IP（例如 `http://192.168.1.10:3000/`）或自己的 HTTPS 地址，再保存并获取二维码。首页推荐、歌曲详情和逐行歌词均从该服务读取，接口不可用时会显示失败状态，而不会伪造本地歌曲。

## 📄 许可

MIT（与桌面端一致）
