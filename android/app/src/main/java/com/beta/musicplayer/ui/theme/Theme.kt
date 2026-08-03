package com.beta.musicplayer.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

// 深色为主的调色板，配合液态玻璃的深色底衬
val AccentPrimary = Color(0xFF8B7CF6)
val AccentSecondary = Color(0xFF6EC1E4)
val AccentTertiary = Color(0xFFF4897B)
val FavoriteRed = Color(0xFFFF3B30)

private val DarkColorScheme = darkColorScheme(
    primary = AccentPrimary,
    secondary = AccentSecondary,
    tertiary = AccentTertiary,
    background = Color(0xFF0D0C12),
    surface = Color(0xFF15131C),
    surfaceVariant = Color(0xFF1E1B28),
    onPrimary = Color(0xFFFFFFFF),
    onSecondary = Color(0xFF00201F),
    onBackground = Color.White,
    onSurface = Color.White,
    onSurfaceVariant = Color.White.copy(alpha = 0.72f),
)

@Composable
fun BetaMusicPlayerTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = DarkColorScheme,
        content = content,
    )
}
