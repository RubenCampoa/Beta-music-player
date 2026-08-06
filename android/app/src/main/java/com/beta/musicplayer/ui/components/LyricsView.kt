package com.beta.musicplayer.ui.components

import android.os.Build
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.animateScrollBy
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsDraggedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
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
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.asComposeRenderEffect
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.lerp
import androidx.compose.ui.unit.sp
import com.beta.musicplayer.data.model.LyricLine
import com.beta.musicplayer.data.model.LyricWord
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.isActive
import kotlin.math.abs

/**
 * Apple Music 风格的全屏歌词：支持非当前句高质景深高斯模糊与 YRC 歌曲的逐字流动平滑卡拉OK发光动效。
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

    // 列表负责连续位移；横屏时根据 focusFraction 自动垂直居中到视口正中央
    LaunchedEffect(currentIndex, autoScrollPaused, lyrics) {
        if (!autoScrollPaused && currentIndex in lyrics.indices) {
            val fraction = focusFraction
            if (fraction != null) {
                val viewportHeight = listState.layoutInfo.viewportSize.height
                val visibleItem = listState.layoutInfo.visibleItemsInfo.firstOrNull { it.index == currentIndex }
                val itemHeight = visibleItem?.size ?: with(density) { 60.dp.roundToPx() }
                val targetCenterPx = if (viewportHeight > 0) (viewportHeight * fraction).toInt() else with(density) { 240.dp.roundToPx() }
                val scrollOffsetPx = -(targetCenterPx - itemHeight / 2)

                listState.animateScrollToItem(
                    index = currentIndex,
                    scrollOffset = scrollOffsetPx,
                )
            } else {
                listState.animateScrollToItem(
                    index = currentIndex,
                    scrollOffset = -focusOffsetPx,
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
        contentPadding = PaddingValues(
            top = if (focusFraction != null) 220.dp else 120.dp,
            bottom = if (focusFraction != null) 220.dp else 240.dp,
            start = 24.dp,
            end = 24.dp,
        ),
    ) {
        itemsIndexed(lyrics, key = { index, item -> "${item.time}_${item.text}_$index" }) { index, line ->
            val isCurrent = index == currentIndex
            val distance = abs(index - currentIndex)

            // 景深高斯模糊计算：当前行 Blur = 0px，越远模糊半径线性增大（最高 18px）
            val blurRadiusPx = when {
                isCurrent -> 0f
                distance == 1 -> 5.5f * density.density
                distance == 2 -> 11f * density.density
                else -> 18f * density.density
            }

            val blurEffect = remember(blurRadiusPx) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && blurRadiusPx > 0.1f) {
                    android.graphics.RenderEffect.createBlurEffect(
                        blurRadiusPx,
                        blurRadiusPx,
                        android.graphics.Shader.TileMode.CLAMP
                    ).asComposeRenderEffect()
                } else {
                    null
                }
            }

            // 聚焦比例 calculation
            val clampedFocus = if (isCurrent) 1f else 0f

            // Apple Music 式的缩放（聚焦 1.05x，非聚焦 0.94x ~ 0.88x）
            val targetScale = when {
                isCurrent -> 1.05f
                distance == 1 -> 0.94f
                else -> 0.88f
            }

            val targetAlpha = when {
                isCurrent -> 1.0f
                distance == 1 -> 0.55f
                distance == 2 -> 0.38f
                else -> 0.22f
            }

            // 平滑动画：位移与透明度 transition
            val animatedAlpha by animateFloatAsState(
                targetValue = targetAlpha,
                animationSpec = tween(durationMillis = 320, easing = FastOutSlowInEasing),
                label = "lyricAlpha_$index",
            )
            val animatedScale by animateFloatAsState(
                targetValue = targetScale,
                animationSpec = spring(
                    dampingRatio = 0.72f,
                    stiffness = 380f,
                ),
                label = "lyricScale_$index",
            )

            val translationY by animateFloatAsState(
                targetValue = if (isCurrent) -2.dp.value * density.density else 0f,
                animationSpec = spring(
                    dampingRatio = 0.68f,
                    stiffness = Spring.StiffnessMediumLow,
                ),
                label = "lyricTranslate_$index",
            )

            // Apple Music 3D 景深混合开关：只有系统支持且不是居中景深页时，使用简化样式
            val depthBlurEnabled = focusFraction != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S

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

/** 仅在支持 YRC 逐字歌词的歌曲上启用的网易云/Apple Music 风格逐字流动发光卡拉OK组件 */
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
            YrcWordItem(
                word = word,
                currentSec = currentSec,
                density = density,
            )
        }
    }
}

@Composable
private fun YrcWordItem(
    word: LyricWord,
    currentSec: Double,
    density: Density,
) {
    val wordStart = word.startTime
    val wordEnd = word.startTime + word.duration
    val isSinging = currentSec >= wordStart && currentSec < wordEnd
    val isSung = currentSec >= wordEnd

    val fillProgress = if (word.duration > 0) {
        ((currentSec - wordStart) / word.duration).coerceIn(0.0, 1.0).toFloat()
    } else if (isSung) 1f else 0f

    // 演唱时的弧形抛物线跳跃 (sin(progress * PI) 7dp) 与 1.12x 微放大
    val jumpYPx = if (isSinging) {
        (kotlin.math.sin(fillProgress * Math.PI).toFloat() * -7f * density.density)
    } else 0f

    val scale = if (isSinging) {
        1.0f + (kotlin.math.sin(fillProgress * Math.PI).toFloat() * 0.12f)
    } else 1.0f

    Box(
        modifier = Modifier.graphicsLayer {
            this.translationY = jumpYPx
            this.scaleX = scale
            this.scaleY = scale
        }
    ) {
        // 底层未唱文字（40% 透明度白色）
        Text(
            text = word.text,
            style = MaterialTheme.typography.titleLarge,
            color = Color.White.copy(alpha = 0.40f),
            fontSize = 28.sp,
            lineHeight = 34.sp,
            fontWeight = FontWeight.Bold,
        )

        // 顶层已唱/正在唱文字：由左至右平滑流动发光填充（100% 亮白 + 炫彩发光影）
        if (fillProgress > 0f) {
            Text(
                text = word.text,
                modifier = Modifier.drawWithContent {
                    clipRect(
                        left = 0f,
                        top = 0f,
                        right = size.width * fillProgress,
                        bottom = size.height,
                    ) {
                        this@drawWithContent.drawContent()
                    }
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
                fontWeight = FontWeight.ExtraBold,
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
