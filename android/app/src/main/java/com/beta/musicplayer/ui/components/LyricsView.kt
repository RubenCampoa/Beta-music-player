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
import androidx.compose.foundation.layout.fillMaxHeight
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
import androidx.compose.runtime.snapshotFlow
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
import androidx.compose.ui.unit.lerp
import androidx.compose.ui.unit.sp
import com.beta.musicplayer.data.model.LyricLine
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.isActive
import kotlin.math.abs

import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.ui.input.pointer.pointerInput

import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.withStyle

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import com.beta.musicplayer.data.model.LyricWord

/**
 * Apple Music 风格的全屏歌词：支持非当前句高质景深高斯模糊与 YRC 歌曲的非线性逐字跳跃动效。
 */
@Composable
fun LyricsView(
    lyrics: List<LyricLine>,
    positionProvider: () -> Long,
    onSeekTo: (Long) -> Unit,
    modifier: Modifier = Modifier,
    onTap: (() -> Unit)? = null,
    // 底部控制区隐藏时禁止歌词行点击跳转，此时任意位置点击只负责调出 UI
    lineSeekEnabled: Boolean = true,
    // 聚焦行在视口中的垂直位置比例：null = 默认距顶 116dp；横屏传 0.5f 让当前行垂直居中
    focusFraction: Float? = null,
    // 竖屏景深模糊开关：横屏传 false 切换 Apple Music 式"清晰度/尺寸层次"（无重度磨砂 Blur）
    depthBlurEnabled: Boolean = true,
) {
    if (lyrics.isEmpty()) {
        Box(
            modifier = modifier
                .fillMaxHeight()
                .then(
                    if (onTap != null) {
                        Modifier.pointerInput(onTap) {
                            detectTapGestures { onTap() }
                        }
                    } else Modifier
                ),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = "暂无歌词",
                color = Color.White.copy(alpha = 0.45f),
                style = MaterialTheme.typography.bodyMedium,
            )
        }
        return
    }

    var currentPositionMs by remember { mutableStateOf(positionProvider()) }
    var currentIndex by remember(lyrics) {
        mutableIntStateOf(lyrics.findCurrentIndex(currentPositionMs))
    }
    val listState = rememberLazyListState()
    val isUserDragging by listState.interactionSource.collectIsDraggedAsState()
    var autoScrollPaused by remember { mutableStateOf(false) }
    val density = LocalDensity.current
    val focusOffsetPx = with(density) { 116.dp.roundToPx() }

    // 全屏歌词 20Hz 局部高频更新，驱动逐字高亮与滚动。
    LaunchedEffect(lyrics, positionProvider) {
        while (isActive) {
            val pos = positionProvider()
            currentPositionMs = pos
            val nextIndex = lyrics.findCurrentIndex(pos)
            if (nextIndex != currentIndex) currentIndex = nextIndex
            delay(50)
        }
    }

    // 只把真实手势视为用户滚动；animateScrollToItem 不再取消它自己。
    LaunchedEffect(isUserDragging) {
        if (isUserDragging) {
            autoScrollPaused = true
            onTap?.invoke()
        } else if (autoScrollPaused) {
            delay(1_600)
            autoScrollPaused = false
        }
    }

    // 列表负责连续位移；横屏居中 / 竖屏距顶 116dp 均按实测行位置用 animateScrollBy 对齐
    // （不能用 animateScrollToItem 传负 scrollOffset：该参数要求 >= 0，负值会导致滚动失效）
    LaunchedEffect(currentIndex, autoScrollPaused, lyrics) {
        if (!autoScrollPaused && currentIndex in lyrics.indices) {
            val centered = focusFraction != null
            val targetPx = if (centered) {
                (listState.layoutInfo.viewportSize.height * focusFraction!!).toInt()
            } else {
                focusOffsetPx
            }
            var item = listState.layoutInfo.visibleItemsInfo
                .firstOrNull { it.index == currentIndex }
            if (item == null) {
                // 远距离跳转：先无动画定位，等布局完成后再按实测位置精确对齐
                listState.scrollToItem(currentIndex)
                item = snapshotFlow {
                    listState.layoutInfo.visibleItemsInfo.firstOrNull { it.index == currentIndex }
                }.first { it != null }!!
            }
            val distance = if (centered) {
                // 行中心对齐到视口指定比例处（0.5f = 垂直居中）
                item.offset + item.size / 2 - targetPx
            } else {
                item.offset - targetPx
            }
            if (abs(distance) > 0.5f) {
                listState.animateScrollBy(
                    value = distance.toFloat(),
                    animationSpec = spring(
                        dampingRatio = 0.72f,
                        stiffness = 360f,
                        visibilityThreshold = 0.5f,
                    ),
                )
            }
        }
    }

    // 只撑满高度、不覆盖宽度：横屏时外部会传入固定宽度约束（如 0.58f 宽靠右），
    // 若此处 fillMaxSize 会把宽度重新撑到约束上限导致歌词铺满全屏与封面重叠。
    LazyColumn(
        state = listState,
        modifier = modifier
            .fillMaxHeight()
            .then(
                if (onTap != null) {
                    Modifier.pointerInput(onTap) {
                        detectTapGestures { onTap() }
                    }
                } else Modifier
            ),
        contentPadding = if (focusFraction != null) {
            // 居中模式需要上下留出约半屏的可滚空间，才能让首/尾行也对齐到视口中部
            PaddingValues(
                top = 300.dp,
                bottom = 300.dp,
                start = 22.dp,
                end = 22.dp,
            )
        } else {
            PaddingValues(
                top = 112.dp,
                bottom = 224.dp,
                start = 22.dp,
                end = 22.dp,
            )
        },
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
                    index < currentIndex -> (-4).dp
                    else -> 6.dp
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

            val restingAlpha = if (depthBlurEnabled) {
                when (distance) {
                    0 -> 1f
                    1 -> 0.36f
                    2 -> 0.26f
                    else -> 0.14f
                }
            } else {
                // Apple Music 横屏：邻句清晰但变淡，不过度压暗
                when (distance) {
                    0 -> 1f
                    1 -> 0.55f
                    2 -> 0.35f
                    else -> 0.22f
                }
            }
            val animatedAlpha by animateFloatAsState(
                targetValue = restingAlpha,
                animationSpec = if (depthBlurEnabled) {
                    tween(
                        durationMillis = 170,
                        easing = FastOutSlowInEasing,
                    )
                } else {
                    // Apple Music 式切行：弹簧柔和过渡带轻微回弹
                    spring(
                        dampingRatio = 0.8f,
                        stiffness = 300f,
                        visibilityThreshold = 0.001f,
                    )
                },
                label = "lyricAlpha",
            )
            val clampedFocus = focusProgress.coerceIn(0f, 1f)
            val animatedScale = if (depthBlurEnabled) {
                0.86f + 0.14f * focusProgress
            } else {
                0.92f + 0.08f * focusProgress
            }

            // 参考图高质景深模糊：非当前句根据距离呈现 7.5px..22px 磨砂玻璃 Blur。
            val blurBucket = when {
                Build.VERSION.SDK_INT < Build.VERSION_CODES.S -> 0
                distance == 0 -> 0
                distance == 1 -> 1
                distance == 2 -> 2
                else -> 3
            }
            val blurEffect = remember(blurBucket, depthBlurEnabled) {
                if (!depthBlurEnabled || blurBucket == 0) {
                    null
                } else {
                    val radius = when (blurBucket) {
                        1 -> 7.5f
                        2 -> 14f
                        else -> 22f
                    }
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
                        enabled = lineSeekEnabled,
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
                if (isCurrent && line.isYrc && line.words.isNotEmpty()) {
                    YrcKaraokeLine(
                        words = line.words,
                        currentPositionMs = currentPositionMs,
                    )
                } else {
                    // Apple Music 式聚焦：当前行字号随 focusProgress 从 28sp 放大到 32sp
                    val animatedFontSize = if (depthBlurEnabled) {
                        28.sp
                    } else {
                        lerp(28.sp, 32.sp, clampedFocus)
                    }
                    val animatedLineHeight = if (depthBlurEnabled) {
                        34.sp
                    } else {
                        lerp(34.sp, 38.sp, clampedFocus)
                    }
                    Text(
                        text = line.text,
                        modifier = Modifier.fillMaxWidth(),
                        style = MaterialTheme.typography.titleLarge.copy(
                            shadow = Shadow(
                                color = Color.White.copy(alpha = 0.5f * clampedFocus),
                                blurRadius = 18f * clampedFocus,
                            ),
                        ),
                        color = Color.White,
                        fontSize = animatedFontSize,
                        lineHeight = animatedLineHeight,
                        fontWeight = FontWeight.Black,
                        textAlign = TextAlign.Start,
                    )
                }

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

/** 仅在支持 YRC 逐字歌词的歌曲上启用的非线性 3D 跳跃高亮组件 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun YrcKaraokeLine(
    words: List<LyricWord>,
    currentPositionMs: Long,
) {
    val currentSec = currentPositionMs / 1000.0
    val density = LocalDensity.current

    FlowRow(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.Start,
    ) {
        words.forEach { word ->
            val wordStart = word.startTime
            val wordEnd = word.startTime + word.duration
            val wordProgress = if (word.duration > 0) {
                ((currentSec - wordStart) / word.duration).coerceIn(0.0, 1.0).toFloat()
            } else 0f

            val isSinging = currentSec >= wordStart && currentSec < wordEnd
            val isSung = currentSec >= wordEnd

            // 非线性抛物线跳跃与 Spring 回弹（sin(progress * PI) 弧形跃起 7dp）
            val jumpYPx = if (isSinging) {
                (kotlin.math.sin(wordProgress * Math.PI).toFloat() * -7f * density.density)
            } else 0f

            val scale = if (isSinging) {
                1.0f + (kotlin.math.sin(wordProgress * Math.PI).toFloat() * 0.16f)
            } else 1.0f

            val alpha = when {
                isSinging -> 1f
                isSung -> 1f
                else -> 0.40f
            }

            Text(
                text = word.text,
                modifier = Modifier
                    .graphicsLayer {
                        this.translationY = jumpYPx
                        this.scaleX = scale
                        this.scaleY = scale
                        this.alpha = alpha
                    },
                style = MaterialTheme.typography.titleLarge.copy(
                    shadow = if (isSinging) Shadow(
                        color = Color.White.copy(alpha = 0.95f),
                        blurRadius = 18f,
                    ) else null,
                ),
                color = Color.White,
                fontSize = 28.sp,
                lineHeight = 34.sp,
                fontWeight = if (isSinging || isSung) FontWeight.ExtraBold else FontWeight.Bold,
            )
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
