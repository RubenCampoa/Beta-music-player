package com.beta.musicplayer.data.remote

import com.beta.musicplayer.data.local.PreferencesRepository
import com.beta.musicplayer.data.model.LyricLine
import com.beta.musicplayer.data.model.Artist
import com.beta.musicplayer.data.model.Playlist
import com.beta.musicplayer.data.model.Song
import com.beta.musicplayer.data.model.UserProfile
import com.beta.musicplayer.data.util.Format
import com.beta.musicplayer.data.util.LrcParser
import kotlinx.coroutines.flow.first
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.contentOrNull
import retrofit2.HttpException
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.Response
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import retrofit2.http.GET
import retrofit2.http.Query
import java.io.IOException
import java.util.concurrent.TimeUnit
import okhttp3.MediaType.Companion.toMediaType

// ---------------------------------------------------------------------------
// DTO（宽松解析：忽略未知字段）
// ---------------------------------------------------------------------------

@Serializable
data class QrKeyResp(val code: Int = -1, val data: QrKeyData? = null, val unikey: String? = null)

@Serializable
data class QrKeyData(val unikey: String? = null)

@Serializable
data class QrImageResp(val code: Int = -1, val data: QrImageData? = null, val qrurl: String? = null)

@Serializable
data class QrImageData(val qrimg: String? = null, val qrurl: String? = null)

@Serializable
data class QrCheckResp(val code: Int = -1, val message: String? = null, val cookie: String? = null)

@Serializable
data class AuthApiResp(
    val code: Int = -1,
    val data: Boolean? = null,
    val message: String? = null,
    val msg: String? = null,
    val cookie: String? = null,
)

data class PhoneAuthResult(
    val success: Boolean,
    val message: String,
)

@Serializable
data class AccountResp(val code: Int = -1, val profile: ProfileDto? = null)

@Serializable
data class ProfileDto(
    val userId: Long = 0,
    val nickname: String = "",
    val avatarUrl: String = "",
    val signature: String? = null,
    val vipType: Int? = null,
)

@Serializable
data class PlaylistResp(val playlist: List<PlaylistDto>? = null)

@Serializable
data class PlaylistDto(
    val id: Long = 0,
    val name: String = "",
    @SerialName("coverImgUrl") val coverImgUrl: String? = null,
    // /personalized 使用 picUrl，/user/playlist 才使用 coverImgUrl。
    @SerialName("picUrl") val picUrl: String? = null,
    @SerialName("trackCount") val trackCount: Int = 0,
    val description: String? = null,
    val creator: CreatorDto? = null,
)

@Serializable
data class CreatorDto(val nickname: String? = null)

@Serializable
data class LikelistResp(val ids: List<Long>? = null)

@Serializable
data class LikeResp(val code: Int = -1)

@Serializable
data class PlaylistTracksResp(val songs: List<TrackDto>? = null, val playlist: PlaylistTracksInner? = null)

@Serializable
data class PlaylistTracksInner(val tracks: List<TrackDto>? = null)

@Serializable
data class SearchResp(val result: SearchResultDto? = null)

@Serializable
data class SearchResultDto(val songs: List<TrackDto>? = null)

@Serializable
data class SongDetailResp(val songs: List<TrackDto>? = null)

@Serializable
data class SongUrlResp(val data: List<SongUrlDto>? = null)

@Serializable
data class SongUrlDto(val url: String? = null)

@Serializable
data class LyricResp(
    val lrc: LyricText? = null,
    val tlyric: LyricText? = null,
    val nolyric: Boolean? = null,
    val uncollected: Boolean? = null,
)

@Serializable
data class LyricText(val lyric: String? = null)

@Serializable
data class PersonalizedNewSongResp(val result: List<NewSongItemDto>? = null)

@Serializable
data class NewSongItemDto(
    val id: Long = 0,
    val name: String = "",
    val song: TrackDto? = null,
)

@Serializable
data class PersonalizedPlaylistResp(val result: List<PlaylistDto>? = null)

@Serializable
data class TopArtistsResp(
    val code: Int = -1,
    val more: Boolean? = null,
    val artists: List<ArtistProfileDto>? = null,
)

@Serializable
data class ArtistProfileDto(
    val id: Long = 0,
    val name: String = "",
    val picUrl: String? = null,
    val img1v1Url: String? = null,
    val albumSize: Int = 0,
    val musicSize: Int = 0,
    val briefDesc: String? = null,
    val alias: List<String>? = null,
)

@Serializable
data class ArtistTopSongsResp(
    val code: Int = -1,
    val songs: List<TrackDto>? = null,
)

@Serializable
data class TrackDto(
    val id: Long = 0,
    val name: String = "",
    val ar: List<ArtistDto>? = null,
    val artists: List<ArtistDto>? = null,
    val al: AlbumDto? = null,
    val album: AlbumDto? = null,
    val dt: Long? = null,
    val duration: Long? = null,
    val fee: Int? = null,
    val privilege: PrivilegeDto? = null,
)

@Serializable
data class ArtistDto(val name: String? = null)

@Serializable
data class AlbumDto(
    val name: String? = null,
    @SerialName("picUrl") val picUrl: String? = null,
    @SerialName("pic_str") val picStr: String? = null,
    @SerialName("picId") val picId: Long? = null,
)

@Serializable
data class PrivilegeDto(val fee: Int? = null)

// ---------------------------------------------------------------------------
// Retrofit 接口
// ---------------------------------------------------------------------------

private interface NeteaseApi {
    @GET("/login/qr/key")
    suspend fun getQrKey(): QrKeyResp

    @GET("/login/qr/create")
    suspend fun getQrImage(@Query("key") key: String, @Query("qrimg") qrimg: Boolean = true): QrImageResp

    @GET("/login/qr/check")
    suspend fun checkQr(@Query("key") key: String): QrCheckResp

    @GET("/captcha/sent")
    suspend fun sendCaptcha(
        @Query("phone") phone: String,
        @Query("ctcode") countryCode: String,
    ): AuthApiResp

    @GET("/captcha/verify")
    suspend fun verifyCaptcha(
        @Query("phone") phone: String,
        @Query("captcha") captcha: String,
        @Query("ctcode") countryCode: String,
    ): AuthApiResp

    @GET("/login/cellphone")
    suspend fun loginCellphone(
        @Query("phone") phone: String,
        @Query("captcha") captcha: String,
        @Query("countrycode") countryCode: String,
    ): AuthApiResp

    @GET("/logout")
    suspend fun logout(): AuthApiResp

    @GET("/user/account")
    suspend fun getUserAccount(): AccountResp

    @GET("/user/playlist")
    suspend fun getUserPlaylists(@Query("uid") uid: Long): PlaylistResp

    @GET("/likelist")
    suspend fun getLikelist(@Query("uid") uid: Long): LikelistResp

    @GET("/like")
    suspend fun like(@Query("id") id: Long, @Query("like") like: Boolean): LikeResp

    @GET("/playlist/track/all")
    suspend fun getPlaylistTracks(
        @Query("id") id: Long,
        @Query("limit") limit: Int,
        @Query("offset") offset: Int,
    ): PlaylistTracksResp

    @GET("/cloudsearch")
    suspend fun cloudSearch(@Query("keywords") keywords: String): SearchResp

    @GET("/search")
    suspend fun search(@Query("keywords") keywords: String): SearchResp

    @GET("/song/detail")
    suspend fun getSongDetail(@Query("ids") ids: String): SongDetailResp

    // api-enhanced 当前发布的服务将 song_url_v1 路由裁剪掉；使用兼容性更高的
    // /song/url（br）才能在桌面端自带服务和常见部署中稳定返回真实 CDN URL。
    @GET("/song/url")
    suspend fun getSongUrl(@Query("id") id: Long, @Query("br") bitRate: Int = 320000): SongUrlResp

    @GET("/lyric")
    suspend fun getLyric(@Query("id") id: Long): LyricResp

    @GET("/personalized/newsong")
    suspend fun getPersonalizedNewSongs(@Query("limit") limit: Int = 20): PersonalizedNewSongResp

    @GET("/personalized")
    suspend fun getPersonalizedPlaylists(@Query("limit") limit: Int = 10): PersonalizedPlaylistResp

    @GET("/top/artists")
    suspend fun getTopArtists(
        @Query("limit") limit: Int = 50,
        @Query("offset") offset: Int = 0,
    ): TopArtistsResp

    @GET("/artist/top/song")
    suspend fun getArtistTopSongs(@Query("id") id: Long): ArtistTopSongsResp
}

// ---------------------------------------------------------------------------
// 拦截器：注入 timestamp/cookie + 镜像 failover
// ---------------------------------------------------------------------------

private class ApiEndpointInterceptor(
    private val endpointProvider: () -> HttpUrl,
    private val cookieProvider: () -> String,
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val original = chain.request()
        val withParams = original.url.newBuilder()
            .addQueryParameter("timestamp", System.currentTimeMillis().toString())
            .apply {
                val cookie = cookieProvider()
                if (cookie.isNotBlank()) addQueryParameter("cookie", cookie)
            }
            .build()
        val request = original.newBuilder().url(withParams).build()

        val endpoint = endpointProvider()
        val url = request.url.newBuilder()
            .scheme(endpoint.scheme)
            .host(endpoint.host)
            .port(endpoint.port)
            .build()
        return chain.proceed(request.newBuilder().url(url).build())
    }
}

// ---------------------------------------------------------------------------
// 服务
// ---------------------------------------------------------------------------

/**
 * 网络调用安全包装：捕获业务异常返回 Result，但重新抛出 CancellationException，
 * 避免协程取消被吞掉导致登出/销毁后继续执行副作用。
 */
private inline fun <T> safeNet(block: () -> T): Result<T> =
    try {
        Result.success(block())
    } catch (e: kotlinx.coroutines.CancellationException) {
        throw e
    } catch (e: Exception) {
        Result.failure(e)
    }

/**
 * 网易云音乐 API 服务。
 *
 * 账号 cookie 只能交给用户自己部署的 api-enhanced 服务，绝不能故障转发到
 * 不受控的公共镜像。当前开发机的 api-enhanced 监听 0.0.0.0:3000，真机通过
 * 同一局域网内的 192.168.0.105 访问；地址变化后可在扫码登录弹层内修改。
 */
class NeteaseApiService(
    private val preferences: PreferencesRepository,
) {
    companion object {
        private const val FALLBACK_COVER =
            "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=400&h=400&fit=crop"

        private const val DEFAULT_API_BASE_URL = "http://192.168.0.105:3000/"
        private const val LEGACY_EMULATOR_BASE_URL = "http://10.0.2.2:3000/"
    }

    private val json = Json {
        ignoreUnknownKeys = true
        coerceInputValues = true
        explicitNulls = false
    }

    /** 内存中的 cookie（登录时写入并持久化到 DataStore，拦截器同步读取） */
    @Volatile
    private var cookie: String = ""

    @Volatile
    private var apiBaseUrl: HttpUrl = DEFAULT_API_BASE_URL.toHttpUrl()

    private val retrofit: Retrofit = run {
        val client = OkHttpClient.Builder()
            .connectTimeout(10, TimeUnit.SECONDS)
            .readTimeout(15, TimeUnit.SECONDS)
            .retryOnConnectionFailure(true)
            .addInterceptor(ApiEndpointInterceptor({ apiBaseUrl }) { cookie })
            .build()
        Retrofit.Builder()
            .baseUrl(DEFAULT_API_BASE_URL)
            .client(client)
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build()
    }

    private val api: NeteaseApi = retrofit.create(NeteaseApi::class.java)

    /** 从 DataStore 恢复登录态（应用启动时调用） */
    suspend fun restoreSession() {
        cookie = preferences.getCookie()
        val savedUrl = preferences.getApiBaseUrl()
        if (savedUrl.isNotBlank() && savedUrl.trimEnd('/') != LEGACY_EMULATOR_BASE_URL.trimEnd('/')) {
            normalizeApiBaseUrl(savedUrl)?.let { apiBaseUrl = it }
        } else if (savedUrl.isNotBlank()) {
            // 升级旧 APK 时清掉模拟器专用地址，否则 DataStore 会永久覆盖新默认值。
            apiBaseUrl = DEFAULT_API_BASE_URL.toHttpUrl()
            preferences.setApiBaseUrl(DEFAULT_API_BASE_URL)
        }
    }

    fun getCookie(): String = cookie

    fun getApiBaseUrl(): String = apiBaseUrl.toString()

    suspend fun setApiBaseUrl(value: String): Boolean {
        val normalized = normalizeApiBaseUrl(value) ?: return false
        val previous = apiBaseUrl
        apiBaseUrl = normalized
        val reachable = safeNet {
            api.getTopArtists(limit = 1, offset = 0).code == 200
        }.getOrDefault(false)
        if (!reachable) {
            apiBaseUrl = previous
            return false
        }
        preferences.setApiBaseUrl(normalized.toString())
        return true
    }

    suspend fun setCookie(value: String) {
        cookie = value
        preferences.setCookie(value)
    }

    suspend fun clearSession() {
        cookie = ""
        preferences.clearSession()
    }

    // --- 扫码登录 ---

    suspend fun getQrKey(): String {
        return safeNet {
            val res = api.getQrKey()
            res.data?.unikey ?: res.unikey ?: ""
        }.getOrDefault("")
    }

    suspend fun getQrImage(key: String): String {
        if (key.isBlank()) return ""
        return safeNet {
            val res = api.getQrImage(key, true)
            res.data?.qrimg ?: res.qrurl ?: ""
        }.getOrDefault("")
    }

    suspend fun checkQrStatus(key: String): QrCheckResp {
        return safeNet { api.checkQr(key) }.getOrElse { QrCheckResp(code = -1, message = "网络错误") }
    }

    private fun parseErrorMessage(jsonStr: String): String {
        if (jsonStr.isBlank()) return ""
        return runCatching {
            val element = json.parseToJsonElement(jsonStr).jsonObject
            val msg = element["message"]?.jsonPrimitive?.contentOrNull
                ?: element["msg"]?.jsonPrimitive?.contentOrNull
            msg.orEmpty()
        }.getOrDefault("")
    }

    suspend fun sendPhoneCaptcha(phone: String, countryCode: String): PhoneAuthResult {
        val normalizedPhone = phone.filter(Char::isDigit)
        val normalizedCountryCode = countryCode.filter(Char::isDigit).ifBlank { "86" }
        if (normalizedPhone.length !in 6..20) {
            return PhoneAuthResult(false, "请输入正确的手机号")
        }
        return try {
            val response = api.sendCaptcha(normalizedPhone, normalizedCountryCode)
            if (response.code == 200 && response.data != false) {
                PhoneAuthResult(true, "验证码已发送")
            } else {
                val msg = response.message ?: response.msg
                PhoneAuthResult(false, msg.orEmpty().ifBlank { "验证码发送失败（${response.code}）" })
            }
        } catch (e: HttpException) {
            val errorJson = e.response()?.errorBody()?.string().orEmpty()
            val parsedMsg = parseErrorMessage(errorJson)
            val finalMsg = if (parsedMsg.isNotBlank()) parsedMsg else "发送验证码失败（HTTP ${e.code()}）"
            PhoneAuthResult(false, finalMsg)
        } catch (e: Exception) {
            PhoneAuthResult(false, e.message.orEmpty().ifBlank { "网络错误，请检查 API 服务" })
        }
    }

    suspend fun loginWithPhoneCaptcha(
        phone: String,
        captcha: String,
        countryCode: String,
    ): PhoneAuthResult {
        val normalizedPhone = phone.filter(Char::isDigit)
        val normalizedCaptcha = captcha.filter(Char::isDigit)
        val normalizedCountryCode = countryCode.filter(Char::isDigit).ifBlank { "86" }
        if (normalizedPhone.length !in 6..20 || normalizedCaptcha.length !in 4..8) {
            return PhoneAuthResult(false, "请填写正确的手机号和验证码")
        }
        return try {
            // 先验证验证码
            safeNet { api.verifyCaptcha(normalizedPhone, normalizedCaptcha, normalizedCountryCode) }
            val response = api.loginCellphone(normalizedPhone, normalizedCaptcha, normalizedCountryCode)
            val loginCookie = response.cookie.orEmpty()
            val msg = response.message ?: response.msg
            if (response.code == 200 && loginCookie.isNotBlank()) {
                setCookie(loginCookie)
                PhoneAuthResult(true, "登录成功")
            } else {
                PhoneAuthResult(false, msg.orEmpty().ifBlank { "登录失败（${response.code}）" })
            }
        } catch (e: HttpException) {
            val errorJson = e.response()?.errorBody()?.string().orEmpty()
            val parsedMsg = parseErrorMessage(errorJson)
            val finalMsg = if (parsedMsg.isNotBlank()) {
                "登录失败：$parsedMsg"
            } else {
                "网易云官方对第三方接口风控拦截（HTTP ${e.code()}），推荐使用上方【二维码登录】"
            }
            PhoneAuthResult(false, finalMsg)
        } catch (e: Exception) {
            PhoneAuthResult(false, e.message.orEmpty().ifBlank { "网络错误，请检查 API 服务" })
        }
    }

    /** 服务端注销失败时仍清除本机凭据，确保账号不会残留在设备上。 */
    suspend fun logoutAccount() {
        if (cookie.isNotBlank()) safeNet { api.logout() }
        clearSession()
    }

    // --- 账号与资料 ---

    suspend fun getUserAccount(): UserProfile? {
        if (cookie.isBlank()) return null
        return safeNet {
            val res = api.getUserAccount()
            val p = res.profile
            if (res.code == 200 && p != null && p.userId != 0L) {
                UserProfile(
                    userId = p.userId,
                    nickname = Format.cleanTitle(p.nickname),
                    avatarUrl = p.avatarUrl,
                    signature = p.signature,
                    vipType = p.vipType,
                    isLoggedIn = true,
                )
            } else {
                null
            }
        }.getOrNull()
    }

    suspend fun getUserPlaylists(uid: Long): List<Playlist> {
        return safeNet {
            (api.getUserPlaylists(uid).playlist ?: emptyList()).map {
                Playlist(
                    id = it.id,
                    name = Format.cleanTitle(it.name),
                    coverImgUrl = normalizeImageUrl(it.coverImgUrl ?: it.picUrl),
                    trackCount = it.trackCount,
                    creatorName = it.creator?.nickname,
                    description = it.description,
                )
            }
        }.getOrDefault(emptyList())
    }

    // --- 首页推荐 ---

    suspend fun getPersonalizedNewSongs(): List<Song> {
        return safeNet {
            api.getPersonalizedNewSongs(limit = 60).result?.mapNotNull { item ->
                item.song?.let { formatTrackToSong(it) }
            } ?: emptyList()
        }.getOrDefault(emptyList())
    }

    suspend fun getPersonalizedPlaylists(): List<Playlist> {
        return safeNet {
            (api.getPersonalizedPlaylists().result ?: emptyList()).map {
                Playlist(
                    id = it.id,
                    name = Format.cleanTitle(it.name),
                    coverImgUrl = normalizeImageUrl(it.picUrl ?: it.coverImgUrl),
                    trackCount = it.trackCount,
                    creatorName = it.creator?.nickname,
                    description = it.description,
                )
            }
        }.getOrDefault(emptyList())
    }

    // --- 艺术家 ---

    suspend fun getTopArtists(): List<Artist> {
        return safeNet {
            api.getTopArtists(limit = 50).artists.orEmpty().mapNotNull { dto ->
                if (dto.id == 0L || dto.name.isBlank()) return@mapNotNull null
                val avatar = dto.picUrl ?: dto.img1v1Url ?: return@mapNotNull null
                val detail = dto.briefDesc?.takeIf { it.isNotBlank() }
                    ?: dto.alias?.filter { it.isNotBlank() }?.joinToString(" / ")?.takeIf { it.isNotBlank() }
                    ?: "${dto.musicSize} 首单曲 · ${dto.albumSize} 张专辑"
                Artist(
                    id = dto.id,
                    name = Format.cleanTitle(dto.name),
                    avatarUrl = if (avatar.startsWith("http:")) "https:" + avatar.substring(5) else avatar,
                    musicCount = dto.musicSize,
                    albumCount = dto.albumSize,
                    description = Format.cleanTitle(detail),
                )
            }
        }.getOrDefault(emptyList())
    }

    suspend fun getArtistTopSongs(artistId: Long): List<Song> {
        return safeNet {
            api.getArtistTopSongs(artistId).songs.orEmpty().map { formatTrackToSong(it) }
        }.getOrDefault(emptyList())
    }

    // --- 红心收藏 ---

    suspend fun getLikelist(uid: Long): List<Long> {
        return safeNet { api.getLikelist(uid).ids ?: emptyList() }.getOrDefault(emptyList())
    }

    suspend fun likeSong(songId: Long, like: Boolean = true): Boolean {
        return safeNet { api.like(songId, like).code == 200 }.getOrDefault(false)
    }

    // --- 歌单歌曲（多页自动拉取） ---

    suspend fun getPlaylistSongs(playlistId: Long): List<Song> {
        return safeNet {
            val all = mutableListOf<TrackDto>()
            var offset = 0
            val pageSize = 1000
            while (true) {
                val res = api.getPlaylistTracks(playlistId, pageSize, offset)
                val tracks = res.songs ?: res.playlist?.tracks ?: emptyList()
                if (tracks.isEmpty()) break
                all.addAll(tracks)
                if (tracks.size < pageSize) break
                offset += pageSize
                if (offset >= 10000) break // 安全上限，防意外死循环
            }
            all.map { formatTrackToSong(it) }
        }.getOrDefault(emptyList())
    }

    // --- 搜索 ---

    suspend fun searchSongs(keywords: String): List<Song> {
        // 优先 /cloudsearch（原生带封面）
        val cloudResult = safeNet {
            api.cloudSearch(keywords).result?.songs?.map { formatTrackToSong(it) }
        }.getOrNull()
        if (!cloudResult.isNullOrEmpty()) return cloudResult

        // 兜底 /search，缺封面时用 /song/detail 补全
        val searchResult = safeNet {
            val songs = api.search(keywords).result?.songs
            if (songs.isNullOrEmpty()) return@safeNet emptyList()

            val needDetail = songs.first().al?.picUrl == null && songs.first().album?.picUrl == null
            if (needDetail) {
                val ids = songs.take(30).joinToString(",") { it.id.toString() }
                val detail = safeNet { api.getSongDetail(ids).songs }.getOrNull()
                if (!detail.isNullOrEmpty()) return@safeNet detail.map { formatTrackToSong(it) }
            }
            songs.map { formatTrackToSong(it) }
        }.getOrNull()

        return searchResult ?: emptyList()
    }

    // --- 播放 URL 与歌词 ---

    /** 按 id 批量获取歌曲详情（红心收藏列表用，每批 50） */
    suspend fun getSongsByIds(ids: List<Long>): List<Song> {
        if (ids.isEmpty()) return emptyList()
        val all = mutableListOf<Song>()
        ids.chunked(50).forEach { chunk ->
            safeNet {
                val detail = api.getSongDetail(chunk.joinToString(",")).songs
                if (!detail.isNullOrEmpty()) all.addAll(detail.map { formatTrackToSong(it) })
            }
        }
        return all
    }

    suspend fun getSongAudioUrl(songId: Long): String {
        val fetchedUrl = safeNet {
            val res = api.getSongUrl(songId)
            val url = res.data?.firstOrNull()?.url
            if (!url.isNullOrBlank()) {
                if (url.startsWith("http:")) "https:" + url.substring(5) else url
            } else null
        }.getOrNull()
        if (!fetchedUrl.isNullOrBlank()) return fetchedUrl
        return ""
    }

    suspend fun getSongLyrics(songId: Long): List<LyricLine> {
        safeNet {
            val res = api.getLyric(songId)
            if (res.nolyric == true) {
                return listOf(LyricLine(time = 0.0, text = "♪ 纯音乐，无歌词", translation = "Instrumental Track"))
            }
            if (res.uncollected == true) {
                return listOf(LyricLine(time = 0.0, text = "暂无歌词"))
            }
            val main = res.lrc?.lyric?.let { LrcParser.parse(it) } ?: emptyList()
            if (main.isNotEmpty()) {
                val trans = res.tlyric?.lyric?.let { LrcParser.parse(it) } ?: emptyList()
                return if (trans.isNotEmpty()) LrcParser.mergeTranslation(main, trans) else main
            }
        }
        return listOf(LyricLine(time = 0.0, text = "暂无歌词"))
    }

    // --- 格式化 ---

    private fun formatTrackToSong(track: TrackDto): Song {
        val artistName = (track.ar ?: track.artists)
            ?.joinToString(" / ") { Format.cleanTitle(it.name) }
            ?.takeIf { it.isNotEmpty() }
            ?: "未知歌手"

        var rawCover = track.al?.picUrl
            ?: track.album?.picUrl
            ?: track.al?.picStr
            ?: track.album?.picId?.let { "https://p1.music.126.net/$it.jpg" }

        val fallbackCovers = listOf(
            "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=500&h=500&fit=crop",
            "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=500&h=500&fit=crop",
            "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&h=500&fit=crop",
            "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=500&h=500&fit=crop",
            "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=500&h=500&fit=crop",
            "https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=500&h=500&fit=crop",
            "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=500&h=500&fit=crop",
            "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=500&h=500&fit=crop",
            "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=500&h=500&fit=crop",
            "https://images.unsplash.com/photo-1520523839897-bd0b52f945a0?w=500&h=500&fit=crop",
            "https://images.unsplash.com/photo-1465847899084-d164df4dedc6?w=500&h=500&fit=crop",
            "https://images.unsplash.com/photo-1511379938547-c1f69419868d?w=500&h=500&fit=crop",
            "https://images.unsplash.com/photo-1487180144351-b8472da7d491?w=500&h=500&fit=crop",
            "https://images.unsplash.com/photo-1526478806334-5fd488fcaabc?w=500&h=500&fit=crop",
            "https://images.unsplash.com/photo-1506157786151-b8491531f063?w=500&h=500&fit=crop",
        )

        if (rawCover.isNullOrBlank()) {
            val hash = (track.id.hashCode() and 0x7FFFFFFF)
            rawCover = fallbackCovers[hash % fallbackCovers.size]
        } else {
            rawCover = if (rawCover.startsWith("http:")) "https:" + rawCover.substring(5) else rawCover
        }

        val fee = track.fee ?: track.privilege?.fee
        val isVip = fee == 1

        return Song(
            id = "netease-${track.id}",
            name = Format.cleanTitle(track.name).ifEmpty { "未知歌曲" },
            artist = artistName,
            album = Format.cleanTitle(track.al?.name ?: track.album?.name).ifEmpty { "未知专辑" },
            duration = ((track.dt ?: track.duration ?: 200000L) / 1000).toInt(),
            coverUrl = rawCover,
            audioUrl = "https://music.163.com/song/media/outer/url?id=${track.id}.mp3",
            neteaseId = track.id,
            isVip = isVip,
            fee = fee,
        )
    }

    private fun normalizeImageUrl(url: String?): String {
        if (url.isNullOrBlank()) return ""
        return if (url.startsWith("http:")) "https:" + url.substring(5) else url
    }

    private fun normalizeApiBaseUrl(value: String): HttpUrl? {
        val trimmed = value.trim().trimEnd('/')
        if (trimmed.isBlank()) return null
        return runCatching { "$trimmed/".toHttpUrl() }
            .getOrNull()
            ?.takeIf { it.scheme == "http" || it.scheme == "https" }
    }

    fun getFallbackSongs(): List<Song> = listOf(
        Song(
            id = "fallback-1",
            name = "3 Strikes (三振出局)",
            artist = "Hold me hold me hold me",
            album = "3 Strikes Single",
            duration = 185,
            coverUrl = "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=500&h=500&fit=crop",
            audioUrl = "https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3?filename=lofi-study-112191.mp3",
        ),
        Song(
            id = "fallback-2",
            name = "Stay (Apple Music Session)",
            artist = "The Kid LAROI & Justin Bieber",
            album = "F*CK LOVE 3: OVER YOU",
            duration = 141,
            coverUrl = "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=500&h=500&fit=crop",
            audioUrl = "https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3?filename=lofi-study-112191.mp3",
        ),
        Song(
            id = "fallback-3",
            name = "Blinding Lights",
            artist = "The Weeknd",
            album = "After Hours",
            duration = 200,
            coverUrl = "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&h=500&fit=crop",
            audioUrl = "https://cdn.pixabay.com/download/audio/2022/01/18/audio_d0a13f69d2.mp3?filename=flexing-11011.mp3",
        ),
        Song(
            id = "fallback-4",
            name = "Starboy",
            artist = "The Weeknd ft. Daft Punk",
            album = "Starboy",
            duration = 230,
            coverUrl = "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=500&h=500&fit=crop",
            audioUrl = "https://cdn.pixabay.com/download/audio/2022/03/15/audio_c8c8a70650.mp3?filename=beat-112191.mp3",
        ),
        Song(
            id = "fallback-5",
            name = "Cruel Summer",
            artist = "Taylor Swift",
            album = "Lover",
            duration = 178,
            coverUrl = "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=500&h=500&fit=crop",
            audioUrl = "https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3?filename=lofi-study-112191.mp3",
        ),
        Song(
            id = "fallback-6",
            name = "As It Was",
            artist = "Harry Styles",
            album = "Harry's House",
            duration = 167,
            coverUrl = "https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=500&h=500&fit=crop",
            audioUrl = "https://cdn.pixabay.com/download/audio/2022/03/10/audio_c8c8a70650.mp3?filename=pop-112191.mp3",
        ),
        Song(
            id = "fallback-7",
            name = "Levitating",
            artist = "Dua Lipa ft. DaBaby",
            album = "Future Nostalgia",
            duration = 203,
            coverUrl = "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=500&h=500&fit=crop",
            audioUrl = "https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3?filename=lofi-study-112191.mp3",
        ),
        Song(
            id = "fallback-8",
            name = "Save Your Tears",
            artist = "The Weeknd & Ariana Grande",
            album = "After Hours (Deluxe)",
            duration = 191,
            coverUrl = "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=500&h=500&fit=crop",
            audioUrl = "https://cdn.pixabay.com/download/audio/2022/01/18/audio_d0a13f69d2.mp3?filename=flexing-11011.mp3",
        ),
        Song(
            id = "fallback-9",
            name = "Peaches",
            artist = "Justin Bieber ft. Daniel Caesar & Giveon",
            album = "Justice",
            duration = 198,
            coverUrl = "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=500&h=500&fit=crop",
            audioUrl = "https://cdn.pixabay.com/download/audio/2022/03/15/audio_c8c8a70650.mp3?filename=beat-112191.mp3",
        ),
        Song(
            id = "fallback-10",
            name = "Die For You",
            artist = "The Weeknd & SZA",
            album = "Starboy (Deluxe)",
            duration = 232,
            coverUrl = "https://images.unsplash.com/photo-1520523839897-bd0b52f945a0?w=500&h=500&fit=crop",
            audioUrl = "https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3?filename=lofi-study-112191.mp3",
        ),
        Song(
            id = "fallback-11",
            name = "Flowers",
            artist = "Miley Cyrus",
            album = "Endless Summer Vacation",
            duration = 200,
            coverUrl = "https://images.unsplash.com/photo-1465847899084-d164df4dedc6?w=500&h=500&fit=crop",
            audioUrl = "https://cdn.pixabay.com/download/audio/2022/01/18/audio_d0a13f69d2.mp3?filename=flexing-11011.mp3",
        ),
        Song(
            id = "fallback-12",
            name = "Watermelon Sugar",
            artist = "Harry Styles",
            album = "Fine Line",
            duration = 174,
            coverUrl = "https://images.unsplash.com/photo-1511379938547-c1f69419868d?w=500&h=500&fit=crop",
            audioUrl = "https://cdn.pixabay.com/download/audio/2022/03/15/audio_c8c8a70650.mp3?filename=beat-112191.mp3",
        ),
        Song(
            id = "fallback-13",
            name = "Shape of You",
            artist = "Ed Sheeran",
            album = "÷ (Divide)",
            duration = 233,
            coverUrl = "https://images.unsplash.com/photo-1487180144351-b8472da7d491?w=500&h=500&fit=crop",
            audioUrl = "https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3?filename=lofi-study-112191.mp3",
        ),
        Song(
            id = "fallback-14",
            name = "Bad Habits",
            artist = "Ed Sheeran",
            album = "= (Equals)",
            duration = 231,
            coverUrl = "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=500&h=500&fit=crop",
            audioUrl = "https://cdn.pixabay.com/download/audio/2022/01/18/audio_d0a13f69d2.mp3?filename=flexing-11011.mp3",
        ),
        Song(
            id = "fallback-15",
            name = "Good 4 U",
            artist = "Olivia Rodrigo",
            album = "SOUR",
            duration = 178,
            coverUrl = "https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=500&h=500&fit=crop",
            audioUrl = "https://cdn.pixabay.com/download/audio/2022/03/15/audio_c8c8a70650.mp3?filename=beat-112191.mp3",
        ),
    )
}
