package com.beta.musicplayer.data.local

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.beta.musicplayer.data.model.UserProfile
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.serialization.json.Json
import kotlinx.serialization.encodeToString

import kotlinx.coroutines.flow.catch
import java.io.IOException

private val Context.dataStore by preferencesDataStore(name = "beta_music_player")

/**
 * DataStore 持久化：网易云 cookie、用户资料、播放模式、搜索历史。
 */
class PreferencesRepository(private val context: Context) {

    private val json = Json { ignoreUnknownKeys = true }

    private object Keys {
        val cookie = stringPreferencesKey("netease_cookie")
        val apiBaseUrl = stringPreferencesKey("netease_api_base_url")
        val userProfile = stringPreferencesKey("user_profile")
        val playMode = stringPreferencesKey("play_mode")
        val searchHistory = stringPreferencesKey("search_history")
        val likedSongs = stringPreferencesKey("liked_songs")
    }

    private val safeDataStore = context.dataStore.data.catch { exception ->
        if (exception is IOException) {
            emit(androidx.datastore.preferences.core.emptyPreferences())
        } else {
            throw exception
        }
    }

    // --- cookie ---
    val cookieFlow: Flow<String> = safeDataStore.map { it[Keys.cookie] ?: "" }

    suspend fun getCookie(): String = cookieFlow.first()

    suspend fun setCookie(value: String) {
        context.dataStore.edit { it[Keys.cookie] = value }
    }

    suspend fun clearSession() {
        context.dataStore.edit {
            it.remove(Keys.cookie)
            it.remove(Keys.userProfile)
        }
    }

    // --- 网易云 API 服务地址 ---
    val apiBaseUrlFlow: Flow<String> = safeDataStore.map { it[Keys.apiBaseUrl] ?: "" }

    suspend fun getApiBaseUrl(): String = apiBaseUrlFlow.first()

    suspend fun setApiBaseUrl(value: String) {
        context.dataStore.edit { it[Keys.apiBaseUrl] = value }
    }

    // --- user profile ---
    val userProfileFlow: Flow<UserProfile?> = safeDataStore.map { prefs ->
        prefs[Keys.userProfile]?.let { raw ->
            runCatching { json.decodeFromString<UserProfile>(raw) }.getOrNull()
        }
    }

    suspend fun getUserProfile(): UserProfile? = userProfileFlow.first()

    suspend fun setUserProfile(profile: UserProfile?) {
        context.dataStore.edit { prefs ->
            if (profile == null) prefs.remove(Keys.userProfile)
            else prefs[Keys.userProfile] = json.encodeToString(UserProfile.serializer(), profile)
        }
    }

    // --- play mode: repeat / shuffle ---
    val playModeFlow: Flow<String> = safeDataStore.map { it[Keys.playMode] ?: "repeat_all" }

    suspend fun getPlayMode(): String = playModeFlow.first()

    suspend fun setPlayMode(mode: String) {
        context.dataStore.edit { it[Keys.playMode] = mode }
    }

    // --- search history (JSON 数组字符串) ---
    val searchHistoryFlow: Flow<List<String>> = safeDataStore.map { prefs ->
        prefs[Keys.searchHistory]?.let { raw ->
            runCatching { json.decodeFromString<List<String>>(raw) }.getOrNull()
        } ?: emptyList()
    }

    suspend fun getSearchHistory(): List<String> = searchHistoryFlow.first()

    suspend fun addSearchHistory(keyword: String) {
        if (keyword.isBlank()) return
        context.dataStore.edit { prefs ->
            val current = prefs[Keys.searchHistory]?.let { raw ->
                runCatching { json.decodeFromString<List<String>>(raw) }.getOrNull()
            } ?: emptyList()
            val updated = (listOf(keyword) + current.filterNot { it == keyword }).take(20)
            prefs[Keys.searchHistory] = json.encodeToString<List<String>>(updated)
        }
    }

    suspend fun clearSearchHistory() {
        context.dataStore.edit { it.remove(Keys.searchHistory) }
    }

    // --- liked songs (网易云歌曲 id 列表，用于红心收藏展示) ---
    val likedSongsFlow: Flow<Set<Long>> = safeDataStore.map { prefs ->
        prefs[Keys.likedSongs]?.let { raw ->
            runCatching { json.decodeFromString<Set<Long>>(raw) }.getOrNull()
        } ?: emptySet()
    }

    suspend fun getLikedSongs(): Set<Long> = likedSongsFlow.first()

    suspend fun setLikedSongs(ids: Set<Long>) {
        context.dataStore.edit { it[Keys.likedSongs] = json.encodeToString<Set<Long>>(ids) }
    }

    // 便捷：登录状态
    val isLoggedInFlow: Flow<Boolean> = safeDataStore.map { !(it[Keys.cookie] ?: "").isBlank() }
}
