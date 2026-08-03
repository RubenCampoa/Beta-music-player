package com.beta.musicplayer.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.beta.musicplayer.data.model.Song
import com.beta.musicplayer.data.util.Format

/**
 * 背景层：当前歌曲封面的模糊光斑 + 深色渐变压暗。
 * 需置于 layerBackdrop 之内，供液态玻璃采样。
 */
@Composable
fun BackgroundLayer(song: Song?) {
    Box(
        Modifier
            .fillMaxSize()
            // Backdrop 的 drawRect 只参与玻璃采样；可见背景仍需在这里
            // 明确铺满，避免全屏播放页把下层主页内容透出来。
            .background(Color(0xFF0D0C12))
    ) {
        if (song != null) {
            AsyncImage(
                model = Format.getOptimizedCoverUrl(song.coverUrl, 300),
                contentDescription = null,
                modifier = Modifier
                    .fillMaxSize()
                    .scale(1.4f)
                    .blur(80.dp)
                    .alpha(0.5f),
                contentScale = ContentScale.Crop,
            )
        }
        Box(
            Modifier
                .fillMaxSize()
                .background(
                    Brush.verticalGradient(
                        colors = listOf(
                            Color(0xA60D0C12),
                            Color(0x3D0D0C12),
                            Color(0x700D0C12),
                        )
                    )
                )
        )
    }
}
