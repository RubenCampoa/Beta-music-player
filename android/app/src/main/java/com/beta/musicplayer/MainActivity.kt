package com.beta.musicplayer

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.CompositionLocalProvider
import com.beta.musicplayer.ui.MainScreen
import com.beta.musicplayer.ui.theme.BetaMusicPlayerTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            BetaMusicPlayerTheme {
                // MaterialTheme 只提供 ColorScheme，不会自动改变根布局的 LocalContentColor。
                // 在应用根部指定 onBackground，所有未显式设色的 Text/Icon 都使用白色。
                CompositionLocalProvider(
                    LocalContentColor provides MaterialTheme.colorScheme.onBackground,
                ) {
                    MainScreen()
                }
            }
        }
    }
}
