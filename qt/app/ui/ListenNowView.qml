// ListenNowView.qml — 立推荐（原版 1:1 精确复刻：高清封面、3张倾斜重叠卡片、每日推荐与精选曲目）
import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

ScrollView {
    id: root
    background: null
    padding: 0
    clip: true
    contentWidth: availableWidth
    contentHeight: homeColumn.implicitHeight + 10

    function resetScrollPosition() {
        if (root.contentItem)
            root.contentItem.contentY = 0
    }

    onVisibleChanged: {
        hoveredTrackIndex = -1
        if (visible)
            Qt.callLater(root.resetScrollPosition)
    }
    Component.onCompleted: Qt.callLater(root.resetScrollPosition)

    Connections {
        target: bridge
        function onViewModeChanged(mode) {
            if (mode === "discover")
                Qt.callLater(root.resetScrollPosition)
        }
    }

    readonly property var songsList: bridge.songsModel
    readonly property var homePlaylists: bridge.homePlaylistsModel
    property int coverRevision: 0
    property int playlistRevision: 0
    readonly property bool compactWidth: availableWidth < 820
    // One shared hover owner prevents several delegates from retaining their
    // animated hover state when the pointer crosses rows very quickly.
    property int hoveredTrackIndex: -1

    Connections {
        target: root.songsList
        function onModelReset() { root.coverRevision += 1 }
    }
    Connections {
        target: root.homePlaylists
        function onModelReset() { root.playlistRevision += 1 }
    }

    function getHighResCover(rawUrl, size) {
        if (!rawUrl) return ""
        var s = size || 500
        var processed = rawUrl.replace("http://", "https://")
        if (processed.indexOf("music.126.net") !== -1) {
            return processed.split("?")[0] + "?param=" + s + "y" + s
        }
        if (processed.indexOf("gtimg.cn") !== -1) {
            var sz = s >= 400 ? "500x500" : "300x300"
            return processed.replace(/R\d+x\d+M/, "R" + sz + "M")
        }
        return processed
    }

    function getSongCover(idx, size) {
        var revision = root.coverRevision
        var song = root.songsList.get(idx)
        if (song && song.cover) {
            return root.getHighResCover(song.cover, size || 500)
        }
        return ""
    }

    function getHomePlaylist(idx) {
        var revision = root.playlistRevision
        return root.homePlaylists.get(idx)
    }

    function getPlaylistCover(idx, fallbackSong, size) {
        var playlist = root.getHomePlaylist(idx)
        if (playlist && playlist.cover) return root.getHighResCover(playlist.cover, size || 500)
        return root.getSongCover(fallbackSong, size || 500)
    }

    function getPlaylistName(idx, fallbackName) {
        var playlist = root.getHomePlaylist(idx)
        return playlist && playlist.name ? playlist.name : fallbackName
    }

    function getPlaylistDescription(idx, fallbackText) {
        var playlist = root.getHomePlaylist(idx)
        return playlist && playlist.description ? playlist.description : fallbackText
    }

    ColumnLayout {
        id: homeColumn
        width: root.availableWidth
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.leftMargin: 10
        anchors.rightMargin: 15
        anchors.top: parent.top
        // pageHost 的 24px 顶部留白已移入滚动内容；额外 10px 对齐
        // 原版 home-page 自身的顶部间距。
        anchors.topMargin: 34
        spacing: 0

        // ---------- 1. 顶部 Header ----------
        Item {
            Layout.fillWidth: true
            Layout.preferredHeight: 92
            Layout.bottomMargin: 19

            ColumnLayout {
                anchors.left: parent.left
                anchors.top: parent.top
                spacing: 0

                Text {
                    text: "下午好"
                        color: "#7c8798"
                        font.pixelSize: 10
                        font.bold: true
                        font.letterSpacing: 1.3
                        Layout.bottomMargin: 5
                }

                RowLayout {
                    spacing: 12

                    Text {
                        text: "现在就听"
                        color: "#0f172a"
                        font.pixelSize: 36
                        font.weight: Font.ExtraBold
                    }

                    Rectangle {
                        Layout.preferredHeight: 22
                        Layout.preferredWidth: pillText.implicitWidth + 20
                        radius: 11
                        color: bridge.platform === "qq" ? "#ecfdf5" : bridge.platform === "kugou" ? "#f0f9ff" : "#fff1f2"
                        border.color: bridge.platform === "qq" ? "#a7f3d0" : bridge.platform === "kugou" ? "#bae6fd" : "#fecdd3"

                        Text {
                            id: pillText
                            anchors.centerIn: parent
                            text: bridge.platform === "qq" ? "🟢 QQ 音乐" : bridge.platform === "kugou" ? "🔵 酷狗概念版" : "🔴 网易云"
                            color: bridge.platform === "qq" ? "#047857" : bridge.platform === "kugou" ? "#0369a1" : "#be123c"
                            font.pixelSize: 11
                            font.bold: true
                        }
                    }
                }

                Text {
                    text: "精选 " + (bridge.platform === "qq" ? "QQ 音乐" : bridge.platform === "kugou" ? "酷狗" : "网易云") + " 推荐，陪你度过每一个当下。"
                    color: "#8992a1"
                    font.pixelSize: 12
                    Layout.topMargin: 6
                }
            }

            Rectangle {
                anchors.right: parent.right
                anchors.bottom: parent.bottom
                anchors.bottomMargin: 2
                height: 24
                width: dateText.implicitWidth
                radius: 0
                color: "transparent"
                border.color: "transparent"

                Text {
                    id: dateText
                    anchors.centerIn: parent
                    text: Qt.formatDate(new Date(), "M月d日 ddd")
                    color: "#7a8494"
                    font.pixelSize: 11
                    font.bold: true
                }
            }
        }

        // ---------- 2. 每日推荐 DAILY MIX Hero 卡片 (含 3 张倾斜重叠封面) ----------
        Rectangle {
            id: dailyHero
            Layout.fillWidth: true
            Layout.preferredHeight: root.compactWidth ? 300 : 325
            Layout.bottomMargin: 29
            radius: 22
            color: "#c5ffffff"
            border.color: "#f5ffffff"
            // Keep the artwork inside the rounded hero at the minimum window
            // width. The previous translated 255px stack extended beyond both
            // the card and the ScrollView viewport.
            clip: true

            Rectangle {
                anchors.fill: parent
                radius: parent.radius
                gradient: Gradient {
                    orientation: Gradient.Horizontal
                    GradientStop { position: 0.0; color: "#00ffffff" }
                    GradientStop { position: 0.52; color: "#16fac9d3" }
                    GradientStop { position: 0.78; color: "#28adc7ec" }
                    GradientStop { position: 1.0; color: "#08ffffff" }
                }
            }

            RowLayout {
                anchors.fill: parent
                anchors.leftMargin: root.compactWidth ? 24 : 36
                anchors.rightMargin: root.compactWidth ? 24 : 46
                anchors.topMargin: root.compactWidth ? 27 : 34
                anchors.bottomMargin: root.compactWidth ? 27 : 34
                spacing: root.compactWidth ? 16 : 26

                // Hero 左侧文案与按钮
                ColumnLayout {
                    Layout.fillWidth: true
                    spacing: 0

                    Rectangle {
                        Layout.preferredWidth: 28; Layout.preferredHeight: 28
                        radius: 8; color: "#242c3b"
                        Text { anchors.centerIn: parent; text: "01"; color: "white"; font.pixelSize: 11; font.weight: Font.ExtraBold }
                    }

                    Text { text: "每日推荐   ·   为你精选"; color: "#778296"; font.pixelSize: 11; font.bold: true; Layout.topMargin: 12; Layout.bottomMargin: 4 }

                    Text {
                        text: "每日推荐"
                        color: "#0f172a"
                        font.pixelSize: root.compactWidth ? 48 : 56
                        font.weight: Font.ExtraBold
                        lineHeightMode: Text.ProportionalHeight
                        lineHeight: 0.92
                    }

                    Text {
                        text: "DAILY MIX"
                        color: "#315d9f"
                        font.pixelSize: 10
                        font.weight: Font.DemiBold
                        font.letterSpacing: 2.8
                        Layout.topMargin: 2
                    }

                    Text {
                        text: "从你的听歌轨迹里，挑出今天最适合你的声音。每一首歌，都有它出现的理由。"
                        color: "#8791a0"
                        font.pixelSize: 12
                        lineHeight: 1.25
                        Layout.maximumWidth: root.compactWidth ? 330 : 390
                        wrapMode: Text.WordWrap
                        Layout.topMargin: 18
                    }

                    RowLayout {
                        spacing: 10
                        Layout.topMargin: 12

                        Rectangle {
                            Layout.preferredWidth: 99
                            Layout.preferredHeight: 38
                            radius: 19
                            color: "#202837"

                            RowLayout {
                                anchors.centerIn: parent
                                spacing: 6
                                Text { text: "▶"; color: "#ffffff"; font.pixelSize: 11 }
                                Text { text: "播放全部"; color: "#ffffff"; font.pixelSize: 12; font.bold: true }
                            }

                            MouseArea {
                                anchors.fill: parent
                                onClicked: if (root.songsList.count > 0) bridge.play(0)
                            }
                        }

                        Rectangle {
                            Layout.preferredWidth: 94
                            Layout.preferredHeight: 38
                            radius: 19
                            color: "#8affffff"
                            border.color: "#29384354"

                            RowLayout {
                                anchors.centerIn: parent
                                spacing: 4
                                Text { text: "查看全部"; color: "#334155"; font.pixelSize: 12; font.bold: true }
                                Text { text: "➔"; color: "#334155"; font.pixelSize: 11 }
                            }

                            MouseArea {
                                anchors.fill: parent
                                onClicked: bridge.open_daily_playlist()
                            }
                        }
                    }
                }

                // Hero 右侧：3 张倾斜重叠高清封面 stack 卡片
                Item {
                    id: artStack
                    Layout.preferredWidth: root.compactWidth ? 190 : 255
                    Layout.preferredHeight: root.compactWidth ? 160 : 190
                    Layout.rightMargin: root.compactWidth ? 0 : 20
                    transform: Translate { x: root.compactWidth ? 0 : 84; y: -2 }

                    HeroArtCard { songIndex: 2; baseX: root.compactWidth ? 4 : 6; baseY: root.compactWidth ? 30 : 37; restRotation: -12; baseZ: 1; baseOpacity: 0.74 }
                    HeroArtCard { songIndex: 1; baseX: root.compactWidth ? 70 : 107; baseY: root.compactWidth ? 34 : 42; restRotation: 7; baseZ: 2 }
                    HeroArtCard { songIndex: 0; baseX: root.compactWidth ? 40 : 65; baseY: root.compactWidth ? 8 : 12; restRotation: -5; baseZ: 3 }
                }
            }
        }

        // ---------- 3. 快捷歌单 Quick Mixes ----------
        RowLayout {
            Layout.fillWidth: true
            spacing: 18
            Layout.bottomMargin: 35

            QuickMixCard {
                title: root.getPlaylistName(0, bridge.platform === "netease" ? "私人漫游" : (bridge.platform === "qq" ? "QQ 音乐 每日推荐" : "酷狗 每日推荐"))
                description: root.getPlaylistDescription(0, "全网融合最喜欢门单曲集合")
                coverSource: root.getPlaylistCover(0, 1, 300)
                stackDirection: 1
                onClicked: root.homePlaylists.count > 0 ? bridge.open_home_playlist(0) : bridge.play(0)
            }

            QuickMixCard {
                title: root.getPlaylistName(1, bridge.platform === "netease" ? "私人雷达" : (bridge.platform === "qq" ? "QQ 音乐 私人电台" : "酷狗 私人电台"))
                description: root.getPlaylistDescription(1, "喜爱交织音乐流新流行歌曲")
                coverSource: root.getPlaylistCover(1, 2, 300)
                stackDirection: -1
                onClicked: root.homePlaylists.count > 1 ? bridge.open_home_playlist(1) : bridge.play(1)
            }
        }

        // ---------- 4. 今日为你精选 (8 Track Rows) ----------
        ColumnLayout {
            Layout.fillWidth: true
            spacing: 0

            RowLayout {
                Layout.fillWidth: true
                ColumnLayout {
                    spacing: 5
                    Text { text: "CURATED FOR YOU"; color: "#94a3b8"; font.pixelSize: 10; font.weight: Font.DemiBold }
                    Text { text: "今日为你精选"; color: "#172033"; font.pixelSize: 20; font.weight: Font.ExtraBold }
                }
                Layout.bottomMargin: 14
                Item { Layout.fillWidth: true }
                Text {
                    text: "完整歌单 ➔"
                    color: "#64748b"
                    font.pixelSize: 12
                    font.bold: true
                    MouseArea { anchors.fill: parent; onClicked: bridge.set_view_mode("browse") }
                }
            }

            GridLayout {
                Layout.fillWidth: true
                columns: 2
                columnSpacing: 34
                rowSpacing: 0

                Repeater {
                    model: Math.min(root.songsList.count, 8)

                    Rectangle {
                        id: trackRow
                        readonly property bool hovered: root.hoveredTrackIndex === index
                        readonly property var songData: {
                            var revision = root.coverRevision
                            return root.songsList.get(index)
                        }
                        Layout.fillWidth: true
                        Layout.preferredHeight: 57
                        radius: 11
                        // Qt uses #AARRGGBB, unlike CSS #RRGGBBAA. The old
                        // value decoded as opaque #ffffb3 (yellow).
                        color: hovered ? "#b3ffffff" : "transparent"
                        readonly property real hoverInset: hovered ? 4 : 0
                        transform: Translate {
                            x: trackRow.hovered ? 2 : 0
                            Behavior on x { NumberAnimation { duration: 180; easing.type: Easing.OutCubic } }
                        }

                        Rectangle {
                            anchors.left: parent.left
                            anchors.right: parent.right
                            anchors.bottom: parent.bottom
                            height: 1
                            color: "#121f2937"
                        }

                        MouseArea {
                            id: rowMouse
                            anchors.fill: parent
                            hoverEnabled: true
                            cursorShape: Qt.PointingHandCursor
                            z: 0
                            onEntered: root.hoveredTrackIndex = index
                            onExited: {
                                if (root.hoveredTrackIndex === index)
                                    root.hoveredTrackIndex = -1
                            }
                            onClicked: bridge.play(index)
                        }

                        Text {
                            x: 4 + trackRow.hoverInset
                            width: 20
                            anchors.verticalCenter: parent.verticalCenter
                            text: (index + 1 < 10 ? "0" : "") + (index + 1)
                            color: "#b2b8c3"
                            font.pixelSize: 10
                            font.bold: true
                            horizontalAlignment: Text.AlignLeft
                            z: 1
                        }

                        RoundedImage {
                            id: trackCover
                            x: 36 + trackRow.hoverInset
                            y: 9
                            width: 38
                            height: 38
                            radius: 10
                            source: root.getHighResCover(trackRow.songData.cover, 180)
                            preferredSourceSize: 180
                            fallbackColor: "#e3e7ed"
                            z: 1
                        }
                        Rectangle {
                            x: trackCover.x; y: trackCover.y
                            width: trackCover.width; height: trackCover.height
                            radius: trackCover.radius
                            color: trackRow.hovered ? "#8f111827" : "transparent"
                            opacity: trackRow.hovered ? 1 : 0
                            visible: opacity > 0.001
                            z: 2
                            Behavior on opacity { NumberAnimation { duration: 160; easing.type: Easing.OutCubic } }
                            Text { anchors.centerIn: parent; text: "▶"; color: "white"; font.pixelSize: 12 }
                        }

                        RowLayout {
                            x: 86 + trackRow.hoverInset
                            y: 9
                            width: Math.max(40, parent.width - 196 - trackRow.hoverInset * 2)
                            height: 17
                            spacing: 6
                            z: 1
                            Text {
                                Layout.fillWidth: true
                                text: trackRow.songData.name || "未知曲目"
                                color: "#253044"
                                font.pixelSize: 11
                                font.bold: true
                                elide: Text.ElideRight
                            }
                            Rectangle {
                                visible: trackRow.songData.vip || false
                                Layout.preferredHeight: 14
                                Layout.preferredWidth: visible ? 24 : 0
                                radius: 4
                                color: "#2bf5c55a"
                                border.color: "#38c58c2c"
                                Text { anchors.centerIn: parent; text: "VIP"; color: "#a66b19"; font.pixelSize: 7; font.bold: true }
                            }
                        }

                        Text {
                            x: 86 + trackRow.hoverInset
                            y: 30
                            width: Math.max(40, parent.width - 196 - trackRow.hoverInset * 2)
                            text: trackRow.songData.artist || "未知歌手"
                            color: "#929aa8"
                            font.pixelSize: 10
                            elide: Text.ElideRight
                            z: 1
                        }

                        Row {
                            anchors.right: parent.right
                            anchors.rightMargin: 32 + trackRow.hoverInset
                            anchors.verticalCenter: parent.verticalCenter
                            spacing: 5
                            z: 1
                            AppIcon { name: "clock"; color: "#9da5b1"; width: 12; height: 12 }
                            Text {
                                text: {
                                    var d = Math.round(trackRow.songData.duration || 0)
                                    var m = Math.floor(d / 60)
                                    var s = d % 60
                                    return m + ":" + (s < 10 ? "0" : "") + s
                                }
                                color: "#9da5b1"
                                font.pixelSize: 10
                            }
                        }

                        Text {
                            anchors.right: parent.right
                            anchors.rightMargin: 4 + trackRow.hoverInset
                            anchors.verticalCenter: parent.verticalCenter
                            text: trackRow.songData.isLiked ? "♥" : "♡"
                            color: trackRow.songData.isLiked ? "#e11d48" : "#c1c6ce"
                            opacity: trackRow.hovered || trackRow.songData.isLiked ? 1 : 0
                            font.pixelSize: 15
                            z: 3
                            Behavior on opacity { NumberAnimation { duration: 160; easing.type: Easing.OutCubic } }
                            MouseArea {
                                anchors.fill: parent
                                cursorShape: Qt.PointingHandCursor
                                onClicked: function(mouse) { mouse.accepted = true; bridge.toggle_like(trackRow.songData.id) }
                            }
                        }
                    }
                }
            }
        }

        // ---------- 5. 专属歌单 ----------
        ColumnLayout {
            Layout.fillWidth: true
            Layout.topMargin: 28
            Layout.bottomMargin: 48
            spacing: 0

            RowLayout {
                Layout.fillWidth: true
                Layout.bottomMargin: 14
                ColumnLayout {
                    spacing: 5
                    Text { text: "YOUR LIBRARY"; color: "#94a3b8"; font.pixelSize: 10; font.weight: Font.DemiBold; font.letterSpacing: 1.3 }
                    Text { text: "专属歌单"; color: "#172033"; font.pixelSize: 20; font.weight: Font.ExtraBold }
                }
                Item { Layout.fillWidth: true }
                Text { text: "✣"; color: "#9aa3b4"; font.pixelSize: 17 }
            }

            GridLayout {
                id: playlistGrid
                Layout.fillWidth: true
                columns: 4
                columnSpacing: 16
                rowSpacing: 16
                property real cardSize: Math.max(160, (width - columnSpacing * 3) / 4)

                Repeater {
                    model: Math.min(3, Math.max(root.homePlaylists.count, Math.min(3, root.songsList.count)))
                    PlaylistCard {
                        required property int index
                        Layout.fillWidth: true
                        Layout.preferredHeight: playlistGrid.cardSize
                        playlistIndex: index
                        title: root.getPlaylistName(index, index === 0 ? "网易云热歌榜" : index === 1 ? "云音乐新歌榜" : "云音乐飙升榜")
                        subtitle: {
                            var playlist = root.getHomePlaylist(index)
                            return playlist && playlist.trackCount > 0 ? playlist.trackCount + " 首歌曲" : "100 首歌曲"
                        }
                        coverSource: root.getPlaylistCover(index, index, 500)
                    }
                }
            }
        }
    }

    component HeroArtCard: Rectangle {
        id: heroArt
        required property int songIndex
        required property real baseX
        required property real baseY
        required property real restRotation
        required property int baseZ
        property real baseOpacity: 1
        property bool hovered: artMouse.containsMouse
        width: root.compactWidth ? 118 : 148
        height: width
        x: baseX
        y: hovered ? baseY - 10 : baseY
        radius: root.compactWidth ? 15 : 18
        color: "#e2e6ec"
        border.color: "#b3ffffff"
        border.width: root.compactWidth ? 4 : 5
        rotation: hovered ? 0 : restRotation
        scale: hovered ? 1.09 : 1
        opacity: hovered ? 1 : baseOpacity
        z: hovered ? 10 : baseZ
        clip: true
        Behavior on y { NumberAnimation { duration: 260; easing.type: Easing.OutCubic } }
        Behavior on rotation { NumberAnimation { duration: 280; easing.type: Easing.OutCubic } }
        Behavior on scale { NumberAnimation { duration: 280; easing.type: Easing.OutCubic } }
        Behavior on opacity { NumberAnimation { duration: 200 } }

        RoundedImage {
            anchors.fill: parent
            anchors.margins: root.compactWidth ? 4 : 5
            radius: root.compactWidth ? 11 : 13
            source: root.getSongCover(heroArt.songIndex, 500)
            preferredSourceSize: 500
        }
        Rectangle {
            anchors.fill: parent
            radius: heroArt.radius
            color: heroArt.hovered ? "#47ffffff" : "transparent"
            Behavior on color { ColorAnimation { duration: 160 } }
            Text { anchors.centerIn: parent; text: "▶"; color: "#202a3a"; font.pixelSize: 22; visible: heroArt.hovered }
        }
        MouseArea { id: artMouse; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; onClicked: bridge.play(heroArt.songIndex) }
    }

    component PlaylistCard: Rectangle {
        id: playlistCard
        required property int playlistIndex
        property string title: ""
        property string subtitle: ""
        property string coverSource: ""
        property bool hovered: playlistMouse.containsMouse
        radius: 16
        color: "#e2e6ec"
        clip: true
        transform: Translate {
            y: playlistCard.hovered ? -3 : 0
            Behavior on y { NumberAnimation { duration: 180; easing.type: Easing.OutCubic } }
        }

        RoundedImage {
            anchors.fill: parent
            source: playlistCard.coverSource
            radius: playlistCard.radius
            preferredSourceSize: 560
            imageScale: playlistCard.hovered ? 1.05 : 1
            Behavior on imageScale { NumberAnimation { duration: 350; easing.type: Easing.OutCubic } }
        }
        Rectangle {
            anchors.left: parent.left; anchors.right: parent.right; anchors.bottom: parent.bottom
            height: parent.height * 0.65
            radius: playlistCard.radius
            gradient: Gradient {
                GradientStop { position: 0; color: "#000f172a" }
                GradientStop { position: 1; color: "#d10f172a" }
            }
        }
        Rectangle {
            anchors.top: parent.top; anchors.right: parent.right; anchors.margins: 12
            width: 27; height: 27; radius: 14; color: "#d6ffffff"; visible: playlistCard.hovered
            Text { anchors.centerIn: parent; text: "▶"; color: "#1c2534"; font.pixelSize: 12 }
        }
        Column {
            anchors.left: parent.left; anchors.right: parent.right; anchors.bottom: parent.bottom; anchors.margins: 13
            spacing: 4
            Text { width: parent.width; text: playlistCard.title; color: "white"; font.pixelSize: 12; font.bold: true; elide: Text.ElideRight }
            Text { width: parent.width; text: playlistCard.subtitle; color: "#adffffff"; font.pixelSize: 10; elide: Text.ElideRight }
        }
        MouseArea {
            id: playlistMouse
            anchors.fill: parent
            hoverEnabled: true
            cursorShape: Qt.PointingHandCursor
            onClicked: root.homePlaylists.count > playlistCard.playlistIndex
                       ? bridge.open_home_playlist(playlistCard.playlistIndex)
                       : bridge.play(playlistCard.playlistIndex)
        }
    }

    component QuickMixCard: Rectangle {
        id: quickMix
        property string title: ""
        property string description: ""
        property string coverSource: ""
        property int stackDirection: 1
        property bool hovered: quickMixMouse.containsMouse
        signal clicked()

        Layout.fillWidth: true
        Layout.preferredHeight: 74
        radius: 17
        color: hovered ? "#d1ffffff" : "#87ffffff"
        border.color: "#d1ffffff"
        transform: Translate {
            y: quickMix.hovered ? -2 : 0
            Behavior on y { NumberAnimation { duration: 180; easing.type: Easing.OutCubic } }
        }
        Behavior on color { ColorAnimation { duration: 180 } }

        RowLayout {
            anchors.fill: parent
            anchors.leftMargin: 11; anchors.rightMargin: 14
            anchors.topMargin: 11; anchors.bottomMargin: 11
            spacing: 14

            Item {
                Layout.preferredWidth: 50
                Layout.preferredHeight: 50

                Rectangle { width: parent.width; height: parent.height; radius: 13; color: "#49ffffff"; x: 10 * quickMix.stackDirection; z: -2 }
                Rectangle { width: parent.width; height: parent.height; radius: 13; color: "#94ffffff"; x: 5 * quickMix.stackDirection; z: -1 }
                RoundedImage { anchors.fill: parent; source: quickMix.coverSource; radius: 13; preferredSourceSize: 160; fallbackColor: "#cbd5e1" }
            }

            ColumnLayout {
                Layout.fillWidth: true
                spacing: 2
                Text { Layout.fillWidth: true; text: title; color: "#202a3a"; font.pixelSize: 12; font.weight: Font.ExtraBold; elide: Text.ElideRight; horizontalAlignment: Text.AlignLeft }
                Text { Layout.fillWidth: true; text: description; color: "#8a94a4"; font.pixelSize: 10; elide: Text.ElideRight; horizontalAlignment: Text.AlignLeft }
            }

            Rectangle { width: 24; height: 24; radius: 12; color: "transparent"; border.color: "#24465162"; Text { anchors.centerIn: parent; text: "›"; color: "#657083"; font.pixelSize: 18 } }
        }

        MouseArea {
            id: quickMixMouse
            anchors.fill: parent
            hoverEnabled: true
            cursorShape: Qt.PointingHandCursor
            onClicked: quickMix.clicked()
        }
    }
}
