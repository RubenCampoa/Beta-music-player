// 原版播放队列：全屏暗色遮罩 + 右侧毛玻璃抽屉。
import QtQuick
import QtQuick.Layouts

Item {
    id: root
    width: parent ? parent.width : 1240
    readonly property var queue: bridge.queueModel
    property var currentSong: bridge.currentSong

    function duration(seconds) {
        var value = Math.floor(seconds || 0)
        return Math.floor(value / 60) + ":" + ((value % 60) < 10 ? "0" : "") + (value % 60)
    }

    Rectangle {
        anchors.fill: parent
        color: "#66000000"
        MouseArea { anchors.fill: parent; onClicked: bridge.toggle_queue_drawer() }
    }

    Rectangle {
        id: panel
        width: 384
        anchors.right: parent.right
        anchors.top: parent.top
        anchors.bottom: parent.bottom
        color: "#f212141d"
        border.color: "#1affffff"

        ColumnLayout {
            anchors.fill: parent
            spacing: 0

            Rectangle {
                Layout.fillWidth: true
                Layout.preferredHeight: 72
                color: "transparent"
                border.color: "#16ffffff"

                RowLayout {
                    anchors.fill: parent
                    anchors.leftMargin: 20
                    anchors.rightMargin: 20
                    spacing: 10
                    AppIcon { name: "list-music"; color: "#fb7185"; width: 22; height: 22 }
                    Text {
                        Layout.fillWidth: true
                        text: "播放队列 (" + root.queue.count + ")"
                        color: "white"
                        font.pixelSize: 16
                        font.bold: true
                    }
                    Text {
                        visible: root.queue.count > 0
                        text: "清空"
                        color: clearArea.containsMouse ? "#fb7185" : "#8f98aa"
                        font.pixelSize: 11
                        MouseArea { id: clearArea; anchors.fill: parent; hoverEnabled: true; onClicked: bridge.clear_queue() }
                    }
                    Rectangle {
                        width: 30; height: 30; radius: 15
                        color: closeArea.containsMouse ? "#30ffffff" : "#18ffffff"
                        Text { anchors.centerIn: parent; text: "×"; color: "#d9dce5"; font.pixelSize: 18 }
                        MouseArea { id: closeArea; anchors.fill: parent; hoverEnabled: true; onClicked: bridge.toggle_queue_drawer() }
                    }
                }
            }

            ListView {
                id: queueList
                Layout.fillWidth: true
                Layout.fillHeight: true
                Layout.margins: 16
                spacing: 8
                clip: true
                model: root.queue
                reuseItems: true

                delegate: Rectangle {
                    id: row
                    required property var item
                    property bool current: root.currentSong.id && root.currentSong.id === item.id
                    width: queueList.width
                    height: 62
                    radius: 13
                    color: current ? "#26e11d48" : hover.containsMouse ? "#18ffffff" : "#0dffffff"
                    border.color: current ? "#55e11d48" : "#10ffffff"

                    RowLayout {
                        anchors.fill: parent
                        anchors.margins: 10
                        spacing: 11
                        Rectangle {
                            width: 42; height: 42; radius: 9; color: "#26303d"; clip: true
                            RoundedImage { anchors.fill: parent; source: item.cover || ""; radius: 8; preferredSourceSize: 160 }
                            Rectangle { anchors.fill: parent; visible: row.current; color: "#66000000" }
                            Text { anchors.centerIn: parent; visible: row.current; text: bridge.isPlaying ? "▶" : "Ⅱ"; color: "#fb7185"; font.pixelSize: 14; font.bold: true }
                        }
                        ColumnLayout {
                            Layout.fillWidth: true
                            spacing: 3
                            Text { Layout.fillWidth: true; text: item.name || "未知曲目"; color: row.current ? "#fb7185" : "#edf0f5"; font.pixelSize: 12; font.bold: true; elide: Text.ElideRight }
                            Text { Layout.fillWidth: true; text: item.artist || "未知歌手"; color: "#80899a"; font.pixelSize: 10; elide: Text.ElideRight }
                        }
                        Text { text: root.duration(item.duration); color: "#697386"; font.pixelSize: 10; font.family: "Consolas" }
                        Text {
                            text: "⌫"
                            color: removeArea.containsMouse ? "#fb7185" : "#687285"
                            font.pixelSize: 14
                            MouseArea { id: removeArea; anchors.fill: parent; hoverEnabled: true; onClicked: bridge.remove_queue_index(index) }
                        }
                    }
                    MouseArea { id: hover; anchors.fill: parent; hoverEnabled: true; z: -1; onClicked: bridge.play_queue_index(index) }
                }

                ColumnLayout {
                    anchors.centerIn: parent
                    visible: queueList.count === 0
                    spacing: 8
                    Text { text: "♫"; color: "#3e4655"; font.pixelSize: 40; Layout.alignment: Qt.AlignHCenter }
                    Text { text: "队列暂无歌曲"; color: "#777f8f"; font.pixelSize: 12; font.bold: true; Layout.alignment: Qt.AlignHCenter }
                }
            }
        }
    }
}
