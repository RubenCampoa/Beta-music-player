package com.beta.musicplayer.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.Crossfade
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
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
import androidx.compose.material.icons.rounded.Album
import androidx.compose.material.icons.rounded.Explore
import androidx.compose.material.icons.rounded.GraphicEq
import androidx.compose.material.icons.rounded.Pause
import androidx.compose.material.icons.rounded.Person
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.zIndex
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import coil3.compose.AsyncImage
import com.beta.musicplayer.BetaMusicPlayerApp
import com.beta.musicplayer.data.model.Song
import com.beta.musicplayer.data.util.Format
import com.beta.musicplayer.player.MusicPlayer
import com.beta.musicplayer.ui.components.BackgroundLayer
import com.beta.musicplayer.ui.components.GlassIconButton
import com.beta.musicplayer.ui.components.GlassProgressPlayButton
import com.beta.musicplayer.ui.components.LiquidDockTab
import com.beta.musicplayer.ui.components.LiquidDockTabs
import com.kyant.backdrop.Backdrop
import com.kyant.backdrop.backdrops.layerBackdrop
import com.kyant.backdrop.backdrops.rememberLayerBackdrop
import com.kyant.backdrop.drawBackdrop
import com.kyant.backdrop.effects.blur
import com.kyant.backdrop.effects.lens
import com.kyant.backdrop.effects.vibrancy

private val DockSelectedAccent = Color(0xFF0A84FF)

enum class MainTab(val label: String, val icon: ImageVector) {
    ListenNow("推荐", Icons.Rounded.Explore),
    Browse("专辑", Icons.Rounded.Album),
    Artists("艺术家", Icons.Rounded.GraphicEq),
    Me("我的", Icons.Rounded.Person),
    Search("搜索", Icons.Rounded.Search),
}

@Composable
fun MainScreen() {
    val context = LocalContext.current
    val app = context.applicationContext as BetaMusicPlayerApp
    val player = app.container.player
    val viewModel: MainViewModel = viewModel { MainViewModel(app.container) }
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val playerState by player.state.collectAsStateWithLifecycle()

    val pageTabs = remember {
        listOf(
            MainTab.ListenNow,
            MainTab.Browse,
            MainTab.Artists,
            MainTab.Me,
            MainTab.Search,
        )
    }

    var selectedPageIndex by rememberSaveable { mutableIntStateOf(0) }
    var showPlayerSheet by rememberSaveable { mutableStateOf(false) }

    Box(Modifier.fillMaxSize()) {
        // 页面内部玻璃只采样稳定背景，避免玻璃组件录回自身形成采样闭环。
        val backgroundBackdrop = rememberLayerBackdrop {
            drawRect(Color(0xFF0D0C12))
            drawContent()
        }
        // Glass Bottom Bar 教程要求底板采样“背景 + MainNavHost”。Dock 使用这层，
        // 才能真正折射后方的封面、卡片、文字和列表，而不只是模糊纯色背景。
        val dockBackdrop = rememberLayerBackdrop {
            drawRect(Color(0xFF0D0C12))
            drawContent()
        }

        // dockBackdrop 采样“背景 + 页面内容”，使 Dock 和 MiniPlayerBar 能够实时折射与模糊后方滚动过的歌名、封面和列表
        Box(
            Modifier
                .fillMaxSize()
                .layerBackdrop(dockBackdrop)
        ) {
            Box(
                Modifier
                    .fillMaxSize()
                    .layerBackdrop(backgroundBackdrop)
            ) {
                BackgroundLayer(song = playerState.currentSong)
            }

            val saveableStateHolder = androidx.compose.runtime.saveable.rememberSaveableStateHolder()

            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .statusBarsPadding()
            ) {
                pageTabs.forEachIndexed { index, tab ->
                    val isSelected = index == selectedPageIndex
                    val pageAlpha by androidx.compose.animation.core.animateFloatAsState(
                        targetValue = if (isSelected) 1f else 0f,
                        animationSpec = tween(durationMillis = 200, easing = androidx.compose.animation.core.FastOutSlowInEasing),
                        label = "tabAlpha_$index",
                    )
                    if (pageAlpha > 0f) {
                        Box(
                            modifier = Modifier
                                .fillMaxSize()
                                .graphicsLayer { alpha = pageAlpha }
                        ) {
                            saveableStateHolder.SaveableStateProvider(key = tab.name) {
                                when (tab) {
                                    MainTab.ListenNow -> ListenNowView(viewModel, uiState, playerState, backgroundBackdrop)
                                    MainTab.Browse -> BrowseView(viewModel, uiState, backgroundBackdrop)
                                    MainTab.Artists -> ArtistsView(viewModel, uiState, backgroundBackdrop)
                                    MainTab.Me -> MeView(viewModel, uiState, backgroundBackdrop)
                                    MainTab.Search -> SearchView(viewModel, uiState, backgroundBackdrop)
                                }
                            }
                        }
                    }
                }
            }
        }

        // 顶端沉浸式渐变遮罩 (Top Status Bar Mask)
        Box(
            Modifier
                .fillMaxWidth()
                .height(72.dp)
                .align(Alignment.TopCenter)
                .background(
                    Brush.verticalGradient(
                        colors = listOf(
                            Color(0xFF0D0C12).copy(alpha = 0.96f),
                            Color(0xFF0D0C12).copy(alpha = 0.65f),
                            Color(0xFF0D0C12).copy(alpha = 0.15f),
                            Color.Transparent,
                        )
                    )
                )
        )

        // 悬浮操控层位于 dockBackdrop 之外，避免 Dock 把自己录入采样源。
        Column(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .navigationBarsPadding()
                .padding(horizontal = 8.dp)
                .padding(bottom = 10.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            val currentSong = playerState.currentSong
            if (currentSong != null) {
                MiniPlayerBar(
                    backdrop = dockBackdrop,
                    song = currentSong,
                    playerState = playerState,
                    onClick = { showPlayerSheet = true },
                    onTogglePlay = { player.togglePlay() },
                )
                Spacer(Modifier.height(10.dp))
            }

            val selectedTab = pageTabs[selectedPageIndex]
            GlassBottomBar(
                backdrop = dockBackdrop,
                selected = selectedTab,
                onSelect = { tab ->
                    val targetPage = pageTabs.indexOf(tab)
                    if (targetPage >= 0 && targetPage != selectedPageIndex) {
                        selectedPageIndex = targetPage
                    }
                },
            )
        }
    }

    if (showPlayerSheet) {
        PlayerSheet(
            player = player,
            playerState = playerState,
            likedIds = uiState.likedIds,
            onToggleLike = { viewModel.toggleLike(it) },
            onCyclePlayMode = { viewModel.cyclePlayMode() },
            onDismiss = { showPlayerSheet = false },
        )
    }

    // 顶部 Toast 提示（顶层绘制：主页与全屏播放页均可见，如未登录时收藏歌曲提示）
    Box(Modifier.fillMaxSize()) {
        AnimatedVisibility(
            visible = uiState.toastMessage != null,
            enter = fadeIn() + slideInVertically { -it },
            exit = fadeOut() + slideOutVertically { -it },
            modifier = Modifier
                .align(Alignment.TopCenter)
                .statusBarsPadding()
                .padding(top = 10.dp)
                .zIndex(10f),
        ) {
            uiState.toastMessage?.let { msg ->
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(percent = 50))
                        .background(Color(0xEE2A2930))
                        .padding(horizontal = 20.dp, vertical = 10.dp)
                ) {
                    Text(
                        text = msg,
                        color = Color.White,
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            }
        }
    }
}

/**
 * Dock 直接组合 AndroidLiquidGlass 官方示例同构的三层实现。
 * 页面选择由 MainScreen 的 selectedPageIndex 负责，这里只保留导航胶囊的视觉位置。
 */
@Composable
private fun GlassBottomBar(
    backdrop: Backdrop,
    selected: MainTab,
    onSelect: (MainTab) -> Unit,
    modifier: Modifier = Modifier,
) {
    val navTabs = remember {
        listOf(
            MainTab.ListenNow,
            MainTab.Browse,
            MainTab.Artists,
            MainTab.Me,
        )
    }
    val selectedIndex = navTabs.indexOf(selected)
    val dockIndex = remember { mutableIntStateOf(selectedIndex.coerceAtLeast(0)) }
    val latestSelected = rememberUpdatedState(selected)
    val latestOnSelect = rememberUpdatedState(onSelect)
    val selectedIndexProvider = remember { { dockIndex.intValue } }
    val selectDockTab = remember(navTabs) {
        { index: Int ->
            if (index in navTabs.indices) {
                dockIndex.intValue = index
                val target = navTabs[index]
                if (target != latestSelected.value) latestOnSelect.value(target)
            }
        }
    }

    LaunchedEffect(selectedIndex) {
        if (selectedIndex >= 0 && dockIndex.intValue != selectedIndex) {
            dockIndex.intValue = selectedIndex
        }
    }

    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        LiquidDockTabs(
            selectedTabIndex = selectedIndexProvider,
            onTabSelected = selectDockTab,
            backdrop = backdrop,
            tabsCount = navTabs.size,
            indicatorVisible = selectedIndex >= 0,
            modifier = Modifier
                .weight(1f)
                .height(64.dp),
        ) {
            navTabs.forEachIndexed { index, tab ->
                val contentColor = Color.White.copy(alpha = 0.72f)
                LiquidDockTab(
                    onClick = { selectDockTab(index) },
                ) {
                    Icon(
                        imageVector = tab.icon,
                        contentDescription = tab.label,
                        tint = contentColor,
                        modifier = Modifier.size(21.dp),
                    )
                    Text(
                        text = tab.label,
                        color = contentColor,
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Medium,
                    )
                }
            }
        }

        Spacer(Modifier.width(8.dp))

        val isSearchSelected = selected == MainTab.Search
        GlassIconButton(
            backdrop = backdrop,
            icon = Icons.Rounded.Search,
            onClick = { onSelect(MainTab.Search) },
            size = 56.dp,
            iconSize = 22.dp,
            tint = if (isSearchSelected) Color.White else Color.White.copy(alpha = 0.82f),
            contentDescription = "搜索",
        )
    }
}

/** 迷你播放条（全圆角胶囊 + 动态环形进度圈，Issue 1 隔离点击区域） */
@Composable
private fun MiniPlayerBar(
    backdrop: Backdrop,
    song: Song,
    playerState: MusicPlayer.PlayerState,
    onClick: () -> Unit,
    onTogglePlay: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val progress = if (playerState.durationMs > 0) {
        (playerState.positionMs.toFloat() / playerState.durationMs.toFloat()).coerceIn(0f, 1f)
    } else 0f

    val currentPositionSec = playerState.positionMs / 1000.0
    val currentLyricText = remember(playerState.lyrics, currentPositionSec) {
        if (playerState.lyrics.isEmpty()) null
        else {
            playerState.lyrics.lastOrNull { it.time <= currentPositionSec }?.text
        }
    }
    val lyricSnippet = currentLyricText ?: song.artist

    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(60.dp)
            .drawBackdrop(
                backdrop = backdrop,
                shape = { RoundedCornerShape(percent = 50) },
                effects = {
                    vibrancy()
                    blur(8.dp.toPx())
                    lens(14.dp.toPx(), 28.dp.toPx())
                },
                onDrawSurface = { drawRect(Color.White.copy(alpha = 0.08f)) }
            )
            .clip(RoundedCornerShape(percent = 50))
            .padding(horizontal = 6.dp),
        contentAlignment = Alignment.Center,
    ) {
        Row(
            Modifier.fillMaxSize(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Row(
                Modifier
                    .weight(1f)
                    .fillMaxHeight()
                    .clickable(
                        interactionSource = null,
                        indication = null,
                        onClick = onClick
                    )
                    .padding(start = 6.dp, end = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                AsyncImage(
                    model = Format.getOptimizedCoverUrl(song.coverUrl, 120),
                    contentDescription = null,
                    modifier = Modifier
                        .size(44.dp)
                        .clip(CircleShape),
                    contentScale = ContentScale.Crop,
                )
                Spacer(Modifier.width(10.dp))
                Column(Modifier.weight(1f)) {
                    Text(
                        text = song.name,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        style = MaterialTheme.typography.bodyMedium,
                        color = Color.White,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        text = lyricSnippet,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        style = MaterialTheme.typography.bodySmall,
                        color = Color.White.copy(alpha = 0.65f),
                    )
                }
            }
            GlassProgressPlayButton(
                backdrop = backdrop,
                icon = if (playerState.isPlaying) Icons.Rounded.Pause else Icons.Rounded.PlayArrow,
                progress = progress,
                onClick = onTogglePlay,
                contentDescription = if (playerState.isPlaying) "暂停" else "播放",
                size = 46.dp,
                iconSize = 24.dp,
            )
            Spacer(Modifier.width(4.dp))
        }
    }
}
