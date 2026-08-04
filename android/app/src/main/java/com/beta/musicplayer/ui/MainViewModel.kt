package com.beta.musicplayer.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.beta.musicplayer.AppContainer
import com.beta.musicplayer.data.model.Playlist
import com.beta.musicplayer.data.model.Artist
import com.beta.musicplayer.data.model.Song
import com.beta.musicplayer.data.model.UserProfile
import com.beta.musicplayer.player.MusicPlayer
import kotlinx.coroutines.delay
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class MainUiState(
    val user: UserProfile? = null,
    val userPlaylists: List<Playlist> = emptyList(),
    val recommendedSongs: List<Song> = emptyList(),
    val recommendedPlaylists: List<Playlist> = emptyList(),
    val isLoadingRecommendations: Boolean = false,
    val artists: List<Artist> = emptyList(),
    val isLoadingArtists: Boolean = false,
    val artistsError: String? = null,
    val selectedArtist: Artist? = null,
    val artistSongs: List<Song> = emptyList(),
    val isLoadingArtistSongs: Boolean = false,
    val artistSongsError: String? = null,
    val searchQuery: String = "",
    val searchResults: List<Song> = emptyList(),
    val isSearching: Boolean = false,
    val searchHistory: List<String> = emptyList(),
    val likedIds: Set<Long> = emptySet(),
    val likedSongs: List<Song> = emptyList(),
    val isLoadingLiked: Boolean = false,
    val selectedPlaylist: Playlist? = null,
    val playlistSongs: List<Song> = emptyList(),
    val isLoadingPlaylistSongs: Boolean = false,
    val playlistSongsError: String? = null,
    // 登录
    val qrImage: String? = null,
    val qrKey: String = "",
    val qrMessage: String? = null,
    val isLoginLoading: Boolean = false,
    val isLoginSheetVisible: Boolean = false,
    val isCaptchaSending: Boolean = false,
    val captchaSentAt: Long = 0L,
    val isPhoneLoginLoading: Boolean = false,
    val phoneLoginMessage: String? = null,
    val apiBaseUrl: String = "",
    val toastMessage: String? = null,
)

class MainViewModel(private val container: AppContainer) : ViewModel() {

    private val _uiState = MutableStateFlow(MainUiState())
    val uiState: StateFlow<MainUiState> = _uiState.asStateFlow()
    private var playlistDetailJob: Job? = null
    private var artistDetailJob: Job? = null

    init {
        viewModelScope.launch {
            // Application.onCreate 的恢复任务与首屏 ViewModel 可能并发；这里显式等待，
            // 避免首次请求仍使用旧 baseUrl，或登录 cookie 尚未恢复就加载账号。
            container.init()
            _uiState.update { it.copy(apiBaseUrl = container.neteaseApi.getApiBaseUrl()) }
            loadRecommendations()
            loadArtists()
            // 启动恢复：用户资料、搜索历史
            val user = container.neteaseApi.getUserAccount()
            container.preferences.setUserProfile(user)
            _uiState.update { it.copy(user = user) }

            if (user != null) {
                loadUserData(user)
            }
        }

        // 各持久化数据流独立收集（不可串行 collect——首个 collect 会永久挂起）
        viewModelScope.launch {
            container.preferences.userProfileFlow.collect { profile ->
                _uiState.update { it.copy(user = profile) }
            }
        }
        viewModelScope.launch {
            container.preferences.searchHistoryFlow.collect { history ->
                _uiState.update { it.copy(searchHistory = history) }
            }
        }
        viewModelScope.launch {
            container.preferences.likedSongsFlow.collect { ids ->
                _uiState.update { it.copy(likedIds = ids) }
            }
        }
    }

    private suspend fun loadUserData(user: UserProfile) {
        viewModelScope.launch {
            val playlists = container.neteaseApi.getUserPlaylists(user.userId)
            val likedIds = container.neteaseApi.getLikelist(user.userId).toSet()
            _uiState.update { it.copy(userPlaylists = playlists, likedIds = likedIds) }
            container.preferences.setLikedSongs(likedIds)

            _uiState.update { it.copy(isLoadingLiked = true) }
            val likedSongs = container.neteaseApi.getSongsByIds(likedIds.toList())
            _uiState.update { it.copy(likedSongs = likedSongs, isLoadingLiked = false) }
        }
    }

    private fun loadRecommendations() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoadingRecommendations = true) }
            val recSongs = container.neteaseApi.getPersonalizedNewSongs()
            val recPlaylists = container.neteaseApi.getPersonalizedPlaylists()
            _uiState.update {
                it.copy(
                    recommendedSongs = recSongs,
                    recommendedPlaylists = recPlaylists,
                    isLoadingRecommendations = false,
                )
            }
            if (container.player.state.value.currentSong == null && recSongs.isNotEmpty()) {
                container.player.preloadQueue(recSongs, 0)
            }
        }
    }

    fun loadArtists() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoadingArtists = true, artistsError = null) }
            val artists = container.neteaseApi.getTopArtists()
            _uiState.update {
                it.copy(
                    artists = artists,
                    isLoadingArtists = false,
                    artistsError = if (artists.isEmpty()) "网易云热门歌手加载失败，点击重试" else null,
                )
            }
        }
    }

    /** 打开艺术家详情，加载网易云真实热门歌曲；不自动播放。 */
    fun openArtist(artist: Artist) {
        artistDetailJob?.cancel()
        _uiState.update {
            it.copy(
                selectedArtist = artist,
                artistSongs = emptyList(),
                isLoadingArtistSongs = true,
                artistSongsError = null,
            )
        }
        artistDetailJob = viewModelScope.launch {
            val songs = container.neteaseApi.getArtistTopSongs(artist.id)
            _uiState.update { state ->
                if (state.selectedArtist?.id != artist.id) {
                    state
                } else {
                    state.copy(
                        artistSongs = songs,
                        isLoadingArtistSongs = false,
                        artistSongsError = if (songs.isEmpty()) {
                            "${artist.name} 暂无热门歌曲，或网易云接口加载失败"
                        } else {
                            null
                        },
                    )
                }
            }
        }
    }

    fun closeArtist() {
        artistDetailJob?.cancel()
        artistDetailJob = null
        _uiState.update {
            it.copy(
                selectedArtist = null,
                artistSongs = emptyList(),
                isLoadingArtistSongs = false,
                artistSongsError = null,
            )
        }
    }

    // --- 搜索 ---

    private var searchJob: kotlinx.coroutines.Job? = null

    fun search(keywords: String) {
        val query = keywords.trim()
        _uiState.update { it.copy(searchQuery = keywords) }
        if (query.isEmpty()) {
            searchJob?.cancel()
            _uiState.update { it.copy(searchResults = emptyList(), isSearching = false) }
            return
        }
        searchJob?.cancel()
        searchJob = viewModelScope.launch {
            delay(300)
            _uiState.update { it.copy(isSearching = true) }
            val results = container.neteaseApi.searchSongs(query)
            _uiState.update { it.copy(searchResults = results, isSearching = false) }
            container.preferences.addSearchHistory(query)
        }
    }

    fun clearSearchResults() {
        _uiState.update { it.copy(searchResults = emptyList(), searchQuery = "") }
    }

    fun clearSearchHistory() {
        viewModelScope.launch { container.preferences.clearSearchHistory() }
    }

    /** 播放搜索/歌单/红心列表 */
    fun playList(songs: List<Song>, startIndex: Int = 0) {
        container.player.playQueue(songs, startIndex)
    }

    /** 加载歌单并开始播放 */
    fun playPlaylist(playlist: Playlist, onDone: () -> Unit = {}) {
        viewModelScope.launch {
            val songs = container.neteaseApi.getPlaylistSongs(playlist.id)
            if (songs.isNotEmpty()) {
                container.player.playQueue(songs, 0)
            }
            onDone()
        }
    }

    /** 打开歌单详情；只加载列表，不自动开始播放。 */
    fun openPlaylist(playlist: Playlist) {
        playlistDetailJob?.cancel()
        _uiState.update {
            it.copy(
                selectedPlaylist = playlist,
                playlistSongs = emptyList(),
                isLoadingPlaylistSongs = true,
                playlistSongsError = null,
            )
        }
        playlistDetailJob = viewModelScope.launch {
            val songs = container.neteaseApi.getPlaylistSongs(playlist.id)
            _uiState.update { state ->
                if (state.selectedPlaylist?.id != playlist.id) {
                    state
                } else {
                    state.copy(
                        playlistSongs = songs,
                        isLoadingPlaylistSongs = false,
                        playlistSongsError = if (songs.isEmpty()) {
                            "歌单中暂无可播放歌曲，或网易云接口加载失败"
                        } else {
                            null
                        },
                    )
                }
            }
        }
    }

    fun closePlaylist() {
        playlistDetailJob?.cancel()
        playlistDetailJob = null
        _uiState.update {
            it.copy(
                selectedPlaylist = null,
                playlistSongs = emptyList(),
                isLoadingPlaylistSongs = false,
                playlistSongsError = null,
            )
        }
    }

    // --- 播放控制（代理到播放器） ---

    fun togglePlay() = container.player.togglePlay()

    fun next() = container.player.next()

    fun previous() = container.player.previous()

    fun seekFraction(fraction: Float) {
        val duration = container.player.state.value.durationMs
        container.player.seekTo((fraction * duration).toLong())
    }

    fun cyclePlayMode() {
        val next = when (container.player.state.value.playMode) {
            MusicPlayer.PlayMode.REPEAT_ALL -> MusicPlayer.PlayMode.REPEAT_ONE
            MusicPlayer.PlayMode.REPEAT_ONE -> MusicPlayer.PlayMode.SHUFFLE
            MusicPlayer.PlayMode.SHUFFLE -> MusicPlayer.PlayMode.REPEAT_ALL
        }
        container.player.setPlayMode(next)
        viewModelScope.launch { container.preferences.setPlayMode(next.name) }
    }

    fun showToast(message: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(toastMessage = message) }
            delay(2500)
            _uiState.update { if (it.toastMessage == message) it.copy(toastMessage = null) else it }
        }
    }

    // --- 红心收藏 ---

    fun toggleLike(song: Song) {
        val id = song.neteaseId ?: return
        if (_uiState.value.user == null) {
            showToast("请登录后再操作")
            return
        }
        viewModelScope.launch {
            val liked = id in _uiState.value.likedIds
            val success = container.neteaseApi.likeSong(id, !liked)
            if (success) {
                val newIds = if (liked) _uiState.value.likedIds - id else _uiState.value.likedIds + id
                _uiState.update { it.copy(likedIds = newIds) }
                container.preferences.setLikedSongs(newIds)
                // 红心列表增量维护
                if (liked) {
                    _uiState.update { it.copy(likedSongs = it.likedSongs.filterNot { s -> s.neteaseId == id }) }
                } else if (_uiState.value.likedSongs.none { it.neteaseId == id }) {
                    val fresh = container.neteaseApi.getSongsByIds(listOf(id))
                    _uiState.update { it.copy(likedSongs = listOfNotNull(fresh.firstOrNull()) + it.likedSongs) }
                }
            }
        }
    }

    // --- 登录 ---

    private var qrPollJob: kotlinx.coroutines.Job? = null

    fun startLogin() {
        qrPollJob?.cancel()
        qrPollJob = viewModelScope.launch {
            _uiState.update {
                it.copy(
                    isLoginSheetVisible = true,
                    isLoginLoading = true,
                    qrMessage = null,
                    qrImage = null,
                    phoneLoginMessage = null,
                )
            }
            val key = container.neteaseApi.getQrKey()
            if (key.isBlank()) {
                _uiState.update { it.copy(isLoginLoading = false, qrMessage = "获取二维码失败，请检查网络") }
                return@launch
            }
            val image = container.neteaseApi.getQrImage(key)
            if (image.isBlank()) {
                _uiState.update { it.copy(isLoginLoading = false, qrMessage = "获取二维码失败，请检查网络") }
                return@launch
            }
            _uiState.update { it.copy(qrKey = key, qrImage = image, isLoginLoading = false) }
            pollQr(key)
        }
    }

    private suspend fun pollQr(key: String) {
        while (true) {
            delay(1500)
            val res = container.neteaseApi.checkQrStatus(key)
            when {
                res.code == 800 -> {
                    _uiState.update { it.copy(qrMessage = "二维码已过期，请重新获取", qrImage = null, qrKey = "") }
                    return
                }
                res.code == 801 -> _uiState.update { it.copy(qrMessage = "请使用网易云音乐 App 扫码") }
                res.code == 802 -> _uiState.update { it.copy(qrMessage = "已扫码，请在手机上确认") }
                res.code == 803 -> {
                    container.neteaseApi.setCookie(res.cookie ?: "")
                    val user = container.neteaseApi.getUserAccount()
                    container.preferences.setUserProfile(user)
                    _uiState.update {
                        it.copy(
                            user = user,
                            qrImage = null,
                            qrKey = "",
                            qrMessage = "登录成功",
                            isLoginSheetVisible = user == null,
                        )
                    }
                    if (user != null) loadUserData(user)
                    return
                }
            }
        }
    }

    fun closeLogin() {
        qrPollJob?.cancel()
        _uiState.update {
            it.copy(
                isLoginSheetVisible = false,
                isLoginLoading = false,
                isCaptchaSending = false,
                isPhoneLoginLoading = false,
                qrImage = null,
                qrKey = "",
                qrMessage = null,
                phoneLoginMessage = null,
            )
        }
    }

    fun openPhoneLogin() {
        qrPollJob?.cancel()
        _uiState.update {
            it.copy(
                isLoginSheetVisible = true,
                isLoginLoading = false,
                qrImage = null,
                qrKey = "",
                qrMessage = null,
                phoneLoginMessage = null,
            )
        }
    }

    fun sendPhoneCaptcha(phone: String, countryCode: String) {
        if (_uiState.value.isCaptchaSending) return
        qrPollJob?.cancel()
        viewModelScope.launch {
            _uiState.update {
                it.copy(isCaptchaSending = true, phoneLoginMessage = null, isLoginSheetVisible = true)
            }
            val result = container.neteaseApi.sendPhoneCaptcha(phone, countryCode)
            _uiState.update {
                it.copy(
                    isCaptchaSending = false,
                    captchaSentAt = if (result.success) System.currentTimeMillis() else it.captchaSentAt,
                    phoneLoginMessage = result.message,
                )
            }
        }
    }

    fun loginWithPhoneCaptcha(phone: String, captcha: String, countryCode: String) {
        if (_uiState.value.isPhoneLoginLoading) return
        qrPollJob?.cancel()
        viewModelScope.launch {
            _uiState.update {
                it.copy(isPhoneLoginLoading = true, phoneLoginMessage = null, isLoginSheetVisible = true)
            }
            val result = container.neteaseApi.loginWithPhoneCaptcha(phone, captcha, countryCode)
            if (!result.success) {
                _uiState.update { it.copy(isPhoneLoginLoading = false, phoneLoginMessage = result.message) }
                return@launch
            }

            val user = container.neteaseApi.getUserAccount()
            if (user == null) {
                _uiState.update {
                    it.copy(
                        isPhoneLoginLoading = false,
                        phoneLoginMessage = "已取得登录凭据，但账号资料同步失败，请稍后重试",
                    )
                }
                return@launch
            }
            container.preferences.setUserProfile(user)
            _uiState.update {
                it.copy(
                    user = user,
                    isLoginSheetVisible = false,
                    isPhoneLoginLoading = false,
                    phoneLoginMessage = null,
                    qrImage = null,
                    qrKey = "",
                    qrMessage = null,
                )
            }
            loadUserData(user)
        }
    }

    fun updateApiBaseUrl(value: String) {
        viewModelScope.launch {
            if (container.neteaseApi.setApiBaseUrl(value)) {
                _uiState.update {
                    it.copy(
                        apiBaseUrl = container.neteaseApi.getApiBaseUrl(),
                        qrMessage = "服务已连接，正在重新加载网易云数据",
                        qrImage = null,
                        qrKey = "",
                    )
                }
                loadRecommendations()
                loadArtists()
                startLogin()
            } else {
                _uiState.update {
                    it.copy(qrMessage = "服务地址无效或无法连接，请确认 api-enhanced 已启动")
                }
            }
        }
    }

    fun logout() {
        qrPollJob?.cancel()
        playlistDetailJob?.cancel()
        artistDetailJob?.cancel()
        viewModelScope.launch {
            container.neteaseApi.logoutAccount()
            container.preferences.setUserProfile(null)
            container.preferences.setLikedSongs(emptySet())
            _uiState.update {
                it.copy(
                    user = null,
                    userPlaylists = emptyList(),
                    likedIds = emptySet(),
                    likedSongs = emptyList(),
                    selectedPlaylist = null,
                    playlistSongs = emptyList(),
                    isLoadingPlaylistSongs = false,
                    playlistSongsError = null,
                    selectedArtist = null,
                    artistSongs = emptyList(),
                    isLoadingArtistSongs = false,
                    artistSongsError = null,
                    isLoginSheetVisible = false,
                    isLoginLoading = false,
                    isCaptchaSending = false,
                    isPhoneLoginLoading = false,
                    phoneLoginMessage = null,
                    qrImage = null,
                    qrKey = "",
                    qrMessage = null,
                )
            }
        }
    }
}
