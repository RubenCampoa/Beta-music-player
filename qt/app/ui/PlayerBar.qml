// 响应式底部播放器：在 960px 窄窗口和宽屏下都保持三段完整布局。
import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

Rectangle {
    id: bar
    width: parent ? parent.width : 1240
    property real uiScale: 1.0
    implicitHeight: 80
    height: implicitHeight
    // Keep the player visually continuous with the page surface. The 1px
    // divider above is the only boundary; a pure-white fill reads as a large
    // rectangular mask against the app's #f5f6f8 workspace.
    color: "#e6ffffff"
    border.width: 0

    Rectangle {
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.top: parent.top
        height: 1
        color: "#e1e4e8"
    }

    signal requestFullLyrics()
    signal requestDesktopLyric()
    property var song: bridge.currentSong
    property int position: bridge.positionMs
    property int duration: bridge.durationMs

    function fmt(ms) {
        var total = Math.max(0, Math.floor((ms || 0) / 1000))
        var minute = Math.floor(total / 60)
        var second = total % 60
        return (minute < 10 ? "0" + minute : minute) + ":" + (second < 10 ? "0" + second : second)
    }

    RowLayout {
        anchors.fill: parent
        anchors.leftMargin: 24
        anchors.rightMargin: 24
        spacing: 14

        RowLayout {
            Layout.fillWidth: true
            Layout.preferredWidth: bar.width * 0.23
            Layout.minimumWidth: 210
            spacing: 12

            Rectangle {
                width: Math.round(48 * bar.uiScale); height: width; radius: Math.round(8 * bar.uiScale)
                color: "#0d1f2937"; border.color: "#141f2937"
                RoundedImage { anchors.fill: parent; source: bar.song.cover || ""; radius: parent.radius; preferredSourceSize: 200 }
                AppIcon { anchors.centerIn: parent; name: "music"; color: "#9aa3af"; width: 20; height: 20; visible: !bar.song.cover }
                Rectangle { anchors.fill: parent; radius: parent.radius; antialiasing: true; color: coverMouse.containsMouse ? "#18000000" : "transparent" }
                AppIcon { anchors.centerIn: parent; visible: coverMouse.containsMouse; name: "quote"; color: "white"; width: 18; height: 18 }
                MouseArea {
                    id: coverMouse; anchors.fill: parent; hoverEnabled: true
                    onClicked: bridge.toggle_full_lyrics()
                    ToolTip.visible: containsMouse
                    ToolTip.text: "打开全屏歌词"
                }
            }

            Item {
                id: metadata
                Layout.fillWidth: true
                Layout.preferredHeight: 38
                Column {
                    anchors.left: parent.left
                    anchors.right: parent.right
                    anchors.verticalCenter: parent.verticalCenter
                    spacing: 3
                    Text { width: parent.width; text: bar.song.name || "未在播放"; color: metadataMouse.containsMouse ? "#111827" : "#263246"; font.pixelSize: Math.round(14 * bar.uiScale); font.bold: true; elide: Text.ElideRight }
                    Text { width: parent.width; visible: !!bar.song.artist; text: bar.song.artist || ""; color: metadataMouse.containsMouse ? "#657083" : "#8490a1"; font.pixelSize: Math.round(11 * bar.uiScale); elide: Text.ElideRight }
                }
                MouseArea {
                    id: metadataMouse
                    anchors.fill: parent
                    hoverEnabled: true
                    cursorShape: Qt.PointingHandCursor
                    onClicked: bar.requestFullLyrics()
                    ToolTip.visible: containsMouse
                    ToolTip.text: "打开全屏歌词"
                }
            }

            IconButton {
                iconName: "heart"
                iconFill: (bar.song.isLiked || (bar.song.id && bridge.isFavorite(bar.song.id))) ? "#e11d48" : "none"
                tip: (bar.song.isLiked || (bar.song.id && bridge.isFavorite(bar.song.id))) ? "取消收藏" : "收藏歌曲"
                foreground: (bar.song.isLiked || (bar.song.id && bridge.isFavorite(bar.song.id))) ? "#e11d48" : "#8b96a6"
                onClicked: if (bar.song.id) bridge.toggle_like(bar.song.id)
            }
        }

        ColumnLayout {
            Layout.fillWidth: true
            Layout.preferredWidth: bar.width * 0.54
            Layout.minimumWidth: 330
            spacing: 6

            RowLayout {
                Layout.alignment: Qt.AlignHCenter
                spacing: 10
                IconButton { size: Math.round(32 * bar.uiScale); iconName: "shuffle"; tip: "随机播放"; foreground: bridge.isShuffle ? "#e11d48" : "#687486"; onClicked: bridge.toggle_shuffle() }
                IconButton { size: Math.round(34 * bar.uiScale); iconName: "skip-back"; iconFill: "#526075"; tip: "上一首"; foreground: "#526075"; onClicked: bridge.prev() }
                Rectangle {
                    id: playButton
                    width: Math.round(40 * bar.uiScale); height: width; radius: width / 2; color: playMouse.containsMouse ? "#f4f5f7" : "white"; border.color: "#201f2937"
                    scale: playMouse.pressed ? 0.9 : playMouse.containsMouse ? 1.06 : 1
                    Behavior on color { ColorAnimation { duration: 150 } }
                    Behavior on scale { NumberAnimation { duration: 150; easing.type: Easing.OutBack } }
                    AppIcon { anchors.centerIn: parent; name: bridge.isPlaying ? "pause" : "play"; color: "#18202d"; fillColor: "#18202d"; width: 18; height: 18 }
                    MouseArea { id: playMouse; anchors.fill: parent; hoverEnabled: true; onClicked: bridge.toggle_play(); ToolTip.visible: containsMouse; ToolTip.text: bridge.isPlaying ? "暂停" : "播放" }
                }
                IconButton { size: Math.round(34 * bar.uiScale); iconName: "skip-forward"; iconFill: "#526075"; tip: "下一首"; foreground: "#526075"; onClicked: bridge.next() }
                IconButton { size: Math.round(32 * bar.uiScale); iconName: bridge.repeatMode === "one" ? "repeat-1" : "repeat"; tip: "单曲/循环"; foreground: bridge.repeatMode !== "off" ? "#e11d48" : "#687486"; onClicked: bridge.toggle_repeat() }
            }

            RowLayout {
                Layout.fillWidth: true; spacing: 8
                Text { text: bar.fmt(bar.position); color: "#8d98a8"; font.pixelSize: Math.round(10 * bar.uiScale); font.family: "Consolas"; Layout.preferredWidth: Math.round(34 * bar.uiScale) }
                Rectangle {
                    id: progressTrack
                    Layout.fillWidth: true; height: 6; radius: 3; color: "#241f2937"
                    property real scrubFraction: -1
                    readonly property real displayFraction: bar.duration > 0 ? (scrubFraction >= 0 ? scrubFraction : Math.min(1, bar.position / bar.duration)) : 0
                    Rectangle { width: parent.width * progressTrack.displayFraction; height: parent.height; radius: 3; color: "#526075"; Behavior on width { enabled: progressTrack.scrubFraction < 0; NumberAnimation { duration: 150; easing.type: Easing.OutCubic } } }
                    Rectangle { visible: progressMouse.containsMouse; width: 10; height: 10; radius: 5; x: Math.max(0, Math.min(parent.width - width, parent.width * progressTrack.displayFraction - width / 2)); anchors.verticalCenter: parent.verticalCenter; color: "#374151" }
                    MouseArea {
                        id: progressMouse; anchors.fill: parent; hoverEnabled: true
                        onPressed: progressTrack.scrubFraction = Math.max(0, Math.min(1, mouseX / width))
                        onPositionChanged: if (pressed) progressTrack.scrubFraction = Math.max(0, Math.min(1, mouseX / width))
                        onReleased: { if (bar.duration > 0 && progressTrack.scrubFraction >= 0) bridge.seek(Math.round(progressTrack.scrubFraction * bar.duration)); progressTrack.scrubFraction = -1 }
                        onCanceled: progressTrack.scrubFraction = -1
                    }
                }
                Text { text: bar.fmt(bar.duration); color: "#8d98a8"; font.pixelSize: Math.round(10 * bar.uiScale); font.family: "Consolas"; Layout.preferredWidth: Math.round(34 * bar.uiScale); horizontalAlignment: Text.AlignRight }
            }
        }

        RowLayout {
            Layout.fillWidth: true
            Layout.preferredWidth: bar.width * 0.23
            Layout.minimumWidth: 210
            Layout.alignment: Qt.AlignRight
            spacing: 5

            Item { Layout.fillWidth: true }
            IconButton { iconName: "list-music"; tip: "播放队列"; onClicked: bridge.toggle_queue_drawer() }
            IconButton { iconName: "monitor"; tip: "桌面歌词"; foreground: bridge.desktopLyricActive ? "#e11d48" : "#667386"; onClicked: bridge.toggle_desktop_lyric() }
            // 与原版一致：进入沉浸歌词由左侧封面/歌曲信息触发；
            // 右侧粉色按钮只表示全屏歌词动效，不承担页面跳转。
            IconButton { size: Math.round(34 * bar.uiScale); iconName: "quote"; tip: "全屏歌词动效"; foreground: "#667386"; onClicked: {} }
            Item { width: 3 }
            AppIcon { name: bridge.muted || bridge.volume === 0 ? "volume-x" : "volume-2"; color: "#6f7b8c"; width: 16; height: 16; MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: bridge.toggle_mute() } }
            Rectangle {
                id: volumeTrack
                Layout.preferredWidth: bar.width < 1050 ? 58 : 82
                height: 5; radius: 3; color: "#241f2937"
                Rectangle { width: parent.width * (bridge.muted ? 0 : bridge.volume) / 100; height: parent.height; radius: 3; color: "#374151" }
                Rectangle { width: 10; height: 10; radius: 5; anchors.verticalCenter: parent.verticalCenter; x: Math.max(0, Math.min(parent.width - width, parent.width * (bridge.muted ? 0 : bridge.volume) / 100 - width / 2)); color: "#374151"; visible: volumeMouse.containsMouse }
                MouseArea {
                    id: volumeMouse; anchors.fill: parent; hoverEnabled: true
                    onPressed: updateVolume(mouseX)
                    onPositionChanged: if (pressed) updateVolume(mouseX)
                    function updateVolume(xValue) { bridge.set_volume(Math.round(Math.max(0, Math.min(1, xValue / width)) * 100)) }
                    ToolTip.visible: containsMouse
                    ToolTip.text: "音量 " + bridge.volume + "%"
                }
            }
        }
    }

    component IconButton: Rectangle {
        id: button
        property string label: ""
        property string iconName: ""
        property string iconFill: "none"
        property string tip: ""
        property int size: Math.round(34 * bar.uiScale)
        property color foreground: "#667386"
        property bool accent: false
        signal clicked()
        width: size; height: size; radius: size / 2
        scale: buttonMouse.pressed ? 0.9 : buttonMouse.containsMouse ? 1.08 : 1
        color: accent ? (buttonMouse.containsMouse ? "#e11d48" : "#16e11d48") : buttonMouse.containsMouse ? "#101f2937" : "transparent"
        border.color: accent ? "#40e11d48" : "transparent"
        Behavior on scale { NumberAnimation { duration: 150; easing.type: Easing.OutBack } }
        Behavior on color { ColorAnimation { duration: 150 } }
        AppIcon { anchors.centerIn: parent; visible: button.iconName.length > 0; name: button.iconName; color: button.accent && buttonMouse.containsMouse ? "white" : button.accent ? "#e11d48" : button.foreground; fillColor: button.iconFill; width: 17; height: 17; strokeWidth: 1.9 }
        Text { anchors.centerIn: parent; visible: button.iconName.length === 0; text: button.label; color: button.accent && buttonMouse.containsMouse ? "white" : button.accent ? "#e11d48" : button.foreground; font.pixelSize: Math.round((button.label.length > 1 ? 11 : 16) * bar.uiScale); font.bold: button.accent }
        MouseArea {
            id: buttonMouse; anchors.fill: parent; hoverEnabled: true; onClicked: button.clicked()
            ToolTip.visible: containsMouse
            ToolTip.text: button.tip
            ToolTip.delay: 350
        }
    }
}
