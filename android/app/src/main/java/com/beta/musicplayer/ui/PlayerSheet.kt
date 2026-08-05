package com.beta.musicplayer.ui

import android.content.Context
import android.content.res.Configuration
import android.media.AudioManager
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
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
import androidx.compose.material.icons.rounded.Star
import androidx.compose.material.icons.rounded.StarBorder
import androidx.compose.material.icons.rounded.VolumeDown
import androidx.compose.material.icons.rounded.VolumeUp
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
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
import com.kyant.backdrop.Backdrop
import com.kyant.backdrop.backdrops.layerBackdrop
import com.kyant.backdrop.backdrops.rememberLayerBackdrop
import kotlinx.coroutines.delay
import kotlin.math.roundToInt

/**
 * 全屏播放页：支持竖屏与横屏（1:1 匹配 Apple Music iPad 横屏播放器布局，通透干净不拥挤）
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

    // 4 秒无手势交互后自动隐藏底部播放操控区（竖屏体验）
    LaunchedEffect(showBottomControls, playerState.isPlaying) {
        if (showBottomControls && playerState.isPlaying) {
            delay(4_000)
            showBottomControls = false
        }
    }

    val toggleBottomControls = remember {
        { showBottomControls = !showBottomControls }
    }

    val isLandscape = LocalConfiguration.current.orientation == Configuration.ORIENTATION_LANDSCAPE

    Box(Modifier.fillMaxSize()) {
        val backdrop = rememberLayerBackdrop {
            drawRect(Color(0xFF0D0C12))
            drawContent()
        }

        val liked = song.neteaseId?.let { it in likedIds } ?: false

        // 重负载渲染层（backdrop 容器 / 全屏模糊背景 / 歌词 RenderEffect）保持同一组合槽位
        Box(
            Modifier
                .fillMaxSize()
                .layerBackdrop(backdrop)
        ) {
            BackgroundLayer(song = song)

            if (!isLandscape) {
                LyricsView(
                    lyrics = playerState.lyrics,
                    positionProvider = lyricPositionProvider,
                    onSeekTo = { positionMs ->
                        showBottomControls = true
                        player.seekTo(positionMs)
                    },
                    onTap = toggleBottomControls,
                    lineSeekEnabled = showBottomControls,
                    focusFraction = null,
                    modifier = Modifier.fillMaxSize(),
                )
            }
        }

        if (isLandscape) {
            // 横屏布局：左侧大封面 + 右侧信息控制区（无全屏歌词）
            Row(
                modifier = Modifier
                    .fillMaxSize()
                    .statusBarsPadding()
                    .navigationBarsPadding()
                    .padding(horizontal = 48.dp, vertical = 12.dp),
                horizontalArrangement = Arrangement.spacedBy(48.dp),
            ) {
                // 左侧：收起按钮置顶 + 封面垂直居中
                Column(
                    modifier = Modifier
                        .fillMaxHeight()
                        .weight(0.42f),
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        GlassIconButton(
                            backdrop = backdrop,
                            icon = Icons.Rounded.KeyboardArrowDown,
                            onClick = onDismiss,
                            contentDescription = "收起",
                            size = 36.dp,
                            surfaceColor = Color.White.copy(alpha = 0.12f),
                        )
                    }
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .weight(1f),
                        contentAlignment = Alignment.Center,
                    ) {
                        AsyncImage(
                            model = Format.getOptimizedCoverUrl(song.coverUrl, 800),
                            contentDescription = song.name,
                            modifier = Modifier
                                .fillMaxHeight(0.85f)
                                .aspectRatio(1f)
                                .clip(RoundedCornerShape(18.dp)),
                            contentScale = ContentScale.Crop,
                        )
                    }
                }

                // 右侧：歌曲信息 / 进度 / 五键 / 音量整组垂直居中
                Column(
                    modifier = Modifier
                        .fillMaxHeight()
                        .weight(0.58f),
                    verticalArrangement = Arrangement.spacedBy(14.dp, Alignment.CenterVertically),
                ) {
                    // 歌曲标题、歌手与收藏按钮
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = song.name,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                style = MaterialTheme.typography.titleLarge.copy(
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 22.sp,
                                ),
                                color = Color.White,
                            )
                            Spacer(Modifier.height(4.dp))
                            Text(
                                text = song.artist,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                style = MaterialTheme.typography.bodyMedium,
                                color = Color.White.copy(alpha = 0.70f),
                            )
                        }

                        GlassIconButton(
                            backdrop = backdrop,
                            icon = if (liked) Icons.Rounded.Star else Icons.Rounded.StarBorder,
                            onClick = { onToggleLike(song) },
                            contentDescription = if (liked) "取消收藏" else "收藏",
                            size = 36.dp,
                            iconSize = 20.dp,
                            tint = if (liked) Color(0xFFFFCC00) else Color.White.copy(alpha = 0.85f),
                            surfaceColor = Color.White.copy(alpha = 0.12f),
                        )
                    }

                    // 进度条与时间
                    Column(modifier = Modifier.fillMaxWidth()) {
                        val progress = if (playerState.durationMs > 0) {
                            (playerState.positionMs.toFloat() / playerState.durationMs).coerceIn(0f, 1f)
                        } else 0f

                        GlassSlider(
                            backdrop = backdrop,
                            value = progress,
                            onValueChange = { fraction ->
                                player.seekTo((fraction * playerState.durationMs).toLong())
                            },
                            modifier = Modifier.fillMaxWidth(),
                        )
                        Spacer(Modifier.height(3.dp))
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                text = Format.formatTime(playerState.positionMs / 1000f),
                                style = MaterialTheme.typography.labelSmall,
                                color = Color.White.copy(alpha = 0.55f),
                            )
                            val remainingMs = (playerState.durationMs - playerState.positionMs).coerceAtLeast(0L)
                            Text(
                                text = "-${Format.formatTime(remainingMs / 1000f)}",
                                style = MaterialTheme.typography.labelSmall,
                                color = Color.White.copy(alpha = 0.55f),
                            )
                        }
                    }

                    // Apple Music 五键排布：随机 | 上一首 | 播放/暂停 | 下一首 | 循环
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        GlassIconButton(
                            backdrop = backdrop,
                            icon = Icons.Rounded.Shuffle,
                            onClick = {
                                player.setPlayMode(
                                    if (playerState.playMode == MusicPlayer.PlayMode.SHUFFLE) {
                                        MusicPlayer.PlayMode.REPEAT_ALL
                                    } else {
                                        MusicPlayer.PlayMode.SHUFFLE
                                    },
                                )
                            },
                            contentDescription = "随机播放",
                            size = 38.dp,
                            iconSize = 20.dp,
                            tint = if (playerState.playMode == MusicPlayer.PlayMode.SHUFFLE) {
                                Color.White
                            } else {
                                Color.White.copy(alpha = 0.85f)
                            },
                            surfaceColor = Color.White.copy(
                                alpha = if (playerState.playMode == MusicPlayer.PlayMode.SHUFFLE) 0.2f else 0.12f,
                            ),
                        )
                        GlassIconButton(
                            backdrop = backdrop,
                            icon = Icons.Rounded.SkipPrevious,
                            onClick = { player.previous() },
                            contentDescription = "上一首",
                            size = 44.dp,
                            iconSize = 24.dp,
                            surfaceColor = Color.White.copy(alpha = 0.12f),
                        )
                        GlassIconButton(
                            backdrop = backdrop,
                            icon = if (playerState.isPlaying) Icons.Rounded.Pause else Icons.Rounded.PlayArrow,
                            onClick = { player.togglePlay() },
                            contentDescription = if (playerState.isPlaying) "暂停" else "播放",
                            size = 54.dp,
                            iconSize = 30.dp,
                            surfaceColor = Color.White.copy(alpha = 0.16f),
                        )
                        GlassIconButton(
                            backdrop = backdrop,
                            icon = Icons.Rounded.SkipNext,
                            onClick = { player.next() },
                            contentDescription = "下一首",
                            size = 44.dp,
                            iconSize = 24.dp,
                            surfaceColor = Color.White.copy(alpha = 0.12f),
                        )
                        GlassIconButton(
                            backdrop = backdrop,
                            icon = if (playerState.playMode == MusicPlayer.PlayMode.REPEAT_ONE) {
                                Icons.Rounded.RepeatOne
                            } else {
                                Icons.Rounded.Repeat
                            },
                            onClick = {
                                player.setPlayMode(
                                    if (playerState.playMode == MusicPlayer.PlayMode.REPEAT_ONE) {
                                        MusicPlayer.PlayMode.REPEAT_ALL
                                    } else {
                                        MusicPlayer.PlayMode.REPEAT_ONE
                                    },
                                )
                            },
                            contentDescription = "循环模式",
                            size = 38.dp,
                            iconSize = 20.dp,
                            tint = if (playerState.playMode != MusicPlayer.PlayMode.REPEAT_ALL) {
                                Color.White
                            } else {
                                Color.White.copy(alpha = 0.85f)
                            },
                            surfaceColor = Color.White.copy(alpha = 0.12f),
                        )
                    }

                    // 音量调节行
                    VolumeSliderRow(backdrop = backdrop, modifier = Modifier.fillMaxWidth())
                }
            }
        } else {
            // 竖屏顶部常驻歌曲基本信息栏
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

            // 竖屏底部自动隐藏播放操控区
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
                    PlaybackControls(
                        backdrop = backdrop,
                        playerState = playerState,
                        liked = liked,
                        showVolumeSlider = false,
                        onSeekFraction = { fraction ->
                            showBottomControls = true
                            player.seekTo((fraction * playerState.durationMs).toLong())
                        },
                        onCyclePlayMode = {
                            showBottomControls = true
                            onCyclePlayMode()
                        },
                        onTogglePlay = {
                            showBottomControls = true
                            player.togglePlay()
                        },
                        onPrevious = {
                            showBottomControls = true
                            player.previous()
                        },
                        onNext = {
                            showBottomControls = true
                            player.next()
                        },
                        onToggleLike = {
                            showBottomControls = true
                            onToggleLike(song)
                        },
                    )
                }
            }
        }
    }
}

/** 播放控制：进度滑块 + 时间 + 控制按钮行 */
@Composable
private fun PlaybackControls(
    backdrop: Backdrop,
    playerState: MusicPlayer.PlayerState,
    liked: Boolean,
    showVolumeSlider: Boolean,
    onSeekFraction: (Float) -> Unit,
    onCyclePlayMode: () -> Unit,
    onTogglePlay: () -> Unit,
    onPrevious: () -> Unit,
    onNext: () -> Unit,
    onToggleLike: () -> Unit,
) {
    val progress = if (playerState.durationMs > 0) {
        (playerState.positionMs.toFloat() / playerState.durationMs).coerceIn(0f, 1f)
    } else 0f

    GlassSlider(
        backdrop = backdrop,
        value = progress,
        onValueChange = onSeekFraction,
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
            onClick = onCyclePlayMode,
            contentDescription = "播放模式",
            size = 44.dp,
            surfaceColor = Color.White.copy(alpha = 0.12f),
        )
        GlassIconButton(
            backdrop = backdrop,
            icon = Icons.Rounded.SkipPrevious,
            onClick = onPrevious,
            contentDescription = "上一首",
            size = 52.dp,
            iconSize = 28.dp,
            surfaceColor = Color.White.copy(alpha = 0.12f),
        )
        GlassIconButton(
            backdrop = backdrop,
            icon = if (playerState.isPlaying) Icons.Rounded.Pause else Icons.Rounded.PlayArrow,
            onClick = onTogglePlay,
            contentDescription = if (playerState.isPlaying) "暂停" else "播放",
            size = 68.dp,
            iconSize = 38.dp,
            surfaceColor = Color.White.copy(alpha = 0.14f),
        )
        GlassIconButton(
            backdrop = backdrop,
            icon = Icons.Rounded.SkipNext,
            onClick = onNext,
            contentDescription = "下一首",
            size = 52.dp,
            iconSize = 28.dp,
            surfaceColor = Color.White.copy(alpha = 0.12f),
        )
        GlassIconButton(
            backdrop = backdrop,
            icon = if (liked) Icons.Rounded.Favorite else Icons.Rounded.FavoriteBorder,
            onClick = onToggleLike,
            contentDescription = if (liked) "取消收藏" else "收藏",
            tint = if (liked) FavoriteRed else Color.White.copy(alpha = 0.9f),
            size = 44.dp,
            surfaceColor = Color.White.copy(alpha = 0.12f),
        )
    }

    if (showVolumeSlider) {
        Spacer(Modifier.height(10.dp))
        VolumeSliderRow(backdrop = backdrop)
    }
}

/** 音量滑块（控制系统媒体音量） */
@Composable
private fun VolumeSliderRow(backdrop: Backdrop, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val audioManager = remember { context.getSystemService(Context.AUDIO_SERVICE) as AudioManager }
    val maxVolume = remember { audioManager.getStreamMaxVolume(AudioManager.STREAM_MUSIC).coerceAtLeast(1) }
    var volumeFraction by remember {
        mutableStateOf(audioManager.getStreamVolume(AudioManager.STREAM_MUSIC).toFloat() / maxVolume)
    }

    Row(
        modifier = modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = Icons.Rounded.VolumeDown,
            contentDescription = "减小音量",
            tint = Color.White.copy(alpha = 0.7f),
            modifier = Modifier.size(18.dp),
        )
        Spacer(Modifier.width(8.dp))
        GlassSlider(
            backdrop = backdrop,
            value = volumeFraction,
            onValueChange = { fraction ->
                volumeFraction = fraction
                audioManager.setStreamVolume(
                    AudioManager.STREAM_MUSIC,
                    (fraction * maxVolume).roundToInt(),
                    0,
                )
            },
            modifier = Modifier.weight(1f),
            trackHeight = 6.dp,
            thumbSize = 18.dp,
        )
        Spacer(Modifier.width(8.dp))
        Icon(
            imageVector = Icons.Rounded.VolumeUp,
            contentDescription = "增大音量",
            tint = Color.White.copy(alpha = 0.7f),
            modifier = Modifier.size(18.dp),
        )
    }
}
