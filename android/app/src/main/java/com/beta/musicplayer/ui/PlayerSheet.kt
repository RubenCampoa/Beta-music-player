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
import androidx.compose.foundation.background
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ChatBubbleOutline
import androidx.compose.material.icons.rounded.Favorite
import androidx.compose.material.icons.rounded.FavoriteBorder
import androidx.compose.material.icons.rounded.GraphicEq
import androidx.compose.material.icons.rounded.KeyboardArrowDown
import androidx.compose.material.icons.rounded.Mic
import androidx.compose.material.icons.rounded.MoreHoriz
import androidx.compose.material.icons.rounded.Pause
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.QueueMusic
import androidx.compose.material.icons.rounded.Repeat
import androidx.compose.material.icons.rounded.RepeatOne
import androidx.compose.material.icons.rounded.Shuffle
import androidx.compose.material.icons.rounded.SkipNext
import androidx.compose.material.icons.rounded.SkipPrevious
import androidx.compose.material.icons.rounded.Star
import androidx.compose.material.icons.rounded.StarBorder
import androidx.compose.material.icons.rounded.Translate
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
            // 横屏布局：完全 1:1 匹配 Apple Music iPad 界面（左侧舒展封面+歌曲信息+控制区，右侧歌词垂直居中）
            Row(
                modifier = Modifier
                    .fillMaxSize()
                    .statusBarsPadding()
                    .navigationBarsPadding()
                    .padding(horizontal = 24.dp, vertical = 12.dp),
                horizontalArrangement = Arrangement.spacedBy(28.dp),
            ) {
                // 左侧列：收起按钮 + 封面 + 歌曲信息 + 进度条 + 5个控制组件 + 音量条
                Column(
                    modifier = Modifier
                        .fillMaxHeight()
                        .weight(0.42f),
                    verticalArrangement = Arrangement.SpaceBetween,
                ) {
                    // 1. 顶部收起按钮
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

                    // 2. 正方形大封面（占比适中不挤压）
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .weight(1f, fill = false),
                        contentAlignment = Alignment.Center,
                    ) {
                        AsyncImage(
                            model = Format.getOptimizedCoverUrl(song.coverUrl, 800),
                            contentDescription = song.name,
                            modifier = Modifier
                                .fillMaxWidth(0.82f)
                                .aspectRatio(1f)
                                .clip(RoundedCornerShape(18.dp)),
                            contentScale = ContentScale.Crop,
                        )
                    }

                    // 3. 歌曲标题、歌手与右侧收藏/更多按钮
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = song.name,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                style = MaterialTheme.typography.titleMedium.copy(
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 19.sp,
                                ),
                                color = Color.White,
                            )
                            Spacer(Modifier.height(2.dp))
                            Text(
                                text = song.artist,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                style = MaterialTheme.typography.bodyMedium,
                                color = Color.White.copy(alpha = 0.70f),
                            )
                        }

                        Row(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
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
                            GlassIconButton(
                                backdrop = backdrop,
                                icon = Icons.Rounded.MoreHoriz,
                                onClick = { },
                                contentDescription = "更多选项",
                                size = 36.dp,
                                iconSize = 20.dp,
                                surfaceColor = Color.White.copy(alpha = 0.12f),
                            )
                        }
                    }

                    Spacer(Modifier.height(4.dp))

                    // 4. 进度条与质量徽章（Dolby Atmos）
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
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(
                                    imageVector = Icons.Rounded.GraphicEq,
                                    contentDescription = null,
                                    tint = Color.White.copy(alpha = 0.60f),
                                    modifier = Modifier.size(12.dp),
                                )
                                Spacer(Modifier.width(4.dp))
                                Text(
                                    text = "Dolby Atmos",
                                    style = MaterialTheme.typography.labelSmall,
                                    fontSize = 10.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = Color.White.copy(alpha = 0.60f),
                                )
                            }
                            val remainingMs = (playerState.durationMs - playerState.positionMs).coerceAtLeast(0L)
                            Text(
                                text = "-${Format.formatTime(remainingMs / 1000f)}",
                                style = MaterialTheme.typography.labelSmall,
                                color = Color.White.copy(alpha = 0.55f),
                            )
                        }
                    }

                    Spacer(Modifier.height(4.dp))

                    // 5. 5个核心控制按钮 (随机/顺序、上一首、播放/暂停、下一首、循环模式)
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        GlassIconButton(
                            backdrop = backdrop,
                            icon = Icons.Rounded.Shuffle,
                            onClick = onCyclePlayMode,
                            contentDescription = "随机播放",
                            size = 38.dp,
                            iconSize = 20.dp,
                            surfaceColor = Color.White.copy(alpha = 0.12f),
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
                            icon = when (playerState.playMode) {
                                MusicPlayer.PlayMode.REPEAT_ALL -> Icons.Rounded.Repeat
                                MusicPlayer.PlayMode.REPEAT_ONE -> Icons.Rounded.RepeatOne
                                MusicPlayer.PlayMode.SHUFFLE -> Icons.Rounded.Shuffle
                            },
                            onClick = onCyclePlayMode,
                            contentDescription = "循环模式",
                            size = 38.dp,
                            iconSize = 20.dp,
                            surfaceColor = Color.White.copy(alpha = 0.12f),
                        )
                    }

                    Spacer(Modifier.height(4.dp))

                    // 6. 音量调节整洁行（精简无用图标，保留音量滑块）
                    VolumeSliderRow(backdrop = backdrop, modifier = Modifier.fillMaxWidth())
                }

                // 右侧列：顶部指示线 + 浮动功能按钮 + 自动居中景深歌词
                Box(
                    modifier = Modifier
                        .fillMaxHeight()
                        .weight(0.58f),
                ) {
                    // 顶部拖拽指示线
                    Box(
                        modifier = Modifier
                            .align(Alignment.TopCenter)
                            .padding(top = 2.dp)
                            .width(36.dp)
                            .height(4.dp)
                            .clip(CircleShape)
                            .background(Color.White.copy(alpha = 0.35f))
                    )

                    // 右上角悬浮操作按钮组 (伴唱 / 翻译)
                    Row(
                        modifier = Modifier
                            .align(Alignment.TopEnd)
                            .zIndex(3f)
                            .padding(top = 2.dp, end = 2.dp),
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        GlassIconButton(
                            backdrop = backdrop,
                            icon = Icons.Rounded.Mic,
                            onClick = { },
                            contentDescription = "伴唱",
                            size = 34.dp,
                            iconSize = 18.dp,
                            surfaceColor = Color.White.copy(alpha = 0.12f),
                        )
                        GlassIconButton(
                            backdrop = backdrop,
                            icon = Icons.Rounded.Translate,
                            onClick = { },
                            contentDescription = "歌词翻译",
                            size = 34.dp,
                            iconSize = 18.dp,
                            surfaceColor = Color.White.copy(alpha = 0.12f),
                        )
                    }

                    // 歌词区（50% 垂直居中正中央对齐，匹配 Apple Music 横屏视觉）
                    LyricsView(
                        lyrics = playerState.lyrics,
                        positionProvider = lyricPositionProvider,
                        onSeekTo = { positionMs -> player.seekTo(positionMs) },
                        onTap = { },
                        focusFraction = 0.50f,
                        modifier = Modifier.fillMaxSize(),
                    )

                    // 右下角悬浮操作按钮组 (歌词 / 播放队列)
                    Row(
                        modifier = Modifier
                            .align(Alignment.BottomEnd)
                            .zIndex(3f)
                            .padding(bottom = 2.dp, end = 2.dp),
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        GlassIconButton(
                            backdrop = backdrop,
                            icon = Icons.Rounded.ChatBubbleOutline,
                            onClick = { },
                            contentDescription = "歌词视图",
                            size = 36.dp,
                            iconSize = 20.dp,
                            surfaceColor = Color.White.copy(alpha = 0.16f),
                        )
                        GlassIconButton(
                            backdrop = backdrop,
                            icon = Icons.Rounded.QueueMusic,
                            onClick = { },
                            contentDescription = "播放队列",
                            size = 36.dp,
                            iconSize = 20.dp,
                            surfaceColor = Color.White.copy(alpha = 0.12f),
                        )
                    }
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
