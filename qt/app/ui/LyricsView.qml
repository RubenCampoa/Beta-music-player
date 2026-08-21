import QtQuick
import QtQuick.Effects

Item {
    id: root
    property var lyricLines: []
    property int activeIndex: -1
    property bool pureMode: false
    property real modeProgress: pureMode ? 1 : 0
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
    // Keep the Windows system UI face explicit so Qt does not pick a different
    // application font on machines with customized UI fonts.
    property string fontFamily: "Microsoft YaHei UI"

    // refined-now-playing-netease uses one transform per absolutely-positioned
    // line. Scale is a cubic falloff, while opacity and blur depend on the
    // distance from the focused line.
    function zoomScale(dist) {
        if (!root.lyricZoom || !root.lyricAnimation) return 1.0
        var d = Math.abs(dist)
        var remaining = Math.max(1.0 - d * 0.2, 0.0)
        return remaining * remaining * remaining * 0.3 + 0.7
    }

    function blurPx(dist) {
        if (!root.lyricBlur || dist === 0) return 0
        var d = Math.abs(dist)
        return Math.min(0.5 + d, 4.5)
    }

    function lineOpacity(dist, isPrelude) {
        if (!root.lyricFade || !root.lyricAnimation) return 1.0
        var d = Math.abs(dist)
        if (d <= 1) return 1.0
        return Math.max(1.0 - 0.4 * (d - 1), 0.0)
    }

    function staggerDelay(signedOffset) {
        if (!root.lyricStagger || !root.lyricAnimation || root.previousActiveIndex < 0)
            return 0
        var direction = root.scrollDirection >= 0 ? 1 : -1
        var clamped = Math.max(-4, Math.min(4, signedOffset))
        return (clamped * direction + 4) * 50
    }
    property int scrollDirection: 1
    property int previousActiveIndex: -1
    property int focusIndex: -1

    // --- 布局状态（refined-now-playing-netease 动态舒适行距）---
    readonly property real dualFontSize: root.fontSize === "large" ? 40 : (viewport.width < 550 ? 30 : 34)
    readonly property real baseFontSize: root.dualFontSize + (50 - root.dualFontSize) * root.modeProgress
    // The reference uses 1.2em with a much smaller lyric face. Our Qt layout
    // uses larger 30–40px text, so keep the same rhythm with a tighter gap.
    readonly property real lineSpace: root.baseFontSize * 0.82
    // true 时行为「逐行动画过渡」，false 时「瞬时重排」（换歌/尺寸变化）。
    property bool animateLayout: false
    property bool layoutReady: false
    property int relayoutAttempts: 0
    readonly property bool modeTransitioning: root.modeProgress > 0.001 && root.modeProgress < 0.999
    // activeView=false 时（全屏歌词层未显示）暂停 60fps 逐字时钟与级联动画，
    // 避免隐藏状态下白白消耗 CPU；打开时由 refreshLayout() 瞬时补一次布局。
    property bool activeView: true
    property var lastHeights: []
    property int stabilizePasses: 0

    function lineCount() {
        if (!root.lyricLines) return 0
        return root.lyricLines.count !== undefined ? root.lyricLines.count : root.lyricLines.length
    }

    // The reference starts the column movement 200ms before the line becomes
    // active, then lets the per-line delays land the wave on the beat. Keep
    // the visual focus separate from activeIndex so highlighting stays exact.
    function updateFocusIndex(milliseconds) {
        var n = root.lineCount()
        if (n <= 0) return
        var adjustedMilliseconds = Number(milliseconds) + root.effectiveLyricOffsetMs
                + (root.lyricStagger && root.lyricAnimation ? 200 : 0)
        var nextFocus = bridge.lyric_index_at(adjustedMilliseconds)
        if (nextFocus === root.focusIndex) return
        root.previousActiveIndex = root.focusIndex
        root.scrollDirection = root.focusIndex < 0 || nextFocus >= root.focusIndex ? 1 : -1
        root.focusIndex = nextFocus
        if (root.activeView)
            root.scheduleRelayout(true, true)
    }

    function scheduleRelayout(animate, preserveVisibility) {
        root.animateLayout = animate
        if (!animate && !preserveVisibility) root.layoutReady = false
        root.relayoutAttempts = 0
        root.stabilizePasses = 0
        // modeProgress and width change together. Restarting on both signals
        // can postpone layout until the tween ends, which looks like a final
        // one-frame spacing jump. Coalesce them into one pass per frame.
        if (!relayoutTimer.running)
            relayoutTimer.start()
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
        var visualFocus = root.focusIndex >= 0 ? root.focusIndex : root.activeIndex
        var current = visualFocus < 0 ? 0 : Math.max(0, Math.min(n - 1, visualFocus))
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
        // The reference packs lines using their scaled visual heights.
        tops[current] = viewH * 0.5 - heights[current] / 2
        for (i = current - 1; i >= 0; --i)
            tops[i] = tops[i + 1] - heights[i] * scales[i] - space
        for (i = current + 1; i < n; ++i)
            tops[i] = tops[i - 1] + heights[i - 1] * scales[i - 1] + space

        for (i = 0; i < n; ++i) {
            var item = lineRepeater.itemAt(i)
            var dist = Math.abs(i - current)
            item.lineIndex = i
            item.distance = dist
            // Set the delay before changing any animated target so every
            // Behavior observes the delay belonging to this transition.
            item.staggerMs = root.staggerDelay(i - current)
            item.targetY = tops[i]
            item.targetScale = scales[i]
            item.targetBlur = isPrelude && i === 0 ? 0 : root.blurPx(dist)
            item.targetOpacity = root.lineOpacity(dist, isPrelude)
        }
        root.layoutReady = true
        root.lastHeights = heights
        // The next tween frame is already a stabilisation pass. Only perform
        // delayed verification after the mode transition has settled.
        if (!root.modeTransitioning && root.stabilizePasses < 2)
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
    // Some QRC variants, however, use offsets relative to the containing line.
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
    readonly property int platformOffsetMs: 0
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

    onActiveIndexChanged: root.updateFocusIndex(bridge.positionMs)
    onLyricLinesChanged: if (root.activeView) {
        root.focusIndex = -1
        root.previousActiveIndex = -1
        root.updateFocusIndex(bridge.positionMs)
        root.scheduleRelayout(false)
    }
    // Mode/layout changes keep the previous positions alive until the next
    // layout pass, avoiding a blank frame during an otherwise instant switch.
    onPureModeChanged: if (root.activeView) root.scheduleRelayout(false, true)
    onModeProgressChanged: if (root.activeView) root.scheduleRelayout(false, true)
    onWidthChanged: if (root.activeView) root.scheduleRelayout(false, true)
    onHeightChanged: if (root.activeView) root.scheduleRelayout(false)
    onFontSizeChanged: if (root.activeView) root.scheduleRelayout(false)
    onVisibleChanged: if (visible && root.activeView) root.scheduleRelayout(false)
    onEffectiveLyricOffsetMsChanged: karaokeClockMs = bridge.positionMs + effectiveLyricOffsetMs
    Component.onCompleted: root.scheduleRelayout(false)

    Connections {
        target: bridge
        function onPositionChanged(milliseconds) {
            root.updateFocusIndex(milliseconds)
            if (!bridge.isPlaying)
                root.karaokeClockMs = milliseconds + root.effectiveLyricOffsetMs
        }
    }

    Connections {
        target: root.lyricLines
        function onModelReset() {
            if (!root.activeView) return
            root.focusIndex = -1
            root.previousActiveIndex = -1
            root.updateFocusIndex(bridge.positionMs)
            root.scheduleRelayout(false)
        }
    }

    Timer {
        id: relayoutTimer
        interval: 16
        repeat: false
        onTriggered: root.relayout()
    }

    Timer {
        id: karaokeTimer
        // Match the reference renderer's 30 fps word-mask cadence: smooth
        // enough for a moving highlight without paying for a 60 fps QML pass.
        interval: 33
        repeat: true
        running: root.visible && root.activeView && root.enableKaraoke && bridge.isPlaying
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
                    readonly property bool hasWordData: root.enableKaraoke && lineData.words && lineData.words.length > 0
                    readonly property bool hasWords: active && hasWordData
                      // 逐字模式下，极少数 YRC/QRC 会把一长串中文作为一个 word 下发；
                      // 这种 word 无法被 Flow 拆行，会在窗口较窄时横向溢出。
                      // 这里仅在显示层把纯中文长词按 4 个字一组拆开，时间戳与时长保持一致。
                      property var displayWords: {
                          // Keep the current line and its neighbours warm. This
                          // avoids constructing dozens of word Text nodes on
                          // the exact frame the active lyric changes.
                          if (lineItem.distance > 2) return []
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
                    readonly property bool nearViewport: lineCenterY > -height
                                                         && lineCenterY < viewport.height + height

                    width: viewport.width
                    height: Math.ceil(plainLine.implicitHeight
                        + (translationText.visible ? translationText.implicitHeight + lyricColumn.spacing : 0)
                        + 8)
                    y: targetY
                    scale: targetScale
                    opacity: root.layoutReady ? (opacityValue * hoverBoost * edgeFade) : 0
                    visible: nearViewport
                    // Dual-column lyrics share a fixed left edge. Scaling from
                    // the centre made smaller, distant lines drift right and
                    // visually form a diagonal staircase.
                    transformOrigin: root.pureMode ? Item.Center : Item.Left

                    // The original animates transform/filter/opacity for 500ms.
                    // Each line is delayed by its signed distance so the column
                    // follows the playback direction as a soft travelling wave.
                    Behavior on y {
                        enabled: root.layoutReady && root.animateLayout && root.lyricAnimation
                                 && lineItem.nearViewport
                        SequentialAnimation {
                            PauseAnimation { duration: lineItem.staggerMs }
                            NumberAnimation {
                                duration: 500
                                easing.type: Easing.BezierSpline
                                easing.bezierCurve: [0.18, 0.77, 0.58, 0.99, 1.0, 1.0]
                            }
                        }
                    }
                    Behavior on scale {
                        enabled: root.layoutReady && root.animateLayout && root.lyricAnimation
                                 && lineItem.nearViewport
                        SequentialAnimation {
                            PauseAnimation { duration: lineItem.staggerMs }
                            NumberAnimation {
                                duration: 500
                                easing.type: Easing.BezierSpline
                                easing.bezierCurve: [0.18, 0.77, 0.58, 0.99, 1.0, 1.0]
                            }
                        }
                    }
                    Behavior on blurValue {
                        enabled: root.layoutReady && root.animateLayout && root.lyricAnimation
                                 && lineItem.nearViewport
                        SequentialAnimation {
                            PauseAnimation { duration: lineItem.staggerMs }
                            NumberAnimation { duration: 500; easing.type: Easing.InOutQuad }
                        }
                    }
                    Behavior on opacityValue {
                        enabled: root.layoutReady && root.animateLayout && root.lyricAnimation
                                 && lineItem.nearViewport
                        SequentialAnimation {
                            PauseAnimation { duration: lineItem.staggerMs }
                            NumberAnimation { duration: 500; easing.type: Easing.InOutQuad }
                        }
                    }

                    Column {
                        id: lyricColumn
                        y: 4
                        x: 16 + 8 * root.modeProgress
                        width: parent.width - 32 - 16 * root.modeProgress
                        spacing: 7
                        layer.enabled: root.lyricBlur && lineItem.nearViewport
                                       && lineItem.distance > 0 && lineItem.distance <= 3
                                       && lineItem.opacity > 0.01
                        layer.smooth: true
                        layer.effect: MultiEffect {
                            blurEnabled: root.lyricBlur
                            blurMax: 32
                            blur: Math.min(1.0, lineItem.blurValue / 32.0)
                        }

                Item {
                    width: parent.width
                    visible: !lineItem.hasWords
                    height: visible ? Math.ceil(plainLine.implicitHeight) : 0

                    // Pre-warm glow nodes for adjacent plain-text lines. The
                    // shader nodes stay hidden until active, so a line change
                    // no longer has to compile/create both bloom passes.
                    Loader {
                        x: plainLine.x
                        width: plainLine.width
                        height: parent.height
                        active: !lineItem.hasWordData && root.lyricGlow
                                && lineItem.nearViewport && lineItem.distance <= 2
                        sourceComponent: Component {
                            Text {
                                anchors.fill: parent
                                visible: lineItem.active
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
                                    blurMax: 40
                                    blur: 0.65
                                }
                            }
                        }
                    }

                    Loader {
                        x: plainLine.x
                        width: plainLine.width
                        height: parent.height
                        active: !lineItem.hasWordData && root.lyricGlow
                                && lineItem.nearViewport && lineItem.distance <= 2
                        sourceComponent: Component {
                            Text {
                                anchors.fill: parent
                                visible: lineItem.active
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
                                    blurMax: 18
                                    blur: 0.40
                                }
                            }
                        }
                    }

                    // 3. 前景清晰加粗文字
                    Text {
                        id: plainLine
                        readonly property real centeredWidth: Math.min(parent.width, Math.ceil(implicitWidth) + 8)
                        width: parent.width + (centeredWidth - parent.width) * root.modeProgress
                        x: Math.max(0, (parent.width - width) / 2)
                        text: lineItem.lineData.text || ""
                        color: "#ffffff"
                        opacity: lineItem.active ? 1.0 : 0.4
                        font.family: root.fontFamily
                        font.pixelSize: root.baseFontSize
                        font.weight: Font.ExtraBold
                        font.letterSpacing: -0.02 * font.pixelSize
                        horizontalAlignment: Text.AlignLeft
                        wrapMode: Text.WrapAtWordBoundaryOrAnywhere
                    }
                }

                Flow {
                    id: karaokeFlow
                    readonly property real centeredWidth: Math.min(parent.width, Math.ceil(plainLine.implicitWidth) + 8)
                    width: parent.width + (centeredWidth - parent.width) * root.modeProgress
                    x: Math.max(0, (parent.width - width) / 2)
                    visible: lineItem.hasWords
                    height: visible ? Math.max(plainLine.implicitHeight, childrenRect.height) : 0
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
                                opacity: wordItem.isFloat ? wordItem.floatOpacity : 0.40
                                font.family: root.fontFamily
                                font.pixelSize: root.baseFontSize
                                font.weight: Font.ExtraBold
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
                                        blurMax: 24
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
                                        shadowBlur: 0.68
                                        shadowHorizontalOffset: 0
                                        shadowVerticalOffset: 0
                                        blurMax: 32
                                    }
                                }
                            }
                        }
                    }
                }

                Text {
                    id: translationText
                    readonly property real centeredWidth: Math.min(parent.width, Math.ceil(implicitWidth) + 8)
                    width: parent.width + (centeredWidth - parent.width) * root.modeProgress
                    x: Math.max(0, (parent.width - width) / 2)
                    visible: (lineItem.lineData.translation || "") !== ""
                    text: lineItem.lineData.translation || ""
                    color: "#ffffff"
                    opacity: lineItem.active ? 0.8 : 0.4
                    font.family: root.fontFamily
                    readonly property real dualTranslationSize: root.fontSize === "large" ? 24 : 20
                    font.pixelSize: dualTranslationSize + (28 - dualTranslationSize) * root.modeProgress
                    font.weight: lineItem.active ? Font.Medium : Font.Normal
                    font.letterSpacing: 0.025 * font.pixelSize
                    horizontalAlignment: Text.AlignLeft
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
            x: 16 + ((viewport.width - implicitWidth) / 2 - 16) * root.modeProgress
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
