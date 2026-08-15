// 原版浏览页：趋势横幅、分类胶囊、热门榜单与双列热歌。
import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

ScrollView {
    id: root
    background: null
    padding: 0
    clip: true
    contentWidth: availableWidth
    contentHeight: browseColumn.y + browseColumn.implicitHeight
    bottomPadding: 0
    ScrollBar.vertical: AppScrollBar {}
    readonly property var songs: bridge.songsModel
    readonly property var homePlaylists: bridge.homePlaylistsModel
    property string activeCategory: "all"

    onVisibleChanged: if (visible) contentY = 0

    function platformName() {
        return bridge.platform === "qq" ? "QQ 音乐" : bridge.platform === "kugou" ? "酷狗概念版" : "网易云"
    }
    function chooseCategory(key) {
        activeCategory = key
        bridge.load_browse(key)
    }
    // StackLayout instantiates every page at startup. Loading here used to let
    // this hidden page overwrite the active "现在就听" data and view mode.
    // The sidebar explicitly loads browse data when the page is requested.

    ColumnLayout {
        id: browseColumn
        width: root.availableWidth
        y: 24
        spacing: 24

        Rectangle {
            Layout.fillWidth: true
            Layout.preferredHeight: 190
            radius: 24
            clip: true
            gradient: Gradient {
                GradientStop { position: 0; color: "#5b1830" }
                GradientStop { position: 0.52; color: "#422052" }
                GradientStop { position: 1; color: "#20293a" }
            }
            Rectangle {
                width: 245; height: 245; radius: 123
                anchors.right: parent.right; anchors.rightMargin: 30
                anchors.verticalCenter: parent.verticalCenter
                color: "transparent"; border.color: "#2effffff"; border.width: 20
                Rectangle { anchors.centerIn: parent; width: 72; height: 72; radius: 36; color: "#24ffffff" }
            }
            ColumnLayout {
                anchors.left: parent.left; anchors.leftMargin: 32
                anchors.verticalCenter: parent.verticalCenter
                width: 590; spacing: 9
                RowLayout {
                    spacing: 8
                    AppIcon { name: "compass"; color: "#fb7185"; Layout.preferredWidth: 17; Layout.preferredHeight: 17 }
                    Text { text: "探索流行趋势与权威榜单（" + root.platformName() + "）"; color: "#fda4af"; font.pixelSize: 11; font.bold: true; font.letterSpacing: 1.1 }
                }
                Text { text: "浏览 · 发现全新音乐风向"; color: "white"; font.pixelSize: 30; font.bold: true; font.letterSpacing: -1.0 }
                Text {
                    text: "实时同步热门榜单与多样化曲风分类，探索音乐无限可能。"
                    color: "#d9dce5"; font.pixelSize: 12; wrapMode: Text.WordWrap; Layout.preferredWidth: 520
                }
            }
        }

        RowLayout {
            Layout.fillWidth: true; spacing: 9
            CategoryChip { key: "all"; label: "全部探索" }
            CategoryChip { key: "pop"; label: "华语流行" }
            CategoryChip { key: "western"; label: "欧美金曲" }
            CategoryChip { key: "acg"; label: "动漫二次元" }
            CategoryChip { key: "lofi"; label: "治愈 Lo-Fi" }
            CategoryChip { key: "rock"; label: "摇滚朋克" }
            CategoryChip { key: "electronic"; label: "电子电音" }
            Item { Layout.fillWidth: true }
        }

        RowLayout {
            Layout.fillWidth: true
            AppIcon { name: "disc"; color: "#d79728"; Layout.preferredWidth: 20; Layout.preferredHeight: 20 }
            Text { text: root.platformName() + "热门榜单"; color: "#253044"; font.pixelSize: 20; font.bold: true }
        }

        RowLayout {
            Layout.fillWidth: true; spacing: 14
            Repeater {
                model: Math.min(6, root.homePlaylists.count)
                delegate: ChartCard {
                    Layout.fillWidth: true
                    cover: root.homePlaylists.get(index).cover || ""
                    title: root.homePlaylists.get(index).name || "推荐歌单"
                    subtitle: root.homePlaylists.get(index).description || ((root.homePlaylists.get(index).trackCount || 0) + " 首歌曲")
                    onClicked: bridge.open_home_playlist(index)
                }
            }
        }

        RowLayout {
            Layout.fillWidth: true; Layout.topMargin: 6
            Text { text: "♨"; color: "#e11d48"; font.pixelSize: 20 }
            Text { text: root.activeCategory === "all" ? "全网热歌速递" : "分类精选曲目"; color: "#253044"; font.pixelSize: 20; font.bold: true }
            Item { Layout.fillWidth: true }
            Text { text: "点击直接播放"; color: "#a1a8b4"; font.pixelSize: 10 }
        }

        GridLayout {
            Layout.fillWidth: true; columns: 2; columnSpacing: 14; rowSpacing: 10
            Repeater {
                model: Math.min(root.songs.count, 10)
                delegate: SongCard {
                    Layout.fillWidth: true
                    song: root.songs.get(index)
                    number: index + 1
                    onClicked: bridge.play(index)
                }
            }
        }
    }

    component CategoryChip: Rectangle {
        id: chip
        property string key: "all"
        property string label: "全部探索"
        property bool selected: root.activeCategory === key
        width: textItem.implicitWidth + 30; height: 32; radius: 16
        color: selected ? "#e11d48" : "#0d1f2937"
        border.color: selected ? "#e11d48" : "#161f2937"
        Text { id: textItem; anchors.centerIn: parent; text: chip.label; color: chip.selected ? "white" : "#697486"; font.pixelSize: 10; font.bold: true }
        MouseArea { anchors.fill: parent; onClicked: root.chooseCategory(chip.key) }
    }

    component ChartCard: Rectangle {
        id: chart
        property string cover: ""
        property string title: ""
        property string subtitle: ""
        signal clicked()
        Layout.preferredHeight: width + 52; radius: 16; color: "#b8ffffff"; border.color: "#141f2937"; clip: true
        ColumnLayout {
            anchors.fill: parent; anchors.margins: 10; spacing: 7
            Rectangle {
                Layout.fillWidth: true; Layout.preferredHeight: width; radius: 12; color: "#e2e6ec"; clip: true
                RoundedImage { anchors.fill: parent; source: chart.cover; radius: 12; preferredSourceSize: 360; fallbackColor: "#e2e6ec" }
                Text { anchors.centerIn: parent; visible: !chart.cover; text: "♪"; color: "#a1a8b4"; font.pixelSize: 28 }
                Rectangle { anchors.fill: parent; radius: 12; antialiasing: true; color: hit.containsMouse ? "#38000000" : "transparent" }
                Text { anchors.centerIn: parent; visible: hit.containsMouse; text: "▶"; color: "white"; font.pixelSize: 23 }
            }
            Text { text: chart.title; color: "#253044"; font.pixelSize: 11; font.bold: true; elide: Text.ElideRight; Layout.fillWidth: true }
            Text { text: chart.subtitle; color: "#929aa7"; font.pixelSize: 9; elide: Text.ElideRight; Layout.fillWidth: true }
        }
        MouseArea {
            id: hit; anchors.fill: parent; hoverEnabled: true
            onClicked: chart.clicked()
        }
    }

    component SongCard: Rectangle {
        id: card
        property var song: ({})
        property int number: 0
        signal clicked()
        Layout.preferredHeight: 62; radius: 13; color: mouse.containsMouse ? "#e6ffffff" : "#a8ffffff"; border.color: "#101f2937"
        RowLayout {
            anchors.fill: parent; anchors.margins: 9; spacing: 11
            Text { text: card.number; color: mouse.containsMouse ? "#e11d48" : "#a1a8b4"; font.pixelSize: 11; font.bold: true; Layout.preferredWidth: 24; horizontalAlignment: Text.AlignHCenter }
            RoundedImage { Layout.preferredWidth: 42; Layout.preferredHeight: 42; radius: 9; source: card.song.cover || ""; fallbackColor: "#e2e6ec" }
            ColumnLayout { Layout.fillWidth: true; spacing: 3; Text { text: card.song.name || "未知歌曲"; color: "#253044"; font.pixelSize: 11; font.bold: true; elide: Text.ElideRight; Layout.fillWidth: true } Text { text: card.song.artist || ""; color: "#7d8796"; font.pixelSize: 10; elide: Text.ElideRight; Layout.fillWidth: true } }
            Rectangle { visible: card.song.vip === true; Layout.preferredWidth: visible ? 28 : 0; Layout.preferredHeight: 17; radius: 5; color: "#1af59e0b"; Text { anchors.centerIn: parent; text: "VIP"; color: "#a66b19"; font.pixelSize: 8; font.bold: true } }
        }
        MouseArea { id: mouse; anchors.fill: parent; hoverEnabled: true; onClicked: card.clicked() }
    }
}
