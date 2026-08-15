import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

Item {
    id: root
    function duration(value) {
        var seconds = Math.floor(value || 0)
        return Math.floor(seconds / 60) + ":" + ((seconds % 60) < 10 ? "0" : "") + (seconds % 60)
    }

    ColumnLayout {
        anchors.fill: parent
        anchors.topMargin: 24
        spacing: 20

        RowLayout {
            Layout.fillWidth: true
            spacing: 12
            ColumnLayout {
                Layout.preferredWidth: 310
                Layout.maximumWidth: 420
                spacing: 4
                Text { Layout.fillWidth: true; text: "本地音乐资料库"; color: "#253044"; font.pixelSize: 25; font.bold: true; elide: Text.ElideRight }
                Text { Layout.fillWidth: true; text: "共 " + bridge.localSongsModel.count + " 首歌曲 · 支持 ID3 标签、专辑封面和同名 LRC"; color: "#7d8796"; font.pixelSize: 11; elide: Text.ElideRight }
            }
            Item { Layout.fillWidth: true }
            RowLayout {
                Layout.alignment: Qt.AlignRight | Qt.AlignVCenter
                spacing: 10
                HeaderButton { text: "选择文件夹"; iconName: "folder-plus"; Layout.preferredWidth: 112; onClicked: bridge.import_local_folder() }
                HeaderButton { text: "导入本地音频"; iconName: "upload"; Layout.preferredWidth: 128; accent: true; onClicked: bridge.import_local_files() }
            }
        }

        Rectangle {
            Layout.fillWidth: true
            Layout.preferredHeight: 148
            radius: 17
            property bool hovered: dropMouse.containsMouse || fileDrop.containsDrag
            color: hovered ? "#b8ffffff" : "#66ffffff"
            border.color: hovered ? "#80ff2d55" : "#3b1f2937"
            border.width: 2
            scale: dropMouse.pressed ? 0.995 : 1
            Behavior on color { ColorAnimation { duration: 180 } }
            Behavior on border.color { ColorAnimation { duration: 180 } }
            Behavior on scale { NumberAnimation { duration: 130; easing.type: Easing.OutCubic } }
            ColumnLayout {
                anchors.centerIn: parent
                spacing: 7
                Rectangle {
                    width: 47; height: 47; radius: 24; color: "#1aff2d55"
                    AppIcon { anchors.centerIn: parent; name: "upload"; color: "#ff2d55"; width: 24; height: 24 }
                }
                Text { text: "拖放音频文件或文件夹到此处直接导入"; color: "#253044"; font.pixelSize: 14; font.bold: true; Layout.alignment: Qt.AlignHCenter }
                Text { text: "支持 MP3、FLAC、WAV、M4A、AAC、OGG、OPUS"; color: "#929aa7"; font.pixelSize: 11; Layout.alignment: Qt.AlignHCenter }
            }
            DropArea { id: fileDrop; anchors.fill: parent; onDropped: bridge.import_local_paths(drop.urls) }
            MouseArea { id: dropMouse; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; onClicked: bridge.import_local_files() }
        }

        Rectangle {
            Layout.fillWidth: true
            Layout.fillHeight: true
            radius: 17
            color: "#b8ffffff"
            border.color: "#141f2937"
            clip: true
            ColumnLayout {
                anchors.fill: parent
                spacing: 0
                Rectangle {
                    Layout.fillWidth: true; Layout.preferredHeight: 43; color: "#0d1f2937"
                    RowLayout {
                        anchors.fill: parent; anchors.leftMargin: 18; anchors.rightMargin: 18; spacing: 0
                        Head { text: "#"; Layout.preferredWidth: 48; horizontalAlignment: Text.AlignHCenter }
                        Head { text: "标题"; Layout.fillWidth: true }
                        Head { text: "歌手"; Layout.preferredWidth: 150 }
                        Head { text: "专辑"; Layout.preferredWidth: 170 }
                        Head { text: "时长"; Layout.preferredWidth: 54; horizontalAlignment: Text.AlignRight }
                        Head { text: "操作"; Layout.preferredWidth: 60; horizontalAlignment: Text.AlignHCenter }
                    }
                }
                ListView {
                    id: list
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    clip: true
                    model: bridge.localSongsModel
                    reuseItems: true
                    ScrollBar.vertical: AppScrollBar {}
                    delegate: Rectangle {
                        required property int index
                        required property string itemId
                        required property string name
                        required property string artist
                        required property string album
                        required property string cover
                        required property int duration
                        width: list.width
                        height: 62
                        color: rowMouse.containsMouse ? "#66ffffff" : "transparent"
                        Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 1; color: "#0a1f2937" }
                        RowLayout {
                            anchors.fill: parent; anchors.leftMargin: 18; anchors.rightMargin: 18; spacing: 0
                            Text { text: index + 1; color: "#a1a8b4"; font.pixelSize: 11; Layout.preferredWidth: 48; horizontalAlignment: Text.AlignHCenter }
                            RowLayout {
                                Layout.fillWidth: true; spacing: 11
                                RoundedImage { width: 38; height: 38; source: cover; radius: 7; preferredSourceSize: 160 }
                                Text { Layout.fillWidth: true; text: name; color: "#253044"; font.pixelSize: 12; font.bold: true; elide: Text.ElideRight }
                            }
                            Text { text: artist; color: "#697486"; font.pixelSize: 11; Layout.preferredWidth: 150; elide: Text.ElideRight }
                            Text { text: album; color: "#929aa7"; font.pixelSize: 11; Layout.preferredWidth: 170; elide: Text.ElideRight }
                            Text { text: root.duration(duration); color: "#929aa7"; font.pixelSize: 11; Layout.preferredWidth: 54; horizontalAlignment: Text.AlignRight }
                            Rectangle {
                                Layout.preferredWidth: 60; height: 30; color: "transparent"
                                AppIcon { anchors.centerIn: parent; name: "trash-2"; color: deleteMouse.containsMouse ? "#e11d48" : "#a1a8b4"; width: 15; height: 15 }
                                MouseArea { id: deleteMouse; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; onClicked: bridge.remove_local_song(itemId) }
                            }
                        }
                        MouseArea { id: rowMouse; anchors.fill: parent; anchors.rightMargin: 60; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; onDoubleClicked: bridge.play_local(index) }
                    }
                    Column {
                        anchors.centerIn: parent
                        visible: list.count === 0
                        spacing: 8
                        AppIcon { anchors.horizontalCenter: parent.horizontalCenter; name: "music"; color: "#c2c8d1"; width: 36; height: 36 }
                        Text { text: "暂无本地音乐，请选择、拖放文件或文件夹导入"; color: "#929aa7"; font.pixelSize: 12 }
                    }
                }
            }
        }
    }

    component Head: Text { color: "#929aa7"; font.pixelSize: 10; font.bold: true; font.letterSpacing: 1.0; elide: Text.ElideRight }
    component HeaderButton: Rectangle {
        id: button
        property string text: ""
        property string iconName: ""
        property bool accent: false
        signal clicked()
        Layout.preferredHeight: 33; radius: 17
        color: accent ? (mouse.containsMouse ? "#fa233b" : "#ff2d55") : mouse.containsMouse ? "#303a4b" : "#202837"
        scale: mouse.pressed ? 0.95 : mouse.containsMouse ? 1.025 : 1
        Behavior on color { ColorAnimation { duration: 150 } }
        Behavior on scale { NumberAnimation { duration: 140; easing.type: Easing.OutBack } }
        RowLayout { anchors.centerIn: parent; spacing: 7; AppIcon { name: button.iconName; color: "white"; Layout.preferredWidth: 14; Layout.preferredHeight: 14 } Text { text: button.text; color: "white"; font.pixelSize: 11; font.bold: true } }
        MouseArea { id: mouse; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; onClicked: button.clicked() }
    }
}
