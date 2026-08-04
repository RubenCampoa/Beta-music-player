package com.beta.musicplayer.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Favorite
import androidx.compose.material.icons.rounded.FavoriteBorder
import androidx.compose.material.icons.rounded.KeyboardArrowDown
import androidx.compose.material.icons.rounded.Pause
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Repeat
import androidx.compose.material.icons.rounded.RepeatOne
import androidx.compose.material.icons.rounded.Shuffle
import androidx.compose.material.icons.rounded.SkipNext
import androidx.compose.material.icons.rounded.SkipPrevious
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.zIndex
import coil3.compose.AsyncImage
import com.beta.musicplayer.data.model.Song
import com.beta.musicplayer.data.util.Format
import com.beta.musicplayer.player.MusicPlayer
import com.beta.musicplayer.ui.components.BackgroundLayer
import com.beta.musicplayer.ui.components.GlassIconButton
import com.beta.musicplayer.ui.components.GlassSlider
import com.beta.musicplayer.ui.components.LyricsView
import com.beta.musicplayer.ui.theme.FavoriteRed
import com.kyant.backdrop.backdrops.layerBackdrop
import com.kyant.backdrop.backdrops.rememberLayerBackdrop

/**
 * 全屏播放页：无外框大底板，仅保留悬浮的液态玻璃控件与景深歌词。
 */
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.delay

/**
 * 全屏播放页：无外框大底板，仅保留悬浮的液态玻璃控件与景深歌词。
 */
@Composable
fun PlayerSheet(
    player: MusicPlayer,
    playerState: MusicPlayer.PlayerState,
    likedIds: Set<Long>,
    onToggleLike: (Song) -> Unit,
    onCyclePlayMode: () -> Unit,
    onDismiss: () -> Unit,
) {
    val song = playerState.currentSong

    LaunchedEffect(song) {
        if (song == null) onDismiss()
    }
    if (song == null) return

    val lyricPositionProvider = remember(player) {
        { player.exoPlayer.currentPosition.coerceAtLeast(0L) }
    }

    var showBottomControls by remember { mutableStateOf(true) }

    // 4 秒无手势交互后自动隐藏底部播放操控区（参考图 2 体验）
    LaunchedEffect(showBottomControls, playerState.isPlaying) {
        if (showBottomControls && playerState.isPlaying) {
            delay(4_000)
            showBottomControls = false
        }
    }

    val toggleBottomControls = remember {
        { showBottomControls = !showBottomControls }
    }

    Box(Modifier.fillMaxSize()) {
        val backdrop = rememberLayerBackdrop {
            drawRect(Color(0xFF0D0C12))
            drawContent()
        }

        Box(
            Modifier
                .fillMaxSize()
                .layerBackdrop(backdrop)
        ) {
            BackgroundLayer(song = song)
            LyricsView(
                lyrics = playerState.lyrics,
                positionProvider = lyricPositionProvider,
                onSeekTo = { positionMs ->
                    showBottomControls = true
                    player.seekTo(positionMs)
                },
                onTap = toggleBottomControls,
                modifier = Modifier.fillMaxSize(),
            )
        }

        val liked = song.neteaseId?.let { it in likedIds } ?: false
        val progress = if (playerState.durationMs > 0) {
            (playerState.positionMs.toFloat() / playerState.durationMs).coerceIn(0f, 1f)
        } else 0f

        // 2. 顶部常驻歌曲基本信息栏（参考图 2：常驻顶部，不自动隐藏）
        Row(
            modifier = Modifier
                .align(Alignment.TopCenter)
                .zIndex(2f)
                .fillMaxWidth()
                .statusBarsPadding()
                .padding(horizontal = 20.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            GlassIconButton(
                backdrop = backdrop,
                icon = Icons.Rounded.KeyboardArrowDown,
                onClick = onDismiss,
                contentDescription = "收起",
                size = 38.dp,
                surfaceColor = Color.White.copy(alpha = 0.12f),
            )
            Spacer(Modifier.width(10.dp))
            AsyncImage(
                model = Format.getOptimizedCoverUrl(song.coverUrl, 160),
                contentDescription = song.name,
                modifier = Modifier
                    .size(42.dp)
                    .clip(RoundedCornerShape(8.dp)),
                contentScale = ContentScale.Crop,
            )
            Spacer(Modifier.width(12.dp))
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.Center,
            ) {
                Text(
                    text = song.name,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                    color = Color.White,
                )
                Spacer(Modifier.height(1.dp))
                Text(
                    text = song.artist,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    style = MaterialTheme.typography.bodySmall,
                    color = Color.White.copy(alpha = 0.7f),
                )
            }
            Spacer(Modifier.width(10.dp))
            GlassIconButton(
                backdrop = backdrop,
                icon = if (liked) Icons.Rounded.Favorite else Icons.Rounded.FavoriteBorder,
                onClick = {
                    showBottomControls = true
                    onToggleLike(song)
                },
                contentDescription = if (liked) "取消喜欢" else "喜欢",
                size = 38.dp,
                tint = if (liked) FavoriteRed else Color.White.copy(alpha = 0.85f),
                surfaceColor = Color.White.copy(alpha = 0.12f),
            )
        }

        // 3. 底部自动隐藏播放操控区（渐变显示/隐藏动画）
        AnimatedVisibility(
            visible = showBottomControls,
            enter = fadeIn(tween(280)) + slideInVertically(tween(280)) { it / 2 },
            exit = fadeOut(tween(280)) + slideOutVertically(tween(280)) { it / 2 },
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .zIndex(2f)
                .fillMaxWidth(),
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .navigationBarsPadding()
                    .padding(horizontal = 24.dp, vertical = 14.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                GlassSlider(
                    backdrop = backdrop,
                    value = progress,
                    onValueChange = { fraction ->
                        showBottomControls = true
                        player.seekTo((fraction * playerState.durationMs).toLong())
                    },
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

                Spacer(Modifier.height(12.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    GlassIconButton(
                        backdrop = backdrop,
                        icon = when (playerState.playMode) {
                            MusicPlayer.PlayMode.REPEAT_ALL -> Icons.Rounded.Repeat
                            MusicPlayer.PlayMode.REPEAT_ONE -> Icons.Rounded.RepeatOne
                            MusicPlayer.PlayMode.SHUFFLE -> Icons.Rounded.Shuffle
                        },
                        onClick = {
                            showBottomControls = true
                            onCyclePlayMode()
                        },
                        contentDescription = "播放模式",
                        size = 44.dp,
                        surfaceColor = Color.White.copy(alpha = 0.12f),
                    )
                    GlassIconButton(
                        backdrop = backdrop,
                        icon = Icons.Rounded.SkipPrevious,
                        onClick = {
                            showBottomControls = true
                            player.previous()
                        },
                        contentDescription = "上一首",
                        size = 52.dp,
                        iconSize = 28.dp,
                        surfaceColor = Color.White.copy(alpha = 0.12f),
                    )
                    GlassIconButton(
                        backdrop = backdrop,
                        icon = if (playerState.isPlaying) Icons.Rounded.Pause else Icons.Rounded.PlayArrow,
                        onClick = {
                            showBottomControls = true
                            player.togglePlay()
                        },
                        contentDescription = if (playerState.isPlaying) "暂停" else "播放",
                        size = 68.dp,
                        iconSize = 38.dp,
                        surfaceColor = Color.White.copy(alpha = 0.14f),
                    )
                    GlassIconButton(
                        backdrop = backdrop,
                        icon = Icons.Rounded.SkipNext,
                        onClick = {
                            showBottomControls = true
                            player.next()
                        },
                        contentDescription = "下一首",
                        size = 52.dp,
                        iconSize = 28.dp,
                        surfaceColor = Color.White.copy(alpha = 0.12f),
                    )
                    GlassIconButton(
                        backdrop = backdrop,
                        icon = if (liked) Icons.Rounded.Favorite else Icons.Rounded.FavoriteBorder,
                        onClick = {
                            showBottomControls = true
                            onToggleLike(song)
                        },
                        contentDescription = if (liked) "取消收藏" else "收藏",
                        tint = if (liked) FavoriteRed else Color.White.copy(alpha = 0.9f),
                        size = 44.dp,
                        surfaceColor = Color.White.copy(alpha = 0.12f),
                    )
                }
            }
        }
    }
}
