package com.beta.musicplayer.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Favorite
import androidx.compose.material.icons.rounded.FavoriteBorder
import androidx.compose.material.icons.rounded.MusicNote
import androidx.compose.material.icons.rounded.Pause
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Repeat
import androidx.compose.material.icons.rounded.RepeatOne
import androidx.compose.material.icons.rounded.Shuffle
import androidx.compose.material.icons.rounded.SkipNext
import androidx.compose.material.icons.rounded.SkipPrevious
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.beta.musicplayer.data.model.Playlist
import com.beta.musicplayer.data.model.Song
import com.beta.musicplayer.data.util.Format
import com.beta.musicplayer.player.MusicPlayer
import com.beta.musicplayer.ui.components.GlassCard
import com.beta.musicplayer.ui.components.GlassIconButton
import com.beta.musicplayer.ui.components.GlassSlider
import com.beta.musicplayer.ui.components.GlassSurface
import com.beta.musicplayer.ui.components.SongListItem
import com.beta.musicplayer.ui.theme.AccentPrimary
import com.beta.musicplayer.ui.theme.FavoriteRed
import com.kyant.backdrop.Backdrop

/**
 * 推荐页：快捷推荐入口 (每日30首/私人FM/热歌榜) + 唱片英雄卡片 + 精选歌单 + 猜你喜欢。
 */
@Composable
fun ListenNowView(
    viewModel: MainViewModel,
    uiState: MainUiState,
    playerState: MusicPlayer.PlayerState,
    backdrop: Backdrop,
) {
    val song = playerState.currentSong ?: uiState.recommendedSongs.firstOrNull()

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(bottom = 170.dp),
    ) {
        // 1. 页顶大标题与副标题
        item {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 20.dp, vertical = 12.dp)
            ) {
                Text(
                    text = "推荐",
                    style = MaterialTheme.typography.headlineLarge,
                    color = Color.White,
                    fontWeight = FontWeight.Bold,
                )
                Spacer(Modifier.height(2.dp))
                Text(
                    text = "来自网易云音乐",
                    style = MaterialTheme.typography.bodySmall,
                    color = Color.White.copy(alpha = 0.55f),
                )
            }
        }

        // 2. 编辑推荐：使用网易云真实封面，不再使用模板化渐变色块和图标徽章。
        item {
            // 避开与下方当前播放封面重复，让首屏更像编辑内容流。
            val firstSong = uiState.recommendedSongs.getOrNull(3)
                ?: uiState.recommendedSongs.firstOrNull()
            val secondSong = uiState.recommendedSongs.getOrNull(8)
                ?: uiState.recommendedSongs.getOrNull(1)
            val featuredPlaylist = uiState.recommendedPlaylists.firstOrNull()
            LazyRow(
                contentPadding = PaddingValues(horizontal = 20.dp),
                horizontalArrangement = Arrangement.spacedBy(14.dp),
                modifier = Modifier.padding(bottom = 18.dp),
            ) {
                item {
                    EditorialRecommendCard(
                        label = "为你精选",
                        title = "每日推荐",
                        subtitle = firstSong?.let { "${it.name} · ${it.artist}" } ?: "每天为你更新",
                        coverUrl = firstSong?.coverUrl,
                        onClick = {
                            if (uiState.recommendedSongs.isNotEmpty()) {
                                viewModel.playList(uiState.recommendedSongs, 0)
                            }
                        },
                    )
                }
                item {
                    EditorialRecommendCard(
                        label = "接着听",
                        title = "私人电台",
                        subtitle = secondSong?.let { "${it.name} · ${it.artist}" } ?: "从喜欢的音乐出发",
                        coverUrl = secondSong?.coverUrl ?: firstSong?.coverUrl,
                        onClick = {
                            if (uiState.recommendedSongs.isNotEmpty()) {
                                viewModel.playList(uiState.recommendedSongs.shuffled(), 0)
                            }
                        },
                    )
                }
                item {
                    EditorialRecommendCard(
                        label = "热门歌单",
                        title = featuredPlaylist?.name ?: "此刻流行",
                        subtitle = "网易云音乐推荐",
                        coverUrl = featuredPlaylist?.coverImgUrl
                            ?: uiState.recommendedSongs.getOrNull(2)?.coverUrl,
                        onClick = {
                            if (uiState.recommendedSongs.isNotEmpty()) {
                                viewModel.playList(uiState.recommendedSongs, 0)
                            }
                        },
                    )
                }
            }
        }

        // 3. 唱片焦点英雄卡片
        item {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 20.dp, vertical = 8.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                if (song != null) {
                    val liked = song.neteaseId?.let { it in uiState.likedIds } ?: false
                    val progress = if (playerState.durationMs > 0) {
                        (playerState.positionMs.toFloat() / playerState.durationMs).coerceIn(0f, 1f)
                    } else 0f

                    // 唱片大封面
                    GlassSurface(
                        backdrop = backdrop,
                        modifier = Modifier.size(230.dp),
                        shape = RoundedCornerShape(26.dp),
                        lensHeight = 22.dp,
                        lensAmount = 44.dp,
                    ) {
                        AsyncImage(
                            model = Format.getOptimizedCoverUrl(song.coverUrl, 600),
                            contentDescription = "专辑封面",
                            modifier = Modifier
                                .fillMaxSize()
                                .clip(RoundedCornerShape(26.dp)),
                            contentScale = ContentScale.Crop,
                        )
                    }

                    Spacer(Modifier.height(16.dp))

                    Text(
                        text = song.name,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold,
                        color = Color.White,
                    )
                    Spacer(Modifier.height(4.dp))
                    Text(
                        text = song.artist,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        style = MaterialTheme.typography.bodyMedium,
                        color = Color.White.copy(alpha = 0.6f),
                    )

                    val activeLyric = if (playerState.currentSong?.neteaseId == song.neteaseId) {
                        playerState.lyrics.lastOrNull { it.time * 1000 <= playerState.positionMs + 500 }?.text
                    } else {
                        null
                    }
                    Text(
                        text = activeLyric ?: if (playerState.currentSong?.neteaseId == song.neteaseId) "正在从网易云同步歌词…" else "播放后同步网易云逐行歌词",
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 10.dp, start = 12.dp, end = 12.dp),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        style = MaterialTheme.typography.bodyMedium,
                        color = Color.White.copy(alpha = 0.8f),
                    )

                    Spacer(Modifier.height(16.dp))

                    // 进度条
                    GlassSlider(
                        backdrop = backdrop,
                        value = progress,
                        onValueChange = { fraction -> viewModel.seekFraction(fraction) },
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Spacer(Modifier.height(4.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Text(
                            text = Format.formatTime(playerState.positionMs / 1000f),
                            style = MaterialTheme.typography.labelSmall,
                            color = Color.White.copy(alpha = 0.55f),
                        )
                        Text(
                            text = Format.formatTime(playerState.durationMs / 1000f),
                            style = MaterialTheme.typography.labelSmall,
                            color = Color.White.copy(alpha = 0.55f),
                        )
                    }

                    Spacer(Modifier.height(16.dp))

                    // 控制按钮组
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(16.dp),
                    ) {
                        GlassIconButton(
                            backdrop = backdrop,
                            icon = when (playerState.playMode) {
                                MusicPlayer.PlayMode.REPEAT_ALL -> Icons.Rounded.Repeat
                                MusicPlayer.PlayMode.REPEAT_ONE -> Icons.Rounded.RepeatOne
                                MusicPlayer.PlayMode.SHUFFLE -> Icons.Rounded.Shuffle
                            },
                            onClick = { viewModel.cyclePlayMode() },
                            contentDescription = "播放模式",
                            size = 40.dp,
                        )
                        GlassIconButton(
                            backdrop = backdrop,
                            icon = Icons.Rounded.SkipPrevious,
                            onClick = { viewModel.previous() },
                            contentDescription = "上一首",
                            size = 48.dp,
                            iconSize = 26.dp,
                        )
                        GlassIconButton(
                            backdrop = backdrop,
                            icon = if (playerState.isPlaying) Icons.Rounded.Pause else Icons.Rounded.PlayArrow,
                            onClick = { viewModel.togglePlay() },
                            contentDescription = if (playerState.isPlaying) "暂停" else "播放",
                            size = 64.dp,
                            iconSize = 36.dp,
                        )
                        GlassIconButton(
                            backdrop = backdrop,
                            icon = Icons.Rounded.SkipNext,
                            onClick = { viewModel.next() },
                            contentDescription = "下一首",
                            size = 48.dp,
                            iconSize = 26.dp,
                        )
                        GlassIconButton(
                            backdrop = backdrop,
                            icon = if (liked) Icons.Rounded.Favorite else Icons.Rounded.FavoriteBorder,
                            onClick = { viewModel.toggleLike(song) },
                            contentDescription = if (liked) "取消收藏" else "收藏",
                            tint = if (liked) FavoriteRed else Color.White.copy(alpha = 0.9f),
                            size = 40.dp,
                        )
                    }
                } else {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(180.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        CircularProgressIndicator(color = Color.White.copy(alpha = 0.7f))
                    }
                }
            }
        }

        // 4. 推荐歌单 (Horizontal Row)
        if (uiState.recommendedPlaylists.isNotEmpty()) {
            item {
                Spacer(Modifier.height(8.dp))
                Text(
                    text = "精选推荐歌单",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(horizontal = 20.dp, vertical = 12.dp),
                )
                LazyRow(
                    contentPadding = PaddingValues(horizontal = 20.dp),
                    horizontalArrangement = Arrangement.spacedBy(14.dp),
                ) {
                    items(uiState.recommendedPlaylists, key = { it.id }) { playlist ->
                        PlaylistCardItem(
                            playlist = playlist,
                            backdrop = backdrop,
                            onClick = { viewModel.playPlaylist(playlist) },
                        )
                    }
                }
            }
        }

        // 5. 热门推荐单曲列表 Header
        item {
            Spacer(Modifier.height(16.dp))
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 20.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(
                    imageVector = Icons.Rounded.MusicNote,
                    contentDescription = null,
                    tint = AccentPrimary,
                    modifier = Modifier.size(20.dp),
                )
                Spacer(Modifier.width(8.dp))
                Text(
                    text = "猜你喜欢",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.weight(1f),
                )
            }
        }

        if (uiState.isLoadingRecommendations && uiState.recommendedSongs.isEmpty()) {
            item {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(120.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    CircularProgressIndicator(color = Color.White.copy(alpha = 0.7f))
                }
            }
        } else if (uiState.recommendedSongs.isEmpty()) {
            item {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(28.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = "未加载到网易云推荐。请启动 api-enhanced 服务后下拉重试。",
                        style = MaterialTheme.typography.bodyMedium,
                        color = Color.White.copy(alpha = 0.55f),
                    )
                }
            }
        } else {
            itemsIndexed(uiState.recommendedSongs, key = { _, s -> s.id }) { index, s ->
                val isLiked = s.neteaseId?.let { it in uiState.likedIds } ?: false
                SongListItem(
                    song = s,
                    onClick = { viewModel.playList(uiState.recommendedSongs, index) },
                    isLiked = isLiked,
                    onToggleLike = { viewModel.toggleLike(s) },
                )
            }
        }
    }
}

/** Apple Music 风格的编辑推荐卡片：真实内容封面 + 克制的文字遮罩。 */
@Composable
private fun EditorialRecommendCard(
    label: String,
    title: String,
    subtitle: String,
    coverUrl: String?,
    onClick: () -> Unit,
) {
    Box(
        modifier = Modifier
            .width(248.dp)
            .height(154.dp)
            .clip(RoundedCornerShape(22.dp))
            .background(Color(0xFF1B1A20))
            .clickable(onClick = onClick),
    ) {
        AsyncImage(
            model = Format.getOptimizedCoverUrl(coverUrl, 600),
            contentDescription = title,
            modifier = Modifier.fillMaxSize(),
            contentScale = ContentScale.Crop,
        )
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.verticalGradient(
                        colors = listOf(
                            Color.Transparent,
                            Color.Black.copy(alpha = 0.08f),
                            Color.Black.copy(alpha = 0.86f),
                        ),
                        startY = 20f,
                    )
                )
        )
        Column(
            modifier = Modifier
                .align(Alignment.BottomStart)
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 14.dp),
        ) {
            Text(
                text = label,
                style = MaterialTheme.typography.labelSmall,
                color = Color.White.copy(alpha = 0.72f),
                fontWeight = FontWeight.Medium,
                maxLines = 1,
            )
            Spacer(Modifier.height(3.dp))
            Text(
                text = title,
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.SemiBold,
                color = Color.White,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(Modifier.height(3.dp))
            Text(
                text = subtitle,
                style = MaterialTheme.typography.bodySmall,
                color = Color.White.copy(alpha = 0.68f),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@Composable
private fun PlaylistCardItem(
    playlist: Playlist,
    backdrop: Backdrop,
    onClick: () -> Unit,
) {
    GlassCard(
        backdrop = backdrop,
        onClick = onClick,
        modifier = Modifier.width(130.dp),
        shape = RoundedCornerShape(18.dp),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(8.dp)
        ) {
            AsyncImage(
                model = Format.getOptimizedCoverUrl(playlist.coverImgUrl, 300),
                contentDescription = null,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(114.dp)
                    .clip(RoundedCornerShape(14.dp)),
                contentScale = ContentScale.Crop,
            )
            Spacer(Modifier.height(6.dp))
            Text(
                text = playlist.name,
                style = MaterialTheme.typography.bodySmall,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}
