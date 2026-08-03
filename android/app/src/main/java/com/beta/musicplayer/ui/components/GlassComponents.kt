package com.beta.musicplayer.ui.components

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.AnimationSpec
import androidx.compose.animation.core.VectorConverter
import androidx.compose.animation.core.VisibilityThreshold
import androidx.compose.animation.core.spring
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CornerBasedShape
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.isSpecified
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import com.kyant.backdrop.Backdrop
import com.kyant.backdrop.backdrops.layerBackdrop
import com.kyant.backdrop.backdrops.rememberCombinedBackdrop
import com.kyant.backdrop.backdrops.rememberLayerBackdrop
import com.kyant.backdrop.drawBackdrop
import com.kyant.backdrop.effects.blur
import com.kyant.backdrop.effects.lens
import com.kyant.backdrop.effects.vibrancy
import kotlinx.coroutines.launch
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.tanh
import kotlin.math.roundToInt

/**
 * 液态玻璃通用容器：从 backdrop 采样绘制模糊 + 透镜效果，叠加半透明表面。
 */
@Composable
fun GlassSurface(
    backdrop: Backdrop,
    modifier: Modifier = Modifier,
    shape: CornerBasedShape = RoundedCornerShape(24.dp),
    tint: Color = Color.White.copy(alpha = 0.08f),
    blurRadius: Dp = 16.dp,
    lensHeight: Dp = 20.dp,
    lensAmount: Dp = 36.dp,
    content: @Composable () -> Unit,
) {
    Box(
        modifier
            .drawBackdrop(
                backdrop = backdrop,
                shape = { shape },
                effects = {
                    vibrancy()
                    blur(blurRadius.toPx())
                    lens(lensHeight.toPx(), lensAmount.toPx())
                },
                onDrawSurface = {
                    if (tint.isSpecified) drawRect(tint)
                },
            )
    ) {
        content()
    }
}

private val IosProgressBlue = Color(0xFF0A84FF)
private val LiquidButtonPressSpec: AnimationSpec<Float> = spring(
    dampingRatio = 0.5f,
    stiffness = 300f,
    visibilityThreshold = 0.001f,
)
private val LiquidButtonOffsetSpec: AnimationSpec<Offset> = spring(
    dampingRatio = 0.5f,
    stiffness = 300f,
    visibilityThreshold = Offset.VisibilityThreshold,
)

/**
 * AndroidLiquidGlass 官方 LiquidButton 的交互材质。
 * 支持圆形按钮、胶囊按钮以及圆角卡片的液态点按、拖拽与高光交互。
 */
@Composable
fun Modifier.liquidButton(
    backdrop: Backdrop,
    onClick: () -> Unit,
    contentDescription: String? = null,
    buttonTint: Color = Color.Unspecified,
    surfaceColor: Color = Color.Unspecified,
    shape: CornerBasedShape = RoundedCornerShape(percent = 50),
): Modifier {
    val animationScope = rememberCoroutineScope()
    val pressProgress = remember { Animatable(0f, 0.001f) }
    val pointerOffsetAnim = remember { Animatable(Offset.Zero, Offset.VectorConverter, Offset.VisibilityThreshold) }
    var startPosition by remember { mutableStateOf(Offset.Zero) }
    val latestOnClick by rememberUpdatedState(onClick)

    return this
        .drawBackdrop(
            backdrop = backdrop,
            shape = { shape },
            effects = {
                vibrancy()
                blur(2.dp.toPx())
                lens(12.dp.toPx(), 24.dp.toPx())
            },
            layerBlock = {
                val width = size.width.coerceAtLeast(1f)
                val height = size.height.coerceAtLeast(1f)
                val progress = pressProgress.value
                val offset = pointerOffsetAnim.value
                val scale = 1f + 4.dp.toPx() / height * progress
                val maxOffset = size.minDimension.coerceAtLeast(1f)
                val offsetAngle = atan2(offset.y, offset.x)
                val maxDragScale = 4.dp.toPx() / height

                translationX = maxOffset * tanh((0.05f * offset.x / maxOffset).toDouble()).toFloat()
                translationY = maxOffset * tanh((0.05f * offset.y / maxOffset).toDouble()).toFloat()
                scaleX = scale +
                    maxDragScale * abs(cos(offsetAngle) * offset.x / size.maxDimension) *
                    (width / height).coerceAtMost(1f)
                scaleY = scale +
                    maxDragScale * abs(sin(offsetAngle) * offset.y / size.maxDimension) *
                    (height / width).coerceAtMost(1f)
            },
            onDrawSurface = {
                // 官方彩色 LiquidButton：Hue 着色后再叠 75% tint，保留折射纹理。
                if (buttonTint.isSpecified) {
                    drawRect(buttonTint, blendMode = BlendMode.Hue)
                    drawRect(buttonTint.copy(alpha = 0.75f))
                }
                if (surfaceColor.isSpecified) {
                    drawRect(surfaceColor)
                }
            },
        )
        .drawWithContent {
            val progress = pressProgress.value
            if (progress > 0f) {
                drawRect(
                    color = Color.White.copy(alpha = 0.08f * progress),
                    blendMode = BlendMode.Plus,
                )
                drawRect(
                    brush = Brush.radialGradient(
                        colors = listOf(
                            Color.White.copy(alpha = 0.15f * progress),
                            Color.Transparent,
                        ),
                        center = startPosition + pointerOffsetAnim.value,
                        radius = size.minDimension * 1.5f,
                    ),
                    blendMode = BlendMode.Plus,
                )
            }
            drawContent()
        }
        .clip(shape)
        .pointerInput(animationScope) {
            awaitEachGesture {
                val down = awaitFirstDown(
                    requireUnconsumed = false,
                    pass = PointerEventPass.Initial,
                )
                startPosition = down.position
                down.consume()
                animationScope.launch {
                    launch { pointerOffsetAnim.snapTo(Offset.Zero) }
                    launch { pressProgress.animateTo(1f, LiquidButtonPressSpec) }
                }

                var pressed = true
                var released = false
                while (pressed) {
                    val event = awaitPointerEvent(PointerEventPass.Initial)
                    val change = event.changes.firstOrNull { it.id == down.id } ?: break
                    val currentOffset = change.position - startPosition
                    animationScope.launch { pointerOffsetAnim.snapTo(currentOffset) }
                    pressed = change.pressed
                    released = !pressed
                    change.consume()
                }

                animationScope.launch {
                    launch { pressProgress.animateTo(0f, LiquidButtonPressSpec) }
                    launch { pointerOffsetAnim.animateTo(Offset.Zero, LiquidButtonOffsetSpec) }
                }
                if (released) latestOnClick()
            }
        }
        .semantics {
            role = Role.Button
            contentDescription?.let { this.contentDescription = it }
            onClick {
                latestOnClick()
                true
            }
        }
}

/** 液态玻璃图标按钮：与官方 LiquidButton 使用相同折射和按压形变。 */
@Composable
fun GlassIconButton(
    backdrop: Backdrop,
    icon: ImageVector,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    contentDescription: String? = null,
    size: Dp = 48.dp,
    iconSize: Dp = 24.dp,
    tint: Color = Color.White.copy(alpha = 0.9f),
    buttonTint: Color = Color.Unspecified,
    surfaceColor: Color = Color.Unspecified,
) {
    Box(
        modifier
            .size(size)
            .liquidButton(
                backdrop = backdrop,
                onClick = onClick,
                contentDescription = contentDescription,
                buttonTint = buttonTint,
                surfaceColor = surfaceColor,
            ),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = tint,
            modifier = Modifier.size(iconSize),
        )
    }
}

/** 液态玻璃交互卡片（歌单卡片/艺术家卡片）：具备完整点按、拖拽位移形变、高光跟手与 Spring 回弹。 */
@Composable
fun GlassCard(
    backdrop: Backdrop,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    shape: CornerBasedShape = RoundedCornerShape(20.dp),
    surfaceColor: Color = Color.White.copy(alpha = 0.08f),
    content: @Composable () -> Unit,
) {
    Box(
        modifier = modifier.liquidButton(
            backdrop = backdrop,
            onClick = onClick,
            surfaceColor = surfaceColor,
            shape = shape,
        ),
    ) {
        content()
    }
}

/**
 * 液态玻璃进度滑块（播放进度/拖动）。
 * value 范围 0f..1f。
 */
@Composable
fun GlassSlider(
    backdrop: Backdrop,
    value: Float,
    onValueChange: (Float) -> Unit,
    modifier: Modifier = Modifier,
    trackHeight: Dp = 6.dp,
    thumbWidth: Dp = 40.dp,
    thumbHeight: Dp = 24.dp,
) {
    val density = LocalDensity.current
    var widthPx by remember { mutableIntStateOf(0) }
    var dragging by remember { mutableFloatStateOf(-1f) }
    val latestOnValueChange by rememberUpdatedState(onValueChange)
    val trackBackdrop = rememberLayerBackdrop()
    val combinedBackdrop = rememberCombinedBackdrop(backdrop, trackBackdrop)

    val current = if (dragging >= 0f) dragging else value
    val thumbWidthPx = with(density) { thumbWidth.toPx() }

    Box(
        modifier
            .fillMaxWidth()
            .height(40.dp)
            .onSizeChanged { widthPx = it.width }
            .pointerInput(widthPx, thumbWidthPx) {
                awaitEachGesture {
                    val down = awaitFirstDown(requireUnconsumed = false)
                    val travel = (widthPx - thumbWidthPx).coerceAtLeast(1f)
                    fun fractionAt(x: Float): Float =
                        ((x - thumbWidthPx / 2f) / travel).coerceIn(0f, 1f)

                    dragging = fractionAt(down.position.x)
                    down.consume()

                    var pressed = true
                    while (pressed) {
                        val event = awaitPointerEvent()
                        val change = event.changes.firstOrNull { it.id == down.id } ?: break
                        dragging = fractionAt(change.position.x)
                        pressed = change.pressed
                        change.consume()
                    }

                    latestOnValueChange(dragging.coerceIn(0f, 1f))
                    dragging = -1f
                }
            },
        contentAlignment = Alignment.CenterStart,
    ) {
        // Glass Slider 教程：先把轨道录入独立 backdrop。
        Box(
            Modifier
                .fillMaxWidth()
                .height(trackHeight)
                .layerBackdrop(trackBackdrop)
                .clip(CircleShape)
                .background(Color.White.copy(alpha = 0.18f))
        ) {
            Canvas(Modifier.fillMaxSize()) {
                drawRoundRect(
                    color = IosProgressBlue,
                    topLeft = Offset.Zero,
                    size = Size(size.width * current, size.height),
                    cornerRadius = CornerRadius(size.height / 2),
                )
            }
        }

        // 拇指同时折射页面背景和进度轨道，并开启色散。
        Box(
            Modifier
                .align(Alignment.CenterStart)
                .offset {
                    IntOffset(
                        x = (current * (widthPx - thumbWidthPx)).roundToInt(),
                        y = 0,
                    )
                }
                .size(thumbWidth, thumbHeight)
                .drawBackdrop(
                    backdrop = combinedBackdrop,
                    shape = { CircleShape },
                    effects = {
                        lens(
                            refractionHeight = 12.dp.toPx(),
                            refractionAmount = 16.dp.toPx(),
                            chromaticAberration = true,
                        )
                    },
                )
        )
    }
}

/**
 * 带环形播放进度圈的液态玻璃播放按钮（对齐参考设计图 Mini Player 右侧按钮）。
 */
@Composable
fun GlassProgressPlayButton(
    backdrop: Backdrop,
    icon: ImageVector,
    progress: Float,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    contentDescription: String? = null,
    size: Dp = 44.dp,
    iconSize: Dp = 22.dp,
    tint: Color = Color.White,
    buttonTint: Color = Color.Unspecified,
    surfaceColor: Color = Color.Unspecified,
) {
    Box(
        modifier
            .size(size)
            .liquidButton(
                backdrop = backdrop,
                onClick = onClick,
                contentDescription = contentDescription,
                buttonTint = buttonTint,
                surfaceColor = surfaceColor,
            ),
        contentAlignment = Alignment.Center,
    ) {
        Canvas(Modifier.fillMaxSize()) {
            val strokePx = 3.dp.toPx()
            val arcSize = size.toPx() - strokePx
            val offset = strokePx / 2f

            // 外围轨道线
            drawArc(
                color = Color.White.copy(alpha = 0.2f),
                startAngle = 0f,
                sweepAngle = 360f,
                useCenter = false,
                topLeft = Offset(offset, offset),
                size = Size(arcSize, arcSize),
                style = androidx.compose.ui.graphics.drawscope.Stroke(width = strokePx),
            )

            // 播放进度高亮弧
            if (progress > 0f) {
                drawArc(
                    color = IosProgressBlue,
                    startAngle = -90f,
                    sweepAngle = progress.coerceIn(0f, 1f) * 360f,
                    useCenter = false,
                    topLeft = Offset(offset, offset),
                    size = Size(arcSize, arcSize),
                    style = androidx.compose.ui.graphics.drawscope.Stroke(width = strokePx),
                )
            }
        }

        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = tint,
            modifier = Modifier.size(iconSize),
        )
    }
}
