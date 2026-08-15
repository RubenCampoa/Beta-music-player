// Beta Music Player — 主界面（原版精确复刻）
// 结构：圆角外壳 shell > [全屏歌词层 | 主界面(TitleBar + Sidebar+视图区 + PlayerBar)]
import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import QtQuick.Effects

ApplicationWindow {
    id: root
    width: 1240
    height: 820
    minimumWidth: 960
    minimumHeight: 640
    visible: true
    color: "transparent"
    title: "Beta Music Player"
    flags: Qt.FramelessWindowHint | Qt.Window
           | Qt.WindowMinimizeButtonHint | Qt.WindowMaximizeButtonHint
           | Qt.WindowCloseButtonHint

    property bool showFullLyrics: bridge.fullLyrics
    property bool nativeTitleBarEnabled: !showFullLyrics
    property var settingsData: bridge.settings

    // Keep page state after the first visit, but avoid constructing every
    // view, list and image provider during application startup.
    component LazyPage: Loader {
        property bool selected: false
        property bool loadedOnce: false
        active: selected || loadedOnce
        asynchronous: false
        onLoaded: loadedOnce = true
    }

    Shortcut {
        sequence: "Ctrl+L"
        onActivated: bridge.toggle_full_lyrics()
    }
    Shortcut {
        sequence: "Escape"
        enabled: root.showFullLyrics
        onActivated: bridge.toggle_full_lyrics()
    }

    // ============ 圆角外壳（原版 app-shell）============
    Rectangle {
        id: shell
        anchors.fill: parent
        // The real HWND is rounded by Windows 11 DWM. Keeping the QML shell
        // square prevents two different radii from clipping each other.
        radius: 0
        color: root.showFullLyrics ? "#070912" : "#f5f6f8"
        border.color: root.showFullLyrics ? "transparent" : "#1a1f2937"
        border.width: 1
        clip: true

        // ---------- 全屏歌词层 ----------
        Rectangle {
            id: fullLyricsLayer
            anchors.fill: parent
            // Keep the lyric surface flush with the native window. An inset
            // transparent host leaves a visible moat around the entire view
            // on Windows, especially over bright desktop content.
            anchors.margins: 0
            radius: bridge.windowFullscreen ? 0 : 20
            color: "#070912"
            visible: root.showFullLyrics || opacity > 0.001
            enabled: root.showFullLyrics
            opacity: 0
            scale: 0.975
            transform: Translate { id: lyricsTranslate; y: 8 }
            z: 100
            clip: true
            Behavior on radius { NumberAnimation { duration: 480; easing.type: Easing.OutCubic } }
            state: root.showFullLyrics ? "shown" : "hidden"
            states: [
                State {
                    name: "shown"
                    PropertyChanges { fullLyricsLayer.opacity: 1; fullLyricsLayer.scale: 1 }
                    PropertyChanges { lyricsTranslate.y: 0 }
                },
                State {
                    name: "hidden"
                    PropertyChanges { fullLyricsLayer.opacity: 0; fullLyricsLayer.scale: 0.975 }
                    PropertyChanges { lyricsTranslate.y: 8 }
                }
            ]
            transitions: Transition {
                from: "shown"
                to: "hidden"
                ParallelAnimation {
                    NumberAnimation { target: fullLyricsLayer; properties: "opacity,scale"; duration: 480; easing.type: Easing.BezierSpline; easing.bezierCurve: [0.22, 1, 0.36, 1, 1, 1] }
                    NumberAnimation { target: lyricsTranslate; property: "y"; duration: 480; easing.type: Easing.BezierSpline; easing.bezierCurve: [0.22, 1, 0.36, 1, 1, 1] }
                }
            }

            FluidBackground {
                anchors.fill: parent
                visible: root.settingsData.fluidBackground !== false
                animationEnabled: root.showFullLyrics
                                  && root.visibility !== Window.Minimized
                                  && root.visibility !== Window.Hidden
                property var activeSong: bridge.currentSong
                artworkSource: root.showFullLyrics ? (activeSong.cover || "") : ""
            }

            FullLyricsView { anchors.fill: parent }
        }

        // ---------- 主界面 ----------
        ColumnLayout {
            id: mainSurface
            anchors.fill: parent
            spacing: 0
            visible: !root.showFullLyrics || opacity > 0.001
            enabled: !root.showFullLyrics
            opacity: root.showFullLyrics ? 0 : 1
            Behavior on opacity { NumberAnimation { duration: root.showFullLyrics ? 180 : 360; easing.type: Easing.OutCubic } }

            layer.enabled: bridge.isLoginModalOpen
            layer.effect: Component {
                MultiEffect {
                    blurEnabled: true
                    blurMax: 48
                    blur: 0.90
                    brightness: -0.06
                }
            }

            TitleBar {
                Layout.fillWidth: true
                onSearchTriggered: function (query) {
                    bridge.search(query)
                }
            }

            RowLayout {
                Layout.fillWidth: true
                Layout.fillHeight: true
                spacing: 0

                Sidebar {}

                Rectangle {
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    color: "transparent"

                    Item {
                        id: pageHost
                        anchors.fill: parent
                        anchors.leftMargin: root.width <= 1040 ? 20 : 32
                        anchors.rightMargin: root.width <= 1040 ? 20 : 32
                        anchors.bottomMargin: 0
                        property int requestedIndex: {
                            var mode = bridge.viewMode
                            if (mode === "discover") return 0
                            if (mode === "browse") return 1
                            if (mode === "search") return 2
                            if (mode === "favorites") return 3
                            if (mode === "local") return 4
                            if (mode === "playlist_detail") return 5
                            if (mode === "settings") return 6
                            if (mode === "about") return 7
                            if (mode === "notice") return 8
                            if (mode === "changelog") return 9
                            return 0
                        }
                        property int displayedIndex: requestedIndex
                        property int transitionDirection: 1
                        readonly property bool animationsEnabled: root.settingsData.smoothAnimations !== false

                        onRequestedIndexChanged: {
                            if (requestedIndex === displayedIndex)
                                return
                            transitionDirection = requestedIndex > displayedIndex ? 1 : -1
                             if (!animationsEnabled) {
                                 pageTransition.stop()
                                 displayedIndex = requestedIndex
                                 pageStack.opacity = 1
                                 pageStack.scale = 1
                                 pageShift.x = 0
                                 pageShift.y = 0
                                return
                            }
                            pageTransition.restart()
                        }

                         SequentialAnimation {
                             id: pageTransition
                             ParallelAnimation {
                                 NumberAnimation { target: pageStack; property: "opacity"; to: 0; duration: 420; easing.type: Easing.BezierSpline; easing.bezierCurve: [0.22, 1, 0.36, 1, 1, 1] }
                                 NumberAnimation { target: pageStack; property: "scale"; to: 0.992; duration: 420; easing.type: Easing.BezierSpline; easing.bezierCurve: [0.22, 1, 0.36, 1, 1, 1] }
                                 NumberAnimation { target: pageShift; property: "y"; to: -10; duration: 420; easing.type: Easing.BezierSpline; easing.bezierCurve: [0.22, 1, 0.36, 1, 1, 1] }
                             }
                             ScriptAction {
                                 script: function() {
                                     pageHost.displayedIndex = pageHost.requestedIndex
                                     pageShift.x = 0
                                     pageShift.y = 12
                                     pageStack.scale = 0.988
                                 }
                             }
                             ParallelAnimation {
                                 NumberAnimation { target: pageShift; property: "y"; to: 0; duration: 420; easing.type: Easing.BezierSpline; easing.bezierCurve: [0.22, 1, 0.36, 1, 1, 1] }
                                 NumberAnimation { target: pageStack; property: "scale"; to: 1; duration: 420; easing.type: Easing.BezierSpline; easing.bezierCurve: [0.22, 1, 0.36, 1, 1, 1] }
                                 NumberAnimation { target: pageStack; property: "opacity"; to: 1; duration: 420; easing.type: Easing.BezierSpline; easing.bezierCurve: [0.22, 1, 0.36, 1, 1, 1] }
                             }
                         }

                        StackLayout {
                            id: pageStack
                            anchors.fill: parent
                            currentIndex: pageHost.displayedIndex
                            transformOrigin: Item.Center
                            transform: Translate { id: pageShift }

                            LazyPage {
                                selected: pageHost.displayedIndex === 0
                                sourceComponent: Component {
                                    Item {
                                        ListenNowView {
                                            anchors.left: parent.left
                                            anchors.right: parent.right
                                            anchors.bottom: parent.bottom
                                            anchors.top: parent.top
                                        }
                                    }
                                }
                            }
                            LazyPage { selected: pageHost.displayedIndex === 1; sourceComponent: Component { BrowseView {} } }
                            LazyPage { selected: pageHost.displayedIndex === 2; sourceComponent: Component { SearchView {} } }
                            LazyPage { selected: pageHost.displayedIndex === 3; sourceComponent: Component { SearchView {} } }
                            LazyPage { selected: pageHost.displayedIndex === 4; sourceComponent: Component { LocalMusicView {} } }
                            LazyPage { selected: pageHost.displayedIndex === 5; sourceComponent: Component { PlaylistView {} } }
                            LazyPage { selected: pageHost.displayedIndex === 6; sourceComponent: Component { SettingsView {} } }
                            LazyPage { selected: pageHost.displayedIndex === 7; sourceComponent: Component { AboutView {} } }
                            LazyPage { selected: pageHost.displayedIndex === 8; sourceComponent: Component { NoticeView {} } }
                            LazyPage { selected: pageHost.displayedIndex === 9; sourceComponent: Component { ChangelogView {} } }
                        }
                    }
                }
            }

            PlayerBar {
                Layout.fillWidth: true
                onRequestFullLyrics: bridge.toggle_full_lyrics()
                onRequestDesktopLyric: bridge.toggle_desktop_lyric()
            }
        }

        // ---------- 播放队列抽屉 (Drawer Overlay) ----------
        QueueDrawer {
            id: queueOverlay
            anchors.right: parent.right
            anchors.top: parent.top
            anchors.bottom: parent.bottom
            visible: bridge.isQueueDrawerOpen || opacity > 0.001
            enabled: bridge.isQueueDrawerOpen
            opacity: bridge.isQueueDrawerOpen ? 1 : 0
            transform: Translate { x: bridge.isQueueDrawerOpen ? 0 : 40; Behavior on x { NumberAnimation { duration: 280; easing.type: Easing.OutCubic } } }
            Behavior on opacity { NumberAnimation { duration: bridge.isQueueDrawerOpen ? 220 : 170; easing.type: Easing.OutCubic } }
            z: 200
        }

        // ---------- 扫码登录 Modal Overlay ----------
        LoginModal {
            id: loginOverlay
            anchors.fill: parent
            visible: bridge.isLoginModalOpen || opacity > 0.001
            enabled: bridge.isLoginModalOpen
            opacity: bridge.isLoginModalOpen ? 1 : 0
            scale: bridge.isLoginModalOpen ? 1 : 0.97
            Behavior on opacity { NumberAnimation { duration: bridge.isLoginModalOpen ? 260 : 180; easing.type: Easing.OutCubic } }
            Behavior on scale { NumberAnimation { duration: 300; easing.type: Easing.OutBack } }
            z: 300
        }

        // ---------- 加载提示（与 Toast 同款的深色胶囊，紧凑醒目）----------
        Rectangle {
            anchors.top: parent.top
            anchors.horizontalCenter: parent.horizontalCenter
            anchors.topMargin: 54
            width: busyRow.implicitWidth + 24
            height: 30
            radius: 15
            color: "#f21e293b"
            border.color: "#26394a60"
            // Search owns its loading presentation inside the result panel.  A
            // global pill here overlaps both the title-bar field and its history
            // popover, which is especially noticeable while a query is pending.
            visible: bridge.busy && bridge.viewMode !== "search"
            z: 390
            RowLayout {
                id: busyRow
                anchors.centerIn: parent
                spacing: 8
                BusyIndicator {
                    running: bridge.busy
                    width: 15
                    height: 15
                    padding: 0
                    palette.text: "white"
                }
                Text { text: "加载中…"; color: "#ffffff"; font.pixelSize: 12; font.bold: true }
            }
        }

        Rectangle {
            id: toastBox
            anchors.horizontalCenter: parent.horizontalCenter
            anchors.bottom: parent.bottom
            anchors.bottomMargin: 100
            height: 36
            width: toastText.implicitWidth + 32
            radius: 18
            // QML uses #AARRGGBB (not CSS #RRGGBBAA). Keep the toast nearly
            // opaque so content behind it cannot wash out the message.
            color: "#f21e293b"
            border.color: "#26394a60"
            visible: toastTimer.running
            z: 400

            Text {
                id: toastText
                anchors.centerIn: parent
                text: bridge.toastMessage
                color: "#ffffff"
                font.pixelSize: 13
                font.bold: true
            }

            Timer {
                id: toastTimer
                interval: 2500
                running: false
                repeat: false
            }

            Connections {
                target: bridge
                function onToastChanged(msg) {
                    if (msg) {
                        toastTimer.restart()
                    }
                }
            }
        }
    }
}
