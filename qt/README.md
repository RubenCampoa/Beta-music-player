# Beta Music Player — Qt 6 / QML 重构版

Qt 版本位于 `qt/`，与仓库中的 Electron 原版并存。界面使用 QML 与 Qt Quick
Controls 自定义组件重建，桥接层由原生 **C++ / Qt 6** 实现。

## C++ / Qt 6 运行

原生 C++ 代码在 [`cpp/`](cpp/)，保留共享 QML 界面（`app/ui/`），由 C++
`MusicBridge` 作为 QML 应用控制器连接结构化列表模型与原生能力。已接入 Qt
Multimedia、Qt WebEngine、三平台推荐/搜索/歌单/账号、扫码与网页登录、VIP
音源与音质降级、逐字歌词、本地资料库和 Windows 11 系统集成。

构建前需安装 **Visual Studio 2019/2022 的 Desktop development with C++**
（或独立 MSVC C++ Build Tools）。Qt 套件路径默认是 `C:\Qt\6.5.3\msvc2019_64`。

安装编译器后，先双击 `build_cpp.bat` 构建并部署 Qt 运行库，再双击
`run_cpp.bat` 启动。构建脚本会自动查找 Visual Studio，并在缺少 C++ 工具链时
显示明确错误，不会闪退。

执行 `package_qt.bat` 可复现生成 `dist/Beta Music Player 1.0.8 Portable.zip`
与 `dist/Beta Music Player Setup 1.0.8.exe`。发布物内含 Qt、WebEngine、
Multimedia、Node.js、三平台生产依赖和 app-local MSVC 运行库，不依赖系统 Qt、
Node 或 npm。脚本会依次进行侧车健康检查、发布目录启动自检、ZIP 压缩和 NSIS
安装器生成。

## 已实现

- 原版标题栏、侧栏、现在就听、浏览、搜索、歌单详情和本地音乐页面
- 网易云、QQ 音乐、酷狗概念版真实推荐、搜索、歌单详情与即时平台切换
- 播放队列、收藏（含网易云账号同步）、音量、进度、随机与单曲/列表循环独立开关
- 三平台扫码、手动 Cookie 与 Qt WebEngine 独立网页登录 Cookie 捕获
- 登录后账户头像、昵称，以及网易云/QQ 个人歌单同步
- 双栏/纯歌词全屏界面，YRC/QRC/KRC 逐字歌词与歌词快慢偏移微调
- 桌面歌词悬浮窗（双行、锁定鼠标穿透、播放控制）
- 本地音乐文件/文件夹/拖放导入、去重、删除、ID3/封面/时长与同名 LRC 读取
- GPU ShaderEffect 流体背景和封面主色提取
- 设置项、音质、音量、播放模式与收藏的本地持久化

Qt 数据默认保存在 `%LOCALAPPDATA%\BetaMusicPlayerQt\storage.json`，不会读取或
覆盖 Electron 原版数据；升级会保留现有 Qt 账号、收藏、本地库和设置。
