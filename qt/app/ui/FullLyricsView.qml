import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import QtQuick.Effects

Item {
    id: root
    property var song: bridge.currentSong
    readonly property var lyricLines: bridge.lyricsModel
    property var preferences: bridge.settings
    property bool pureMode: false

    function fmt(ms) {
        var total = Math.max(0, Math.floor((ms || 0) / 1000))
        return Math.floor(total / 60) + ":" + ((total % 60) < 10 ? "0" : "") + (total % 60)
    }

    function lyricOffset() { return bridge.lyricOffset }

    function closeLyrics() { bridge.toggle_full_lyrics() }

    MouseArea {
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.top: parent.top
        height: 72
        acceptedButtons: Qt.LeftButton
        onPressed: bridge.window_start_drag()
        onDoubleClicked: bridge.window_toggle_fullscreen()
    }

    Item {
        id: toolbar
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.top: parent.top
        // 原版 full-lyrics shell 为 p-6，toolbar 额外 px-2：合计 32px。
        anchors.leftMargin: 32
        anchors.rightMargin: 32
        anchors.topMargin: 20
        height: 58
        z: 5

        GlassButton {
            anchors.left: parent.left
            anchors.verticalCenter: parent.verticalCenter
            iconName: "chevron-down"
            tip: "收起全屏歌词"
            onClicked: root.closeLyrics()
        }

        Rectangle {
            id: pullHandle
            anchors.horizontalCenter: parent.horizontalCenter
            anchors.top: parent.top
            anchors.topMargin: 15
            width: 80
            height: 28
            radius: 14
            color: handleMouse.containsMouse ? "#14ffffff" : "transparent"

            Rectangle {
                anchors.centerIn: parent
                width: 80
                height: 8
                radius: 4
                color: handleMouse.containsMouse ? "#99ffffff" : "#4dffffff"
                Behavior on color { ColorAnimation { duration: 160 } }
            }
            MouseArea {
                id: handleMouse
                anchors.fill: parent
                hoverEnabled: true
                cursorShape: Qt.PointingHandCursor
                onClicked: root.closeLyrics()
                ToolTip.visible: containsMouse
                ToolTip.text: "收起歌词"
            }
        }

        Row {
            anchors.right: parent.right
            anchors.verticalCenter: parent.verticalCenter
            spacing: 10

            ToolbarPill {
                pillWidth: root.pureMode ? 96 : 112
                iconName: root.pureMode ? "columns" : "align-left"
                label: root.pureMode ? "双栏模式" : "纯歌词全屏"
                iconColor: root.pureMode ? "#f472b6" : "#22d3ee"
                tip: root.pureMode ? "双栏模式" : "纯歌词模式"
                onClicked: root.pureMode = !root.pureMode
            }
            ToolbarPill {
                pillWidth: bridge.windowFullscreen ? 116 : 101
                iconName: bridge.windowFullscreen ? "minimize-2" : "maximize"
                label: bridge.windowFullscreen ? "取消全屏覆盖" : "全屏覆盖"
                iconColor: "#34d399"
                active: bridge.windowFullscreen
                tip: bridge.windowFullscreen ? "退出全屏" : "全屏"
                onClicked: bridge.window_toggle_fullscreen()
            }
            ToolbarPill {
                pillWidth: 76
                iconName: "x"
                label: "关闭"
                tip: "关闭歌词"
                onClicked: root.closeLyrics()
            }
        }
    }

    Item {
        id: contentFrame
        anchors.top: toolbar.bottom
        anchors.bottom: parent.bottom
        anchors.horizontalCenter: parent.horizontalCenter
        anchors.topMargin: 0
        anchors.bottomMargin: 8
        width: root.pureMode ? Math.min(parent.width - 48, 960) : Math.min(parent.width - 64, 1440)

        RowLayout {
            anchors.fill: parent
            spacing: root.pureMode ? 0 : Math.max(32, Math.min(80, (contentFrame.width - 600) * 0.08))

            Item {
                id: leftPane
                visible: !root.pureMode
                Layout.fillWidth: true
                Layout.preferredWidth: 1
                Layout.fillHeight: true

                ColumnLayout {
                    id: leftColumn
                    anchors.centerIn: parent
                    width: Math.min(leftPane.width - 32, 400)
                    spacing: 0

                    readonly property real availableH: leftPane.height
                    readonly property real dynamicCoverSize: Math.max(140, Math.min(width, availableH - 270, 360))

                    // 1. 唱片封面（大圆角、细腻微光边框与柔和弥散阴影）
                    Item {
                        id: coverStage
                        Layout.alignment: Qt.AlignHCenter
                        Layout.preferredWidth: Math.round(leftColumn.dynamicCoverSize)
                        Layout.preferredHeight: Math.round(leftColumn.dynamicCoverSize)
                        Layout.minimumWidth: Math.round(leftColumn.dynamicCoverSize)
                        Layout.maximumWidth: Math.round(leftColumn.dynamicCoverSize)
                        Layout.minimumHeight: Math.round(leftColumn.dynamicCoverSize)
                        Layout.maximumHeight: Math.round(leftColumn.dynamicCoverSize)
                        Layout.fillWidth: false
                        Layout.fillHeight: false
                        width: Math.round(leftColumn.dynamicCoverSize)
                        height: Math.round(leftColumn.dynamicCoverSize)

                        RoundedImage {
                            id: artwork
                            anchors.fill: parent
                            source: root.song.cover || ""
                            radius: 18
                            preferredSourceSize: 1024
                            cacheEnabled: true
                            fallbackColor: "#1affffff"
                            shadowEnabled: true
                            shadowColor: "#80000000"
                            shadowBlur: 0.78
                            shadowVerticalOffset: 12
                        }
                        Rectangle {
                            anchors.fill: parent
                            radius: 18
                            color: "transparent"
                            border.width: 1
                            border.color: "#28ffffff"
                        }
                        AppIcon {
                            anchors.centerIn: parent
                            visible: !root.song.cover
                            name: "music"
                            color: "#66ffffff"
                            width: 48
                            height: 48
                        }
                    }

                    // 2. 歌曲标题、歌手与右侧圆形毛玻璃收藏按钮
                    RowLayout {
                        Layout.fillWidth: true
                        Layout.topMargin: Math.max(6, Math.min(14, (leftColumn.availableH - 480) * 0.1))
                        spacing: 12

                        ColumnLayout {
                            Layout.fillWidth: true
                            spacing: 2

                            Text {
                                Layout.fillWidth: true
                                text: root.song.name || "未在播放"
                                color: "#ffffff"
                                font.pixelSize: leftColumn.availableH < 560 ? 18 : 22
                                font.weight: Font.ExtraBold
                                elide: Text.ElideRight
                            }
                            Text {
                                Layout.fillWidth: true
                                text: root.song.artist || "未知歌手"
                                color: "#b8c2cc"
                                font.pixelSize: leftColumn.availableH < 560 ? 12 : 14
                                font.weight: Font.Medium
                                elide: Text.ElideRight
                            }
                        }

                        Rectangle {
                            id: likeButton
                            width: 38
                            height: 38
                            radius: 19
                            color: heartMouse.containsMouse ? "#40ffffff" : "#24ffffff"
                            border.width: 1
                            border.color: "#30ffffff"
                            scale: heartMouse.pressed ? 0.92 : 1
                            Behavior on color { ColorAnimation { duration: 150 } }
                            Behavior on scale { NumberAnimation { duration: 120; easing.type: Easing.OutCubic } }

                            AppIcon {
                                anchors.centerIn: parent
                                name: "heart"
                                color: (root.song.isLiked || (root.song.id && bridge.isFavorite(root.song.id))) ? "#fb4b72" : "white"
                                fillColor: (root.song.isLiked || (root.song.id && bridge.isFavorite(root.song.id))) ? "#fb4b72" : "none"
                                width: 18
                                height: 18
                                strokeWidth: 2
                            }
                            MouseArea {
                                id: heartMouse
                                anchors.fill: parent
                                hoverEnabled: true
                                cursorShape: Qt.PointingHandCursor
                                onClicked: if (root.song.id) bridge.toggle_like(root.song.id)
                            }
                        }
                    }

                    // 3. 进度条（带发光圆点滑块）
                    Item {
                        id: progressTrackContainer
                        Layout.fillWidth: true
                        Layout.preferredHeight: 16
                        Layout.topMargin: Math.max(6, Math.min(12, (leftColumn.availableH - 480) * 0.1))

                        Rectangle {
                            id: progressTrack
                            anchors.verticalCenter: parent.verticalCenter
                            width: parent.width
                            height: 4
                            radius: 2
                            color: "#33ffffff"
                            property real scrubFraction: -1
                            readonly property real displayFraction: bridge.durationMs > 0 ? (scrubFraction >= 0 ? scrubFraction : Math.min(1, bridge.positionMs / bridge.durationMs)) : 0

                            Rectangle {
                                height: parent.height
                                radius: 2
                                color: "#ffffff"
                                width: parent.width * progressTrack.displayFraction
                            }

                            Rectangle {
                                id: progressThumb
                                width: 10
                                height: 10
                                radius: 5
                                color: "#ffffff"
                                anchors.verticalCenter: parent.verticalCenter
                                x: Math.max(0, Math.min(parent.width - width, parent.width * progressTrack.displayFraction - width / 2))
                                layer.enabled: true
                                layer.effect: MultiEffect {
                                    shadowEnabled: true
                                    shadowColor: "#60000000"
                                    shadowBlur: 0.40
                                    blurMax: 8
                                }
                            }
                        }

                        MouseArea {
                            anchors.fill: parent
                            cursorShape: Qt.PointingHandCursor
                            onPressed: progressTrack.scrubFraction = Math.max(0, Math.min(1, mouseX / width))
                            onPositionChanged: if (pressed) progressTrack.scrubFraction = Math.max(0, Math.min(1, mouseX / width))
                            onReleased: {
                                if (bridge.durationMs > 0 && progressTrack.scrubFraction >= 0)
                                    bridge.seek(Math.round(progressTrack.scrubFraction * bridge.durationMs))
                                progressTrack.scrubFraction = -1
                            }
                            onCanceled: progressTrack.scrubFraction = -1
                        }
                    }

                    // 4. 时间指示
                    RowLayout {
                        Layout.fillWidth: true
                        Layout.topMargin: 2
                        Text {
                            text: root.fmt(bridge.positionMs)
                            color: "#8a96a3"
                            font.pixelSize: 10
                            font.family: "Consolas"
                        }
                        Item { Layout.fillWidth: true }
                        Text {
                            text: root.fmt(bridge.durationMs)
                            color: "#8a96a3"
                            font.pixelSize: 10
                            font.family: "Consolas"
                        }
                    }

                    RowLayout {
                        Layout.alignment: Qt.AlignHCenter
                        Layout.topMargin: Math.max(8, Math.min(20, (leftColumn.availableH - 480) * 0.15))
                        spacing: 20
                        ControlIcon { iconName: "shuffle"; active: bridge.isShuffle; onClicked: bridge.toggle_shuffle() }
                        ControlIcon { iconName: "skip-back"; iconSize: 20; fill: "#f3f4f6"; onClicked: bridge.prev() }
                        Rectangle {
                            width: 44; height: 44; radius: 22
                            color: playMouse.containsMouse ? "#e8e9ec" : "white"
                            scale: playMouse.pressed ? 0.92 : playMouse.containsMouse ? 1.05 : 1
                            Behavior on scale { NumberAnimation { duration: 160; easing.type: Easing.OutBack } }
                            AppIcon { anchors.centerIn: parent; name: bridge.isPlaying ? "pause" : "play"; color: "#111827"; fillColor: "#111827"; width: 18; height: 18 }
                            MouseArea { id: playMouse; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; onClicked: bridge.toggle_play() }
                        }
                        ControlIcon { iconName: "skip-forward"; iconSize: 20; fill: "#f3f4f6"; onClicked: bridge.next() }
                        ControlIcon { iconName: bridge.repeatMode === "one" ? "repeat-1" : "repeat"; active: bridge.repeatMode !== "off"; onClicked: bridge.toggle_repeat() }
                    }

                    RowLayout {
                        Layout.fillWidth: true
                        Layout.topMargin: Math.max(4, Math.min(10, (leftColumn.availableH - 480) * 0.08))
                        spacing: 10
                        AppIcon {
                            Layout.preferredWidth: 14
                            Layout.preferredHeight: 14
                            name: bridge.muted || bridge.volume === 0 ? "volume-x" : "volume-2"
                            color: "#ffffff"
                            opacity: 0.60
                            MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: bridge.toggle_mute() }
                        }
                        Rectangle {
                            id: lyricVolumeTrack
                            Layout.fillWidth: true
                            Layout.preferredHeight: 5
                            radius: 3; color: "#38ffffff"
                            Rectangle { width: parent.width * (bridge.muted ? 0 : bridge.volume) / 100; height: parent.height; radius: 3; color: "white" }
                            Rectangle {
                                width: 12; height: 12; radius: 6
                                anchors.verticalCenter: parent.verticalCenter
                                x: Math.max(0, Math.min(parent.width - width, parent.width * (bridge.muted ? 0 : bridge.volume) / 100 - width / 2))
                                color: "white"
                            }
                            MouseArea {
                                anchors.fill: parent
                                onPressed: update(mouseX)
                                onPositionChanged: if (pressed) update(mouseX)
                                function update(value) { bridge.set_volume(Math.round(Math.max(0, Math.min(1, value / width)) * 100)) }
                            }
                        }
                        AppIcon {
                            Layout.preferredWidth: 14
                            Layout.preferredHeight: 14
                            name: "volume-2"
                            color: "#ffffff"
                            opacity: 0.40
                        }
                    }

                    // 歌词快慢偏移微调滑块
                    RowLayout {
                        Layout.fillWidth: true
                        Layout.topMargin: Math.max(4, Math.min(8, (leftColumn.availableH - 480) * 0.08))
                        spacing: 8
                        AppIcon {
                            Layout.preferredWidth: 13
                            Layout.preferredHeight: 13
                            name: "clock"
                            color: "#ffffff"
                            opacity: 0.65
                        }
                        Text {
                            text: "歌词微调"
                            color: "#d7dbe2"
                            font.pixelSize: 11
                            font.weight: Font.Medium
                        }
                        Rectangle {
                            id: offsetTrack
                            Layout.fillWidth: true
                            Layout.preferredHeight: 5
                            radius: 3
                            color: "#38ffffff"

                            // 中间 0ms 基准线
                            Rectangle {
                                anchors.horizontalCenter: parent.horizontalCenter
                                width: 1.5; height: 7
                                anchors.verticalCenter: parent.verticalCenter
                                color: "#60ffffff"
                            }

                            Rectangle {
                                id: offsetThumb
                                width: 11; height: 11; radius: 5.5
                                anchors.verticalCenter: parent.verticalCenter
                                color: bridge.lyricOffset !== 0 ? "#fb7185" : "#ffffff"
                                x: Math.max(0, Math.min(parent.width - width, (bridge.lyricOffset + 2000) / 4000 * (parent.width - width)))
                                layer.enabled: true
                                layer.effect: MultiEffect {
                                    shadowEnabled: true
                                    shadowColor: "#60000000"
                                    shadowBlur: 0.35
                                    blurMax: 6
                                }
                            }

                            MouseArea {
                                anchors.fill: parent
                                cursorShape: Qt.PointingHandCursor
                                onDoubleClicked: bridge.set_lyric_offset(0)
                                onPressed: update(mouseX)
                                onPositionChanged: if (pressed) update(mouseX)
                                function update(xValue) {
                                    var ratio = Math.max(0, Math.min(1, xValue / width))
                                    bridge.set_lyric_offset(Math.round((ratio - 0.5) * 4000))
                                }
                            }
                        }
                        Rectangle {
                            Layout.preferredWidth: 52
                            Layout.preferredHeight: 20
                            radius: 10
                            color: bridge.lyricOffset !== 0 ? "#33fb7185" : "#18ffffff"
                            border.width: 1
                            border.color: bridge.lyricOffset !== 0 ? "#55fb7185" : "#20ffffff"

                            Text {
                                anchors.centerIn: parent
                                text: (bridge.lyricOffset > 0 ? "+" : "") + bridge.lyricOffset + "ms"
                                color: bridge.lyricOffset !== 0 ? "#fb7185" : "#d1d5db"
                                font.pixelSize: 10
                                font.family: "Consolas"
                                font.bold: bridge.lyricOffset !== 0
                            }

                            MouseArea {
                                anchors.fill: parent
                                cursorShape: Qt.PointingHandCursor
                                onClicked: bridge.set_lyric_offset(0)
                            }
                        }
                    }

                    // 逐字歌词开关
                    RowLayout {
                        Layout.fillWidth: true
                        Layout.topMargin: Math.max(4, Math.min(8, (leftColumn.availableH - 480) * 0.08))
                        spacing: 8
                        AppIcon { Layout.preferredWidth: 13; Layout.preferredHeight: 13; name: "sparkles"; color: "#ffffff"; opacity: 0.60 }
                        Text { text: "逐字歌词"; color: "#d7dbe2"; font.pixelSize: 11 }
                        Text { Layout.fillWidth: true; text: "仅支持逐字数据的歌曲生效"; color: "#5faeb4c0"; font.pixelSize: 9; elide: Text.ElideRight }
                        Rectangle {
                            id: karaokeToggle
                            Layout.preferredWidth: 32; Layout.preferredHeight: 18; radius: 9
                            color: (root.preferences.enableKaraoke !== false) ? "#e8ffffff" : "#33ffffff"
                            Rectangle {
                                anchors.verticalCenter: parent.verticalCenter
                                width: 14; height: 14; radius: 7
                                x: (root.preferences.enableKaraoke !== false) ? parent.width - width - 2 : 2
                                color: (root.preferences.enableKaraoke !== false) ? "#111827" : "#e8ffffff"
                                Behavior on x { NumberAnimation { duration: 160; easing.type: Easing.OutCubic } }
                            }
                            MouseArea {
                                anchors.fill: parent
                                onClicked: bridge.set_setting("enableKaraoke", !(root.preferences.enableKaraoke !== false))
                            }
                        }
                    }
                }
            }

            LyricsView {
                id: lyricView
                Layout.fillWidth: true
                Layout.preferredWidth: 1
                Layout.fillHeight: true
                Layout.leftMargin: root.pureMode ? 48 : 0
                Layout.rightMargin: root.pureMode ? 48 : 0
                activeView: bridge.fullLyrics
                lyricLines: root.lyricLines
                activeIndex: bridge.activeIndex
                pureMode: root.pureMode
                lyricGlow: root.preferences.lyricGlow !== false
                lyricBlur: root.preferences.lyricBlur !== false
                lyricZoom: root.preferences.lyricZoom !== false
                lyricFade: root.preferences.lyricFade !== false
                lyricStagger: root.preferences.lyricStagger !== false
                lyricAnimation: root.preferences.lyricAnimation !== false
                enableKaraoke: root.preferences.enableKaraoke !== false
                karaokeAnimation: root.preferences.karaokeAnimation === "float" ? "float" : "slide"
                lyricOffsetMs: bridge.lyricOffset
                fontSize: root.preferences.lyricFontSize === "large" ? "large" : "normal"
            }
        }
    }

    ParallelAnimation {
        id: coverEntrance
        NumberAnimation { target: artwork; property: "scale"; from: 0.92; to: 1; duration: 800; easing.type: Easing.BezierSpline; easing.bezierCurve: [0.16, 1, 0.3, 1, 1, 1] }
        NumberAnimation { target: artwork; property: "opacity"; from: 0; to: 1; duration: 650; easing.type: Easing.BezierSpline; easing.bezierCurve: [0.16, 1, 0.3, 1, 1, 1] }
    }

    Connections {
        target: bridge
        function onFullLyricsChanged(open) {
            // 打开全屏歌词时瞬时重排一次：隐藏期间跳过的逐字/换行高度变化
            // 会在这一帧全部校正，避免出现歌词挤在一起的陈旧布局。
            if (open) {
                lyricView.refreshLayout()
                if (root.preferences.artworkAnimation !== false)
                    coverEntrance.restart()
            }
        }
    }

    component GlassButton: Rectangle {
        id: glass
        property string iconName: "x"
        property string tip: ""
        property color foreground: "#f4f5f7"
        property string fill: "none"
        property int buttonSize: 44
        signal clicked()
        width: buttonSize
        height: buttonSize
        radius: buttonSize / 2
        color: glassMouse.containsMouse ? "#40ffffff" : "#1affffff"
        border.color: "#1fffffff"
        scale: glassMouse.pressed ? 0.92 : 1
        Behavior on color { ColorAnimation { duration: 160 } }
        Behavior on scale { NumberAnimation { duration: 130; easing.type: Easing.OutCubic } }
        AppIcon { anchors.centerIn: parent; name: glass.iconName; color: glass.foreground; fillColor: glass.fill; width: 24; height: 24; strokeWidth: 2 }
        MouseArea {
            id: glassMouse
            anchors.fill: parent
            hoverEnabled: true
            cursorShape: Qt.PointingHandCursor
            onClicked: glass.clicked()
            ToolTip.visible: containsMouse
            ToolTip.text: glass.tip
            ToolTip.delay: 350
        }
    }

    component ToolbarPill: Rectangle {
        id: pill
        property string iconName: "x"
        property string label: ""
        property string tip: ""
        property color iconColor: "#aeb5c2"
        property int pillWidth: 90
        property bool active: false
        signal clicked()
        width: pillWidth; height: 34; radius: 17
        color: active ? "#e11d48" : pillMouse.containsMouse ? "#34ffffff" : "#1affffff"
        border.color: active ? "#e11d48" : "#24ffffff"
        scale: pillMouse.pressed ? 0.95 : pillMouse.containsMouse ? 1.035 : 1
        Behavior on color { ColorAnimation { duration: 160 } }
        Behavior on scale { NumberAnimation { duration: 150; easing.type: Easing.OutBack } }
        RowLayout {
            anchors.centerIn: parent; spacing: 6
            AppIcon { name: pill.iconName; color: pill.active ? "white" : pill.iconColor; width: 16; height: 16; strokeWidth: 2 }
            Text { text: pill.label; color: "#e9ebf0"; font.pixelSize: 12; font.bold: true }
        }
        MouseArea {
            id: pillMouse; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor
            onClicked: pill.clicked(); ToolTip.visible: containsMouse; ToolTip.text: pill.tip; ToolTip.delay: 350
        }
    }

    component ControlIcon: Item {
        id: control
        property string iconName
        property string fill: "none"
        property bool active: false
        property int iconSize: 18
        signal clicked()
        width: 34; height: 34
        scale: controlMouse.pressed ? 0.88 : controlMouse.containsMouse ? 1.08 : 1
        Behavior on scale { NumberAnimation { duration: 140; easing.type: Easing.OutBack } }
        AppIcon { anchors.centerIn: parent; name: control.iconName; color: control.active ? "#fb7185" : "#e3e6ec"; fillColor: control.fill; width: control.iconSize; height: control.iconSize }
        MouseArea { id: controlMouse; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; onClicked: control.clicked() }
    }
}
