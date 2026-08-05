cmake_minimum_required(VERSION 3.22.1)

project(embeddednode)

add_library(libnode SHARED IMPORTED)
set_target_properties(
    libnode
    PROPERTIES
    IMPORTED_LOCATION "${CMAKE_CURRENT_LIST_DIR}/../jniLibs/${ANDROID_ABI}/libnode.so"
    INTERFACE_INCLUDE_DIRECTORIES "${CMAKE_CURRENT_LIST_DIR}/libnode/include/node"
)

add_library(embeddednode SHARED native-lib.cpp)
target_include_directories(embeddednode PRIVATE "${CMAKE_CURRENT_LIST_DIR}/libnode/include/node")

# Android 16 要求原生库支持 16KB 内存页对齐
target_link_options(embeddednode PRIVATE "-Wl,-z,max-page-size=16384")

find_library(log-lib log)
target_link_libraries(embeddednode libnode ${log-lib})
