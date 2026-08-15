import QtQuick
import QtQuick.Controls

ScrollBar {
    id: control
    width: 7
    policy: ScrollBar.AsNeeded
    padding: 1
    contentItem: Rectangle {
        implicitWidth: 5
        radius: 3
        color: control.pressed ? "#7c8797" : control.hovered ? "#99a2af" : "#b8c0ca"
        opacity: control.active ? 0.82 : 0.42
        Behavior on opacity { NumberAnimation { duration: 160 } }
    }
    background: Item {}
}
