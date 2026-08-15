// GPU metaball fluid background. Four palette fields merge into one
// continuously deforming surface; the song artwork only supplies colours.
import QtQuick

Item {
    id: fluid
    anchors.fill: parent
    z: 0

    property var colors: bridge.fluidColors
    property url artworkSource: ""
    property bool animationEnabled: true

    property color colorA: colors.length > 0 ? colors[0] : "#4c80d6"
    property color colorB: colors.length > 1 ? colors[1] : "#d2699e"
    property color colorC: colors.length > 2 ? colors[2] : "#eea353"
    property color colorD: colors.length > 3 ? colors[3] : "#4cb2a3"

    Behavior on colorA { ColorAnimation { duration: 1200 } }
    Behavior on colorB { ColorAnimation { duration: 1200 } }
    Behavior on colorC { ColorAnimation { duration: 1200 } }
    Behavior on colorD { ColorAnimation { duration: 1200 } }

    Rectangle { anchors.fill: parent; color: "#05070f" }

    ShaderEffect {
        id: liquidField
        anchors.fill: parent
        opacity: 0.96

        property color cA: fluid.colorA
        property color cB: fluid.colorB
        property color cC: fluid.colorC
        property color cD: fluid.colorD
        property real time
        property real aspect: width / Math.max(1, height)

        NumberAnimation on time {
            from: 0
            to: 100
            duration: 111111
            running: fluid.animationEnabled && fluid.visible
            loops: Animation.Infinite
        }

        fragmentShader: Qt.resolvedUrl("FluidBackground.frag.qsb")
    }

    Rectangle {
        anchors.fill: parent
        color: "#3203070f"
        gradient: Gradient {
            orientation: Gradient.Horizontal
            GradientStop { position: 0; color: "#5203070f" }
            GradientStop { position: 0.46; color: "#10050812" }
            GradientStop { position: 1; color: "#5c03070f" }
        }
    }
}
