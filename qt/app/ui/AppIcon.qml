import QtQuick

Item {
    id: root
    property string name: "music"
    property color color: "#7d8796"
    property string fillColor: "none"
    property real strokeWidth: 2
    implicitWidth: 18
    implicitHeight: 18

    readonly property var paths: ({
        "circle-play": "<circle cx='12' cy='12' r='10'/><polygon points='10 8 16 12 10 16 10 8'/>",
        "compass": "<circle cx='12' cy='12' r='10'/><polygon points='16 8 14 14 8 16 10 10 16 8'/>",
        "hard-drive": "<line x1='22' x2='2' y1='12' y2='12'/><path d='M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z'/><line x1='6' x2='6.01' y1='16' y2='16'/><line x1='10' x2='10.01' y1='16' y2='16'/>",
        "list-music": "<path d='M21 15V6'/><path d='M18.5 18a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z'/><path d='M12 12H3'/><path d='M16 6H3'/><path d='M12 18H3'/>",
        "settings": "<path d='M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z'/><circle cx='12' cy='12' r='3'/>",
        "triangle-alert": "<path d='m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3z'/><path d='M12 9v4'/><path d='M12 17h.01'/>",
        "history": "<path d='M3 12a9 9 0 1 0 3-6.7L3 8'/><path d='M3 3v5h5'/><path d='M12 7v5l4 2'/>",
        "info": "<circle cx='12' cy='12' r='10'/><path d='M12 16v-4'/><path d='M12 8h.01'/>",
        "circle-alert": "<circle cx='12' cy='12' r='10'/><line x1='12' x2='12' y1='8' y2='12'/><line x1='12' x2='12.01' y1='16' y2='16'/>",
        "search": "<circle cx='11' cy='11' r='8'/><path d='m21 21-4.3-4.3'/>",
        "qr-code": "<rect x='3' y='3' width='6' height='6' rx='1'/><rect x='15' y='3' width='6' height='6' rx='1'/><rect x='3' y='15' width='6' height='6' rx='1'/><path d='M15 15h2v2h-2z'/><path d='M19 15h2v4h-2z'/><path d='M15 19h2v2h-2z'/><path d='M19 21h2'/>",
        "music": "<path d='M9 18V5l12-2v13'/><circle cx='6' cy='18' r='3'/><circle cx='18' cy='16' r='3'/>",
        "log-in": "<path d='M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4'/><polyline points='10 17 15 12 10 7'/><line x1='15' x2='3' y1='12' y2='12'/>",
        "heart": "<path d='M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z'/>",
        "shuffle": "<path d='m18 14 4 4-4 4'/><path d='m18 2 4 4-4 4'/><path d='M2 18h1.4c1.2 0 2.3-.6 3-1.6L17.6 6H22'/><path d='M2 6h1.9c1 0 2 .4 2.7 1.2l1.1 1.2'/>",
        "skip-back": "<polygon points='19 20 9 12 19 4 19 20'/><line x1='5' x2='5' y1='19' y2='5'/>",
        "play": "<polygon points='6 3 20 12 6 21 6 3'/>",
        "pause": "<rect width='4' height='16' x='6' y='4' rx='1'/><rect width='4' height='16' x='14' y='4' rx='1'/>",
        "skip-forward": "<polygon points='5 4 15 12 5 20 5 4'/><line x1='19' x2='19' y1='5' y2='19'/>",
        "repeat": "<path d='m17 2 4 4-4 4'/><path d='M3 11V9a3 3 0 0 1 3-3h15'/><path d='m7 22-4-4 4-4'/><path d='M21 13v2a3 3 0 0 1-3 3H3'/>",
        "repeat-1": "<path d='m17 2 4 4-4 4'/><path d='M3 11V9a3 3 0 0 1 3-3h15'/><path d='m7 22-4-4 4-4'/><path d='M21 13v2a3 3 0 0 1-3 3H3'/><path d='M11 10h1v4'/>",
        "monitor": "<rect width='20' height='14' x='2' y='3' rx='2'/><line x1='8' x2='16' y1='21' y2='21'/><line x1='12' x2='12' y1='17' y2='21'/>",
        "quote": "<path d='M3 21c3 0 7-1 7-8V5c0-1.25-.75-2-2-2H4c-1.25 0-2 .75-2 1.97V11c0 1.25.75 2 2 2h3c0 4-2 6-4 6v2z'/><path d='M15 21c3 0 7-1 7-8V5c0-1.25-.75-2-2-2h-4c-1.25 0-2 .75-2 1.97V11c0 1.25.75 2 2 2h3c0 4-2 6-4 6v2z'/>",
        "volume-2": "<polygon points='11 5 6 9 2 9 2 15 6 15 11 19 11 5'/><path d='M15.54 8.46a5 5 0 0 1 0 7.07'/><path d='M19.07 4.93a10 10 0 0 1 0 14.14'/>",
        "volume-x": "<polygon points='11 5 6 9 2 9 2 15 6 15 11 19 11 5'/><line x1='22' x2='16' y1='9' y2='15'/><line x1='16' x2='22' y1='9' y2='15'/>",
        "upload": "<path d='M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4'/><polyline points='17 8 12 3 7 8'/><line x1='12' x2='12' y1='3' y2='15'/>",
        "folder-plus": "<path d='M12 10v6'/><path d='M9 13h6'/><path d='M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z'/>",
        "arrow-right": "<path d='M5 12h14'/><path d='m12 5 7 7-7 7'/>",
        "clock": "<circle cx='12' cy='12' r='10'/><polyline points='12 6 12 12 16 14'/>",
        "disc": "<circle cx='12' cy='12' r='10'/><circle cx='12' cy='12' r='2'/>",
        "sparkles": "<path d='m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z'/>",
        "github": "<path d='M15 22v-4a4.8 4.8 0 0 0-1-3.5c3.28-.36 6.72-1.61 6.72-7A5.44 5.44 0 0 0 19.28 4 5.07 5.07 0 0 0 19.14.5S18 0 15 1.82a13.38 13.38 0 0 0-7 0C5 0 3.86.5 3.86.5A5.07 5.07 0 0 0 3.72 4a5.44 5.44 0 0 0-1.44 3.78c0 5.42 3.44 6.67 6.72 7A4.8 4.8 0 0 0 8 18v4'/><path d='M8 19c-3 .92-3-2-4-2'/>",
        "user": "<path d='M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2'/><circle cx='12' cy='7' r='4'/>",
        "x": "<path d='M18 6 6 18'/><path d='m6 6 12 12'/>",
        "lock": "<rect width='18' height='11' x='3' y='11' rx='2' ry='2'/><path d='M7 11V7a5 5 0 0 1 10 0v4'/>",
        "unlock": "<rect width='18' height='11' x='3' y='11' rx='2' ry='2'/><path d='M7 11V7a5 5 0 0 1 9.9-1'/>",
        "trash": "<path d='M3 6h18'/><path d='M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2'/><path d='m19 6-1 14c0 1-1 2-2 2H8c-1 0-2-1-2-2L5 6'/><path d='M10 11v6'/><path d='M14 11v6'/>",
        "flame": "<path d='M12 22c4.4 0 8-3.6 8-8 0-3-2-5-3-6-1 3-3 4-4 4 1-4-2-8-5-10 0 3-2 5-3 7-1 1-1 3-1 5 0 4.4 3.6 8 8 8z'/><path d='M8 18c0-2 1-3 2-4 0 2 1 3 2 3 1 0 2-1 2-3 1 1 2 2 2 4'/>",
        "external-link": "<path d='M15 3h6v6'/><path d='M10 14 21 3'/><path d='M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6'/>",
        "sun": "<circle cx='12' cy='12' r='4'/><path d='M12 2v2'/><path d='M12 20v2'/><path d='m4.93 4.93 1.42 1.42'/><path d='m17.66 17.66 1.41 1.41'/><path d='M2 12h2'/><path d='M20 12h2'/><path d='m6.34 17.66-1.41 1.41'/><path d='m19.07 4.93-1.41 1.41'/>"
        ,"chevron-down": "<path d='m6 9 6 6 6-6'/>",
        "align-left": "<path d='M15 12H3'/><path d='M17 18H3'/><path d='M21 6H3'/>",
        "columns": "<rect width='18' height='18' x='3' y='3' rx='2'/><path d='M12 3v18'/>",
        "maximize": "<path d='M8 3H5a2 2 0 0 0-2 2v3'/><path d='M16 3h3a2 2 0 0 1 2 2v3'/><path d='M8 21H5a2 2 0 0 1-2-2v-3'/><path d='M16 21h3a2 2 0 0 0 2-2v-3'/>",
        "minimize-2": "<polyline points='4 14 10 14 10 20'/><polyline points='20 10 14 10 14 4'/><line x1='14' x2='21' y1='10' y2='3'/><line x1='3' x2='10' y1='21' y2='14'/>",
        "refresh-cw": "<path d='M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8'/><path d='M21 3v5h-5'/><path d='M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16'/><path d='M8 16H3v5'/>",
        "globe": "<circle cx='12' cy='12' r='10'/><line x1='2' x2='22' y1='12' y2='12'/><path d='M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z'/>",
        "shield-check": "<path d='M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z'/><path d='m9 12 2 2 4-4'/>",
        "log-out": "<path d='M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4'/><polyline points='16 17 21 12 16 7'/><line x1='21' x2='9' y1='12' y2='12'/>",
        "check": "<polyline points='20 6 9 17 4 12'/>"
    })

    Image {
        anchors.fill: parent
        sourceSize.width: Math.max(24, width * Screen.devicePixelRatio)
        sourceSize.height: Math.max(24, height * Screen.devicePixelRatio)
        smooth: true
        mipmap: true
        source: {
            var body = root.paths[root.name] || root.paths.music
            var svg = "<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='" + root.fillColor + "' stroke='" + root.color + "' stroke-width='" + root.strokeWidth + "' stroke-linecap='round' stroke-linejoin='round'>" + body + "</svg>"
            return "data:image/svg+xml;utf8," + encodeURIComponent(svg)
        }
    }
}
