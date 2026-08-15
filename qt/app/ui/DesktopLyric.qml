// 桌面歌词悬浮窗：当前/下一行、播放控制、锁定与拖动工具栏。
import QtQuick
import QtQuick.Layouts
import QtQuick.Window

Window {
    id: root
    width: 860
    height: 176
    minimumWidth: 560
    minimumHeight: 130
    maximumWidth: 1200
    maximumHeight: 260
    flags: Qt.FramelessWindowHint | Qt.WindowStaysOnTopHint | Qt.Tool
    color: "transparent"
    visible: false
    x: Math.round((Screen.width - width) / 2)
    y: Screen.height - height - 86

    readonly property var lyricLines: bridge.lyricsModel
    property int activeIndex: bridge.activeIndex
    property var song: bridge.currentSong
    property var preferences: bridge.settings
    property bool isPlaying: bridge.isPlaying
    property bool locked: preferences.desktopLyricLocked === true
    property int paletteIndex: Math.max(0, Math.min(3, Number(preferences.desktopLyricColor || 0)))
    property var primaryColors: ["#ffffff", "#fde68a", "#a7f3d0", "#bfdbfe"]
    property var secondaryColors: ["#8fffffff", "#c8fef3c7", "#c8d1fae5", "#c8dbeafe"]
    property var panelColors: ["#99121620", "#a3362715", "#a30b2d2a", "#a30c2340"]
    property int primaryFontSize: preferences.desktopLyricFontSize === "large" ? 31 : preferences.desktopLyricFontSize === "small" ? 21 : 25
    property string currentText: activeIndex >= 0 && activeIndex < lyricLines.count ? lyricLines.get(activeIndex).text : (song.name ? song.name : "Beta Music Player")
    property string nextText: activeIndex >= 0 && activeIndex < lyricLines.count && lyricLines.get(activeIndex).translation ? lyricLines.get(activeIndex).translation : (activeIndex >= 0 && activeIndex + 1 < lyricLines.count ? lyricLines.get(activeIndex + 1).text : (song.artist || "桌面歌词"))

    Rectangle {
        anchors.fill: parent
        anchors.margins: 7
        radius: 24
        color: hover.containsMouse && !root.locked ? Qt.lighter(root.panelColors[root.paletteIndex], 1.18) : root.panelColors[root.paletteIndex]
        border.color: hover.containsMouse && !root.locked ? "#35ffffff" : "#16ffffff"

        Rectangle { anchors.fill: parent; anchors.margins: 1; radius: 23; color: "transparent"; border.color: "#10fb7185" }

        MouseArea {
            id: hover
            anchors.fill: parent
            hoverEnabled: true
            enabled: !root.locked
            onPressed: root.startSystemMove()
        }

        ColumnLayout {
            anchors.fill: parent
            anchors.leftMargin: 26
            anchors.rightMargin: 26
            anchors.topMargin: 13
            anchors.bottomMargin: 13
            spacing: 5

            RowLayout {
                Layout.fillWidth: true
                Layout.preferredHeight: 25
                opacity: hover.containsMouse && !root.locked ? 1 : 0.28
                Behavior on opacity { NumberAnimation { duration: 160 } }
                RowLayout { Layout.fillWidth: true; spacing: 7; Rectangle { width: 7; height: 7; radius: 4; color: "#fb4b72" } Text { text: root.song.name || "Beta Music Player"; color: "#aeb5c2"; font.pixelSize: 9; font.bold: true; elide: Text.ElideRight } }
                AppIcon { name: "skip-back"; color: "#c7ccd5"; fillColor: "#c7ccd5"; width: 13; height: 13; MouseArea { anchors.fill: parent; onClicked: bridge.prev() } }
                Rectangle { width: 26; height: 26; radius: 13; color: "#22ffffff"; AppIcon { anchors.centerIn: parent; name: root.isPlaying ? "pause" : "play"; color: "white"; fillColor: "white"; width: 11; height: 11 } MouseArea { anchors.fill: parent; onClicked: bridge.toggle_play() } }
                AppIcon { name: "skip-forward"; color: "#c7ccd5"; fillColor: "#c7ccd5"; width: 13; height: 13; MouseArea { anchors.fill: parent; onClicked: bridge.next() } }
                AppIcon { name: "palette"; color: "#c7ccd5"; width: 13; height: 13; MouseArea { anchors.fill: parent; onClicked: bridge.set_setting_value("desktopLyricColor", (root.paletteIndex + 1) % 4) } }
                AppIcon { name: "type"; color: "#c7ccd5"; width: 13; height: 13; MouseArea { anchors.fill: parent; onClicked: bridge.set_setting_value("desktopLyricFontSize", root.preferences.desktopLyricFontSize === "small" ? "normal" : root.preferences.desktopLyricFontSize === "large" ? "small" : "large") } }
                AppIcon { name: root.locked ? "lock" : "unlock"; color: "#c7ccd5"; width: 13; height: 13; MouseArea { anchors.fill: parent; onClicked: { root.locked = !root.locked; bridge.set_desktop_lyric_locked(root.locked) } } }
                AppIcon { name: "x"; color: "#c7ccd5"; width: 17; height: 17; MouseArea { anchors.fill: parent; onClicked: bridge.toggle_desktop_lyric() } }
            }

            Text {
                Layout.fillWidth: true
                text: root.currentText
                color: root.primaryColors[root.paletteIndex]
                font.pixelSize: root.primaryFontSize
                font.bold: true
                horizontalAlignment: Text.AlignHCenter
                elide: Text.ElideRight
                style: Text.Raised
                styleColor: "#80000000"
            }
            Text {
                Layout.fillWidth: true
                text: root.nextText
                color: root.secondaryColors[root.paletteIndex]
                font.pixelSize: Math.max(13, root.primaryFontSize - 10)
                horizontalAlignment: Text.AlignHCenter
                elide: Text.ElideRight
            }
        }
    }

    Component.onCompleted: if (root.locked) bridge.set_desktop_lyric_locked(true)
}
