import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

ScrollView {
    id: root
    background: null
    padding: 0
    clip: true
    contentWidth: availableWidth
    contentHeight: aboutColumn.y + aboutColumn.implicitHeight + 48
    bottomPadding: 0
    onVisibleChanged: if (visible) contentY = 0
    ScrollBar.vertical: AppScrollBar {}

    ColumnLayout {
        id: aboutColumn
        anchors.horizontalCenter: parent.horizontalCenter
        width: Math.min(root.availableWidth - 56, 1100)
        y: 28
        spacing: 24

        RowLayout {
            Layout.fillWidth: true
            Layout.preferredHeight: 72
            ColumnLayout {
                spacing: 3
                Text { text: "关于"; color: "#18202d"; font.pixelSize: 30; font.weight: Font.ExtraBold }
                Text { text: "了解 Beta Music Player 的设计理念与开发者信息"; color: "#929aa7"; font.pixelSize: 13 }
            }
            Item { Layout.fillWidth: true }
            Rectangle {
                width: 115; height: 28; radius: 14; color: "#0d1f2937"; border.color: "#141f2937"
                RowLayout { anchors.centerIn: parent; spacing: 7
                    Rectangle {
                        width: 13; height: 13; radius: 7; border.color: "#ff2d55"; border.width: 2; color: "transparent"
                        Rectangle { width: 3; height: 3; radius: 2; color: "#ff2d55"; anchors.centerIn: parent }
                        RotationAnimation on rotation { from: 0; to: 360; duration: 5000; loops: Animation.Infinite; running: root.visible }
                    }
                    Text { text: "v" + appVersion + " 正式版"; color: "#7d8796"; font.pixelSize: 11; font.weight: Font.DemiBold }
                }
            }
        }
        Rectangle { Layout.fillWidth: true; height: 1; color: "#141f2937"; Layout.topMargin: -34 }

        SectionCard {
            Layout.topMargin: -15
            title: "开发者信息"; iconName: "user"; cardHeight: 192
            InnerPanel {
                anchors.left: parent.left; anchors.right: parent.right; anchors.bottom: parent.bottom
                anchors.leftMargin: 24; anchors.rightMargin: 24; anchors.bottomMargin: 24
                height: 98
                RowLayout { anchors.fill: parent; anchors.margins: 20; spacing: 16
                    Rectangle {
                        width: 58; height: 58; radius: 29
                        gradient: Gradient { GradientStop { position: 0; color: "#8b5cf6" } GradientStop { position: 0.52; color: "#c026d3" } GradientStop { position: 1; color: "#ff2d55" } }
                        Text { anchors.centerIn: parent; text: "R"; color: "#18202d"; font.pixelSize: 22; font.bold: true }
                    }
                    ColumnLayout { Layout.fillWidth: true; spacing: 5
                        RowLayout { spacing: 8
                            Text { text: "RubenCampoa"; color: "#253044"; font.pixelSize: 19; font.bold: true }
                            Rectangle { width: 65; height: 22; radius: 11; color: "#15ff2d55"; border.color: "#40ff2d55"; Text { anchors.centerIn: parent; text: "项目作者"; color: "#ff2d55"; font.pixelSize: 10; font.bold: true } }
                        }
                        Text { text: "喜欢 vibe coding，有创意的高中生 AI 开发者。"; color: "#7d8796"; font.pixelSize: 11 }
                    }
                    ActionButton { text: "♧  访问 GitHub 主页  ↗"; width: 170; onClicked: Qt.openUrlExternally("https://github.com/RubenCampoa") }
                }
            }
        }

        SectionCard {
            title: "开源仓库"; iconName: "github"; cardHeight: 180
            InnerPanel {
                anchors.left: parent.left; anchors.right: parent.right; anchors.bottom: parent.bottom
                anchors.leftMargin: 24; anchors.rightMargin: 24; anchors.bottomMargin: 24
                height: 86
                RowLayout { anchors.fill: parent; anchors.margins: 20
                    ColumnLayout { Layout.fillWidth: true; spacing: 6
                        Text { text: "RubenCampoa / Beta-music-player"; color: "#253044"; font.pixelSize: 15; font.bold: true }
                        Text { text: "项目代码完全开源，欢迎 Star、提交 Issue 或 Contributing 代码！"; color: "#7d8796"; font.pixelSize: 11 }
                    }
                    ActionButton { text: "♧  项目 GitHub 仓库  ↗"; width: 170; accent: true; onClicked: Qt.openUrlExternally("https://github.com/RubenCampoa/Beta-music-player") }
                }
            }
        }

        SectionCard {
            title: "项目设计与特性"; iconName: "sparkles"; cardHeight: 214
            RowLayout {
                anchors.left: parent.left; anchors.right: parent.right; anchors.bottom: parent.bottom
                anchors.leftMargin: 24; anchors.rightMargin: 24; anchors.bottomMargin: 24; spacing: 14
                FeaturePanel { Layout.fillWidth: true; icon: "♫"; title: "现代视觉风格"; detail: "基于专辑封面主色调渲染流体渐变光斑背景，搭配浅色毛玻璃界面。" }
                FeaturePanel { Layout.fillWidth: true; icon: "◇"; title: "全景 60FPS 动效歌词"; detail: "GPU 变形、逐字点亮和阶梯景深模糊，让歌词切换保持顺滑。" }
            }
        }

        RowLayout { Layout.alignment: Qt.AlignHCenter; spacing: 5
            Text { text: "Made with"; color: "#a1a8b4"; font.pixelSize: 11 }
            Text { text: "♥"; color: "#ff2d55"; font.pixelSize: 13 }
            Text { text: "by RubenCampoa & Open Source Community"; color: "#a1a8b4"; font.pixelSize: 11 }
        }
    }

    component SectionCard: Rectangle {
        id: section
        property string title: ""; property string iconName: "music"; property int cardHeight: 180
        Layout.fillWidth: true; Layout.preferredHeight: cardHeight; radius: 18
        color: "#c8ffffff"; border.color: "#141f2937"
        property bool hovered: sectionMouse.containsMouse
        transform: Translate { y: section.hovered ? -3 : 0; Behavior on y { NumberAnimation { duration: 240; easing.type: Easing.OutCubic } } }
        scale: sectionMouse.pressed ? 0.995 : 1
        Behavior on scale { NumberAnimation { duration: 130; easing.type: Easing.OutCubic } }
        RowLayout { anchors.left: parent.left; anchors.top: parent.top; anchors.leftMargin: 24; anchors.topMargin: 23; spacing: 10
            AppIcon { name: section.iconName; color: "#ff2d55"; width: 21; height: 21 }
            Text { text: section.title; color: "#253044"; font.pixelSize: 18; font.bold: true }
        }
        MouseArea { id: sectionMouse; anchors.fill: parent; hoverEnabled: true; acceptedButtons: Qt.NoButton }
    }
    component InnerPanel: Rectangle { radius: 13; color: "#0b1f2937"; border.color: "#141f2937" }
    component FeaturePanel: Rectangle {
        id: feature
        property string icon: ""; property string title: ""; property string detail: ""
        Layout.preferredHeight: 102; radius: 13; color: "#0b1f2937"; border.color: "#141f2937"
        RowLayout { anchors.fill: parent; anchors.margins: 18; spacing: 12
            Text { text: feature.icon; color: "#ff2d55"; font.pixelSize: 20 }
            ColumnLayout { Layout.fillWidth: true; spacing: 7
                Text { text: feature.title; color: "#253044"; font.pixelSize: 13; font.bold: true }
                Text { Layout.fillWidth: true; text: feature.detail; color: "#7d8796"; font.pixelSize: 10; wrapMode: Text.WordWrap; lineHeight: 1.35 }
            }
        }
    }
    component ActionButton: Rectangle {
        id: action
        property string text: ""; property bool accent: false; signal clicked()
        height: 36; radius: 11; color: accent ? (actionMouse.containsMouse ? "#fa233b" : "#ff2d55") : actionMouse.containsMouse ? "#161f2937" : "#0b1f2937"
        border.color: accent ? "transparent" : "#161f2937"; scale: actionMouse.pressed ? 0.95 : 1
        Behavior on color { ColorAnimation { duration: 160 } }
        Behavior on scale { NumberAnimation { duration: 130; easing.type: Easing.OutBack } }
        Text { anchors.centerIn: parent; text: action.text; color: action.accent ? "white" : "#4b5563"; font.pixelSize: 11; font.bold: action.accent }
        MouseArea { id: actionMouse; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; onClicked: action.clicked() }
    }
}
