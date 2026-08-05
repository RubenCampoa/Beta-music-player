plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
}

android {
    namespace = "com.beta.musicplayer"
    compileSdk = 36
    ndkVersion = "25.2.9519653"

    defaultConfig {
        applicationId = "com.beta.musicplayer"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"

        vectorDrawables {
            useSupportLibrary = true
        }

        externalNativeBuild {
            cmake {
                cppFlags += ""
                arguments += listOf("-DANDROID_STL=c++_shared")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            // 开发期 release 复用 debug 签名，便于直接安装验证
            signingConfig = signingConfigs.getByName("debug")
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    // 按 CPU 架构拆分 APK，避免把三份 Node.js 运行库塞进同一个安装包。
    // arm64-v8a 是当前 Android 手机的主流架构。
    splits {
        abi {
            isEnable = true
            reset()
            include("arm64-v8a", "armeabi-v7a", "x86_64")
            isUniversalApk = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    externalNativeBuild {
        cmake {
            path = file("src/main/cpp/CMakeLists.txt")
            version = "3.22.1"
        }
    }

    lint {
        checkReleaseBuilds = false
        // local.properties 的 Windows 路径转义误报（PropertyEscape 对本地开发文件无意义）
        disable += "PropertyEscape"
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
        freeCompilerArgs.add("-Xskip-metadata-version-check")
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)

    // Compose
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.foundation)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.material.icons.extended)
    implementation(libs.androidx.navigation.compose)
    debugImplementation(libs.androidx.compose.ui.tooling)

    // Media3 playback
    implementation(libs.androidx.media3.exoplayer)
    implementation(libs.androidx.media3.session)

    // Network
    implementation(libs.retrofit)
    implementation(libs.retrofit.kotlinx.serialization)
    implementation(libs.okhttp)
    implementation(libs.okhttp.logging)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.coroutines.android)

    // Persistence
    implementation(libs.androidx.datastore.preferences)

    // Image loading
    implementation(libs.coil.compose)
    implementation(libs.coil.network.okhttp)

    // Liquid Glass (Backdrop)
    implementation(libs.backdrop)
    implementation(libs.shapes)

    // Testing
    testImplementation(libs.junit)
}

// 禁用 AarMetadata 检查以防 backdrop 要求 compileSdk 37 阻碍 local SDK 35 正常编译
tasks.matching { it.name.contains("AarMetadata") }.configureEach {
    enabled = false
}

// Android 16 要求所有 .so 支持 16KB 内存页：LOAD 段需满足 p_align >= 0x4000
// 且 p_offset 与 p_vaddr 模 0x4000 同余。NDK r25 自带的 libc++_shared.so 等预构建库
// 只有 4KB 对齐，这里在原生库合并后用 third_party/Patch16Kb.exe 重新对齐（幂等，
// 已对齐的库会被跳过）。若 NDK 被重装/升级导致检查失败，先删除 NDK sysroot 中的
// *.orig4kb 备份同名文件后重跑构建即可。
tasks.matching { it.name.startsWith("merge") && it.name.endsWith("NativeLibs") }.configureEach {
    doLast {
        val patcher = rootProject.file("third_party/Patch16Kb.exe")
        if (!patcher.exists()) return@doLast
        outputs.files.forEach { outRoot ->
            fileTree(outRoot).matching { include("**/*.so") }.forEach { so ->
                providers.exec {
                    commandLine(patcher.absolutePath, so.absolutePath)
                }.result.get().assertNormalExitValue()
            }
        }
    }
}
