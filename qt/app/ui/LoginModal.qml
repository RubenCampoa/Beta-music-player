import QtQuick
import QtQuick.Layouts
import QtQuick.Effects

Item {
    id: root
    property bool showCredentialInput: false
    property bool forceShowQr: false

    property var accountsData: bridge.accounts
    readonly property var currentAccount: (accountsData && accountsData[bridge.loginPlatform]) || ({})
    readonly property bool isLoggedIn: !!(currentAccount && currentAccount.nickname)

    function accent(platform) {
        return platform === "qq" ? "#10b981"
             : platform === "kugou" ? "#0ea5e9" : "#f43f5e"
    }
    function platformName(platform) {
        return platform === "qq" ? "QQ 音乐"
             : platform === "kugou" ? "酷狗概念版" : "网易云音乐"
    }
    function loginTitle(platform) {
        return platformName(platform) + "账号登录"
    }

    Connections {
        target: bridge
        function onLoginPlatformChanged() {
            root.forceShowQr = false
            root.showCredentialInput = false
        }
    }

    // 1. 半透明柔和暗色背景遮罩与微弱环境彩光
    Rectangle {
        anchors.fill: parent
        color: "#4d0a1410"

        Rectangle {
            anchors.centerIn: parent
            width: 440
            height: 520
            radius: 220
            color: root.accent(bridge.loginPlatform)
            opacity: 0.16
            layer.enabled: true
            layer.effect: MultiEffect {
                blurEnabled: true
                blurMax: 64
                blur: 1.0
            }
        }

        MouseArea { anchors.fill: parent; onClicked: bridge.toggle_login_modal() }
    }

    // 2. 悬浮毛玻璃晶体弹窗卡片 (Glassmorphism Modal Card)
    Rectangle {
        id: card
        anchors.centerIn: parent
        width: 380
        height: 490
        radius: 30
        color: "#5c2a3832"
        border.width: 1.2
        border.color: "#35ffffff"
        layer.enabled: true
        layer.smooth: true
        layer.effect: MultiEffect {
            shadowEnabled: true
            shadowColor: "#80000000"
            shadowBlur: 0.85
            shadowVerticalOffset: 18
            blurMax: 48
        }

        // 内高光细线边框
        Rectangle {
            anchors.fill: parent
            anchors.margins: 1
            radius: card.radius - 1
            color: "transparent"
            border.width: 1
            border.color: "#18ffffff"
        }

        MouseArea { anchors.fill: parent }

        // 右上角关闭按钮：精致的毛玻璃圆钮
        Rectangle {
            id: closeButton
            anchors.top: parent.top
            anchors.right: parent.right
            anchors.topMargin: 16
            anchors.rightMargin: 16
            width: 32
            height: 32
            radius: 16
            color: closeMouse.containsMouse ? "#45ffffff" : "#28ffffff"
            border.width: 1
            border.color: "#35ffffff"
            z: 30
            Behavior on color { ColorAnimation { duration: 140 } }
            AppIcon {
                anchors.centerIn: parent
                name: "x"
                color: "#ffffff"
                width: 12
                height: 12
                strokeWidth: 2.2
            }
            MouseArea {
                id: closeMouse
                anchors.fill: parent
                hoverEnabled: true
                cursorShape: Qt.PointingHandCursor
                onClicked: bridge.toggle_login_modal()
            }
        }

        // 主内容垂直流（严格全局几何水平居中、垂直居中）
        Column {
            anchors.centerIn: parent
            width: parent.width - 40
            spacing: 12

            // 1. 顶部平台切换胶囊
            Rectangle {
                anchors.horizontalCenter: parent.horizontalCenter
                width: 310
                height: 36
                radius: 18
                color: "#24000000"
                border.width: 1
                border.color: "#28ffffff"

                Row {
                    anchors.centerIn: parent
                    spacing: 2
                    Repeater {
                        model: [
                            { key: "netease", name: "网易云" },
                            { key: "qq", name: "QQ 音乐" },
                            { key: "kugou", name: "酷狗概念版" }
                        ]
                        delegate: Rectangle {
                            required property var modelData
                            readonly property bool selected: bridge.loginPlatform === modelData.key
                            width: 100
                            height: 30
                            radius: 15
                            color: selected ? root.accent(modelData.key) : "transparent"
                            Behavior on color { ColorAnimation { duration: 180 } }
                            Row {
                                anchors.centerIn: parent
                                spacing: 4
                                Rectangle {
                                    anchors.verticalCenter: parent.verticalCenter
                                    width: 6; height: 6; radius: 3
                                    color: selected ? "#ffffff" : root.accent(modelData.key)
                                }
                                Text {
                                    anchors.verticalCenter: parent.verticalCenter
                                    text: modelData.name
                                    color: selected ? "#ffffff" : "#cbd5e1"
                                    font.pixelSize: 11
                                    font.weight: Font.DemiBold
                                }
                            }
                            MouseArea {
                                anchors.fill: parent
                                cursorShape: Qt.PointingHandCursor
                                onClicked: {
                                    root.forceShowQr = false
                                    root.showCredentialInput = false
                                    bridge.set_platform(modelData.key)
                                    bridge.begin_login(modelData.key)
                                }
                            }
                        }
                    }
                }
            }

            // 2. 标题区（带圆角图标 + 粗体标题）
            Row {
                anchors.horizontalCenter: parent.horizontalCenter
                spacing: 8
                Rectangle {
                    anchors.verticalCenter: parent.verticalCenter
                    width: 28; height: 28; radius: 8
                    color: root.accent(bridge.loginPlatform)
                    AppIcon {
                        anchors.centerIn: parent
                        name: root.isLoggedIn && !root.forceShowQr ? "user" : "qr-code"
                        color: "white"
                        width: 14; height: 14
                        strokeWidth: 2.2
                    }
                }
                Text {
                    anchors.verticalCenter: parent.verticalCenter
                    text: root.isLoggedIn && !root.forceShowQr
                          ? root.platformName(bridge.loginPlatform) + " 已登录"
                          : root.loginTitle(bridge.loginPlatform)
                    color: "#ffffff"
                    font.pixelSize: 18
                    font.weight: Font.Bold
                }
            }

            // 3. 副标题
            Text {
                anchors.horizontalCenter: parent.horizontalCenter
                text: "扫码同步您的个人歌单与无损音乐资产"
                color: "#cbd5e1"
                font.pixelSize: 11
            }

            // 4. 内容主体（已登录卡片 VS 未登录二维码/Cookie）
            Item {
                anchors.horizontalCenter: parent.horizontalCenter
                width: parent.width
                height: root.isLoggedIn && !root.forceShowQr ? 275 : 275

                // A. 已登录卡片
                Column {
                    anchors.centerIn: parent
                    width: parent.width
                    spacing: 16
                    visible: root.isLoggedIn && !root.forceShowQr

                    Rectangle {
                        anchors.horizontalCenter: parent.horizontalCenter
                        width: 290
                        height: 168
                        radius: 20
                        color: "#25ffffff"
                        border.width: 1
                        border.color: "#30ffffff"

                        Column {
                            anchors.centerIn: parent
                            spacing: 8

                            Rectangle {
                                anchors.horizontalCenter: parent.horizontalCenter
                                width: 60; height: 60; radius: 30
                                color: "#202837"
                                border.width: 2
                                border.color: root.accent(bridge.loginPlatform)
                                clip: true
                                RoundedImage {
                                    anchors.fill: parent
                                    source: root.currentAccount.avatarUrl || ""
                                    radius: 30
                                    preferredSourceSize: 128
                                }
                            }

                            Text {
                                anchors.horizontalCenter: parent.horizontalCenter
                                text: root.currentAccount.nickname || "未知用户"
                                color: "#ffffff"
                                font.pixelSize: 16
                                font.weight: Font.Bold
                                elide: Text.ElideRight
                            }

                            Row {
                                anchors.horizontalCenter: parent.horizontalCenter
                                spacing: 6

                                Rectangle {
                                    height: 20
                                    width: badgeText.implicitWidth + 14
                                    radius: 10
                                    color: "#2234d399"
                                    border.color: "#4434d399"
                                    Row {
                                        anchors.centerIn: parent
                                        spacing: 4
                                        Rectangle { anchors.verticalCenter: parent.verticalCenter; width: 5; height: 5; radius: 3; color: "#34d399" }
                                        Text { id: badgeText; text: "在线已同步"; color: "#34d399"; font.pixelSize: 10; font.bold: true }
                                    }
                                }

                                Rectangle {
                                    visible: !!root.currentAccount.vip
                                    height: 20
                                    width: vipText.implicitWidth + 14
                                    radius: 10
                                    color: "#22f59e0b"
                                    border.color: "#44f59e0b"
                                    Text { id: vipText; anchors.centerIn: parent; text: "VIP 会员"; color: "#f59e0b"; font.pixelSize: 10; font.bold: true }
                                }
                            }
                        }
                    }

                    Row {
                        anchors.horizontalCenter: parent.horizontalCenter
                        spacing: 12

                        GlassAction {
                            label: "重新扫码"
                            iconName: "refresh-cw"
                            preferredWidth: 105
                            onClicked: {
                                root.forceShowQr = true
                                bridge.begin_login(bridge.loginPlatform)
                            }
                        }

                        GlassAction {
                            label: "退出登录"
                            iconName: "log-out"
                            filled: true
                            actionColor: "#dc2626"
                            preferredWidth: 105
                            onClicked: {
                                bridge.logout(bridge.loginPlatform)
                                root.forceShowQr = true
                                bridge.begin_login(bridge.loginPlatform)
                            }
                        }
                    }
                }

                // B. 未登录二维码 / Cookie 输入
                Column {
                    anchors.centerIn: parent
                    width: parent.width
                    spacing: 11
                    visible: !root.isLoggedIn || root.forceShowQr

                    // 二维码白底卡片
                    Rectangle {
                        anchors.horizontalCenter: parent.horizontalCenter
                        width: 168
                        height: 168
                        radius: 20
                        color: "#ffffff"
                        visible: !root.showCredentialInput
                        border.width: 1
                        border.color: "#25ffffff"
                        layer.enabled: true
                        layer.effect: MultiEffect {
                            shadowEnabled: true
                            shadowColor: "#30000000"
                            shadowBlur: 0.50
                            shadowVerticalOffset: 6
                            blurMax: 24
                        }

                        Image {
                            anchors.fill: parent
                            anchors.margins: 10
                            source: bridge.loginQrImage
                            fillMode: Image.PreserveAspectFit
                            asynchronous: true
                            visible: bridge.loginQrImage !== ""
                        }
                        Column {
                            anchors.centerIn: parent
                            visible: bridge.loginQrImage === ""
                            spacing: 6
                            AppIcon {
                                anchors.horizontalCenter: parent.horizontalCenter
                                name: "refresh-cw"
                                color: root.accent(bridge.loginPlatform)
                                width: 26; height: 26
                                strokeWidth: 2.2
                                RotationAnimator on rotation {
                                    from: 0; to: 360; duration: 1100
                                    loops: Animation.Infinite
                                    running: bridge.loginQrImage === ""
                                }
                            }
                            Text {
                                anchors.horizontalCenter: parent.horizontalCenter
                                text: "正在生成二维码…"
                                color: "#64748b"
                                font.pixelSize: 11
                            }
                        }
                    }

                    // Cookie 输入面板
                    Rectangle {
                        anchors.horizontalCenter: parent.horizontalCenter
                        width: 300
                        height: 172
                        radius: 16
                        color: "#25000000"
                        border.width: 1
                        border.color: "#30ffffff"
                        visible: root.showCredentialInput

                        Column {
                            anchors.fill: parent
                            anchors.margins: 12
                            spacing: 8

                            Text {
                                text: "粘贴 " + root.platformName(bridge.loginPlatform) + " Cookie 凭证"
                                color: "#f1f5f9"
                                font.pixelSize: 11
                                font.weight: Font.DemiBold
                            }
                            Rectangle {
                                width: parent.width
                                height: 76
                                radius: 8
                                color: "#40000000"
                                border.color: qqCookieInput.activeFocus ? root.accent(bridge.loginPlatform) : "#24ffffff"
                                TextInput {
                                    id: qqCookieInput
                                    anchors.fill: parent
                                    anchors.margins: 8
                                    color: "white"
                                    font.pixelSize: 10
                                    selectByMouse: true
                                    clip: true
                                }
                            }
                            Row {
                                anchors.right: parent.right
                                spacing: 8
                                GlassAction {
                                    label: "取消"
                                    preferredWidth: 64
                                    height: 30
                                    onClicked: root.showCredentialInput = false
                                }
                                GlassAction {
                                    label: "确认绑定"
                                    filled: true
                                    actionColor: root.accent(bridge.loginPlatform)
                                    preferredWidth: 84
                                    height: 30
                                    onClicked: {
                                        if (qqCookieInput.text.trim().length > 0) {
                                            bridge.complete_web_login(bridge.loginPlatform, qqCookieInput.text.trim())
                                            qqCookieInput.text = ""
                                            root.showCredentialInput = false
                                        }
                                    }
                                }
                            }
                        }
                    }

                    // 扫码状态胶囊 (如：请使用网易云音乐/QQ音乐 App 扫码登录)
                    Rectangle {
                        anchors.horizontalCenter: parent.horizontalCenter
                        width: Math.min(300, Math.max(210, statusRow.implicitWidth + 28))
                        height: 30
                        radius: 15
                        color: "#28ffffff"
                        border.width: 1
                        border.color: "#30ffffff"

                        Row {
                            id: statusRow
                            anchors.centerIn: parent
                            spacing: 6
                            AppIcon {
                                anchors.verticalCenter: parent.verticalCenter
                                name: "circle-alert"
                                color: root.accent(bridge.loginPlatform)
                                width: 13; height: 13
                                strokeWidth: 2
                            }
                            Text {
                                id: statusText
                                text: bridge.loginStatus ? bridge.loginStatus : (bridge.loginPlatform === "qq" ? "请使用 QQ 音乐 App 扫码登录" : bridge.loginPlatform === "kugou" ? "请使用微信扫码登录酷狗概念版" : "请使用网易云音乐 App 扫码登录")
                                color: "#f1f5f9"
                                font.pixelSize: 11
                                font.weight: Font.DemiBold
                            }
                        }
                    }

                    // 辅助链接 (返回账号信息)
                    Row {
                        anchors.horizontalCenter: parent.horizontalCenter
                        spacing: 12
                        visible: root.isLoggedIn && root.forceShowQr

                        Text {
                            text: "返回账号信息"
                            color: root.accent(bridge.loginPlatform)
                            font.pixelSize: 10
                            font.underline: returnLinkMouse.containsMouse
                            MouseArea {
                                id: returnLinkMouse
                                anchors.fill: parent
                                hoverEnabled: true
                                cursorShape: Qt.PointingHandCursor
                                onClicked: root.forceShowQr = false
                            }
                        }
                    }

                    // 操作按钮组
                    Row {
                        anchors.horizontalCenter: parent.horizontalCenter
                        spacing: 8

                        GlassAction {
                            label: "刷新"
                            iconName: "refresh-cw"
                            preferredWidth: 70
                            onClicked: bridge.refresh_login_qr()
                        }

                        GlassAction {
                            label: "Cookie 绑定"
                            iconName: "music"
                            preferredWidth: 92
                            visible: true
                            onClicked: root.showCredentialInput = !root.showCredentialInput
                        }

                        GlassAction {
                            label: "网页端登录"
                            iconName: "globe"
                            filled: true
                            actionColor: root.accent(bridge.loginPlatform)
                            preferredWidth: 100
                            visible: true
                            onClicked: {
                                bridge.login_via_web(bridge.loginPlatform)
                                root.showCredentialInput = true
                            }
                        }
                    }
                }
            }

            // 5. 底部安全背书提示
            Row {
                anchors.horizontalCenter: parent.horizontalCenter
                spacing: 5
                AppIcon {
                    anchors.verticalCenter: parent.verticalCenter
                    name: "shield-check"
                    color: root.accent(bridge.loginPlatform)
                    width: 12; height: 12
                    strokeWidth: 2
                }
                Text {
                    anchors.verticalCenter: parent.verticalCenter
                    text: "基于" + (bridge.loginPlatform === "qq" ? "QQ 音乐" : bridge.loginPlatform === "kugou" ? "酷狗音乐" : "网易云音乐") + "官方 API 通信 · 安全加密"
                    color: "#a0b2be"
                    font.pixelSize: 10
                }
            }
        }
    }

    component GlassAction: Rectangle {
        id: action
        property string label: ""
        property string iconName: ""
        property bool filled: false
        property color actionColor: "#28ffffff"
        property int preferredWidth: 80
        signal clicked()
        width: preferredWidth
        height: 36
        radius: 18
        color: filled ? (actionMouse.containsMouse ? Qt.lighter(actionColor, 1.1) : actionColor)
                      : (actionMouse.containsMouse ? "#40ffffff" : "#28ffffff")
        border.width: 1
        border.color: filled ? "#40ffffff" : "#30ffffff"
        scale: actionMouse.pressed ? 0.96 : 1
        Behavior on color { ColorAnimation { duration: 150 } }
        Behavior on scale { NumberAnimation { duration: 120; easing.type: Easing.OutCubic } }
        Row {
            anchors.centerIn: parent
            spacing: 5
            AppIcon {
                anchors.verticalCenter: parent.verticalCenter
                visible: action.iconName !== ""
                name: action.iconName
                color: "white"
                width: 13; height: 13
                strokeWidth: 2.2
            }
            Text {
                anchors.verticalCenter: parent.verticalCenter
                text: action.label
                color: "white"
                font.pixelSize: 11
                font.weight: Font.DemiBold
            }
        }
        MouseArea {
            id: actionMouse
            anchors.fill: parent
            hoverEnabled: true
            cursorShape: Qt.PointingHandCursor
            onClicked: action.clicked()
        }
    }
}
