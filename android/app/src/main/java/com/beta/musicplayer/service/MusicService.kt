package com.beta.musicplayer.service

import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import com.beta.musicplayer.BetaMusicPlayerApp

/**
 * Media3 系统的 MediaSessionService 原生前台服务。
 * 绑定应用级 ExoPlayer 实例与 MediaSession，支持系统通知栏控制、锁屏界面控制与蓝牙按键响应。
 */
class MusicService : MediaSessionService() {
    private var mediaSession: MediaSession? = null

    override fun onCreate() {
        super.onCreate()
        val app = applicationContext as? BetaMusicPlayerApp ?: return
        val player = app.container.player.exoPlayer
        mediaSession = MediaSession.Builder(this, player).build()
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? {
        return mediaSession
    }

    override fun onDestroy() {
        mediaSession?.run {
            player.release()
            release()
        }
        mediaSession = null
        super.onDestroy()
    }
}
