import QtQuick
import QtQuick.Effects

Item {
    id: root
    property var lyricLines: []
    property int activeIndex: -1
    property bool pureMode: false
    property bool lyricGlow: true
    property bool lyricBlur: true
    property bool lyricZoom: true
    property bool lyricFade: true
    property bool lyricStagger: true
    property bool lyricAnimation: true
    property bool enableKaraoke: true
    property string karaokeAnimation: "slide"   // "slide" = refined-now-playing-netease 海浪逐字 | "float"
    property int lyricOffsetMs: 0
    property string fontSize: "normal"
    // Tailwind's font-sans resolves to the Windows system UI face in the
    // Electron reference.  Keep it explicit so Qt does not pick a different
    // application/default font on machines with customized UI fonts.
    property string fontFamily: "Microsoft YaHei UI"

    // --- 1:1 复刻 solstice23/refined-now-playing-netease 变换与动画公式 ---
    // 参考 refined-now-playing-netease：行级 scale/opacity/blur 均按
    // 距当前行的距离 d 取离散档位，当前行轻微放大，d=1 行略微收缩，
    // 更远行回到基础收缩值；透明度与景深模糊按 1/2/3 行递减。
    function zoomScale(dist) {
        if (!root.lyricZoom || !root.lyricAnimation) return 1.0
        var d = Math.abs(dist)
        if (d === 0) return root.pureMode ? 1.045 : 1.035
        if (d === 1) return root.pureMode ? 0.99 : 0.98
        return root.pureMode ? 0.978 : 0.96
    }

    function blurPx(dist) {
        if (!root.lyricBlur || dist === 0) return 0
        var d = Math.abs(dist)
        if (d === 1) return 0.5
        if (d === 2) return 1.8
        if (d === 3) return 3.2
        return Math.min(6.0, 3.2 + (d - 3) * 0.8)
    }

    function lineOpacity(dist, isPrelude) {
        if (dist === 0) return isPrelude ? 0.85 : 1.0
        var d = Math.abs(dist)
        if (d === 1) return 0.65
        if (d === 2) return 0.45
        if (d === 3) return 0.32
        return 0.25
    }

    function staggerDelay(signedOffset) {
        return 0
    }
    property int scrollDirection: 1
    property int previousActiveIndex: -1

    // --- 布局状态（refined-now-playing-netease 动态舒适行距）---
    readonly property real baseFontSize: root.pureMode ? 50 : (root.fontSize === "large" ? 40 : (viewport.width < 550 ? 30 : 34))
    readonly property real lineSpace: root.baseFontSize * 0.5
    // true 时行为「逐行动画过渡」，false 时「瞬时重排」（换歌/尺寸变化）。
    property bool animateLayout: false
    property bool layoutReady: false
    property int relayoutAttempts: 0
    // activeView=false 时（全屏歌词层未显示）暂停 60fps 逐字时钟与级联动画，
    // 避免隐藏状态下白白消耗 CPU；打开时由 refreshLayout() 瞬时补一次布局。
    property bool activeView: true
    property var lastHeights: []
    property int stabilizePasses: 0

    function lineCount() {
        if (!root.lyricLines) return 0
        return root.lyricLines.count !== undefined ? root.lyricLines.count : root.lyricLines.length
    }

    function scheduleRelayout(animate) {
        root.animateLayout = animate
        if (!animate) root.layoutReady = false
        root.relayoutAttempts = 0
        root.stabilizePasses = 0
        relayoutTimer.restart()
    }

    // 供外部（全屏歌词打开时）显式触发瞬时重排，避免隐藏期间漏排导致的错位。
    function refreshLayout() { root.scheduleRelayout(false) }

    function retryRelayout() {
        if (root.relayoutAttempts < 200) {
            root.relayoutAttempts += 1
            relayoutTimer.restart()
        }
    }

    function relayout() {
        var n = root.lineCount()
        if (n <= 0) { root.layoutReady = false; return }
        var isPrelude = root.activeIndex < 0
        var current = isPrelude ? 0 : Math.max(0, Math.min(n - 1, root.activeIndex))
        var space = root.lineSpace
        var viewH = viewport.height
        if (viewH <= 0) { root.retryRelayout(); return }

        var heights = []
        var scales = []
        for (var i = 0; i < n; ++i) {
            var it = lineRepeater.itemAt(i)
            if (!it) { root.retryRelayout(); return }
            var h = it.height
            if (!isFinite(h) || h <= 0) { root.retryRelayout(); return }
            heights.push(h)
            var d = Math.abs(i - current)
            scales.push(isPrelude && i === 0 ? 1.0 : root.zoomScale(d))
        }
        root.relayoutAttempts = 0

        var tops = []
        // 与参考实现一致：布局按每行原始高度 + 固定行距堆叠，
        // scale 仅作为视觉变换，不参与布局计算。
        tops[current] = viewH * 0.5 - heights[current] / 2
        for (i = current - 1; i >= 0; --i)
            tops[i] = tops[i + 1] - heights[i] - space
        for (i = current + 1; i < n; ++i)
            tops[i] = tops[i - 1] + heights[i - 1] + space

        for (i = 0; i < n; ++i) {
            var item = lineRepeater.itemAt(i)
            var dist = Math.abs(i - current)
            item.lineIndex = i
            item.distance = dist
            item.targetY = tops[i]
            item.targetScale = scales[i]
            item.targetBlur = isPrelude && i === 0 ? 0 : root.blurPx(dist)
            item.targetOpacity = root.lineOpacity(dist, isPrelude)
            item.staggerMs = root.staggerDelay(i - current)
        }
        root.layoutReady = true
        root.lastHeights = heights
        // 换行/字体重排可能让行高在下一帧才稳定，随后校验一次并自动收敛。
        if (root.stabilizePasses < 2)
            Qt.callLater(root.verifyLayout)
    }

    function verifyLayout() {
        root.stabilizePasses += 1
        var n = root.lineCount()
        if (n <= 0) return
        for (var i = 0; i < n; ++i) {
            var it = lineRepeater.itemAt(i)
            if (!it || !isFinite(it.height) || it.height <= 0) { root.retryRelayout(); return }
            var previous = Number(root.lastHeights && root.lastHeights[i] !== undefined ? root.lastHeights[i] : 0)
            if (Math.abs(it.height - previous) > 1.5) {
                // 行高在换行后收敛：直接重跑 relayout，不重置 layoutReady，
                // 避免产生一次多余的淡出/淡入闪烁。
                root.relayoutAttempts = 0
                relayoutTimer.restart()
                return
            }
        }
    }

    // Provider adapters normally expose absolute song timestamps.  Some
    // QRC/KRC variants, however, use offsets relative to the containing line.
    function normalizedWordStartMs(lineData, wordData) {
        var lineStart = Number(lineData && lineData.time !== undefined ? lineData.time : 0)
        var wordStart = Number(wordData && wordData.time !== undefined ? wordData.time : lineStart)
        if (!isFinite(lineStart))
            lineStart = 0
        if (!isFinite(wordStart))
            wordStart = lineStart
        if (lineStart > 1 && wordStart >= 0 && wordStart < lineStart - 0.25)
            wordStart += lineStart
        return wordStart * 1000
    }

    // --- 平台固有延迟补偿与有效偏移 ---
    readonly property int platformOffsetMs: (bridge.currentSong && bridge.currentSong.source === "kugou") ? 400 : 0
    readonly property int effectiveLyricOffsetMs: root.lyricOffsetMs + platformOffsetMs

    // --- 前奏倒计时 3 点动效 ---
    function getFirstLyricTime() {
        if (!root.lyricLines) return 0
        var count = root.lineCount()
        if (!count || count <= 0) return 0
        for (var i = 0; i < count; ++i) {
            var item = root.lyricLines.get ? root.lyricLines.get(i) : root.lyricLines[i]
            var t = Number(item && item.time !== undefined ? item.time : (item && item.item && item.item.time !== undefined ? item.item.time : 0))
            if (t > 0) return t
        }
        return 0
    }

    readonly property real firstLyricTime: root.getFirstLyricTime()
    readonly property real currentPlaybackSec: bridge.positionMs / 1000.0
    // 参考实现中三点倒计时只锚定真实开唱时间，不受歌词行是否已提前激活影响。
    readonly property bool showPreChorusDots: root.firstLyricTime > 0.8
                                          && root.currentPlaybackSec < (root.firstLyricTime + (root.effectiveLyricOffsetMs / 1000.0) + 0.2)

    readonly property real leadTime: Math.min(0.9, root.firstLyricTime * 0.4)
    readonly property real endTime: Math.max(0, root.firstLyricTime - leadTime)
    readonly property real dot1Threshold: endTime / 3.0
    readonly property real dot2Threshold: (endTime * 2.0) / 3.0
    readonly property real dot3Threshold: endTime

    readonly property bool dot1Lit: root.currentPlaybackSec >= root.dot1Threshold
    readonly property bool dot2Lit: root.currentPlaybackSec >= root.dot2Threshold
    readonly property bool dot3Lit: root.currentPlaybackSec >= root.dot3Threshold

    // 平滑媒体时钟，供逐字歌词连续上色。
    property real karaokeClockMs: bridge.positionMs + effectiveLyricOffsetMs

    onActiveIndexChanged: {
        root.scrollDirection = activeIndex > root.previousActiveIndex ? 1 : -1
        root.previousActiveIndex = activeIndex
        if (root.activeView)
            root.scheduleRelayout(true)
    }
    onLyricLinesChanged: if (root.activeView) root.scheduleRelayout(false)
    onPureModeChanged: if (root.activeView) root.scheduleRelayout(false)
    onWidthChanged: if (root.activeView) root.scheduleRelayout(false)
    onHeightChanged: if (root.activeView) root.scheduleRelayout(false)
    onFontSizeChanged: if (root.activeView) root.scheduleRelayout(false)
    onVisibleChanged: if (visible && root.activeView) root.scheduleRelayout(false)
    onEffectiveLyricOffsetMsChanged: karaokeClockMs = bridge.positionMs + effectiveLyricOffsetMs
    Component.onCompleted: root.scheduleRelayout(false)

    Connections {
        target: root.lyricLines
        function onModelReset() { if (root.activeView) root.scheduleRelayout(false) }
    }

    Timer {
        id: relayoutTimer
        interval: 16
        repeat: false
        onTriggered: root.relayout()
    }

    Timer {
        id: karaokeTimer
        interval: 16
        repeat: true
        running: root.visible && root.activeView && root.enableKaraoke
        onTriggered: {
            var target = bridge.positionMs + root.effectiveLyricOffsetMs
            var delta = target - root.karaokeClockMs
            root.karaokeClockMs = Math.abs(delta) > 500 ? target : root.karaokeClockMs + delta * 0.5
        }
    }

    Item {
        id: viewport
        anchors.fill: parent

        Item {
            id: lyricContent
            anchors.fill: parent

            Repeater {
                id: lineRepeater
                model: root.lyricLines
                delegate: Item {
                    id: lineItem
                    property var lineData: model ? model.item : ({})
                    // 以下由 relayout() 统一下发
                    property int lineIndex: index
                    property int distance: index + 1
                    property real targetY: 0
                    property real targetScale: 1
                    property real targetBlur: 0
                    property real targetOpacity: 1
                    property int staggerMs: 0

                    readonly property bool active: root.activeIndex >= 0 && lineIndex === root.activeIndex
                    readonly property bool past: root.activeIndex >= 0 && lineIndex < root.activeIndex
                    readonly property bool hasWords: active && root.enableKaraoke && lineData.words && lineData.words.length > 0
                      // 逐字模式下，极少数 YRC/KRC 会把一长串中文作为一个 word 下发；
                      // 这种 word 无法被 Flow 拆行，会在窗口较窄时横向溢出。
                      // 这里仅在显示层把纯中文长词按 4 个字一组拆开，时间戳与时长保持一致。
                      property var displayWords: {
                          var source = lineItem.lineData.words || []
                          if (!source || source.length === 0) return []
                          var result = []
                          for (var wi = 0; wi < source.length; ++wi) {
                              var w = source[wi]
                              var t = w.text !== undefined ? w.text : (w.word !== undefined ? w.word : "")
                              t = String(t || "")
                              if (/^[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef·•・]+$/.test(t) && t.length > 4) {
                                  for (var cj = 0; cj < t.length; cj += 4)
                                      result.push({ text: t.substring(cj, cj + 4), time: w.time, duration: w.duration })
                              } else {
                                  result.push(w)
                              }
                          }
                          return result
                      }

                    // 动画中间值：绑定目标，Behavior 负责带错峰的过渡。
                    property real blurValue: targetBlur
                    property real opacityValue: targetOpacity
                    readonly property real hoverBoost: (lineMouse.containsMouse && !active) ? 2.0 : 1.0

                    // 顶部与底部超平滑淡入淡出（连续余弦 Ease-in-out 衰减，在到达边界前已彻底平滑归零）
                    readonly property real lineCenterY: y + height * 0.5
                    readonly property real topDist: lineCenterY
                    readonly property real bottomDist: viewport.height - lineCenterY
                    readonly property real fadeRange: Math.max(80, viewport.height * 0.28)
                    readonly property real topFactor: topDist <= 0 ? 0.0 : (topDist >= fadeRange ? 1.0 : (0.5 - 0.5 * Math.cos((topDist / fadeRange) * Math.PI)))
                    readonly property real bottomFactor: bottomDist <= 0 ? 0.0 : (bottomDist >= fadeRange ? 1.0 : (0.5 - 0.5 * Math.cos((bottomDist / fadeRange) * Math.PI)))
                    readonly property real edgeFade: topFactor * bottomFactor

                    width: viewport.width
                    height: Math.ceil(karaokeMeasure.implicitHeight
                        + (translationText.visible ? translationMeasure.implicitHeight + lyricColumn.spacing : 0)
                        + 8)
                    y: targetY
                    scale: targetScale
                    opacity: root.layoutReady ? (opacityValue * hoverBoost * edgeFade) : 0
                    transformOrigin: root.pureMode ? Item.Center : Item.Left

                    // y 动画等价于参考实现的整列歌词滚动：所有行一起平滑移动。
                    // scale/opacity 则按 refined-now-playing-netease 的规则：
                    // 仅当前行附近 (distance <= 2) 参与果冻弹簧/淡入过渡，
                    // 更远的行直接跳到目标值；模糊为瞬时切换。
                    Behavior on y {
                        enabled: root.layoutReady && root.animateLayout && root.lyricAnimation
                        NumberAnimation {
                            duration: 500
                            easing.type: Easing.BezierSpline
                            easing.bezierCurve: [0.18, 0.77, 0.58, 0.99, 1.0, 1.0]
                        }
                    }
                    Behavior on scale {
                        enabled: root.layoutReady && root.animateLayout && root.lyricAnimation && lineItem.distance <= 2
                        SpringAnimation { spring: 3.1; damping: 0.82; mass: 0.9; epsilon: 0.001 }
                    }
                    Behavior on blurValue {
                        enabled: root.layoutReady && root.animateLayout && root.lyricAnimation
                        NumberAnimation { duration: 0 }
                    }
                    Behavior on opacityValue {
                        enabled: root.layoutReady && root.animateLayout && root.lyricAnimation && lineItem.distance <= 2
                        NumberAnimation { duration: 320; easing.type: Easing.OutCubic }
                    }

                    Column {
                        id: lyricColumn
                        y: 4
                        x: root.pureMode ? (parent.width - width) / 2 : 16
                        width: parent.width - (root.pureMode ? 48 : 32)
                        spacing: 7
                        layer.enabled: root.lyricBlur
                        layer.smooth: true
                        layer.effect: MultiEffect {
                            blurEnabled: root.lyricBlur
                            blurMax: 32
                            blur: Math.min(1.0, lineItem.blurValue / 32.0)
                        }

                Item {
                    width: parent.width
                    visible: !lineItem.hasWords
                    height: visible ? Math.ceil(karaokeMeasure.implicitHeight) : 0

                    // 1. 广域柔和弥散光晕 (Wide Diffuse Halo)
                    Text {
                        anchors.fill: parent
                        visible: lineItem.active && root.lyricGlow
                        text: plainLine.text
                        font: plainLine.font
                        horizontalAlignment: plainLine.horizontalAlignment
                        wrapMode: Text.WrapAtWordBoundaryOrAnywhere
                        color: "#ffffff"
                        opacity: 0.70
                        layer.enabled: visible
                        layer.smooth: true
                        layer.effect: MultiEffect {
                            blurEnabled: true
                            blurMax: 54
                            blur: 0.65
                        }
                    }

                    // 2. 核心聚焦高亮光晕 (Core Intense Bloom)
                    Text {
                        anchors.fill: parent
                        visible: lineItem.active && root.lyricGlow
                        text: plainLine.text
                        font: plainLine.font
                        horizontalAlignment: plainLine.horizontalAlignment
                        wrapMode: Text.WrapAtWordBoundaryOrAnywhere
                        color: "#ffffff"
                        opacity: 0.95
                        layer.enabled: visible
                        layer.smooth: true
                        layer.effect: MultiEffect {
                            blurEnabled: true
                            blurMax: 22
                            blur: 0.40
                        }
                    }

                    // 3. 前景清晰加粗文字
                    Text {
                        id: plainLine
                        width: parent.width
                        text: lineItem.lineData.text || ""
                        color: "#ffffff"
                        font.family: root.fontFamily
                        font.pixelSize: root.baseFontSize
                        font.weight: root.pureMode ? Font.Black : Font.ExtraBold
                        font.letterSpacing: -0.02 * font.pixelSize
                        horizontalAlignment: root.pureMode ? Text.AlignHCenter : Text.AlignLeft
                        wrapMode: Text.WrapAtWordBoundaryOrAnywhere
                    }
                }

                // 隐藏测量文本：纯歌词模式下用于逐字 Flow 的居中宽度
                Text {
                    id: karaokeMeasure
                    visible: false
                    width: parent.width
                    text: lineItem.lineData.text || ""
                    font.family: root.fontFamily
                    font.pixelSize: root.baseFontSize
                    font.weight: root.pureMode ? Font.Black : Font.ExtraBold
                    font.letterSpacing: -0.02 * font.pixelSize
                    wrapMode: Text.WrapAtWordBoundaryOrAnywhere
                }

                Flow {
                    id: karaokeFlow
                    width: root.pureMode
                        ? Math.min(parent.width, Math.ceil(karaokeMeasure.implicitWidth) + 8)
                        : parent.width
                    x: root.pureMode ? Math.max(0, (parent.width - karaokeMeasure.implicitWidth) / 2) : 0
                    visible: lineItem.hasWords
                    height: visible ? Math.max(karaokeMeasure.implicitHeight, childrenRect.height) : 0
                    spacing: 0
                    clip: false

                    Repeater {
                        model: lineItem.displayWords
                        delegate: Item {
                            id: wordItem
                            property var wordData: modelData
                            property real startMs: root.normalizedWordStartMs(lineItem.lineData, wordData)
                            property real durationMs: Math.max(50, Number(wordData.duration || 0.25) * 1000)
                            property real rawProgress: Math.max(0, Math.min(1, (root.karaokeClockMs - startMs) / durationMs))
                            property real reveal: rawProgress >= 1 ? 1 : Math.sin(rawProgress * Math.PI / 2)
                            readonly property bool isFloat: root.karaokeAnimation !== "slide"
                            property real floatY: -3.5 * Math.sin(rawProgress * Math.PI / 2)
                            property real floatOpacity: 0.38 + 0.62 * rawProgress
                            width: Math.ceil(baseWord.implicitWidth)
                            height: Math.ceil(baseWord.implicitHeight)

                            // 基准（未唱）文字：float 模式随进度自然上浮并提亮
                            Text {
                                id: baseWord
                                y: wordItem.isFloat ? wordItem.floatY : 0
                                text: wordItem.wordData.text || ""
                                color: "#ffffff"
                                opacity: wordItem.isFloat ? wordItem.floatOpacity : 0.60
                                font.family: root.fontFamily
                                font.pixelSize: root.baseFontSize
                                font.weight: root.pureMode ? Font.Black : Font.ExtraBold
                                font.letterSpacing: -0.02 * font.pixelSize
                            }

                            // float 模式：已唱文字背后的柔和弥散光晕
                            Text {
                                visible: wordItem.isFloat && root.lyricGlow && wordItem.rawProgress > 0
                                y: wordItem.floatY
                                text: wordItem.wordData.text || ""
                                color: "#ffffff"
                                opacity: 0.65 * wordItem.rawProgress
                                font: baseWord.font
                                layer.enabled: visible
                                layer.smooth: true
                                layer.effect: MultiEffect {
                                    blurEnabled: true
                                    blurMax: 24
                                    blur: 0.6
                                }
                            }

                            // slide 模式：遮罩逐字点亮（含光晕与阴影）
                            Item {
                                visible: !wordItem.isFloat
                                x: 0
                                width: parent.width * wordItem.reveal
                                height: parent.height
                                clip: true
                                Text {
                                    width: wordItem.width
                                    height: parent.height
                                    visible: root.lyricGlow && wordItem.reveal > 0
                                    text: wordItem.wordData.text || ""
                                    color: "#ffffffff"
                                    opacity: 0.65
                                    font: baseWord.font
                                    layer.enabled: visible
                                    layer.smooth: true
                                    layer.effect: MultiEffect {
                                        blurEnabled: true
                                        blurMax: 32
                                        blur: 0.55
                                    }
                                }
                                Text {
                                    id: litWord
                                    width: wordItem.width
                                    height: parent.height
                                    text: wordItem.wordData.text || ""
                                    color: "#ffffff"
                                    font: baseWord.font
                                    layer.enabled: root.lyricGlow && wordItem.reveal > 0
                                    layer.smooth: true
                                    layer.effect: MultiEffect {
                                        shadowEnabled: true
                                        shadowColor: "#ffffffff"
                                        shadowBlur: 0.82
                                        shadowHorizontalOffset: 0
                                        shadowVerticalOffset: 0
                                        blurMax: 48
                                    }
                                }
                            }
                        }
                    }
                }

                Text {
                    id: translationText
                    width: parent.width
                    visible: (lineItem.lineData.translation || "") !== ""
                    text: lineItem.lineData.translation || ""
                    color: lineItem.active ? "#e6ffffff" : "#ffffff"
                    font.family: root.fontFamily
                    font.pixelSize: root.pureMode ? 28 : (root.fontSize === "large" ? 24 : 20)
                    font.weight: lineItem.active ? Font.Medium : Font.Normal
                    font.letterSpacing: 0.025 * font.pixelSize
                    horizontalAlignment: root.pureMode ? Text.AlignHCenter : Text.AlignLeft
                    wrapMode: Text.WrapAtWordBoundaryOrAnywhere
                }
                Text {
                    id: translationMeasure
                    visible: false
                    width: parent.width
                    text: lineItem.lineData.translation || ""
                    font.family: root.fontFamily
                    font.pixelSize: root.pureMode ? 28 : (root.fontSize === "large" ? 24 : 20)
                    font.weight: Font.Medium
                    font.letterSpacing: 0.025 * font.pixelSize
                    horizontalAlignment: root.pureMode ? Text.AlignHCenter : Text.AlignLeft
                    wrapMode: Text.WrapAtWordBoundaryOrAnywhere
                }
                }

                MouseArea {
                    id: lineMouse
                    anchors.fill: parent
                    hoverEnabled: true
                    cursorShape: Qt.PointingHandCursor
                    onClicked: bridge.seek(Math.round((lineItem.lineData.time || 0) * 1000))
                }
            }
        }

        Row {
            id: countdownRow
            x: root.pureMode ? (viewport.width - implicitWidth) / 2 : 16
            y: lineRepeater.count > 0 && lineRepeater.itemAt(0) ? Math.max(12, lineRepeater.itemAt(0).y - 28) : Math.max(12, viewport.height * 0.5 - 44)
            spacing: 11
            visible: root.showPreChorusDots || opacity > 0.001
            opacity: root.showPreChorusDots ? 1 : 0
            scale: root.showPreChorusDots ? 1 : 0.65
            transformOrigin: root.pureMode ? Item.Center : Item.Left

            Behavior on opacity { NumberAnimation { duration: 280; easing.type: Easing.OutCubic } }
            Behavior on scale { NumberAnimation { duration: 280; easing.type: Easing.OutBack } }

            CountdownDot { lit: root.dot1Lit }
            CountdownDot { lit: root.dot2Lit }
            CountdownDot { lit: root.dot3Lit }
        }

        Text {
            anchors.centerIn: parent
            visible: root.lineCount() === 0
            text: "暂无歌词"
            color: "#70ffffff"
            font.pixelSize: 18
            font.italic: true
        }
    }
}

    component CountdownDot: Rectangle {
        id: dot
        property bool lit: false
        width: 10
        height: 10
        radius: 5
        color: "#ffffff"
        opacity: lit ? 0.95 : 0.22
        layer.enabled: lit
        layer.effect: MultiEffect {
            shadowEnabled: true
            shadowColor: "#e6ffffff"
            shadowBlur: 0.55
            blurMax: 14
            shadowHorizontalOffset: 0
            shadowVerticalOffset: 0
        }

        Behavior on opacity { NumberAnimation { duration: 200; easing.type: Easing.OutCubic } }

        SequentialAnimation on scale {
            id: popAnim
            running: false
            NumberAnimation { from: 0.55; to: 1.35; duration: 175; easing.type: Easing.OutCubic }
            NumberAnimation { to: 0.92; duration: 125; easing.type: Easing.InOutQuad }
            NumberAnimation { to: 1.12; duration: 100; easing.type: Easing.OutQuad }
            NumberAnimation { to: 1.0; duration: 100; easing.type: Easing.OutCubic }
        }

        onLitChanged: {
            if (lit)
                popAnim.restart()
        }
    }
}
