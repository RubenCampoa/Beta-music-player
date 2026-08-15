import QtQuick
import QtQuick.Effects

Item {
    id: root
    property url source: ""
    property real radius: 12
    property int fillMode: Image.PreserveAspectCrop
    property color fallbackColor: "#141f2937"
    property bool shadowEnabled: false
    property color shadowColor: "#80000000"
    property real shadowBlur: 0.6
    property real shadowVerticalOffset: 8
    property int preferredSourceSize: 0
    property bool cacheEnabled: true
    property alias imageScale: sourceImage.scale
    property alias imageOpacity: sourceImage.opacity
    signal statusChanged(int status)

    // 1. 遮罩形状与 GPU 纹理源
    Rectangle {
        id: maskRect
        anchors.fill: parent
        radius: root.radius
        color: "#ffffff"
        antialiasing: true
        visible: false
    }

    ShaderEffectSource {
        id: maskSourceItem
        sourceItem: maskRect
        hideSource: true
        live: true
        smooth: true
    }

    // 2. 底层独立圆角柔和弥散投影（严格使用遮罩形状产生纯净阴影，杜绝黑色矩形底块溢出）
    MultiEffect {
        anchors.fill: parent
        source: maskSourceItem
        z: -1
        visible: root.shadowEnabled && (sourceImage.status === Image.Ready || root.fallbackColor !== "transparent")
        shadowEnabled: root.shadowEnabled
        shadowColor: root.shadowColor
        shadowBlur: root.shadowBlur
        shadowVerticalOffset: root.shadowVerticalOffset
        blurMax: 48
    }

    // 3. 加载中/占位底色圆角矩形
    Rectangle {
        anchors.fill: parent
        radius: root.radius
        color: root.fallbackColor
        visible: sourceImage.status !== Image.Ready
    }

    // 4. 原始待裁剪图片
    Image {
        id: sourceImage
        anchors.fill: parent
        source: root.source
        sourceSize.width: root.preferredSourceSize > 0 ? root.preferredSourceSize : undefined
        sourceSize.height: root.preferredSourceSize > 0 ? root.preferredSourceSize : undefined
        fillMode: root.fillMode
        smooth: true
        mipmap: true
        asynchronous: true
        cache: root.cacheEnabled
        visible: false
        onStatusChanged: root.statusChanged(status)
    }

    // 5. 纯净圆角裁剪层（零溢出、边缘超平滑抗锯齿）
    MultiEffect {
        anchors.fill: parent
        source: sourceImage
        visible: sourceImage.status === Image.Ready
        maskEnabled: true
        maskSource: maskSourceItem
        maskThresholdMin: 0.0
        maskSpreadAtMin: 0.0
    }
}
