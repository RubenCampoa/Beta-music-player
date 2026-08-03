package com.beta.musicplayer.ui

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
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
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
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
import com.beta.musicplayer.ui.components.liquidButton
import com.kyant.backdrop.Backdrop
import com.kyant.backdrop.backdrops.layerBackdrop
import com.kyant.backdrop.backdrops.rememberLayerBackdrop

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
    val pagerState = rememberPagerState(initialPage = selectedPageIndex) { pageTabs.size }
    var showPlayerSheet by rememberSaveable { mutableStateOf(false) }

    // Dock 是页面选择的唯一真源；Pager 只负责渲染与切页动画。
    // LaunchedEffect 会在快速连续点按时自动取消旧动画，避免多个 Job 争抢 Pager 状态。
    LaunchedEffect(selectedPageIndex) {
        if (pagerState.currentPage != selectedPageIndex || pagerState.currentPageOffsetFraction != 0f) {
            pagerState.animateScrollToPage(
                page = selectedPageIndex,
                animationSpec = tween(
                    durationMillis = 280,
                    easing = FastOutSlowInEasing,
                ),
            )
        }
    }

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

            HorizontalPager(
                state = pagerState,
                userScrollEnabled = false,
                beyondViewportPageCount = 1,
                key = { pageTabs[it].name },
                modifier = Modifier
                    .fillMaxSize()
                    .statusBarsPadding(),
            ) { page ->
                when (pageTabs[page]) {
                    MainTab.ListenNow -> ListenNowView(viewModel, uiState, playerState, backgroundBackdrop)
                    MainTab.Browse -> BrowseView(viewModel, uiState, backgroundBackdrop)
                    MainTab.Artists -> ArtistsView(viewModel, uiState, backgroundBackdrop)
                    MainTab.Me -> MeView(viewModel, uiState, backgroundBackdrop)
                    MainTab.Search -> SearchView(viewModel, uiState, backgroundBackdrop)
                }
            }
        }

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
                val active = selectedIndex == index
                val contentColor = if (active) {
                    DockSelectedAccent
                } else {
                    Color.White.copy(alpha = 0.72f)
                }
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
                        fontWeight = if (active) FontWeight.SemiBold else FontWeight.Medium,
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

/** 迷你播放条（全圆角胶囊 + 动态环形进度圈） */
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

    val lyricSnippet = playerState.lyrics.firstOrNull()?.text ?: song.artist

    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(60.dp)
            .liquidButton(
                backdrop = backdrop,
                onClick = onClick,
                contentDescription = "打开播放页",
                shape = RoundedCornerShape(percent = 50),
            ),
    ) {
        Row(
            Modifier
                .fillMaxSize()
                .padding(horizontal = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            AsyncImage(
                model = Format.getOptimizedCoverUrl(song.coverUrl, 120),
                contentDescription = null,
                modifier = Modifier
                    .size(46.dp)
                    .clip(CircleShape),
                contentScale = ContentScale.Crop,
            )
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    text = song.name,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    style = MaterialTheme.typography.bodyMedium,
                    color = Color.White,
                )
                Text(
                    text = lyricSnippet,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    style = MaterialTheme.typography.bodySmall,
                    color = Color.White.copy(alpha = 0.65f),
                )
            }
            Spacer(Modifier.width(8.dp))
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
