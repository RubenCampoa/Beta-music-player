#!/bin/bash
# 在 Windows Git Bash 下尝试 nodejs-mobile 的 Android 交叉编译 configure 阶段
set -x
cd /f/musicplayer/android/third_party/nodejs-mobile-src || exit 1
export PATH="/usr/bin:$PATH:/f/musicplayer/android/third_party/python311"
NDK=/c/Users/11932/AppData/Local/Android/Sdk/ndk/25.2.9519653
TC="$NDK/toolchains/llvm/prebuilt/windows-x86_64"
export PATH="$PATH:$TC/bin:$NDK/prebuilt/windows-x86_64/bin"
export CC="$TC/bin/x86_64-linux-android26-clang"
export CXX="$TC/bin/x86_64-linux-android26-clang++"
export AR="$TC/bin/llvm-ar"
export RANLIB="$TC/bin/llvm-ranlib"
export CC_host=gcc
export CXX_host=g++
export GYP_DEFINES="target_arch=x64 v8_target_arch=x64 android_target_arch=x64 host_os=win OS=android ANDROID_NDK_ROOT=$NDK ANDROID_NDK_SYSROOT=$TC/sysroot"
python.exe ./configure.py --dest-cpu=x64 --dest-os=android --openssl-no-asm --with-intl=none --cross-compiling --shared 2>&1 | tail -40
echo "CONFIGURE_EXIT=$?"
