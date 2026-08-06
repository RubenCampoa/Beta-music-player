package com.beta.musicplayer

import android.app.Application
import android.content.Context
import com.beta.musicplayer.data.local.PreferencesRepository
import com.beta.musicplayer.data.remote.NeteaseApiService
import com.beta.musicplayer.player.MusicPlayer
import com.beta.musicplayer.runtime.EmbeddedNodeRuntime
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withTimeoutOrNull
import kotlin.time.Duration.Companion.milliseconds
import kotlin.time.Duration.Companion.seconds

/** 简易服务定位器：应用级依赖容器 */
class AppContainer(app: Context) {
    private val appContext = app.applicationContext
    val applicationScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    val preferences = PreferencesRepository(app)
    val netEaseApi = NeteaseApiService(preferences)
    val player = MusicPlayer(app.applicationContext, netEaseApi)
    private val initMutex = Mutex()
    @Volatile private var initialized = false
    /** 原生库是否可用（加载失败时为 false，自动降级外部 API） */
    @Volatile private var nativeRuntimeAvailable = true

    /** 启动时恢复登录态与播放模式 */
    suspend fun init() {
        if (initialized) {
            if (nativeRuntimeAvailable) {
                tryStartNodeRuntime()
                waitForEmbeddedApi()
                if (!netEaseApi.restoreSession()) {
                    restartNodeRuntime()
                    netEaseApi.restoreSession()
                }
            } else {
                netEaseApi.restoreSession()
            }
            return
        }
        initMutex.withLock {
            if (initialized) return
            tryStartNodeRuntime()
            // 首次启动需要从 APK 解压 Node 依赖，低端设备可能超过 15 秒。
            waitForEmbeddedApi()
            if (!netEaseApi.restoreSession()) {
                if (nativeRuntimeAvailable) {
                    restartNodeRuntime()
                }
                netEaseApi.restoreSession()
            }
            preferences.getPlayMode().let { mode ->
                runCatching {
                    player.setPlayMode(MusicPlayer.PlayMode.valueOf(mode))
                }
            }
            initialized = true
        }
    }

    private fun tryStartNodeRuntime() {
        try {
            EmbeddedNodeRuntime.start(appContext)
        } catch (e: Throwable) {
            // 原生库加载失败时降级到外部 API
            nativeRuntimeAvailable = false
            android.util.Log.e("AppContainer", "EmbeddedNodeRuntime unavailable, falling back to external API", e)
        }
    }

    private suspend fun restartNodeRuntime() {
        try {
            EmbeddedNodeRuntime.restart(appContext)
            waitForEmbeddedApi()
        } catch (e: Throwable) {
            nativeRuntimeAvailable = false
            android.util.Log.e("AppContainer", "Failed to restart EmbeddedNodeRuntime", e)
        }
    }

    private suspend fun waitForEmbeddedApi() {
        if (!nativeRuntimeAvailable) return
        // 首次启动需要从 APK 解压 Node 依赖，低端设备可能超过 45 秒。
        withTimeoutOrNull(45.seconds) {
            while (true) {
                val ready = try {
                    EmbeddedNodeRuntime.isReady(appContext)
                } catch (_: Throwable) {
                    nativeRuntimeAvailable = false
                    return@withTimeoutOrNull
                }
                if (ready) break
                delay(100.milliseconds)
            }
        }
    }
}

class BetaMusicPlayerApp : Application() {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
        container.applicationScope.launch {
            container.init()
        }
    }
}
