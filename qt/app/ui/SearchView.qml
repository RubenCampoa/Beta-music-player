// 对齐原版的搜索页：信息头卡、平台切换与列式结果表。
import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import QtQuick.Effects

Item {
    id: root
    readonly property var songs: bridge.songsModel
    property string observedQuery: bridge.searchQuery
    property string observedPlatform: bridge.platform

    function resetSearchScroll() {
        Qt.callLater(function() {
            if (!list)
                return
            list.cancelFlick()
            wheelSnap.stop()
            list.contentY = list.originY
        })
    }

    onObservedQueryChanged: resetSearchScroll()
    onObservedPlatformChanged: resetSearchScroll()
    Component.onCompleted: resetSearchScroll()
    function platformName(source) {
        return source === "qq" ? "QQ 音乐" : source === "kugou" ? "酷狗概念版" : source === "local" ? "本地音乐" : "网易云"
    }
    function platformColor(key) {
        return key === "qq" ? "#10b981" : key === "kugou" ? "#0ea5e9" : "#fa233b"
    }
    function platformDotColor(key, active) {
        if (key === "qq") return active ? "#a7f3d0" : "#10b981"
        if (key === "kugou") return active ? "#bae6fd" : "#0ea5e9"
        return active ? "#ffb3c1" : "#fa233b"
    }
    function accent() { return root.platformColor(bridge.platform) }
    function duration(value) { var seconds = Math.floor(value || 0); return Math.floor(seconds / 60) + ":" + ((seconds % 60) < 10 ? "0" : "") + (seconds % 60) }

    ColumnLayout {
        anchors.fill: parent
        anchors.topMargin: 24
        spacing: 20

        Rectangle {
            Layout.fillWidth: true; Layout.preferredHeight: 118; radius: 17
            color: "#b8ffffff"; border.color: "#141f2937"; border.width: 1
            RowLayout {
                anchors.fill: parent; anchors.margins: 22; spacing: 16
                ColumnLayout {
                    Layout.fillWidth: true; spacing: 4
                    RowLayout { spacing: 7; AppIcon { name: "search"; color: root.accent(); width: 17; height: 17 } Text { text: root.platformName(bridge.platform) + "全网搜索"; color: root.accent(); font.pixelSize: 11; font.bold: true; font.letterSpacing: 1.1 } }
                    RowLayout { spacing: 7; Text { text: "搜索结果："; color: "#253044"; font.pixelSize: 23; font.bold: true } Text { text: "“" + (bridge.searchQuery || "未输入关键词") + "”"; color: root.accent(); font.pixelSize: 23; font.bold: true; elide: Text.ElideRight; Layout.maximumWidth: 300 } }
                    Text { text: "共找到 " + root.songs.count + " 首相关单曲"; color: "#929aa7"; font.pixelSize: 11 }
                }
                RowLayout {
                    spacing: 12
                    Layout.alignment: Qt.AlignVCenter

                    // 1. 统一分段胶囊容器 (Unified Segmented Capsule)
                    Rectangle {
                        id: platformCapsule
                        implicitHeight: 36
                        implicitWidth: capsuleRow.implicitWidth + 8
                        radius: 18
                        color: "#0a1f2937"
                        border.color: "#141f2937"
                        border.width: 1

                        Row {
                            id: capsuleRow
                            anchors.centerIn: parent
                            spacing: 3

                            PlatformTab { key: "netease"; label: "网易云音乐" }
                            PlatformTab { key: "qq"; label: "QQ 音乐" }
                            PlatformTab { key: "kugou"; label: "酷狗概念版" }
                        }
                    }

                    // 2. 播放全部搜索结果按钮 (Play All Search Results Pill Button)
                    Rectangle {
                        id: playAllBtn
                        visible: root.songs.count > 0
                        implicitHeight: 36
                        implicitWidth: playAllRow.implicitWidth + 32
                        radius: 18
                        color: root.accent()
                        scale: playAllMouse.pressed ? 0.96 : (playAllMouse.containsMouse ? 1.03 : 1.0)
                        opacity: playAllMouse.containsMouse ? 0.95 : 1.0

                        Behavior on scale { NumberAnimation { duration: 150; easing.type: Easing.OutCubic } }
                        Behavior on opacity { NumberAnimation { duration: 150; easing.type: Easing.OutCubic } }

                        layer.enabled: true
                        layer.effect: MultiEffect {
                            shadowEnabled: true
                            shadowColor: Qt.rgba(
                                bridge.platform === "qq" ? 0.06 : bridge.platform === "kugou" ? 0.05 : 0.98,
                                bridge.platform === "qq" ? 0.72 : bridge.platform === "kugou" ? 0.52 : 0.14,
                                bridge.platform === "qq" ? 0.50 : bridge.platform === "kugou" ? 0.91 : 0.23,
                                0.35
                            )
                            shadowBlur: 0.50
                            shadowVerticalOffset: 2
                        }

                        RowLayout {
                            id: playAllRow
                            anchors.centerIn: parent
                            spacing: 8

                            AppIcon {
                                name: "play"
                                color: "#ffffff"
                                fillColor: "#ffffff"
                                width: 13
                                height: 13
                            }

                            Text {
                                text: "播放全部搜索结果"
                                color: "#ffffff"
                                font.pixelSize: 12
                                font.bold: true
                            }
                        }

                        MouseArea {
                            id: playAllMouse
                            anchors.fill: parent
                            hoverEnabled: true
                            cursorShape: Qt.PointingHandCursor
                            onClicked: bridge.play_search_result(0)
                        }
                    }
                }
            }
        }

        Rectangle {
            id: resultsPanel
            Layout.fillWidth: true; Layout.fillHeight: true; radius: 17; color: "#b8ffffff"; border.color: "#141f2937"; border.width: 1; clip: true
            ColumnLayout {
                anchors.fill: parent; spacing: 0
                Rectangle {
                    Layout.fillWidth: true; Layout.preferredHeight: 43; radius: 17; color: "#0d1f2937"
                    Rectangle { anchors.left: parent.left; anchors.right: parent.right; anchors.bottom: parent.bottom; height: 17; color: parent.color }
                    RowLayout { anchors.fill: parent; anchors.leftMargin: 18; anchors.rightMargin: 18; spacing: 0
                        Header { text: "#"; Layout.preferredWidth: 48; horizontalAlignment: Text.AlignHCenter }
                        Header { text: "标题"; Layout.fillWidth: true }
                        Header { text: "歌手"; Layout.preferredWidth: 140 }
                        Header { text: "专辑"; Layout.preferredWidth: 150 }
                        Header { text: "平台"; Layout.preferredWidth: 76; horizontalAlignment: Text.AlignHCenter }
                        Header { text: "时长"; Layout.preferredWidth: 52; horizontalAlignment: Text.AlignRight }
                    }
                }
                ListView {
                    id: list
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    Layout.bottomMargin: 16
                    clip: true
                    model: root.songs
                    reuseItems: true
                    interactive: true
                    boundsBehavior: Flickable.StopAtBounds
                    flickableDirection: Flickable.VerticalFlick
                    pressDelay: 90
                    snapMode: ListView.SnapToItem
                    ScrollBar.vertical: AppScrollBar {}
                    readonly property real rowHeight: 62

                    function scrollByWheel(delta) {
                        wheelSnap.stop()
                        var minY = originY
                        var maxY = Math.max(minY, originY + contentHeight - height)
                        contentY = Math.max(minY, Math.min(maxY, contentY - delta))
                        wheelSnapDelay.restart()
                    }

                    function snapToNearestRow() {
                        var minY = originY
                        var maxY = Math.max(minY, originY + contentHeight - height)
                        var row = Math.round((contentY - originY) / rowHeight)
                        var targetY = Math.max(minY, Math.min(maxY, originY + row * rowHeight))
                        if (Math.abs(targetY - contentY) < 0.5) {
                            contentY = targetY
                            return
                        }
                        wheelSnap.from = contentY
                        wheelSnap.to = targetY
                        wheelSnap.restart()
                    }

                    Timer {
                        id: wheelSnapDelay
                        interval: 120
                        repeat: false
                        onTriggered: list.snapToNearestRow()
                    }

                    NumberAnimation {
                        id: wheelSnap
                        target: list
                        property: "contentY"
                        duration: 140
                        easing.type: Easing.OutCubic
                    }

                    WheelHandler {
                        target: null
                        onWheel: function(event) {
                            var delta = event.pixelDelta.y
                            if (delta === 0)
                                delta = event.angleDelta.y / 2
                            list.scrollByWheel(delta)
                            event.accepted = true
                        }
                    }
                    delegate: Rectangle {
                        id: songRow
                        required property int index
                        required property var item
                        required property bool vip
                        width: list.width; height: 62; color: hit.containsMouse ? "#66ffffff" : "transparent"
                        Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 1; color: "#0a1f2937" }
                        RowLayout { anchors.fill: parent; anchors.leftMargin: 18; anchors.rightMargin: 18; spacing: 0
                            Text { text: index + 1; color: "#a1a8b4"; font.pixelSize: 11; Layout.preferredWidth: 48; horizontalAlignment: Text.AlignHCenter }
                            RowLayout { Layout.fillWidth: true; spacing: 11
                                Rectangle { width: 38; height: 38; radius: 7; color: "#e3e7ed"; clip: true; RoundedImage { anchors.fill: parent; source: item.cover || ""; radius: 7; preferredSourceSize: 160 } AppIcon { anchors.centerIn: parent; name: "music"; color: "#a1a8b4"; width: 16; height: 16; visible: !item.cover } }
                                Text { Layout.fillWidth: true; text: item.name; color: "#253044"; font.pixelSize: 12; font.bold: true; elide: Text.ElideRight }
                                Rectangle {
                                    visible: songRow.vip
                                    Layout.preferredWidth: visible ? 28 : 0; Layout.preferredHeight: 17
                                    radius: 5; color: "#2af59e0b"; border.color: "#38d99a24"
                                    Text { anchors.centerIn: parent; text: "VIP"; color: "#a66b19"; font.pixelSize: 8; font.bold: true }
                                }
                            }
                            Text { text: item.artist; color: "#697486"; font.pixelSize: 11; Layout.preferredWidth: 140; elide: Text.ElideRight }
                            Text { text: item.album; color: "#929aa7"; font.pixelSize: 11; Layout.preferredWidth: 150; elide: Text.ElideRight }
                            Rectangle { Layout.preferredWidth: 62; Layout.preferredHeight: 20; radius: 10; color: item.source === "qq" ? "#e8f8f1" : item.source === "kugou" ? "#e8f5fc" : "#fff0f2"; Text { anchors.centerIn: parent; text: root.platformName(item.source); color: item.source === "qq" ? "#047857" : item.source === "kugou" ? "#0369a1" : "#e11d48"; font.pixelSize: 9; font.bold: true } }
                            Text { text: root.duration(item.duration); color: "#929aa7"; font.pixelSize: 11; Layout.preferredWidth: 52; horizontalAlignment: Text.AlignRight }
                        }
                        MouseArea {
                            id: hit
                            anchors.fill: parent
                            hoverEnabled: true
                            preventStealing: false
                            scrollGestureEnabled: false
                            onClicked: bridge.play_search_result(songRow.index)
                        }
                    }
                    Column {
                        anchors.centerIn: parent
                        visible: list.count === 0 && !bridge.busy
                        spacing: 8
                        AppIcon { anchors.horizontalCenter: parent.horizontalCenter; name: "music"; color: "#c2c8d1"; width: 34; height: 34 }
                        Text { text: "未找到相关歌曲，请尝试其他关键词"; color: "#929aa7"; font.pixelSize: 12 }
                    }

                    Column {
                        anchors.centerIn: parent
                        visible: list.count === 0 && bridge.busy
                        spacing: 9
                        BusyIndicator {
                            anchors.horizontalCenter: parent.horizontalCenter
                            running: visible
                            width: 24
                            height: 24
                        }
                        Text {
                            anchors.horizontalCenter: parent.horizontalCenter
                            text: "正在搜索…"
                            color: "#7c8797"
                            font.pixelSize: 12
                            font.weight: Font.Medium
                        }
                    }
                }
            }
        }
    }

    component Header: Text { color: "#929aa7"; font.pixelSize: 10; font.bold: true; font.letterSpacing: 1.0; elide: Text.ElideRight }
    component PlatformTab: Rectangle {
        id: tab
        property string key: "netease"
        property string label: "网易云音乐"
        property bool active: bridge.platform === key
        implicitHeight: 30
        implicitWidth: tabRow.implicitWidth + 24
        radius: 15
        color: active ? root.platformColor(tab.key) : (tabMouse.containsMouse ? "#0a000000" : "transparent")

        Behavior on color { ColorAnimation { duration: 180 } }

        layer.enabled: tab.active
        layer.effect: MultiEffect {
            shadowEnabled: true
            shadowColor: Qt.rgba(
                tab.key === "qq" ? 0.06 : tab.key === "kugou" ? 0.05 : 0.98,
                tab.key === "qq" ? 0.72 : tab.key === "kugou" ? 0.52 : 0.14,
                tab.key === "qq" ? 0.50 : tab.key === "kugou" ? 0.91 : 0.23,
                0.28
            )
            shadowBlur: 0.4
            shadowVerticalOffset: 1
        }

        Row {
            id: tabRow
            anchors.centerIn: parent
            spacing: 6

            Rectangle {
                width: 7
                height: 7
                radius: 3.5
                anchors.verticalCenter: parent.verticalCenter
                color: root.platformDotColor(tab.key, tab.active)

                Behavior on color { ColorAnimation { duration: 180 } }
            }

            Text {
                text: tab.label
                color: tab.active ? "#ffffff" : "#4b5563"
                font.pixelSize: 12
                font.bold: true
                anchors.verticalCenter: parent.verticalCenter

                Behavior on color { ColorAnimation { duration: 180 } }
            }
        }

        MouseArea {
            id: tabMouse
            anchors.fill: parent
            hoverEnabled: true
            cursorShape: Qt.PointingHandCursor
            onClicked: {
                bridge.set_platform(tab.key)
                if (bridge.searchQuery) bridge.search(bridge.searchQuery)
            }
        }
    }
}
