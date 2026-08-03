package com.beta.musicplayer

import android.app.Application
import android.content.Context
import com.beta.musicplayer.data.local.PreferencesRepository
import com.beta.musicplayer.data.remote.NeteaseApiService
import com.beta.musicplayer.player.MusicPlayer
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/** 简易服务定位器：应用级依赖容器 */
class AppContainer(app: Context) {
    val applicationScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    val preferences = PreferencesRepository(app)
    val neteaseApi = NeteaseApiService(preferences)
    val player = MusicPlayer(app.applicationContext, neteaseApi)
    private val initMutex = Mutex()
    @Volatile private var initialized = false

    /** 启动时恢复登录态与播放模式 */
    suspend fun init() {
        if (initialized) return
        initMutex.withLock {
            if (initialized) return
            neteaseApi.restoreSession()
            preferences.getPlayMode().let { mode ->
                runCatching {
                    player.setPlayMode(MusicPlayer.PlayMode.valueOf(mode))
                }
            }
            initialized = true
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
