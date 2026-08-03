package com.beta.musicplayer.ui.components

import android.os.Build
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.animateScrollBy
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsDraggedAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.asComposeRenderEffect
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.beta.musicplayer.data.model.LyricLine
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlin.math.abs

/**
 * Apple Music 风格的全屏歌词。
 *
 * 排版尺寸在换句时保持不变，焦点仅通过 GPU 层的位移、缩放和透明度弹簧过渡，
 * 避免字体重排与列表滚动互相争抢主线程。程序滚动和用户拖动也使用独立状态。
 */
@Composable
fun LyricsView(
    lyrics: List<LyricLine>,
    positionProvider: () -> Long,
    onSeekTo: (Long) -> Unit,
    modifier: Modifier = Modifier,
) {
    if (lyrics.isEmpty()) {
        Box(modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text(
                text = "暂无歌词",
                color = Color.White.copy(alpha = 0.45f),
                style = MaterialTheme.typography.bodyMedium,
            )
        }
        return
    }

    var currentIndex by remember(lyrics) {
        mutableIntStateOf(lyrics.findCurrentIndex(positionProvider()))
    }
    val listState = rememberLazyListState()
    val isUserDragging by listState.interactionSource.collectIsDraggedAsState()
    var autoScrollPaused by remember { mutableStateOf(false) }
    val density = LocalDensity.current
    val focusOffsetPx = with(density) { 116.dp.roundToPx() }

    // 全屏歌词使用局部 20Hz 时钟，但只在歌词索引真正变化时写入状态。
    // 因此切句延迟低于 50ms，也不会让整个播放器页面以 20Hz 重组。
    LaunchedEffect(lyrics, positionProvider) {
        while (isActive) {
            val nextIndex = lyrics.findCurrentIndex(positionProvider())
            if (nextIndex != currentIndex) currentIndex = nextIndex
            delay(50)
        }
    }

    // 只把真实手势视为用户滚动；animateScrollToItem 不再取消它自己。
    LaunchedEffect(isUserDragging) {
        if (isUserDragging) {
            autoScrollPaused = true
        } else if (autoScrollPaused) {
            delay(1_600)
            autoScrollPaused = false
        }
    }

    // 列表负责连续位移；相邻换句使用可回弹的滚动弹簧，远距离跳转则直接定位。
    LaunchedEffect(currentIndex, autoScrollPaused, lyrics) {
        if (!autoScrollPaused && currentIndex in lyrics.indices) {
            val currentItem = listState.layoutInfo.visibleItemsInfo
                .firstOrNull { it.index == currentIndex }
            if (currentItem == null) {
                listState.scrollToItem(currentIndex, scrollOffset = -focusOffsetPx)
            } else {
                val distanceToFocus = (currentItem.offset - focusOffsetPx).toFloat()
                if (abs(distanceToFocus) > 0.5f) {
                    listState.animateScrollBy(
                        value = distanceToFocus,
                        animationSpec = spring(
                            dampingRatio = 0.72f,
                            stiffness = 360f,
                            visibilityThreshold = 0.5f,
                        ),
                    )
                }
            }
        }
    }

    LazyColumn(
        state = listState,
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(
            top = 112.dp,
            bottom = 224.dp,
            start = 22.dp,
            end = 22.dp,
        ),
    ) {
        itemsIndexed(
            items = lyrics,
            key = { index, line -> "${index}_${line.time}_${line.text}" },
        ) { index, line ->
            val isCurrent = index == currentIndex
            val distance = abs(index - currentIndex)

            val focusProgress by animateFloatAsState(
                targetValue = if (isCurrent) 1f else 0f,
                animationSpec = spring(
                    dampingRatio = 0.62f,
                    stiffness = 320f,
                    visibilityThreshold = 0.001f,
                ),
                label = "lyricFocus",
            )
            val targetTranslationY = with(density) {
                when {
                    isCurrent -> 0.dp
                    index < currentIndex -> (-5).dp
                    else -> 7.dp
                }.toPx()
            }
            val translationY by animateFloatAsState(
                targetValue = targetTranslationY,
                animationSpec = spring(
                    dampingRatio = Spring.DampingRatioMediumBouncy,
                    stiffness = Spring.StiffnessMediumLow,
                    visibilityThreshold = 0.1f,
                ),
                label = "lyricTranslation",
            )

            val restingAlpha = when (distance) {
                0 -> 1f
                1 -> 0.42f
                2 -> 0.25f
                else -> 0.13f
            }
            val animatedAlpha by animateFloatAsState(
                targetValue = restingAlpha,
                animationSpec = tween(
                    durationMillis = 170,
                    easing = FastOutSlowInEasing,
                ),
                label = "lyricAlpha",
            )
            val clampedFocus = focusProgress.coerceIn(0f, 1f)
            // focusProgress 可轻微超过 1，使当前句到位后产生自然的果冻回弹。
            val animatedScale = 0.92f + 0.08f * focusProgress

            // 相邻两句保持清晰，焦点交接时不会突然切换 RenderEffect。
            // 只有远端歌词使用缓存模糊，兼顾参考图的景深与滚动性能。
            val blurBucket = when {
                Build.VERSION.SDK_INT < Build.VERSION_CODES.S -> 0
                distance <= 1 -> 0
                distance == 2 -> 1
                else -> 2
            }
            val blurEffect = remember(blurBucket) {
                if (blurBucket == 0) {
                    null
                } else {
                    val radius = if (blurBucket == 1) 3.5f else 6.5f
                    android.graphics.RenderEffect.createBlurEffect(
                        radius,
                        radius,
                        android.graphics.Shader.TileMode.CLAMP,
                    ).asComposeRenderEffect()
                }
            }

            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                        onClick = {
                            autoScrollPaused = false
                            onSeekTo((line.time * 1_000).toLong())
                        },
                    )
                    .graphicsLayer {
                        alpha = animatedAlpha
                        scaleX = animatedScale
                        scaleY = animatedScale
                        this.translationY = translationY
                        transformOrigin = TransformOrigin(0f, 0.5f)
                        renderEffect = blurEffect
                    }
                    .padding(vertical = 7.dp),
                horizontalAlignment = Alignment.Start,
            ) {
                Text(
                    text = line.text,
                    modifier = Modifier.fillMaxWidth(),
                    style = MaterialTheme.typography.titleLarge.copy(
                        shadow = Shadow(
                            color = Color.White.copy(alpha = 0.22f * clampedFocus),
                            blurRadius = 11f * clampedFocus,
                        ),
                    ),
                    color = Color.White,
                    fontSize = 28.sp,
                    lineHeight = 34.sp,
                    fontWeight = FontWeight.ExtraBold,
                    textAlign = TextAlign.Start,
                )

                line.translation?.takeIf { it.isNotBlank() }?.let { translation ->
                    Spacer(Modifier.height(3.dp))
                    Text(
                        text = translation,
                        modifier = Modifier.fillMaxWidth(),
                        style = MaterialTheme.typography.bodyMedium,
                        color = Color.White.copy(alpha = 0.76f),
                        fontSize = 16.sp,
                        lineHeight = 20.sp,
                        fontWeight = FontWeight.Bold,
                        textAlign = TextAlign.Start,
                    )
                }
            }
        }
    }
}

/** O(log n) 查询，避免播放进度每次刷新时遍历整份歌词。 */
private fun List<LyricLine>.findCurrentIndex(currentTimeMs: Long): Int {
    var low = 0
    var high = lastIndex
    var result = 0

    while (low <= high) {
        val middle = (low + high).ushr(1)
        if (this[middle].time * 1_000 <= currentTimeMs) {
            result = middle
            low = middle + 1
        } else {
            high = middle - 1
        }
    }
    return result.coerceIn(indices)
}
