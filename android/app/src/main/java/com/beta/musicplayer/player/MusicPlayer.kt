package com.beta.musicplayer.player

import android.content.Context
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
            }

            override fun onPlaybackStateChanged(playbackState: Int) {
                _state.update { it.copy(isBuffering = playbackState == Player.STATE_BUFFERING) }
            }

            override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
                val idx = exoPlayer.currentMediaItemIndex
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
                // 兜底 URL 播放失败时，尝试用 /song/url/v1 获取真实 URL 重试一次（保留完整队列）
                val song = _state.value.currentSong ?: return
                val neteaseId = song.neteaseId ?: return
                if (neteaseId in retriedNeteaseIds) return
                retriedNeteaseIds.add(neteaseId)
                scope.launch {
                    val realUrl = api.getSongAudioUrl(neteaseId)
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
                        exoPlayer.prepare()
                        exoPlayer.playWhenReady = true
                    }
                }
            }
        })
    }

    init {
        // 进度 ticker
        scope.launch {
            while (isActive) {
                _state.update {
                    it.copy(
                        positionMs = exoPlayer.currentPosition.coerceAtLeast(0),
                        durationMs = exoPlayer.duration.coerceAtLeast(0),
                    )
                }
                // 5Hz 足以及时触发歌词弹簧，同时避免 10Hz 根状态刷新与
                // Dock/Pager 切页动画争用主线程。原来的 500ms 延迟仍已消除。
                delay(200)
            }
        }
    }

    /** 用队列替换当前播放（startIndex 指定从第几首开始） */
    fun playQueue(songs: List<Song>, startIndex: Int = 0) {
        if (songs.isEmpty()) return
        retriedNeteaseIds.clear()
        val safeStartIndex = startIndex.coerceIn(0, songs.lastIndex)
        val requestToken = ++playRequestToken
        _state.update { it.copy(queue = songs, queueIndex = -1, currentSong = songs[safeStartIndex], lyrics = emptyList()) }
        // 首曲不依赖 ExoPlayer 的 transition 回调，确保一按播放就请求 /lyric。
        loadLyricsForCurrent()
        // 不把易失效的 music.163.com outer 链接直接交给播放器。先通过
        // api-enhanced 取得实际 CDN URL，首首歌曲切换时也会走同一条链路。
        scope.launch {
            val firstSong = songs[safeStartIndex]
            val playableUrl = firstSong.neteaseId?.let { api.getSongAudioUrl(it) }
            if (requestToken != playRequestToken) return@launch
            val items = songs.mapIndexed { index, song ->
                val url = if (index == safeStartIndex && !playableUrl.isNullOrBlank()) {
                    playableUrl
                } else {
                    song.audioUrl
                }
                MediaItem.Builder().setUri(url).build()
            }
            exoPlayer.setMediaItems(items, safeStartIndex, 0L)
            exoPlayer.prepare()
            exoPlayer.playWhenReady = true
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
        _state.update { it.copy(queue = songs, queueIndex = safeStartIndex, currentSong = songs[safeStartIndex], lyrics = emptyList()) }
        exoPlayer.setMediaItems(items, safeStartIndex, 0L)
        exoPlayer.prepare()
        exoPlayer.playWhenReady = false
        // 首页首次进入会预加载第一首；这里也提前替换成 API 返回的 CDN URL，
        // 用户点击播放时无需先触发一次 outer-url 错误再重试。
        val firstSong = songs[safeStartIndex]
        firstSong.neteaseId?.let { neteaseId ->
            scope.launch {
                val playableUrl = api.getSongAudioUrl(neteaseId)
                if (
                    playableUrl.isNotBlank() &&
                    _state.value.currentSong?.neteaseId == neteaseId &&
                    exoPlayer.currentMediaItemIndex == safeStartIndex
                ) {
                    val updatedItems = (0 until exoPlayer.mediaItemCount)
                        .map { exoPlayer.getMediaItemAt(it) }
                        .toMutableList()
                    updatedItems[safeStartIndex] = MediaItem.Builder().setUri(playableUrl).build()
                    exoPlayer.setMediaItems(updatedItems, safeStartIndex, 0L)
                    exoPlayer.prepare()
                    exoPlayer.playWhenReady = false
                }
            }
        }
    }

    fun togglePlay() {
        exoPlayer.playWhenReady = !exoPlayer.playWhenReady
    }

    fun seekTo(ms: Long) {
        exoPlayer.seekTo(ms.coerceAtLeast(0))
    }

    fun next() {
        if (_state.value.queue.isEmpty()) return
        exoPlayer.seekToNextMediaItem()
    }

    fun previous() {
        if (_state.value.queue.isEmpty()) return
        if (exoPlayer.currentPosition > 3_000) {
            exoPlayer.seekTo(0)
        } else {
            exoPlayer.seekToPreviousMediaItem()
        }
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
