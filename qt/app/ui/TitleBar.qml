// 与 Electron 原版一致的 56px 顶栏：交通灯、品牌、居中搜索、平台与账户。
import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

Rectangle {
    id: titleBar
    property var currentAccount: (bridge.accounts && bridge.accounts[bridge.platform]) || bridge.account || ({})
    width: parent ? parent.width : 1240
    height: 56
    z: 100
    color: "#f9fafc"
    border.color: "#121f2937"
    border.width: 1

    signal searchTriggered(string query)

    // 无边框窗口不会由系统自动提供标题栏拖动。把标题栏空白区域交给
    // QWindow.startSystemMove()，并保留后绘制控件的点击优先级。
    MouseArea {
        z: 0
        anchors.fill: parent
        acceptedButtons: Qt.LeftButton
        onPressed: bridge.window_start_drag()
        onDoubleClicked: bridge.window_maximize()
    }

    RowLayout {
        z: 20
        anchors.left: parent.left
        anchors.leftMargin: 20
        anchors.verticalCenter: parent.verticalCenter
        spacing: 8
        TrafficButton { baseColor: "#ff736a"; onClicked: bridge.window_close() }
        TrafficButton { baseColor: "#f5c45b"; onClicked: bridge.window_minimize() }
        TrafficButton { baseColor: "#69c77d"; onClicked: bridge.window_maximize() }
    }

    RowLayout {
        z: 10
        anchors.left: parent.left
        anchors.leftMargin: 202
        anchors.verticalCenter: parent.verticalCenter
        spacing: 8
        visible: titleBar.width >= 1080
        Rectangle {
            width: 24; height: 24; radius: 8; color: "#263246"
            scale: brandMouse.containsMouse ? 1.06 : 1
            Behavior on scale { NumberAnimation { duration: 180; easing.type: Easing.OutBack } }
            AppIcon { anchors.centerIn: parent; name: "music"; color: "white"; width: 14; height: 14; strokeWidth: 2.4 }
            MouseArea { id: brandMouse; anchors.fill: parent; hoverEnabled: true; acceptedButtons: Qt.NoButton }
        }
        Text { text: "Beta Music Player"; color: "#253044"; font.pixelSize: 14; font.weight: Font.DemiBold }
    }

    Rectangle {
        id: searchBox
        z: 10
        anchors.horizontalCenter: parent.horizontalCenter
        anchors.verticalCenter: parent.verticalCenter
        width: Math.min(500, Math.max(titleBar.width < 1080 ? 260 : 280,
                                     titleBar.width - 740))
        height: 34
        radius: 17
        color: searchInput.activeFocus ? "#ffffff" : "#e8ffffff"
        border.color: searchInput.activeFocus ? "#40263246" : "#141f2937"
        scale: searchInput.activeFocus ? 1.01 : 1
        Behavior on color { ColorAnimation { duration: 180 } }
        Behavior on border.color { ColorAnimation { duration: 180 } }
        Behavior on scale { NumberAnimation { duration: 180; easing.type: Easing.OutCubic } }

        AppIcon { anchors.left: parent.left; anchors.leftMargin: 13; anchors.verticalCenter: parent.verticalCenter; name: "search"; color: "#93a0b2"; width: 15; height: 15 }
        TextInput {
            id: searchInput
            anchors.left: parent.left; anchors.leftMargin: 34
            anchors.right: parent.right; anchors.rightMargin: 14
            anchors.verticalCenter: parent.verticalCenter
            color: "#253044"; font.pixelSize: 12; clip: true; selectByMouse: true
            onAccepted: {
                if (text.trim().length > 0) {
                    titleBar.searchTriggered(text.trim())
                    focus = false
                }
            }
            Keys.onEscapePressed: searchInput.focus = false
        }
        Text {
            anchors.left: parent.left; anchors.leftMargin: 34; anchors.verticalCenter: parent.verticalCenter
            text: "搜索歌曲、歌手或专辑 (按回车搜索)..."
            color: "#a1a8b4"; font.pixelSize: 12; visible: searchInput.text.length === 0
        }

        // 搜索历史下拉（对齐原版 TitleBar 的 search-history popover）
        Rectangle {
            id: historyPopover
            anchors.top: parent.bottom
            anchors.topMargin: 8
            anchors.left: parent.left
            anchors.right: parent.right
            height: Math.min(46 + historyPopover.historyModel.length * 34, 246)
            radius: 16
            color: "#ffffff"
            border.color: "#141f2937"
            border.width: 1
            clip: true
            visible: searchInput.activeFocus && historyPopover.historyModel.length > 0
            z: 200
            property var historyModel: bridge.searchHistory

            RowLayout {
                anchors.left: parent.left; anchors.right: parent.right
                anchors.top: parent.top; anchors.topMargin: 10
                anchors.leftMargin: 14; anchors.rightMargin: 14
                height: 20
                AppIcon { name: "history"; color: "#e11d48"; width: 14; height: 14 }
                Text { text: "搜索历史"; color: "#7c8797"; font.pixelSize: 12; font.bold: true }
                Item { Layout.fillWidth: true }
                Text {
                    text: "清空"
                    color: clearHistoryArea.containsMouse ? "#e11d48" : "#a1a8b4"
                    font.pixelSize: 11
                    MouseArea { id: clearHistoryArea; anchors.fill: parent; hoverEnabled: true; onClicked: bridge.clear_search_history() }
                }
            }

            ListView {
                id: historyList
                anchors.left: parent.left; anchors.right: parent.right
                anchors.top: parent.top; anchors.topMargin: 36
                anchors.bottom: parent.bottom; anchors.bottomMargin: 8
                anchors.leftMargin: 8; anchors.rightMargin: 8
                spacing: 4
                clip: true
                interactive: contentHeight > height
                boundsBehavior: Flickable.StopAtBounds
                flickableDirection: Flickable.VerticalFlick
                model: historyPopover.historyModel
                ScrollBar.vertical: AppScrollBar {}

                delegate: Rectangle {
                    width: historyList.width
                    height: 32
                    radius: 16
                    color: histHover.containsMouse ? "#e9edf3" : "#f4f5f7"
                    RowLayout {
                        z: 1
                        anchors.fill: parent
                        anchors.leftMargin: 12; anchors.rightMargin: 10
                        spacing: 7
                        AppIcon { name: "clock"; color: "#a1a8b4"; width: 12; height: 12 }
                        Text { Layout.fillWidth: true; text: modelData; color: "#536074"; font.pixelSize: 12; elide: Text.ElideRight }
                        Text {
                            text: "×"
                            color: delArea.containsMouse ? "#e11d48" : "#a1a8b4"
                            font.pixelSize: 14
                            MouseArea { id: delArea; anchors.fill: parent; hoverEnabled: true; scrollGestureEnabled: false; onClicked: bridge.remove_search_history_item(modelData) }
                        }
                    }
                    MouseArea {
                        id: histHover
                        z: 0
                        anchors.fill: parent
                        hoverEnabled: true
                        scrollGestureEnabled: false
                        onClicked: { searchInput.text = modelData; searchInput.focus = true; searchInput.selectAll() }
                    }
                }
            }
        }
    }

    function defaultLoginText(platform) {
        if (platform === "qq") return "登录 QQ 音乐"
        if (platform === "kugou") return "登录酷狗音乐"
        if (platform === "local") return "本地模式"
        return "登录网易云"
    }

    RowLayout {
        z: 10
        anchors.right: parent.right
        anchors.rightMargin: 16
        anchors.verticalCenter: parent.verticalCenter
        spacing: 8

        PlatformPill {
            platformKey: bridge.platform
            title: bridge.platform === "qq" ? "QQ 音乐" : bridge.platform === "kugou" ? "酷狗音乐" : bridge.platform === "local" ? "本地音乐" : "网易云"
            accent: bridge.platform === "qq" ? "#059669" : bridge.platform === "kugou" ? "#0284c7" : bridge.platform === "local" ? "#7c3aed" : "#e11d48"
            borderColor: bridge.platform === "qq" ? "#a7f3d0" : bridge.platform === "kugou" ? "#bae6fd" : bridge.platform === "local" ? "#ddd6fe" : "#fecdd3"
            background: bridge.platform === "qq" ? "#ecfdf5" : bridge.platform === "kugou" ? "#f0f9ff" : bridge.platform === "local" ? "#f5f3ff" : "#fff1f2"
            onClicked: {
                var platforms = ["netease", "qq", "kugou"]
                var next = (platforms.indexOf(bridge.platform) + 1) % platforms.length
                bridge.set_platform(platforms[next])
            }
        }

        Rectangle {
            id: accountButton
            readonly property var currentAcc: (bridge.accounts && bridge.accounts[bridge.platform]) || bridge.account || ({})
            readonly property bool isLoggedIn: !!(currentAcc && currentAcc.nickname)

            Layout.preferredHeight: 28
            Layout.preferredWidth: Math.max(92, accountRow.implicitWidth + 24)
            radius: 14
            color: accountButton.isLoggedIn
                   ? (accountMouse.containsMouse ? "#f8fafc" : "#ffffff")
                   : (accountMouse.containsMouse ? "#2d3748" : "#1e293b")
            border.width: 1
            border.color: accountButton.isLoggedIn ? "#e2e8f0" : "#334155"
            scale: accountMouse.pressed ? 0.96 : 1
            Behavior on color { ColorAnimation { duration: 150 } }
            Behavior on scale { NumberAnimation { duration: 120; easing.type: Easing.OutCubic } }

            Row {
                id: accountRow
                anchors.centerIn: parent
                spacing: 6

                Rectangle {
                    visible: accountButton.isLoggedIn
                    anchors.verticalCenter: parent.verticalCenter
                    width: 20
                    height: 20
                    radius: 10
                    color: "#f1f5f9"
                    clip: true
                    RoundedImage {
                        id: accountAvatar
                        anchors.fill: parent
                        source: accountButton.currentAcc.avatarUrl || ""
                        radius: 10
                        preferredSourceSize: 64
                        visible: source !== ""
                    }
                    AppIcon {
                        anchors.centerIn: parent
                        name: "user"
                        color: "#94a3b8"
                        width: 11
                        height: 11
                        visible: !accountAvatar.visible
                    }
                }

                AppIcon {
                    visible: !accountButton.isLoggedIn
                    anchors.verticalCenter: parent.verticalCenter
                    name: "user"
                    color: "#cbd5e1"
                    width: 13
                    height: 13
                    strokeWidth: 2
                }

                Text {
                    anchors.verticalCenter: parent.verticalCenter
                    text: accountButton.isLoggedIn
                          ? accountButton.currentAcc.nickname
                          : titleBar.defaultLoginText(bridge.platform)
                    color: accountButton.isLoggedIn ? "#1e293b" : "#ffffff"
                    font.pixelSize: 11
                    font.weight: Font.DemiBold
                    elide: Text.ElideRight
                    width: Math.min(120, implicitWidth)
                }

                AppIcon {
                    visible: accountButton.isLoggedIn
                    anchors.verticalCenter: parent.verticalCenter
                    name: "log-out"
                    color: "#64748b"
                    width: 12
                    height: 12
                    strokeWidth: 2
                }
            }

            MouseArea {
                id: accountMouse
                anchors.fill: parent
                hoverEnabled: true
                cursorShape: Qt.PointingHandCursor
                onClicked: bridge.toggle_login_modal()
            }
        }
    }

    component TrafficButton: Rectangle {
        id: traffic
        property color baseColor: "#ff736a"
        signal clicked()
        width: 14; height: 14; radius: 7
        color: trafficMouse.containsMouse ? Qt.lighter(baseColor, 1.08) : baseColor
        scale: trafficMouse.pressed ? 0.82 : trafficMouse.containsMouse ? 1.08 : 1
        Behavior on color { ColorAnimation { duration: 120 } }
        Behavior on scale { NumberAnimation { duration: 120; easing.type: Easing.OutBack } }
        MouseArea {
            id: trafficMouse
            anchors.fill: parent
            hoverEnabled: true
            acceptedButtons: Qt.LeftButton
            preventStealing: true
            cursorShape: Qt.PointingHandCursor
            onPressed: mouse.accepted = true
            onClicked: traffic.clicked()
        }
    }

    component PlatformPill: Rectangle {
        id: pill
        property string platformKey: "netease"
        property string title: "网易云"
        property color accent: "#e11d48"
        property color borderColor: "#fecdd3"
        property color background: "#fff1f2"
        signal clicked()
        Layout.preferredHeight: 28
        Layout.preferredWidth: Math.max(68, pillRow.implicitWidth + 24)
        radius: 14
        color: pillMouse.containsMouse ? Qt.lighter(background, 1.03) : background
        border.color: borderColor
        border.width: 1
        scale: pillMouse.pressed ? 0.95 : pillMouse.containsMouse ? 1.035 : 1
        Behavior on color { ColorAnimation { duration: 150 } }
        Behavior on scale { NumberAnimation { duration: 140; easing.type: Easing.OutBack } }

        Row {
            id: pillRow
            anchors.centerIn: parent
            spacing: 5
            Rectangle {
                anchors.verticalCenter: parent.verticalCenter
                width: 6
                height: 6
                radius: 3
                color: pill.accent
            }
            Text {
                id: pillText
                anchors.verticalCenter: parent.verticalCenter
                text: pill.title
                color: pill.accent
                font.pixelSize: 11
                font.weight: Font.Bold
            }
        }
        MouseArea {
            id: pillMouse
            anchors.fill: parent
            hoverEnabled: true
            cursorShape: Qt.PointingHandCursor
            onClicked: pill.clicked()
        }
    }
}
