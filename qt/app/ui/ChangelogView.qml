import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

ScrollView {
    id: root
    background: null
    padding: 0
    clip: true; contentWidth: availableWidth; contentHeight: changelogColumn.y + changelogColumn.implicitHeight + 48; bottomPadding: 0
    onVisibleChanged: if (visible) contentY = 0
    ScrollBar.vertical: AppScrollBar {}
    ColumnLayout {
        id: changelogColumn
        anchors.horizontalCenter: parent.horizontalCenter
        width: Math.min(root.availableWidth - 56, 1100)
        y: 28
        spacing: 24
        RowLayout { Layout.fillWidth: true; Layout.preferredHeight: 72; spacing: 12; AppIcon { name: "history"; color: "#ff2d55"; width: 32; height: 32 } ColumnLayout { spacing: 3; Text { text: "更新日志"; color: "#18202d"; font.pixelSize: 30; font.weight: Font.ExtraBold } Text { text: "查看 Beta Music Player 版本演进与新功能记录"; color: "#929aa7"; font.pixelSize: 13 } } Item { Layout.fillWidth: true } Rectangle { width: 126; height: 28; radius: 14; color: "#15ff2d55"; border.color: "#40ff2d55"; RowLayout { anchors.centerIn: parent; spacing: 6; AppIcon { name: "disc"; color: "#ff2d55"; width: 13; height: 13 } Text { text: "当前版本 v" + appVersion; color: "#ff2d55"; font.pixelSize: 10; font.bold: true } } } }
        Rectangle { Layout.fillWidth: true; height: 1; color: "#141f2937"; Layout.topMargin: -34 }

        VersionCard {
            Layout.topMargin: -15
            latest: true; version: "v1.0.9"; date: "2026-08-21"
            summary: "Qt 原生版正式发布与双平台稳定性升级"
            items: [
                "【Qt 原生版】完成 Qt 6 / QML / C++ 迁移，删除 Electron/React 运行时，构建与发布全面统一。",
                "【平台精简】完整移除酷狗概念版模式和登录，仅保留网易云音乐与 QQ 音乐。",
                "【登录与 VIP】轻量 WebView2 登录自动捕获 Cookie，账号页显示 VIP 类型/等级/到期时间，修复会员仍只能听 30 秒。",
                "【播放稳定性】增加音源缓存、下一曲预取、鉴权重试与不可播/VIP 曲目自动跳过，减少切歌延迟和无声停顿。",
                "【平台切换】网易云与 QQ 独立缓存首页、歌单和账号状态，切换后即时回显并静默刷新。",
                "【歌词兼容】完善 YRC/QRC/LRC 解析与 QQ 翻译，修复偶发只显示一行、长句换行和逐字高光丢失。",
                "【全屏歌词】优化非线性海浪切行、光晕和行距；纯歌词/双栏改为立即切换，消除闪现、抖动与斜向阶梯。",
                "【界面修复】修复歌单点歌后回到顶部，改善列表、播放页和叠放封面的圆角抗锯齿。",
                "【性能与打包】限制屏外歌词动画与效果节点，优化流体背景/内存/缓存；新安装包集成 Qt、WebView2、Node.js 与 MSVC 运行库。"
            ]
        }

        VersionCard {
            latest: false; version: "v1.0.8-Beta"; date: "2026-08-15"
            warningNotice: "目前版本是 Beta 测试版本，支持网易云音乐与 QQ 音乐。"
            summary: "逐字歌词性能与双平台体验增强"
            items: [
                "【逐字歌词性能】逐字波浪组件 memo 化，慢歌长句每帧仅更新正在唱的一个字，逐字点亮流畅不卡顿。",
                "【歌词时间轴】直连音频实时媒体时钟并做指数平滑，消除慢歌逐字抖动与时间外推漂移。",
                "【高亮增强】激活歌词光晕更亮一档（逐字与非逐字），随点亮进度平滑淡入。",
                "【前奏倒计时】三个圆点覆盖网易云与 QQ 模式，消失时机锚定真实开唱时间；QQ 歌词元数据过滤升级（标题/词曲行，兼容全角连字符、括号副标题与 [ti:] 前置 meta）。",
                "【歌词切换时间微调】全屏歌词音量条下方新增滑块，按每首歌独立调整歌词行切换偏移（-2000ms ~ +2000ms），播放下一首自动恢复默认 0ms。",
                "【窗口行为】移除自定义最小化/恢复动画，回归 Windows 系统默认窗口动画。",
                "【检查更新】修复版本比较逻辑（旧标签不再误报新版本）、版本号统一读取、区分 API 限流与网络失败、启动检查 6 小时节流。",
                "【设置】「性能与卡顿优化建议」更新并新增「一键设置」，一键仅开启流体背景并关闭全部歌词动效。",
                "【逐字歌词】新增网易云逐字歌词（YRC）支持，行级联动海浪式非线性果冻动画，唱到哪亮到哪、快歌不闪现，字渐亮缓出收敛、发光平滑渐入。",
                "【安全加固】恢复 webSecurity 与窗口沙箱、注入内容安全策略（CSP）、app-audio 本地音频协议白名单校验、本地 API 仅绑定 127.0.0.1、修复端口占用崩溃与本地音乐加载链路。",
                "【QQ 音乐识别修复】VIP 判定改为以“播放受限”为准（安和桥等高品质付费歌曲不再误标 VIP），榜单接入权威付费信息校验，严格匹配防同名翻唱/DJ 版错配。",
                "【播放修复】修复内容安全策略误拦截 http 音源导致的“音源播放失败”，QQ 封面跨域注入修复流体背景取色。",
                "【进度条交互】播放进度条支持拖拽滑动（拖动实时预览、松手定位），修复拖动不跟手与卡顿。"
            ]
        }

        VersionCard {
            latest: false; version: "v1.0.7"; date: "2026-08-06"
            summary: "QQ 音乐深度集成与播放性能重构"
            items: [
                "【QQ音乐深度集成】彻底修复 QQ 音乐模式下登录界面与提示错乱，支持双平台独立 Web 窗口登录与凭证绑定。",
                "【QQ音乐封面修复】修复 QQ 音乐 API 封面错乱与加载破损问题，支持全零 albummid 自动降级与全局图片加载容错。",
                "【榜单与歌单优化】修复 QQ 音乐推荐歌单曲目重复缺陷，实现巅峰热歌榜、飙升榜、新歌榜权威榜单独立映射。",
                "【播放性能重构】重构切歌与音源派发机制，取消空音源打断，实现单次原子化状态更新，彻底解决需手动暂停再播放问题。",
                "【音源歌词解耦】歌词拉取改为后台静默非阻塞加载，加入播放器 onStalled / onWaiting 智能恢复机制。",
                "【底栏收藏实时同步】修复底栏爱心收藏状态延迟缺陷，补充状态监听与多平台曲目 ID 规范匹配，实现秒级红心切换。"
            ]
        }

        VersionCard {
            latest: false; version: "v1.0.6"; date: "2026-08-06"
            summary: "界面动效优化与首页推荐交互"
            items: [
                "修复浅色主题下播放器进度条与拖动圆点对比度不足、几乎不可见的问题。",
                "重做全屏歌词液态背景，加入实时流动的液体光团与高光带，不再只是封面放大模糊。",
                "升级歌词切换为非线性果冻缓动，并优化歌词滚动弹簧效果，减少切换顿挫。",
                "增加主窗口、最大化/还原、最小化及全屏进出过渡动画，恢复全屏前的窗口尺寸。",
                "优化窗口圆角、半透明毛玻璃和全屏歌词交互状态，提升整体视觉一致性。",
                "修复首页推荐偶尔播放预制歌曲的问题，“查看全部”现在会正确进入每日推荐歌单。",
                "首页推荐封面新增悬停交互和点击播放，搜索历史下拉层恢复不透明并支持完整点击操作。",
                "登录弹窗隐藏底部播放栏，统一 Beta Music Player 应用名称、图标和 Windows 打包身份。"
            ]
        }

        VersionCard {
            latest: false; version: "v1.0.5"; date: "2026-08-02"
            summary: "纯歌词全屏模式与网易云 VIP 播放修复"
            items: [
                "新增纯歌词全屏模式与经典双栏歌词模式切换。",
                "桌面歌词支持长歌词自动横向滚动显示。",
                "优化网易云 VIP 音源鉴权、解析、缓存与播放启动速度。",
                "修复 VIP 音源解析失败停留在 0:00、Cookie 外发和音频切换卡顿问题。"
            ]
        }

        VersionCard {
            latest: false; version: "v1.0.4"; date: "2026-07-24"
            summary: "独立桌面歌词、全屏覆盖与音量平滑渐变"
            items: [
                "【网易云同款独立桌面歌词】新增独立透明置顶桌面歌词窗口，支持随屏幕自由拖拽、快捷锁定（鼠标穿透）与一键解封播控；内置 6 组炫彩/霓虹渐变配色，一键切换并持久化。",
                "【全屏歌词窗口全屏覆盖】全屏歌词顶部新增【全屏覆盖/取消全屏覆盖】按钮，界面按钮与系统窗口状态实时双向同步。",
                "【音频播控平滑淡入淡出】播放、暂停及切歌引入余弦曲线音量渐变，旧歌柔和渐隐、新歌平滑渐现，告别生硬爆音。"
            ]
        }

        VersionCard {
            latest: false; version: "v1.0.3"; date: "2026-07-24"
            summary: "歌单无上限加载与元数据清洗"
            items: [
                "【歌单歌曲无上限全量加载】突破歌单单页 50 首限制，多页自动循环拉取，无上限全量载入并完整展示。",
                "【元数据空字符清洗】修复歌曲名/歌手/专辑末尾异常多出数字“0”的问题，剔除 Null 字符与转义异常。"
            ]
        }

        VersionCard {
            latest: false; version: "v1.0.1"; date: "2026-07-23"
            summary: "本地 ID3 解析、系统托盘与浏览视图"
            items: [
                "【本地音乐 ID3 解析】导入 MP3/FLAC 自动识别歌曲名、歌手、专辑名及封面，告别“未知歌手”与占位封面。",
                "【系统托盘后台常驻】关闭主窗口自动最小化至系统托盘，右键托盘一键显示/播放/切歌/退出。",
                "【「浏览」探索视图】解耦“现在就听”与“浏览”，打造热歌榜、飙升榜、新歌榜、原创榜、ACG 榜、欧美榜及热门曲风标签。"
            ]
        }

        VersionCard {
            latest: false; version: "v1.0.0"; date: "2026-07-23"
            summary: "初始正式版发布"
            items: [
                "响应式流体光斑背景与毛玻璃高斯模糊面板。",
                "全景双行歌词平滑滚动、歌词发光与阶梯景深模糊效果。",
                "网易云音乐扫码登录、同步个人歌单与喜欢列表。",
                "本地音频文件拖拽播放与 IndexedDB 本地资料库管理。"
            ]
        }
    }

    component VersionCard: Rectangle {
        id: card
        property bool latest: false
        property string version: ""
        property string date: ""
        property string warningNotice: ""
        property string summary: ""
        property var items: []
        Layout.fillWidth: true
        Layout.preferredHeight: cardContent.implicitHeight + 48
        radius: 17
        color: "#c8ffffff"
        border.color: latest ? "#4dff2d55" : "#141f2937"
        transform: Translate { y: cardMouse.containsMouse ? -3 : 0; Behavior on y { NumberAnimation { duration: 240; easing.type: Easing.OutCubic } } }
        scale: cardMouse.pressed ? 0.997 : 1
        Behavior on scale { NumberAnimation { duration: 130; easing.type: Easing.OutCubic } }

        ColumnLayout {
            id: cardContent
            anchors.left: parent.left
            anchors.right: parent.right
            anchors.top: parent.top
            anchors.margins: 24
            spacing: 10

            RowLayout {
                Layout.fillWidth: true
                spacing: 10
                Text { text: card.version; color: "#253044"; font.pixelSize: 22; font.bold: true }
                Rectangle { visible: card.latest; width: 58; height: 22; radius: 11; color: "#ff2d55"; Text { anchors.centerIn: parent; text: "最新版本"; color: "white"; font.pixelSize: 9; font.bold: true } }
                Item { Layout.fillWidth: true }
                Text { text: card.date; color: "#929aa7"; font.pixelSize: 10; font.family: "Consolas" }
            }

            Rectangle {
                visible: !!card.warningNotice
                Layout.fillWidth: true
                Layout.preferredHeight: warnRow.implicitHeight + 20
                radius: 10
                color: "#fffbeb"
                border.color: "#fde68a"
                border.width: 1

                RowLayout {
                    id: warnRow
                    anchors.fill: parent
                    anchors.margins: 12
                    spacing: 10
                    Text {
                        text: "⚠"
                        color: "#d97706"
                        font.pixelSize: 14
                        font.bold: true
                        Layout.alignment: Qt.AlignTop
                    }
                    Text {
                        Layout.fillWidth: true
                        text: card.warningNotice
                        color: "#92400e"
                        font.pixelSize: 11
                        font.bold: true
                        wrapMode: Text.WordWrap
                        lineHeight: 1.4
                    }
                }
            }

            Text { Layout.fillWidth: true; text: card.summary; color: "#687385"; font.pixelSize: 11; font.bold: true; wrapMode: Text.WordWrap }
            Rectangle { Layout.fillWidth: true; height: 1; color: "#101f2937" }
            Repeater {
                model: card.items
                delegate: RowLayout {
                    Layout.fillWidth: true
                    spacing: 8
                    Text { text: "•"; color: card.latest ? "#ff2d55" : "#929aa7"; font.pixelSize: 13; Layout.alignment: Qt.AlignTop; Layout.topMargin: 1 }
                    Text { Layout.fillWidth: true; text: modelData; color: "#687385"; font.pixelSize: 11; wrapMode: Text.WordWrap; lineHeight: 1.45 }
                }
            }
        }
        MouseArea { id: cardMouse; anchors.fill: parent; hoverEnabled: true; acceptedButtons: Qt.NoButton }
    }
}
