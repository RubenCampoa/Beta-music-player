// 歌单详情：单一滚动链、虚拟化完整曲目列表。
import QtQuick
import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

Item {
    id: root
    property var detail: bridge.playlistDetail
    readonly property var songs: bridge.songsModel

    function duration(value) {
        var seconds = Math.floor(value || 0)
        return Math.floor(seconds / 60) + ":" + ((seconds % 60) < 10 ? "0" : "") + (seconds % 60)
    }
    function accent() {
        return detail.source === "qq" ? "#059669" : detail.source === "kugou" ? "#0284c7" : "#e11d48"
    }

    Connections {
        target: root.songs
        function onModelReset() { list.positionViewAtBeginning() }
    }

    ListView {
        id: list
        anchors.fill: parent
        anchors.topMargin: 24
        clip: true
        model: root.songs
        spacing: 0
        reuseItems: true
        cacheBuffer: 610
        boundsBehavior: Flickable.StopAtBounds
        flickableDirection: Flickable.VerticalFlick
        maximumFlickVelocity: 4200
        flickDeceleration: 5200
        headerPositioning: ListView.InlineHeader
        ScrollBar.vertical: AppScrollBar {}

        onVisibleChanged: if (visible) positionViewAtBeginning()

        header: Item {
            width: list.width
            height: 268

            Rectangle {
                id: heroCard
                anchors.left: parent.left
                anchors.right: parent.right
                anchors.top: parent.top
                height: 206
                radius: 18
                color: "#b8ffffff"
                border.color: "#141f2937"

                RowLayout {
                    anchors.fill: parent
                    anchors.margins: 22
                    spacing: 22

                    RoundedImage {
                        Layout.preferredWidth: 158
                        Layout.preferredHeight: 158
                        radius: 14
                        source: root.detail.cover || ""
                        preferredSourceSize: 420
                        fallbackColor: "#e2e6ec"
                        AppIcon {
                            anchors.centerIn: parent
                            visible: !root.detail.cover
                            name: "music"
                            color: "#a1a8b4"
                            width: 42
                            height: 42
                        }
                    }

                    ColumnLayout {
                        Layout.fillWidth: true
                        spacing: 9

                        RowLayout {
                            spacing: 7
                            AppIcon {
                                name: "list-music"
                                color: root.accent()
                                Layout.preferredWidth: 16
                                Layout.preferredHeight: 16
                            }
                            Text {
                                text: (root.detail.source || "NETEASE").toUpperCase() + " 歌单"
                                color: root.accent()
                                font.pixelSize: 10
                                font.bold: true
                                font.letterSpacing: 1.1
                            }
                        }
                        Text {
                            Layout.fillWidth: true
                            text: root.detail.name || "歌单详情"
                            color: "#253044"
                            font.pixelSize: 30
                            font.bold: true
                            elide: Text.ElideRight
                        }
                        Text {
                            Layout.fillWidth: true
                            Layout.maximumWidth: 576
                            text: root.detail.description || "精选热门音乐"
                            color: "#7d8796"
                            font.pixelSize: 11
                            wrapMode: Text.WrapAnywhere
                            maximumLineCount: 2
                            elide: Text.ElideRight
                            clip: true
                        }
                        Rectangle {
                            Layout.preferredWidth: 122
                            Layout.preferredHeight: 35
                            radius: 18
                            color: root.accent()
                            RowLayout {
                                anchors.centerIn: parent
                                spacing: 6
                                AppIcon {
                                    name: "play"
                                    color: "white"
                                    fillColor: "white"
                                    Layout.preferredWidth: 12
                                    Layout.preferredHeight: 12
                                }
                                Text { text: "播放全部 (" + root.songs.count + ")"; color: "white"; font.pixelSize: 10; font.bold: true }
                            }
                            MouseArea {
                                anchors.fill: parent
                                cursorShape: Qt.PointingHandCursor
                                onClicked: if (root.songs.count) bridge.play(0)
                            }
                        }
                    }
                }
            }

            Rectangle {
                id: tableHeader
                anchors.left: parent.left
                anchors.right: parent.right
                y: 226
                height: 42
                radius: 17
                color: "#f1f2f4"
                border.color: "#141f2937"
                border.width: 1

                // Keep only the top corners rounded.
                Rectangle {
                    anchors.left: parent.left
                    anchors.right: parent.right
                    anchors.bottom: parent.bottom
                    height: tableHeader.radius
                    color: tableHeader.color
                    Rectangle { anchors.left: parent.left; width: 1; height: parent.height; color: "#141f2937" }
                    Rectangle { anchors.right: parent.right; width: 1; height: parent.height; color: "#141f2937" }
                }
                Rectangle { anchors.left: parent.left; anchors.right: parent.right; anchors.bottom: parent.bottom; height: 1; color: "#121f2937" }

                RowLayout {
                    anchors.fill: parent
                    anchors.leftMargin: 18
                    anchors.rightMargin: 18
                    spacing: 0
                    Head { text: "#"; Layout.preferredWidth: 48; horizontalAlignment: Text.AlignHCenter }
                    Head { text: "标题"; Layout.fillWidth: true }
                    Head { text: "歌手"; Layout.preferredWidth: 150 }
                    Head { text: "专辑"; Layout.preferredWidth: 170 }
                    Head { text: "时长"; Layout.preferredWidth: 54; horizontalAlignment: Text.AlignRight }
                }
            }
        }

        delegate: Rectangle {
            id: songRow
            required property int index
            required property var item
            readonly property bool isLast: index === list.count - 1
            width: list.width
            height: 61
            radius: isLast ? 17 : 0
            color: hit.containsMouse ? "#e8ffffff" : "#b8ffffff"

            // A rounded last row needs square top corners to join the table.
            Rectangle {
                visible: songRow.isLast
                anchors.left: parent.left
                anchors.right: parent.right
                anchors.top: parent.top
                height: songRow.radius
                color: songRow.color
            }
            Rectangle { anchors.left: parent.left; width: 1; height: parent.height; color: "#141f2937" }
            Rectangle { anchors.right: parent.right; width: 1; height: parent.height; color: "#141f2937" }
            Rectangle {
                anchors.left: parent.left
                anchors.right: parent.right
                anchors.bottom: parent.bottom
                height: 1
                color: songRow.isLast ? "#141f2937" : "#0d1f2937"
            }

            RowLayout {
                anchors.fill: parent
                anchors.leftMargin: 18
                anchors.rightMargin: 18
                spacing: 0

                Text {
                    text: songRow.index + 1
                    color: hit.containsMouse ? root.accent() : "#a1a8b4"
                    font.pixelSize: 11
                    Layout.preferredWidth: 48
                    horizontalAlignment: Text.AlignHCenter
                }
                RowLayout {
                    Layout.fillWidth: true
                    spacing: 11
                    RoundedImage {
                        Layout.preferredWidth: 38
                        Layout.preferredHeight: 38
                        radius: 9
                        source: songRow.item.cover || ""
                        preferredSourceSize: 180
                        fallbackColor: "#e3e7ed"
                    }
                    Text {
                        Layout.fillWidth: true
                        text: songRow.item.name || "未知歌曲"
                        color: "#253044"
                        font.pixelSize: 12
                        font.bold: true
                        elide: Text.ElideRight
                    }
                    Rectangle {
                        visible: songRow.item.vip === true
                        Layout.preferredWidth: visible ? 28 : 0
                        Layout.preferredHeight: 17
                        radius: 5
                        color: "#2af59e0b"
                        border.color: "#38d99a24"
                        Text { anchors.centerIn: parent; text: "VIP"; color: "#a66b19"; font.pixelSize: 8; font.bold: true }
                    }
                }
                Text { text: songRow.item.artist || ""; color: "#697486"; font.pixelSize: 11; Layout.preferredWidth: 150; elide: Text.ElideRight }
                Text { text: songRow.item.album || ""; color: "#929aa7"; font.pixelSize: 11; Layout.preferredWidth: 170; elide: Text.ElideRight }
                Text { text: root.duration(songRow.item.duration); color: "#929aa7"; font.pixelSize: 11; Layout.preferredWidth: 54; horizontalAlignment: Text.AlignRight }
            }

            MouseArea {
                id: hit
                anchors.fill: parent
                hoverEnabled: true
                cursorShape: Qt.PointingHandCursor
                preventStealing: false
                onClicked: bridge.play(songRow.index)
            }
        }

        footer: Item { width: list.width; height: 12 }
    }

    component Head: Text {
        color: "#929aa7"
        font.pixelSize: 10
        font.bold: true
        font.letterSpacing: 1.0
        elide: Text.ElideRight
    }
}
