// 原版 188px 资料库侧栏。
import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

Rectangle {
    id: sidebar
    readonly property var syncedPlaylists: bridge.playlistsModel
    property real uiScale: 1.0
    Layout.preferredWidth: 188
    Layout.minimumWidth: 188
    Layout.maximumWidth: 188
    Layout.fillHeight: true
    color: "#f9fafc"
    border.color: "#121f2937"
    border.width: 1

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: 12
        spacing: 0

        // 1. 顶部推荐区
        SectionLabel { text: "推荐"; Layout.topMargin: 2 }
        NavItem { text: "现在就听"; icon: "circle-play"; active: bridge.viewMode === "discover"; onClicked: bridge.set_view_mode("discover") }
        NavItem { text: "浏览"; icon: "compass"; active: bridge.viewMode === "browse"; onClicked: { bridge.set_view_mode("browse"); bridge.load_browse("all") } }

        Item { Layout.preferredHeight: 12 }
        // 2. 资料库区
        SectionLabel { text: "资料库" }
        NavItem { text: "本地音乐"; icon: "hard-drive"; active: bridge.viewMode === "local"; onClicked: bridge.set_view_mode("local") }

        Item { Layout.preferredHeight: 12 }
        // 3. 歌单区（自适应滚动，占满中间剩余空间）
        RowLayout {
            Layout.fillWidth: true; Layout.leftMargin: 11; Layout.rightMargin: 10
            Text { Layout.fillWidth: true; text: (bridge.platform === "qq" ? "QQ音乐" : bridge.platform === "kugou" ? "酷狗" : "网易云") + "歌单"; color: "#697689"; font.pixelSize: 12; font.bold: true }
            AppIcon { name: "list-music"; color: "#a0a8b4"; Layout.preferredWidth: 14; Layout.preferredHeight: 14 }
        }
        Item { Layout.preferredHeight: 6 }

        ScrollView {
            Layout.fillWidth: true
            Layout.fillHeight: true
            Layout.minimumHeight: 40
            clip: true
            ScrollBar.horizontal.policy: ScrollBar.AlwaysOff
            ScrollBar.vertical: AppScrollBar { width: 3 }

            ColumnLayout {
                width: parent.width
                spacing: 2

                PlaylistItem {
                    visible: sidebar.syncedPlaylists.count === 0
                    text: bridge.account.nickname ? "暂无同步歌单" : "点击登录同步歌单"
                    muted: true
                    onClicked: bridge.toggle_login_modal()
                }
                Repeater {
                    model: sidebar.syncedPlaylists
                    delegate: PlaylistItem {
                        required property int index
                        text: sidebar.syncedPlaylists.get(index).name
                        onClicked: bridge.open_user_playlist(index)
                    }
                }
            }
        }

        // 4. 底部系统区（始终固定在底部，绝不被遮挡）
        Item { Layout.preferredHeight: 8 }
        Rectangle { Layout.fillWidth: true; Layout.preferredHeight: 1; color: "#1a1f2937"; Layout.bottomMargin: 6 }
        NavItem { text: "设置"; icon: "settings"; active: bridge.viewMode === "settings"; onClicked: bridge.set_view_mode("settings") }
        NavItem { text: "注意事项"; icon: "triangle-alert"; active: bridge.viewMode === "notice"; onClicked: bridge.set_view_mode("notice") }
        NavItem { text: "更新日志"; icon: "history"; active: bridge.viewMode === "changelog"; onClicked: bridge.set_view_mode("changelog") }
        NavItem { text: "关于"; icon: "info"; active: bridge.viewMode === "about"; onClicked: bridge.set_view_mode("about") }
        Rectangle { Layout.fillWidth: true; Layout.preferredHeight: 1; color: "#1a1f2937"; Layout.topMargin: 6; Layout.bottomMargin: 6 }
        RowLayout {
            Layout.fillWidth: true; Layout.leftMargin: 11; spacing: 8
            Text { text: "Beta Music Player"; color: "#929aa7"; font.pixelSize: 10; Layout.fillWidth: true }
            Rectangle { Layout.preferredWidth: 62; Layout.preferredHeight: 18; radius: 5; color: "#ffffff"; border.color: "#101f2937"; Text { anchors.centerIn: parent; text: "v" + appVersion; color: "#8d97a6"; font.pixelSize: 8 } }
        }
        Item { Layout.preferredHeight: 3 }
    }

    component SectionLabel: Text {
        Layout.fillWidth: true; Layout.leftMargin: 11; Layout.bottomMargin: 8
        color: "#697689"; font.pixelSize: Math.round(12 * sidebar.uiScale); font.bold: true
    }
    component NavItem: Rectangle {
        id: nav
        property string text: ""; property string icon: ""; property bool active: false
        property bool hovered: navHover.hovered
        property bool pressed: navTap.pressed
        signal clicked()
        Layout.fillWidth: true; Layout.preferredHeight: Math.round(39 * sidebar.uiScale); radius: 8
        // Animate alpha over a stable white RGB base. QML's named
        // "transparent" is transparent black, which produces a grey/black
        // interpolation frame when entering the white hover state.
        color: active ? "#f0ffffff" : pressed ? "#d9ffffff" : hovered ? "#a8ffffff" : "#00ffffff"
        border.color: active ? "#141f2937" : hovered || pressed ? "#0d1f2937" : "#001f2937"; border.width: 1
        scale: pressed ? 0.985 : 1
        Behavior on color { ColorAnimation { duration: 150; easing.type: Easing.InOutQuad } }
        Behavior on border.color { ColorAnimation { duration: 150; easing.type: Easing.InOutQuad } }
        Behavior on scale { NumberAnimation { duration: 110; easing.type: Easing.OutCubic } }
        AppIcon { id: navIcon; anchors.left: parent.left; anchors.leftMargin: 12; anchors.verticalCenter: parent.verticalCenter; name: nav.icon; color: nav.active ? "#253044" : "#8190a4"; width: 16; height: 16; Behavior on color { ColorAnimation { duration: 160 } } }
        Text { anchors.left: navIcon.right; anchors.leftMargin: 12; anchors.verticalCenter: parent.verticalCenter; text: nav.text; color: nav.active ? "#253044" : nav.hovered ? "#263246" : "#59677a"; font.pixelSize: 14; font.weight: nav.active ? Font.DemiBold : Font.Normal; Behavior on color { ColorAnimation { duration: 160 } } }
        HoverHandler { id: navHover; cursorShape: Qt.PointingHandCursor }
        TapHandler { id: navTap; onTapped: nav.clicked() }
    }
    component PlaylistItem: Rectangle {
        id: playlist
        property string text: ""; property bool muted: false
        property bool hovered: playlistHover.hovered
        signal clicked()
        Layout.fillWidth: true; Layout.preferredHeight: 30; radius: 7; color: hovered ? "#eef1f4" : "#f9fafc"
        Behavior on color { ColorAnimation { duration: 120 } }
        RowLayout { anchors.fill: parent; anchors.leftMargin: 12; spacing: 9; AppIcon { name: "list-music"; color: "#939dab"; Layout.preferredWidth: 13; Layout.preferredHeight: 13 } Text { Layout.fillWidth: true; text: playlist.text; color: playlist.muted ? "#939dab" : "#657286"; font.pixelSize: 12; font.italic: playlist.muted; elide: Text.ElideRight } }
        HoverHandler { id: playlistHover; cursorShape: Qt.PointingHandCursor }
        TapHandler { onTapped: playlist.clicked() }
    }
}
