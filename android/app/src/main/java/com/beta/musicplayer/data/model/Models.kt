package com.beta.musicplayer.data.model

import kotlinx.serialization.Serializable

/** 歌曲（对齐桌面端 src/types/music.ts 的 Song） */
@Serializable
data class Song(
    val id: String,            // 形如 "netease-12345"
    val name: String,
    val artist: String,
    val album: String,
    val duration: Int,         // 秒
    val coverUrl: String,
    val audioUrl: String,
    val neteaseId: Long? = null,
    val isVip: Boolean = false,
    val fee: Int? = null,
)

/** 逐字/音节精确时间戳 */
@Serializable
data class LyricWord(
    val startTime: Double, // 秒
    val duration: Double,  // 秒
    val text: String,
)

/** 歌词行 */
@Serializable
data class LyricLine(
    val time: Double,          // 秒
    val text: String,
    val translation: String? = null,
    val isYrc: Boolean = false,
    val words: List<LyricWord> = emptyList(),
)

/** 用户资料 */
@Serializable
data class UserProfile(
    val userId: Long,
    val nickname: String,
    val avatarUrl: String,
    val signature: String? = null,
    val vipType: Int? = null,
    val isLoggedIn: Boolean = true,
)

/** 歌单 */
@Serializable
data class Playlist(
    val id: Long,
    val name: String,
    val coverImgUrl: String,
    val trackCount: Int,
    val creatorName: String? = null,
    val description: String? = null,
)

/** 艺术家/歌手 */
@Serializable
data class Artist(
    val id: Long,
    val name: String,
    val avatarUrl: String,
    val musicCount: Int = 0,
    val albumCount: Int = 0,
    val description: String? = null,
)
