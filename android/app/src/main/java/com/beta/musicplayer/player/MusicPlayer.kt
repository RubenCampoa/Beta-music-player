package com.beta.musicplayer.player

import android.content.Context
import android.os.SystemClock
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import com.beta.musicplayer.data.model.LyricLine
import com.beta.musicplayer.data.model.Song
import com.beta.musicplayer.data.remote.NeteaseApiService
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancelChildren
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * Media3 ExoPlayer 播放器封装：队列、播放状态、歌词加载、播放模式。
 * 应用级单例（由 AppContainer 持有），不随 Activity 销毁。
 */
class MusicPlayer(
    private val context: Context,
    private val api: NeteaseApiService,
) {
    enum class PlayMode { REPEAT_ALL, REPEAT_ONE, SHUFFLE }

    data class PlayerState(
        val currentSong: Song? = null,
        val isPlaying: Boolean = false,
        val isBuffering: Boolean = false,
        val positionMs: Long = 0,
        val durationMs: Long = 0,
        val lyrics: List<LyricLine> = emptyList(),
        val playMode: PlayMode = PlayMode.REPEAT_ALL,
        val queue: List<Song> = emptyList(),
        val queueIndex: Int = -1,
    )

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val retriedNeteaseIds = mutableSetOf<Long>()
    private var lyricLoadToken = 0
    private var playRequestToken = 0

    // seek 目标位置缓存：seek 后立即向 UI 上报目标进度，消除进度条回跳抽搐。
    private var pendingSeekMs: Long? = null
    private var seekPendingSince = 0L

    // 错误自动跳歌的连续失败计数，防止整列失效时无限循环。
    private var consecutiveErrorSkips = 0

    private val _state = MutableStateFlow(PlayerState())
    val state: StateFlow<PlayerState> = _state.asStateFlow()

    val exoPlayer: ExoPlayer = ExoPlayer.Builder(context)
        .setAudioAttributes(
            AudioAttributes.Builder()
                .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
                .setUsage(C.USAGE_MEDIA)
                .build(),
            true
        )
        .setHandleAudioBecomingNoisy(true)
        .build().apply {
        repeatMode = Player.REPEAT_MODE_ALL
        addListener(object : Player.Listener {
            override fun onIsPlayingChanged(isPlaying: Boolean) {
                _state.update { it.copy(isPlaying = isPlaying) }
                if (isPlaying) consecutiveErrorSkips = 0
            }

            override fun onPlaybackStateChanged(playbackState: Int) {
                _state.update { it.copy(isBuffering = playbackState == Player.STATE_BUFFERING) }
            }

            override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
                val prevNeteaseId = _state.value.currentSong?.neteaseId
                val idx = exoPlayer.currentMediaItemIndex
                // 离开出错曲目后清除其重试标记，允许稍后再次自动恢复
                if (prevNeteaseId != null) retriedNeteaseIds.remove(prevNeteaseId)
                pendingSeekMs = null
                _state.update {
                    it.copy(
                        queueIndex = idx,
                        currentSong = it.queue.getOrNull(idx),
                        lyrics = emptyList(),
                    )
                }
                loadLyricsForCurrent()
            }

            override fun onPlayerError(error: PlaybackException) {
                // 失效/过期 CDN URL 兜底：用 /song/url/v1 获取真实 URL 重试一次（保留完整队列）；
                // 重试不可行时自动跳下一首，杜绝播放器停留在错误态卡死。
                val song = _state.value.currentSong ?: return
                val neteaseId = song.neteaseId
                if (neteaseId == null || neteaseId in retriedNeteaseIds) {
                    skipToNextAfterError()
                    return
                }
                retriedNeteaseIds.add(neteaseId)
                scope.launch {
                    val realUrl = api.getSongAudioUrl(neteaseId)
                    // 竞态保护：异步取 URL 期间用户已切歌，则不要干扰当前播放
                    if (_state.value.currentSong?.neteaseId != neteaseId) return@launch
                    if (realUrl.isNotBlank()) {
                        val index = exoPlayer.currentMediaItemIndex
                        val items = (0 until exoPlayer.mediaItemCount)
                            .map { exoPlayer.getMediaItemAt(it) }
                            .toMutableList()
                        if (index in items.indices) {
                            items[index] = MediaItem.Builder().setUri(realUrl).build()
                            exoPlayer.setMediaItems(items, index, 0L)
                        } else {
                            exoPlayer.setMediaItem(MediaItem.Builder().setUri(realUrl).build())
                            exoPlayer.seekTo(0, 0L)
                        }
                        consecutiveErrorSkips = 0
                        exoPlayer.prepare()
                        exoPlayer.playWhenReady = true
                    } else {
                        skipToNextAfterError()
                    }
                }
            }
        })
    }

    /** 出错且无法恢复时自动跳下一首；连续失败超过队列长度则停止，避免无限循环。 */
    private fun skipToNextAfterError() {
        consecutiveErrorSkips++
        if (_state.value.queue.isEmpty() ||
            consecutiveErrorSkips > _state.value.queue.size.coerceAtLeast(1)
        ) {
            consecutiveErrorSkips = 0
            exoPlayer.playWhenReady = false
            return
        }
        next()
    }

    /** 错误残留的 STATE_IDLE 下 seek/切换操作不会生效，需要重新 prepare。 */
    private fun ensurePrepared() {
        if (exoPlayer.playbackState == Player.STATE_IDLE) {
            exoPlayer.prepare()
        }
    }

    init {
        // 进度 ticker
        scope.launch {
            while (isActive) {
                _state.update {
                    it.copy(
                        positionMs = effectivePositionMs(),
                        durationMs = exoPlayer.duration.coerceAtLeast(0),
                    )
                }
                // 5Hz 足以及时触发歌词弹簧，同时避免 10Hz 根状态刷新与
                // Dock/Pager 切页动画争用主线程。原来的 500ms 延迟仍已消除。
                delay(200)
            }
        }
    }

    /**
     * seek 后 ExoPlayer 的 currentPosition 需要一小段时间才反映目标位置，
     * 期间直接上报目标值，避免进度条先回跳旧位置再前进的“抽搐”。
     */
    private fun effectivePositionMs(): Long {
        val real = exoPlayer.currentPosition.coerceAtLeast(0)
        val pending = pendingSeekMs ?: return real
        val caughtUp = kotlin.math.abs(real - pending) < 1_500 &&
            exoPlayer.playbackState != Player.STATE_BUFFERING
        val timedOut = SystemClock.elapsedRealtime() - seekPendingSince > 3_000
        return if (caughtUp || timedOut) {
            pendingSeekMs = null
            real
        } else {
            pending
        }
    }

    /** 用队列替换当前播放（startIndex 指定从第几首开始，即点即播无卡顿） */
    fun playQueue(songs: List<Song>, startIndex: Int = 0) {
        if (songs.isEmpty()) return
        retriedNeteaseIds.clear()
        val safeStartIndex = startIndex.coerceIn(0, songs.lastIndex)
        val requestToken = ++playRequestToken
        val targetSong = songs[safeStartIndex]
        pendingSeekMs = null
        _state.update { it.copy(queue = songs, queueIndex = safeStartIndex, currentSong = targetSong, lyrics = emptyList()) }
        // 首曲不依赖 ExoPlayer 的 transition 回调，一按播放即请求歌词。
        loadLyricsForCurrent()

        // 1. 立即加载 MediaItem 并平滑开始播放
        val initialItems = songs.map { MediaItem.Builder().setUri(it.audioUrl).build() }
        exoPlayer.setMediaItems(initialItems, safeStartIndex, 0L)
        exoPlayer.prepare()
        exoPlayer.playWhenReady = true

        // 2. 后台异步升级真实 CDN URL（使用 replaceMediaItem 精准替换，杜绝全量 reset 造成的音频卡顿）
        targetSong.neteaseId?.let { neteaseId ->
            scope.launch {
                val realUrl = api.getSongAudioUrl(neteaseId)
                if (requestToken != playRequestToken) return@launch
                // 快速切歌竞态保护：仅当目标曲目仍是当前播放曲目时才替换，
                // 防止往返切歌时替换错曲目导致播放中断重播。
                if (_state.value.currentSong?.neteaseId != neteaseId) return@launch
                if (!realUrl.isNullOrBlank() && realUrl != targetSong.audioUrl) {
                    val currentIndex = exoPlayer.currentMediaItemIndex
                    if (currentIndex == safeStartIndex && exoPlayer.mediaItemCount > safeStartIndex) {
                        val isPlayingNow = exoPlayer.isPlaying
                        exoPlayer.replaceMediaItem(safeStartIndex, MediaItem.Builder().setUri(realUrl).build())
                        if (isPlayingNow) exoPlayer.playWhenReady = true
                    }
                }
            }
        }
    }

    /** 播放单曲（独立于队列） */
    fun playSong(song: Song) {
        playQueue(listOf(song), 0)
    }

    fun pause() {
        exoPlayer.playWhenReady = false
    }

    fun preloadQueue(songs: List<Song>, startIndex: Int = 0) {
        if (songs.isEmpty()) return
        retriedNeteaseIds.clear()
        val safeStartIndex = startIndex.coerceIn(0, songs.lastIndex)
        val items = songs.map { MediaItem.Builder().setUri(it.audioUrl).build() }
        pendingSeekMs = null
        _state.update { it.copy(queue = songs, queueIndex = safeStartIndex, currentSong = songs[safeStartIndex], lyrics = emptyList()) }
        exoPlayer.setMediaItems(items, safeStartIndex, 0L)
        exoPlayer.prepare()
        exoPlayer.playWhenReady = false
    }

    fun togglePlay() {
        exoPlayer.playWhenReady = !exoPlayer.playWhenReady
    }

    fun seekTo(ms: Long) {
        val target = ms.coerceAtLeast(0)
        pendingSeekMs = target
        seekPendingSince = SystemClock.elapsedRealtime()
        exoPlayer.seekTo(target)
    }

    fun next() {
        if (_state.value.queue.isEmpty()) return
        if (exoPlayer.hasNextMediaItem()) {
            exoPlayer.seekToNextMediaItem()
        } else {
            exoPlayer.seekTo(0, 0L)
        }
        val nextIdx = exoPlayer.currentMediaItemIndex
        val nextSong = _state.value.queue.getOrNull(nextIdx)
        pendingSeekMs = null
        _state.update { it.copy(queueIndex = nextIdx, currentSong = nextSong, lyrics = emptyList()) }
        ensurePrepared()
        loadLyricsForCurrent()
    }

    fun previous() {
        if (_state.value.queue.isEmpty()) return
        if (exoPlayer.currentPosition > 3_000) {
            exoPlayer.seekTo(0)
        } else if (exoPlayer.hasPreviousMediaItem()) {
            exoPlayer.seekToPreviousMediaItem()
        } else {
            exoPlayer.seekTo(_state.value.queue.lastIndex, 0L)
        }
        val prevIdx = exoPlayer.currentMediaItemIndex
        val prevSong = _state.value.queue.getOrNull(prevIdx)
        pendingSeekMs = null
        _state.update { it.copy(queueIndex = prevIdx, currentSong = prevSong, lyrics = emptyList()) }
        ensurePrepared()
        loadLyricsForCurrent()
    }

    fun setPlayMode(mode: PlayMode) {
        _state.update { it.copy(playMode = mode) }
        when (mode) {
            PlayMode.REPEAT_ALL -> {
                exoPlayer.repeatMode = Player.REPEAT_MODE_ALL
                exoPlayer.shuffleModeEnabled = false
            }
            PlayMode.REPEAT_ONE -> {
                exoPlayer.repeatMode = Player.REPEAT_MODE_ONE
                exoPlayer.shuffleModeEnabled = false
            }
            PlayMode.SHUFFLE -> {
                exoPlayer.repeatMode = Player.REPEAT_MODE_ALL
                exoPlayer.shuffleModeEnabled = true
            }
        }
    }

    private fun loadLyricsForCurrent() {
        val song = _state.value.currentSong ?: return
        val neteaseId = song.neteaseId ?: return
        val token = ++lyricLoadToken
        scope.launch {
            val lyrics = api.getSongLyrics(neteaseId)
            // 竞态保护：仅当仍是当前歌曲时应用
            if (token == lyricLoadToken && _state.value.currentSong?.neteaseId == neteaseId) {
                _state.update { it.copy(lyrics = lyrics) }
            }
        }
    }

    fun release() {
        exoPlayer.release()
        scope.coroutineContext.cancelChildren()
    }
}
