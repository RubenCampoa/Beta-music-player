package com.beta.musicplayer.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.ExperimentalFoundationApi
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
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.LibraryMusic
import androidx.compose.material.icons.rounded.ArrowBack
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.beta.musicplayer.data.model.Playlist
import com.beta.musicplayer.data.util.Format
import com.beta.musicplayer.ui.components.GlassCard
import com.beta.musicplayer.ui.components.GlassSurface
import com.beta.musicplayer.ui.components.GlassIconButton
import com.beta.musicplayer.ui.components.SongListItem
import com.kyant.backdrop.Backdrop

/**
 * 浏览页：登录用户的歌单（网格）。
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun BrowseView(
    viewModel: MainViewModel,
    uiState: MainUiState,
    backdrop: Backdrop,
) {
    val selectedPlaylist = uiState.selectedPlaylist
    if (selectedPlaylist != null) {
        BackHandler(onBack = { viewModel.closePlaylist() })
        PlaylistDetail(
            playlist = selectedPlaylist,
            uiState = uiState,
            backdrop = backdrop,
            onBack = { viewModel.closePlaylist() },
            onPlaySong = { index -> viewModel.playList(uiState.playlistSongs, index) },
            onToggleLike = { song -> viewModel.toggleLike(song) },
        )
        return
    }

    Column(Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                imageVector = Icons.Rounded.LibraryMusic,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(24.dp),
            )
            Spacer(Modifier.width(10.dp))
            Text(
                text = "资料库与歌单",
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold,
                color = Color.White,
            )
        }

        if (uiState.user == null) {
            Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(
                        imageVector = Icons.Rounded.LibraryMusic,
                        contentDescription = null,
                        tint = Color.White.copy(alpha = 0.4f),
                        modifier = Modifier.size(64.dp),
                    )
                    Spacer(Modifier.height(12.dp))
                    Text(
                        text = "登录后查看你的歌单",
                        color = Color.White.copy(alpha = 0.5f),
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }
            }
            return@Column
        }

        if (uiState.userPlaylists.isEmpty()) {
            Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                Text(
                    text = "暂无歌单",
                    color = Color.White.copy(alpha = 0.4f),
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
            return@Column
        }

        LazyVerticalGrid(
            columns = GridCells.Fixed(2),
            modifier = Modifier.weight(1f).fillMaxWidth(),
            contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 170.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            items(uiState.userPlaylists, key = { it.id }) { playlist ->
                PlaylistCard(
                    playlist = playlist,
                    backdrop = backdrop,
                    onClick = { viewModel.openPlaylist(playlist) },
                )
            }
        }
    }
}

@Composable
private fun PlaylistDetail(
    playlist: Playlist,
    uiState: MainUiState,
    backdrop: Backdrop,
    onBack: () -> Unit,
    onPlaySong: (Int) -> Unit,
    onToggleLike: (com.beta.musicplayer.data.model.Song) -> Unit,
) {
    Column(Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            GlassIconButton(
                backdrop = backdrop,
                icon = Icons.Rounded.ArrowBack,
                onClick = onBack,
                contentDescription = "返回我的歌单",
                size = 40.dp,
                iconSize = 22.dp,
            )
            Spacer(Modifier.width(12.dp))
            Text(
                text = "歌单详情",
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
            )
        }

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            AsyncImage(
                model = Format.getOptimizedCoverUrl(playlist.coverImgUrl, 300),
                contentDescription = playlist.name,
                modifier = Modifier
                    .size(96.dp)
                    .clip(RoundedCornerShape(18.dp)),
                contentScale = ContentScale.Crop,
            )
            Spacer(Modifier.width(16.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    text = playlist.name,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                Spacer(Modifier.height(6.dp))
                Text(
                    text = "${playlist.trackCount} 首歌曲",
                    style = MaterialTheme.typography.bodySmall,
                    color = Color.White.copy(alpha = 0.58f),
                )
                playlist.creatorName?.takeIf { it.isNotBlank() }?.let { creator ->
                    Spacer(Modifier.height(3.dp))
                    Text(
                        text = creator,
                        style = MaterialTheme.typography.labelSmall,
                        color = Color.White.copy(alpha = 0.45f),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }

        when {
            uiState.isLoadingPlaylistSongs -> {
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxWidth(),
                    contentAlignment = Alignment.Center,
                ) {
                    CircularProgressIndicator(color = Color.White.copy(alpha = 0.75f))
                }
            }

            uiState.playlistSongsError != null -> {
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxWidth()
                        .padding(24.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = uiState.playlistSongsError,
                        style = MaterialTheme.typography.bodyMedium,
                        color = Color.White.copy(alpha = 0.55f),
                    )
                }
            }

            else -> {
                LazyColumn(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxWidth(),
                    contentPadding = PaddingValues(bottom = 170.dp),
                ) {
                    itemsIndexed(
                        items = uiState.playlistSongs,
                        key = { _, song -> song.id },
                    ) { index, song ->
                        SongListItem(
                            song = song,
                            onClick = { onPlaySong(index) },
                            isLiked = song.neteaseId?.let { it in uiState.likedIds } ?: false,
                            onToggleLike = { onToggleLike(song) },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun PlaylistCard(
    playlist: Playlist,
    backdrop: Backdrop,
    onClick: () -> Unit,
) {
    GlassSurface(
        backdrop = backdrop,
        modifier = Modifier
            .clickable(onClick = onClick)
            .padding(2.dp),
        shape = RoundedCornerShape(18.dp),
        lensHeight = 14.dp,
        lensAmount = 24.dp,
    ) {
        Column {
            AsyncImage(
                model = Format.getOptimizedCoverUrl(playlist.coverImgUrl, 400),
                contentDescription = null,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(150.dp)
                    .clip(RoundedCornerShape(topStart = 18.dp, topEnd = 18.dp)),
                contentScale = ContentScale.Crop,
            )
            Column(Modifier.padding(10.dp)) {
                Text(
                    text = playlist.name,
                    style = MaterialTheme.typography.bodyMedium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Spacer(Modifier.height(4.dp))
                Text(
                    text = "${playlist.trackCount} 首",
                    style = MaterialTheme.typography.labelSmall,
                    color = Color.White.copy(alpha = 0.55f),
                )
            }
        }
    }
}
