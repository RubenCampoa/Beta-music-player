cmake_minimum_required(VERSION 3.21)

project(BetaMusicPlayerQt VERSION 1.0.8 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_AUTOMOC ON)
set(CMAKE_AUTORCC ON)
set(CMAKE_AUTOUIC ON)

find_package(Qt6 6.5 REQUIRED COMPONENTS Core Gui Widgets Qml Quick QuickControls2 Multimedia Network)

qt_add_executable(BetaMusicPlayerCpp
    main.cpp
    JsonListModel.cpp
    JsonListModel.h
    LyricParser.cpp
    LyricParser.h
    MusicBridge.cpp
    MusicBridge.h
    WindowsFrame.cpp
    WindowsFrame.h
    WebLoginWindow.cpp
    WebLoginWindow.h
)

if (WIN32)
    configure_file(version.rc.in version.rc @ONLY)
    target_sources(BetaMusicPlayerCpp PRIVATE ${CMAKE_CURRENT_BINARY_DIR}/version.rc)
endif()

target_include_directories(BetaMusicPlayerCpp PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}
    ${CMAKE_CURRENT_SOURCE_DIR}/../webview2/build/native/include
)

target_link_libraries(BetaMusicPlayerCpp PRIVATE
    Qt6::Core
    Qt6::Gui
    Qt6::Widgets
    Qt6::Qml
    Qt6::Quick
    Qt6::QuickControls2
    Qt6::Multimedia
    Qt6::Network
)
target_compile_definitions(BetaMusicPlayerCpp PRIVATE
    BETA_APP_VERSION="1.0.8-Beta"
)

if (WIN32)
    set_target_properties(BetaMusicPlayerCpp PROPERTIES WIN32_EXECUTABLE TRUE)
    target_link_libraries(BetaMusicPlayerCpp PRIVATE
        dwmapi
        user32
        crypt32
        ole32
        oleaut32
        "${CMAKE_CURRENT_SOURCE_DIR}/../webview2/build/native/x64/WebView2Loader.dll.lib"
    )
endif()

# 单元测试：覆盖歌词解析纯函数（parseLrc/parseYrc/parseKrc/filterQqLyricLines）。
enable_testing()
qt_add_executable(LyricsTest
    test/LyricsTest.cpp
    JsonListModel.cpp
    JsonListModel.h
    LyricParser.cpp
    LyricParser.h
    MusicBridge.cpp
    MusicBridge.h
)
target_include_directories(LyricsTest PRIVATE ${CMAKE_CURRENT_SOURCE_DIR})
target_link_libraries(LyricsTest PRIVATE
    Qt6::Core
    Qt6::Gui
    Qt6::Widgets
    Qt6::Multimedia
    Qt6::Network
)
if (WIN32)
    target_link_libraries(LyricsTest PRIVATE user32 crypt32)
endif()
add_test(NAME LyricsTest COMMAND LyricsTest)
