package com.beta.musicplayer.ui

import androidx.activity.compose.BackHandler
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
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.GraphicEq
import androidx.compose.material.icons.rounded.ArrowBack
import androidx.compose.material.icons.rounded.KeyboardArrowRight
import androidx.compose.material.icons.rounded.MusicNote
import androidx.compose.material.icons.rounded.Star
import androidx.compose.material3.Icon
import androidx.compose.material3.CircularProgressIndicator
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
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import com.beta.musicplayer.data.model.Artist
import com.beta.musicplayer.data.util.Format
import com.beta.musicplayer.ui.components.GlassCard
import com.beta.musicplayer.ui.components.GlassSurface
import com.beta.musicplayer.ui.components.GlassIconButton
import com.beta.musicplayer.ui.components.SongListItem
import com.beta.musicplayer.ui.theme.AccentPrimary
import com.kyant.backdrop.Backdrop

/**
 * 艺术家/歌手 独立板块页面。
 */
@Composable
fun ArtistsView(
    viewModel: MainViewModel,
    uiState: MainUiState,
    backdrop: Backdrop,
) {
    val topArtists = uiState.artists
    val selectedArtist = uiState.selectedArtist

    if (selectedArtist != null) {
        BackHandler(onBack = viewModel::closeArtist)
        ArtistDetail(
            artist = selectedArtist,
            uiState = uiState,
            backdrop = backdrop,
            onBack = viewModel::closeArtist,
            onPlaySong = { index -> viewModel.playList(uiState.artistSongs, index) },
            onToggleLike = viewModel::toggleLike,
        )
        return
    }

    Column(Modifier.fillMaxSize()) {
        // 1. 页顶大标题
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp, vertical = 12.dp)
        ) {
            Text(
                text = "艺术家",
                style = MaterialTheme.typography.headlineLarge,
                color = Color.White,
                fontWeight = FontWeight.Bold,
            )
            Spacer(Modifier.height(2.dp))
            Text(
                text = "探索全球热门歌手与独立音乐人",
                style = MaterialTheme.typography.bodySmall,
                color = Color.White.copy(alpha = 0.55f),
            )
        }

        LazyColumn(
            modifier = Modifier.weight(1f).fillMaxWidth(),
            contentPadding = PaddingValues(bottom = 170.dp),
        ) {
            // 2. 热门歌手横向 Top 榜
            item {
                Text(
                    text = "热门流行专区",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp),
                )
                LazyRow(
                    contentPadding = PaddingValues(horizontal = 20.dp),
                    horizontalArrangement = Arrangement.spacedBy(14.dp),
                    modifier = Modifier.padding(bottom = 16.dp),
                ) {
                    items(topArtists.take(5)) { artist ->
                        TopArtistHeroCard(
                            artist = artist,
                            backdrop = backdrop,
                            onClick = { viewModel.openArtist(artist) },
                        )
                    }
                }
            }

            // 3. 全部歌手列表区
            item {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 20.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(
                        imageVector = Icons.Rounded.GraphicEq,
                        contentDescription = null,
                        tint = AccentPrimary,
                        modifier = Modifier.size(20.dp),
                    )
                    Spacer(Modifier.width(8.dp))
                    Text(
                        text = "推荐歌手",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.weight(1f),
                    )
                }
            }

            if (uiState.isLoadingArtists && topArtists.isEmpty()) {
                item {
                    Box(
                        modifier = Modifier.fillMaxWidth().height(180.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        CircularProgressIndicator(color = Color.White.copy(alpha = 0.75f))
                    }
                }
            } else if (topArtists.isEmpty()) {
                item {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(160.dp)
                            .clickable { viewModel.loadArtists() },
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            text = uiState.artistsError ?: "网易云热门歌手加载失败，点击重试",
                            color = Color.White.copy(alpha = 0.6f),
                            style = MaterialTheme.typography.bodyMedium,
                        )
                    }
                }
            }

            items(topArtists) { artist ->
                ArtistListItem(
                    artist = artist,
                    backdrop = backdrop,
                    onClick = { viewModel.openArtist(artist) },
                )
            }
        }
    }
}

@Composable
private fun TopArtistHeroCard(
    artist: Artist,
    backdrop: Backdrop,
    onClick: () -> Unit,
) {
    GlassCard(
        backdrop = backdrop,
        onClick = onClick,
        modifier = Modifier.width(140.dp),
        shape = RoundedCornerShape(22.dp),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            AsyncImage(
                model = Format.getOptimizedCoverUrl(artist.avatarUrl, 300),
                contentDescription = artist.name,
                modifier = Modifier
                    .size(90.dp)
                    .clip(CircleShape),
                contentScale = ContentScale.Crop,
            )
            Spacer(Modifier.height(10.dp))
            Text(
                text = artist.name,
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                color = Color.White,
            )
            Spacer(Modifier.height(2.dp))
            Text(
                text = artist.description ?: "热门音乐人",
                style = MaterialTheme.typography.labelSmall,
                color = Color.White.copy(alpha = 0.55f),
                fontSize = 10.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@Composable
private fun ArtistListItem(
    artist: Artist,
    backdrop: Backdrop,
    onClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 20.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        AsyncImage(
            model = Format.getOptimizedCoverUrl(artist.avatarUrl, 200),
            contentDescription = artist.name,
            modifier = Modifier
                .size(54.dp)
                .clip(CircleShape),
            contentScale = ContentScale.Crop,
        )
        Spacer(Modifier.width(14.dp))
        Column(Modifier.weight(1f)) {
            Text(
                text = artist.name,
                style = MaterialTheme.typography.titleMedium,
                color = Color.White,
                fontWeight = FontWeight.SemiBold,
            )
            Spacer(Modifier.height(3.dp))
            Text(
                text = artist.description ?: "知名流行音乐人",
                style = MaterialTheme.typography.bodySmall,
                color = Color.White.copy(alpha = 0.55f),
            )
        }
        GlassIconButton(
            backdrop = backdrop,
            icon = Icons.Rounded.KeyboardArrowRight,
            onClick = onClick,
            contentDescription = "查看歌手歌曲",
            size = 36.dp,
            iconSize = 22.dp,
        )
    }
}

@Composable
private fun ArtistDetail(
    artist: Artist,
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
                contentDescription = "返回艺术家列表",
                size = 40.dp,
                iconSize = 22.dp,
            )
            Spacer(Modifier.width(12.dp))
            Text(
                text = "艺术家",
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
                color = Color.White,
            )
        }

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            AsyncImage(
                model = Format.getOptimizedCoverUrl(artist.avatarUrl, 360),
                contentDescription = artist.name,
                modifier = Modifier
                    .size(104.dp)
                    .clip(CircleShape),
                contentScale = ContentScale.Crop,
            )
            Spacer(Modifier.width(16.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    text = artist.name,
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold,
                    color = Color.White,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                Spacer(Modifier.height(5.dp))
                Text(
                    text = "${artist.musicCount} 首单曲 · ${artist.albumCount} 张专辑",
                    style = MaterialTheme.typography.bodySmall,
                    color = Color.White.copy(alpha = 0.58f),
                )
                artist.description?.takeIf { it.isNotBlank() }?.let { description ->
                    Spacer(Modifier.height(5.dp))
                    Text(
                        text = description,
                        style = MaterialTheme.typography.labelSmall,
                        color = Color.White.copy(alpha = 0.45f),
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(start = 20.dp, end = 20.dp, top = 12.dp, bottom = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                imageVector = Icons.Rounded.GraphicEq,
                contentDescription = null,
                tint = AccentPrimary,
                modifier = Modifier.size(20.dp),
            )
            Spacer(Modifier.width(8.dp))
            Text(
                text = "热门歌曲",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                color = Color.White,
            )
        }

        when {
            uiState.isLoadingArtistSongs -> {
                Box(
                    modifier = Modifier.weight(1f).fillMaxWidth(),
                    contentAlignment = Alignment.Center,
                ) {
                    CircularProgressIndicator(color = Color.White.copy(alpha = 0.75f))
                }
            }

            uiState.artistSongsError != null -> {
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxWidth()
                        .padding(24.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = uiState.artistSongsError,
                        style = MaterialTheme.typography.bodyMedium,
                        color = Color.White.copy(alpha = 0.58f),
                    )
                }
            }

            else -> {
                LazyColumn(
                    modifier = Modifier.weight(1f).fillMaxWidth(),
                    contentPadding = PaddingValues(bottom = 170.dp),
                ) {
                    itemsIndexed(
                        items = uiState.artistSongs,
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
