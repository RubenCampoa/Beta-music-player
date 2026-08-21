// 系统设置：平台账号、音质、视觉动效与应用偏好。
import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

ScrollView {
    id: root
    background: null
    padding: 0
    clip: true
    contentWidth: availableWidth
    contentHeight: settingsColumn.y + settingsColumn.implicitHeight + 48
    bottomPadding: 0
    ScrollBar.vertical: AppScrollBar {}
    property var prefs: bridge.settings
    property var accountsData: bridge.accounts

    // 右上角「版本号 + 检查更新」整体右移，贴靠到窗口右侧边缘（留 16px 呼吸），
    // 避免在居中的内容列里显得偏中间。
    readonly property real titleShiftRight: Math.max(0, (root.availableWidth - settingsColumn.width) / 2 - 16)

    Component.onCompleted: settingsEntrance.start()

    ParallelAnimation {
        id: settingsEntrance
        NumberAnimation { target: settingsColumn; property: "opacity"; from: 0; to: 1; duration: 420; easing.type: Easing.OutCubic }
        NumberAnimation { target: settingsShift; property: "y"; from: 8; to: 0; duration: 480; easing.type: Easing.OutCubic }
    }

    ColumnLayout {
        id: settingsColumn
        anchors.horizontalCenter: parent.horizontalCenter
        width: Math.min(root.availableWidth - 56, 1100)
        y: 28
        spacing: 0
        opacity: 0
        transform: Translate { id: settingsShift; y: 8 }

        RowLayout {
            Layout.fillWidth: true
            spacing: 16

            ColumnLayout {
                spacing: 3
                RowLayout {
                    spacing: 10
                    AppIcon {
                        name: "settings"
                        color: "#fa233b"
                        Layout.preferredWidth: 28
                        Layout.preferredHeight: 28
                    }
                    Text {
                        text: "系统设置"
                        color: "#253044"
                        font.pixelSize: 30
                        font.weight: Font.ExtraBold
                    }
                }
                Text {
                    text: "偏好设置、多平台账号管理与音质效能控制"
                    color: "#8a94a3"
                    font.pixelSize: 13
                }
            }

            // 占位弹性空白，将版本信息与更新按钮推至最右侧
            Item {
                Layout.fillWidth: true
            }

            RowLayout {
                spacing: 10
                Layout.alignment: Qt.AlignRight | Qt.AlignVCenter

                Rectangle {
                    Layout.preferredWidth: 152
                    Layout.preferredHeight: 32
                    radius: 16
                    color: "#0d1f2937"
                    border.color: "#141f2937"
                    Text {
                        anchors.centerIn: parent
                        text: "Beta Music Player v" + appVersion
                        color: "#7b8594"
                        font.pixelSize: 11
                        font.weight: Font.DemiBold
                    }
                }

                Rectangle {
                    Layout.preferredWidth: 100
                    Layout.preferredHeight: 32
                    radius: 16
                    color: updateMouse.pressed ? "#be123c" : (updateMouse.containsMouse ? "#e11d48" : "#fa233b")
                    scale: updateMouse.pressed ? 0.96 : (updateMouse.containsMouse ? 1.02 : 1.0)

                    Behavior on color { ColorAnimation { duration: 150 } }
                    Behavior on scale { NumberAnimation { duration: 150; easing.type: Easing.OutCubic } }

                    Text {
                        anchors.centerIn: parent
                        text: "✦  检查更新"
                        color: "white"
                        font.pixelSize: 11
                        font.bold: true
                    }

                    MouseArea {
                        id: updateMouse
                        anchors.fill: parent
                        hoverEnabled: true
                        cursorShape: Qt.PointingHandCursor
                        onClicked: bridge.check_for_updates()
                    }
                }
            }
        }
        Rectangle { Layout.fillWidth: true; Layout.topMargin: 20; Layout.preferredHeight: 1; color: "#121f2937" }

        SettingSection {
            Layout.topMargin: 33
            title: "多平台账号管理与即时切换"
            icon: "♙"
            hint: "当前主平台：" + (bridge.platform === "qq" ? "QQ 音乐" : "网易云音乐")
            RowLayout {
                Layout.fillWidth: true
                spacing: 12
                PlatformCard { Layout.fillWidth: true; platformKey: "netease"; platformLabel: "网易云音乐"; accent: "#fa233b" }
                PlatformCard { Layout.fillWidth: true; platformKey: "qq"; platformLabel: "QQ 音乐"; accent: "#10b981" }
            }
        }

        SettingSection {
            Layout.topMargin: 32
            title: "视觉与全套动效控制"
            icon: "✦"
            hint: "可独立开关特效以匹配设备性能"
            GridLayout {
                Layout.fillWidth: true; columns: 2; columnSpacing: 12; rowSpacing: 10
                SettingToggle { Layout.fillWidth: true; settingKey: "fluidBackground"; label: "全景流体模糊背景"; detail: "根据专辑封面色调生成流体扩散背景" }
                SettingToggle { Layout.fillWidth: true; settingKey: "smoothAnimations"; label: "界面平滑动画"; detail: "启用 60FPS 页面过渡与悬停反馈" }
                SettingToggle { Layout.fillWidth: true; settingKey: "lyricAnimation"; label: "Apple 歌词弹性随动"; detail: "歌词切换时触发柔和缩放与滚动" }
                SettingToggle { Layout.fillWidth: true; settingKey: "lyricGlow"; label: "歌词高光漫反射"; detail: "当前歌词显示弥散高光效果" }
                SettingToggle { Layout.fillWidth: true; settingKey: "lyricBlur"; label: "歌词景深模糊"; detail: "非当前歌词使用分层景深效果" }
                SettingToggle { Layout.fillWidth: true; settingKey: "lyricZoom"; label: "歌词距离缩放"; detail: "远离当前行的歌词按距离逐渐缩小" }
                SettingToggle { Layout.fillWidth: true; settingKey: "lyricFade"; label: "歌词距离淡出"; detail: "远离当前行的歌词逐渐透明" }
                SettingToggle { Layout.fillWidth: true; settingKey: "lyricStagger"; label: "歌词错峰级联"; detail: "切换时上下行以波浪式依次过渡" }
                SettingToggle { Layout.fillWidth: true; settingKey: "artworkAnimation"; label: "专辑封面呼吸动画"; detail: "播放时启用封面浮动与光影变化" }
            }
        }

        SettingSection {
            Layout.topMargin: 32
            title: "播放音质"
            icon: "♪"
            hint: "平台不支持时会自动降级，不中断播放"
            RowLayout {
                Layout.fillWidth: true; spacing: 12
                QualityCard { Layout.fillWidth: true; qualityKey: "standard"; label: "标准音质"; detail: "128 Kbps" }
                QualityCard { Layout.fillWidth: true; qualityKey: "high"; label: "极高音质"; detail: "320 Kbps" }
                QualityCard { Layout.fillWidth: true; qualityKey: "lossless"; label: "无损音质"; detail: "FLAC / 平台最高可用" }
            }
        }

        SettingSection {
            id: preferencesSection
            Layout.topMargin: 32
            title: "应用偏好与缓存"
            icon: "⌘"
            hint: "配置会自动保存到本机"
            RowLayout {
                Layout.fillWidth: true; spacing: 12
                SettingToggle { Layout.fillWidth: true; settingKey: "autoDesktopLyric"; label: "自动开启桌面歌词"; detail: "播放时显示桌面悬浮歌词窗口" }
                SettingToggle { Layout.fillWidth: true; settingKey: "autoCheckUpdate"; label: "启动时检查更新"; detail: "仅检查 GitHub Release，不自动下载" }
                Rectangle {
                    Layout.fillWidth: true; Layout.preferredHeight: 66; radius: 12; color: "#0d1f2937"; border.color: "#121f2937"
                    RowLayout { anchors.fill: parent; anchors.margins: 15; ColumnLayout { Layout.fillWidth: true; spacing: 3; Text { text: "清除本地缓存"; color: "#374151"; font.pixelSize: 13; font.bold: true } Text { text: "保留账号、收藏和本地资料库"; color: "#929aa7"; font.pixelSize: 11 } } Rectangle { Layout.preferredWidth: 78; Layout.preferredHeight: 30; radius: 15; color: "#16e11d48"; Text { anchors.centerIn: parent; text: "清除缓存"; color: "#e11d48"; font.pixelSize: 11; font.bold: true } MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: bridge.clear_cache() } } }
                }
            }
        }
    }

    component SettingSection: Rectangle {
        id: section
        property string title: ""
        property string icon: ""
        property string hint: ""
        default property alias body: bodyColumn.children
        Layout.fillWidth: true
        Layout.preferredHeight: bodyColumn.implicitHeight + 94
        radius: 17
        color: "#b8ffffff"
        border.color: "#141f2937"
        ColumnLayout {
            anchors.fill: parent; anchors.margins: 19; spacing: 13
            RowLayout {
                Layout.fillWidth: true; spacing: 8
                Text { text: section.icon; color: "#e11d48"; font.pixelSize: 20 }
                Text { text: section.title; color: "#253044"; font.pixelSize: 18; font.bold: true }
                Item { Layout.fillWidth: true }
                Text { text: section.hint; color: "#929aa7"; font.pixelSize: 11 }
            }
            ColumnLayout { id: bodyColumn; Layout.fillWidth: true; spacing: 10 }
        }
    }

    component PlatformCard: Rectangle {
        id: platformCard
        property string platformKey: "netease"
        property string platformLabel: "网易云音乐"
        property color accent: "#fa233b"
        property bool active: bridge.platform === platformKey
        property var accountData: root.accountsData[platformKey] || ({})
        property bool vipActive: accountData.vipActive === true
        property string vipLabel: accountData.vipLabel || "普通用户"
        property string vipExpireDate: accountData.vipExpireDate || ""
        Layout.preferredHeight: 125
        radius: 13
        color: active ? Qt.rgba(accent.r, accent.g, accent.b, 0.09) : (cardMouse.containsMouse ? "#141f2937" : "#0d1f2937")
        border.color: active ? Qt.rgba(accent.r, accent.g, accent.b, 0.45) : (cardMouse.containsMouse ? "#201f2937" : "#121f2937")
        border.width: active ? 1.5 : 1

        Behavior on color { ColorAnimation { duration: 150 } }
        Behavior on border.color { ColorAnimation { duration: 150 } }

        MouseArea {
            id: cardMouse
            anchors.fill: parent
            hoverEnabled: true
            cursorShape: Qt.PointingHandCursor
            onClicked: {
                if (bridge.platform !== platformCard.platformKey) {
                    bridge.set_platform(platformCard.platformKey)
                    bridge.show_toast("已切换主平台为 " + platformCard.platformLabel)
                }
            }
        }

        ColumnLayout {
            anchors.fill: parent
            anchors.margins: 16
            spacing: 10

            RowLayout {
                Layout.fillWidth: true
                spacing: 8
                Rectangle {
                    Layout.preferredWidth: 10
                    Layout.preferredHeight: 10
                    radius: 5
                    color: platformCard.accent
                }
                Text {
                    Layout.fillWidth: true
                    text: platformCard.platformLabel
                    color: "#374151"
                    font.pixelSize: 13
                    font.bold: true
                }
                Rectangle {
                    visible: platformCard.active
                    Layout.preferredWidth: 72
                    Layout.preferredHeight: 22
                    radius: 11
                    color: platformCard.accent
                    Text {
                        anchors.centerIn: parent
                        text: "当前主平台"
                        color: "white"
                        font.pixelSize: 10
                        font.bold: true
                    }
                }
                Rectangle {
                    visible: !platformCard.active
                    Layout.preferredWidth: 62
                    Layout.preferredHeight: 22
                    radius: 11
                    color: cardMouse.containsMouse ? Qt.rgba(platformCard.accent.r, platformCard.accent.g, platformCard.accent.b, 0.15) : "transparent"
                    border.color: Qt.rgba(platformCard.accent.r, platformCard.accent.g, platformCard.accent.b, 0.3)
                    border.width: 1
                    Text {
                        anchors.centerIn: parent
                        text: "设为主平台"
                        color: platformCard.accent
                        font.pixelSize: 10
                        font.bold: true
                    }
                }
            }

            RowLayout {
                Layout.fillWidth: true
                spacing: 8

                Rectangle {
                    visible: !!platformCard.accountData.nickname
                    Layout.preferredWidth: 38
                    Layout.preferredHeight: 38
                    radius: 19
                    color: Qt.rgba(platformCard.accent.r, platformCard.accent.g, platformCard.accent.b, 0.12)
                    antialiasing: true
                    RoundedImage {
                        anchors.fill: parent
                        source: platformCard.accountData.avatarUrl || ""
                        radius: 19
                        preferredSourceSize: 128
                    }
                }

                ColumnLayout {
                    Layout.fillWidth: true
                    spacing: 1
                    RowLayout {
                        Layout.fillWidth: true
                        spacing: 6
                        Text {
                            Layout.fillWidth: true
                            text: platformCard.accountData.nickname || "未绑定账号"
                            color: platformCard.accountData.nickname ? "#374151" : "#929aa7"
                            font.pixelSize: 12
                            font.bold: !!platformCard.accountData.nickname
                            elide: Text.ElideRight
                        }
                        Rectangle {
                            visible: !!platformCard.accountData.nickname
                            Layout.preferredWidth: vipBadgeText.implicitWidth + 12
                            Layout.preferredHeight: 18
                            radius: 9
                            color: platformCard.vipActive ? "#fff3cd" : "#101f2937"
                            border.width: 1
                            border.color: platformCard.vipActive ? "#f4cf74" : "#161f2937"
                            Text {
                                id: vipBadgeText
                                anchors.centerIn: parent
                                text: platformCard.vipLabel
                                color: platformCard.vipActive ? "#a56508" : "#929aa7"
                                font.pixelSize: 9
                                font.bold: true
                            }
                        }
                    }
                    Text {
                        visible: !!platformCard.accountData.nickname
                        text: platformCard.vipActive
                            ? (platformCard.vipExpireDate !== ""
                                ? "会员有效期至 " + platformCard.vipExpireDate
                                : "会员权益生效中")
                            : "当前账号无有效会员权益"
                        color: platformCard.vipActive ? "#b7791f" : "#929aa7"
                        font.pixelSize: 10
                    }
                }

                Rectangle {
                    Layout.preferredWidth: platformCard.accountData.nickname ? 32 : 76
                    Layout.preferredHeight: 30
                    radius: 10
                    color: platformCard.accountData.nickname ? (actionMouse.containsMouse ? "#18e11d48" : "transparent") : platformCard.accent

                    Text {
                        anchors.centerIn: parent
                        text: platformCard.accountData.nickname ? "↪" : "登录账号"
                        color: platformCard.accountData.nickname ? (actionMouse.containsMouse ? "#e11d48" : "#929aa7") : "white"
                        font.pixelSize: 11
                        font.bold: true
                    }

                    MouseArea {
                        id: actionMouse
                        anchors.fill: parent
                        hoverEnabled: true
                        cursorShape: Qt.PointingHandCursor
                        onClicked: {
                            if (platformCard.accountData.nickname) {
                                bridge.logout(platformCard.platformKey)
                            } else {
                                bridge.set_platform(platformCard.platformKey)
                                bridge.toggle_login_modal()
                            }
                        }
                    }
                }
            }
        }
    }

    component QualityCard: Rectangle {
        id: qualityCard
        property string qualityKey: "high"
        property string label: "极高音质"
        property string detail: "320 Kbps"
        property bool selected: root.prefs.audioQuality === qualityKey
        Layout.preferredHeight: 62; radius: 12
        color: selected ? "#13e11d48" : "#0d1f2937"
        border.color: selected ? "#44e11d48" : "#121f2937"
        RowLayout { anchors.fill: parent; anchors.margins: 15; spacing: 10; Rectangle { Layout.preferredWidth: 18; Layout.preferredHeight: 18; radius: 9; color: qualityCard.selected ? "#e11d48" : "transparent"; border.color: qualityCard.selected ? "#e11d48" : "#a1a8b4"; Text { anchors.centerIn: parent; text: qualityCard.selected ? "✓" : ""; color: "white"; font.pixelSize: 10; font.bold: true } } ColumnLayout { Layout.fillWidth: true; spacing: 2; Text { text: qualityCard.label; color: "#374151"; font.pixelSize: 13; font.bold: true } Text { text: qualityCard.detail; color: "#929aa7"; font.pixelSize: 11 } } }
        MouseArea { anchors.fill: parent; onClicked: bridge.set_audio_quality(qualityCard.qualityKey) }
    }

    component SettingToggle: Rectangle {
        id: toggleRow
        property string settingKey: ""
        property string label: ""
        property string detail: ""
        property bool checked: root.prefs[settingKey] === true
        Layout.preferredHeight: 66; radius: 12
        color: "#0d1f2937"; border.color: "#121f2937"
        RowLayout {
            anchors.fill: parent; anchors.margins: 15; spacing: 10
            ColumnLayout { Layout.fillWidth: true; spacing: 3; Text { text: toggleRow.label; color: "#374151"; font.pixelSize: 13; font.bold: true } Text { Layout.fillWidth: true; text: toggleRow.detail; color: "#929aa7"; font.pixelSize: 11; elide: Text.ElideRight } }
            Rectangle {
                id: checkBox
                Layout.preferredWidth: 20; Layout.preferredHeight: 20; radius: 3
                color: toggleRow.checked ? "#fb3563" : "transparent"
                border.color: toggleRow.checked ? "#fb3563" : "#c5cbd4"
                scale: checkMouse.pressed ? 0.86 : checkMouse.containsMouse ? 1.07 : 1
                Behavior on color { ColorAnimation { duration: 150 } }
                Behavior on border.color { ColorAnimation { duration: 150 } }
                Behavior on scale { NumberAnimation { duration: 150; easing.type: Easing.OutBack } }
                Text { anchors.centerIn: parent; text: "✓"; visible: toggleRow.checked; color: "white"; font.pixelSize: 13; font.bold: true }
                MouseArea { id: checkMouse; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; onClicked: bridge.set_setting(toggleRow.settingKey, !toggleRow.checked) }
            }
        }
    }
}
