# Beta Music Player

<p align="center">
  <img src="./qt/app-icon.png" width="128" height="128" alt="Beta Music Player Logo" />
</p>

基于 Qt 6、QML 和 C++ 构建的沉浸式 Windows 桌面音乐播放器。目前仅保留
网易云音乐与 QQ 音乐，旧 Electron/React 客户端已经移除。

当前稳定版：**v1.0.9**（2026-08-21）。

## 功能

- 网易云与 QQ 音乐推荐、搜索、歌单、账号和收藏。
- 二维码、网页登录与 Cookie 登录，Windows 凭据使用 DPAPI 加密保存。
- VIP 音源识别、不可播放歌曲自动跳过与下一曲音源预取。
- YRC/QRC 逐字歌词、非线性行切换、全屏歌词和桌面歌词。
- GPU ShaderEffect 流体背景、封面取色和可配置性能选项。
- 本地音乐文件/目录导入、音频标签、封面和同名 LRC 读取。
- 系统托盘、硬件媒体键、无边框窗口和 Windows 11 集成。

## 目录

- `qt/app/ui`：QML 界面与动效。
- `qt/cpp`：播放器、网络、存储、登录和平台适配。
- `qt/netease_server.js`：仅监听回环地址的网易云/QQ 本地侧车。
- `qt/package.json`：侧车的最小 Node.js 依赖。
- `android`：Android 相关构建资源。

## 开发环境

- Qt 6.5.3 MSVC 2019 x64，默认安装于 `C:\Qt\6.5.3\msvc2019_64`。
- Visual Studio 2019/2022 C++ Build Tools。
- Node.js 18 或更高版本，仅用于安装 Qt 侧车依赖和打包。
- NSIS 3，仅在生成安装包时需要。

```powershell
cd qt
npm install
./build_cpp.bat
./run_cpp.bat
```

根目录的 `run.bat` 和 `run_cpp.bat` 也会启动 Qt 版本。

## 测试

```powershell
cd qt
./build_cpp.bat
ctest --test-dir cpp/build-nmake --output-on-failure
```

## 打包

```powershell
cd qt
./package_qt.bat
```

打包脚本会创建独立的 Node 侧车运行时、部署 Qt/MSVC 依赖，执行侧车身份检查和
程序自检，最后在 `qt/dist` 生成便携压缩包与 NSIS 安装包。

## 数据与安全

- 用户数据：`%LOCALAPPDATA%\BetaMusicPlayerQt\storage.json`。
- 缓存：系统缓存目录下的 `BetaMusicPlayerQt`，后台自动按容量和时间淘汰。
- 本地平台 API 仅绑定 `127.0.0.1`，每次启动使用随机令牌认证。
- Release 版只执行应用目录内的固定侧车和内置 Node.js，不从当前目录或 PATH
  加载运行代码。

项目通过非官方接口连接第三方音乐服务，仅供学习与技术研究。请遵守所在地区法律、
平台服务条款与版权要求。

## 许可证

MIT
