import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

ScrollView {
    id: root
    background: null
    padding: 0
    clip: true; contentWidth: availableWidth; contentHeight: noticeColumn.y + noticeColumn.implicitHeight + 48; bottomPadding: 0
    onVisibleChanged: if (visible) contentY = 0
    ScrollBar.vertical: AppScrollBar {}

    ColumnLayout {
        id: noticeColumn
        anchors.horizontalCenter: parent.horizontalCenter
        width: Math.min(root.availableWidth - 56, 1100)
        y: 28
        spacing: 24

        RowLayout {
            Layout.fillWidth: true; Layout.preferredHeight: 72
            ColumnLayout { Layout.topMargin: 4; spacing: 3
                Text { text: "注意事项"; color: "#18202d"; font.pixelSize: 30; font.weight: Font.ExtraBold }
                Text { text: "请阅读以下使用须知、性能提示与反馈通道"; color: "#929aa7"; font.pixelSize: 13 }
            }
            Item { Layout.fillWidth: true }
            Rectangle { width: 94; height: 28; radius: 14; color: "#14f59e0b"; border.color: "#40f59e0b"
                Text { anchors.centerIn: parent; text: "△  使用须知"; color: "#f59e0b"; font.pixelSize: 11; font.bold: true }
            }
        }
        Rectangle { Layout.fillWidth: true; height: 1; color: "#141f2937"; Layout.topMargin: -34 }

        NoticeSection {
            Layout.topMargin: -15
            title: "问题反馈与 Bug 提交"; iconName: "github"; accent: "#ff2d55"; cardHeight: 202
            Rectangle {
                anchors.left: parent.left; anchors.right: parent.right; anchors.bottom: parent.bottom
                anchors.leftMargin: 24; anchors.rightMargin: 24; anchors.bottomMargin: 24
                height: 108; radius: 13; color: "#0b1f2937"; border.color: "#141f2937"
                RowLayout { anchors.fill: parent; anchors.margins: 20; spacing: 18
                    ColumnLayout { Layout.fillWidth: true; spacing: 7
                        Text { text: "优先前往 GitHub 提交 Issue"; color: "#253044"; font.pixelSize: 15; font.bold: true }
                        Text { Layout.fillWidth: true; text: "若在播放、歌词显示或扫码登录过程中遇到任何问题或异常，请优先到 GitHub 仓库提交 Issue，作者看到后会第一时间跟进与修复。"; color: "#7d8796"; font.pixelSize: 10; wrapMode: Text.WordWrap; lineHeight: 1.4 }
                    }
                    ActionButton { text: "♧  提交 GitHub Issue  ↗"; width: 174; accent: true; onClicked: Qt.openUrlExternally("https://github.com/RubenCampoa/Beta-music-player/issues") }
                }
            }
        }

        NoticeSection {
            title: "AI 辅助编写声明"; iconName: "sparkles"; accent: "#a855f7"; cardHeight: 178
            InfoPanel { title: "◇  AI 辅助开发"; detail: "本项目在开发过程中使用了 AI 辅助开发，协助完成前端架构、流体色彩算法、歌词渲染与性能优化等功能。" }
        }

        NoticeSection {
            title: "性能与卡顿优化建议"; iconName: "settings"; accent: "#f59e0b"; cardHeight: 202
            Rectangle {
                anchors.left: parent.left; anchors.right: parent.right; anchors.bottom: parent.bottom
                anchors.leftMargin: 24; anchors.rightMargin: 24; anchors.bottomMargin: 24
                height: 108; radius: 13; color: "#0b1f2937"; border.color: "#30f59e0b"
                RowLayout { anchors.fill: parent; anchors.margins: 20; spacing: 18
                    ColumnLayout { Layout.fillWidth: true; spacing: 7
                        Text { text: "△  中低配设备推荐仅开启“全景流体模糊背景”"; color: "#253044"; font.pixelSize: 14; font.bold: true }
                        Text { Layout.fillWidth: true; text: "若歌词滑动存在卡顿，可关闭歌词弹性随动、高光发光与景深模糊，以降低 GPU 渲染开销。"; color: "#7d8796"; font.pixelSize: 10; wrapMode: Text.WordWrap }
                    }
                    ActionButton { text: "一键设置"; width: 88; onClicked: bridge.apply_performance_preset() }
                }
            }
        }
    }

    component NoticeSection: Rectangle {
        id: section
        property string title: ""; property string iconName: "info"; property color accent: "#ff2d55"; property int cardHeight: 180
        Layout.fillWidth: true; Layout.preferredHeight: cardHeight; radius: 18; color: "#c8ffffff"; border.color: "#141f2937"
        transform: Translate { y: sectionMouse.containsMouse ? -3 : 0; Behavior on y { NumberAnimation { duration: 240; easing.type: Easing.OutCubic } } }
        RowLayout { anchors.left: parent.left; anchors.top: parent.top; anchors.leftMargin: 24; anchors.topMargin: 23; spacing: 10
            AppIcon { name: section.iconName; color: section.accent; width: 21; height: 21 }
            Text { text: section.title; color: "#253044"; font.pixelSize: 18; font.bold: true }
        }
        MouseArea { id: sectionMouse; anchors.fill: parent; hoverEnabled: true; acceptedButtons: Qt.NoButton }
    }
    component InfoPanel: Rectangle {
        property string title: ""; property string detail: ""
        anchors.left: parent.left; anchors.right: parent.right; anchors.bottom: parent.bottom
        anchors.leftMargin: 24; anchors.rightMargin: 24; anchors.bottomMargin: 24
        height: 84; radius: 13; color: "#0b1f2937"; border.color: "#141f2937"
        ColumnLayout { anchors.fill: parent; anchors.margins: 18; spacing: 7
            Text { text: parent.parent.title; color: "#374151"; font.pixelSize: 13; font.bold: true }
            Text { Layout.fillWidth: true; text: parent.parent.detail; color: "#7d8796"; font.pixelSize: 10; wrapMode: Text.WordWrap; lineHeight: 1.35 }
        }
    }
    component ActionButton: Rectangle {
        id: action
        property string text: ""; property bool accent: false; signal clicked()
        height: 38; radius: 12; color: accent ? (mouse.containsMouse ? "#fa233b" : "#ff2d55") : mouse.containsMouse ? "#1a1f2937" : "#0d1f2937"
        border.color: accent ? "transparent" : "#141f2937"; scale: mouse.pressed ? 0.95 : mouse.containsMouse ? 1.025 : 1
        Behavior on color { ColorAnimation { duration: 160 } }
        Behavior on scale { NumberAnimation { duration: 140; easing.type: Easing.OutBack } }
        Text { anchors.centerIn: parent; text: action.text; color: accent ? "white" : "#4b5563"; font.pixelSize: 10; font.bold: true }
        MouseArea { id: mouse; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; onClicked: action.clicked() }
    }
}
