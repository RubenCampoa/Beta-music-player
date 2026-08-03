package com.beta.musicplayer.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ChevronRight
import androidx.compose.material.icons.rounded.Favorite
import androidx.compose.material.icons.rounded.Person
import androidx.compose.material.icons.rounded.PhoneAndroid
import androidx.compose.material.icons.rounded.QrCodeScanner
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.beta.musicplayer.data.model.Song
import com.beta.musicplayer.data.model.UserProfile
import com.beta.musicplayer.data.util.Format
import com.beta.musicplayer.ui.components.GlassSurface
import com.beta.musicplayer.ui.components.SongListItem
import com.beta.musicplayer.ui.theme.FavoriteRed
import com.kyant.backdrop.Backdrop
import androidx.compose.runtime.remember
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.Base64
import kotlinx.coroutines.delay

/**
 * 我的页：登录状态 + 红心收藏列表。
 */
@Composable
fun MeView(
    viewModel: MainViewModel,
    uiState: MainUiState,
    backdrop: Backdrop,
) {
    var showLogoutConfirm by rememberSaveable { mutableStateOf(false) }

    Box(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize()) {
            // 账号卡片
            if (uiState.user == null) {
                LoginCard(onLogin = { viewModel.startLogin() }, backdrop = backdrop)
            } else {
                ProfileCard(
                    user = uiState.user,
                    backdrop = backdrop,
                    onLogout = { showLogoutConfirm = true },
                )
            }

            Spacer(Modifier.height(8.dp))

            // 红心收藏
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 20.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(
                    imageVector = Icons.Rounded.Favorite,
                    contentDescription = null,
                    tint = FavoriteRed,
                    modifier = Modifier.size(20.dp),
                )
                Spacer(Modifier.width(8.dp))
                Text(
                    text = "我喜欢的音乐",
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.weight(1f),
                )
                Text(
                    text = "${uiState.likedIds.size} 首",
                    style = MaterialTheme.typography.labelMedium,
                    color = Color.White.copy(alpha = 0.5f),
                )
            }

            when {
                uiState.isLoadingLiked -> {
                    Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(color = Color.White.copy(alpha = 0.7f))
                    }
                }

                uiState.likedSongs.isEmpty() -> {
                    Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                        Text(
                            text = if (uiState.user == null) "登录后同步云端红心" else "还没有收藏的歌曲",
                            color = Color.White.copy(alpha = 0.4f),
                            style = MaterialTheme.typography.bodyMedium,
                        )
                    }
                }

                else -> {
                    LazyColumn(
                        modifier = Modifier.weight(1f).fillMaxWidth(),
                        contentPadding = PaddingValues(bottom = 170.dp),
                    ) {
                        items(uiState.likedSongs, key = { it.id }) { song ->
                            SongListItem(
                                song = song,
                                onClick = {
                                    val index = uiState.likedSongs.indexOfFirst { it.id == song.id }
                                    viewModel.playList(uiState.likedSongs, index.coerceAtLeast(0))
                                },
                                isLiked = true,
                                onToggleLike = { viewModel.toggleLike(song) },
                            )
                        }
                    }
                }
            }
        }

        if (uiState.isLoginSheetVisible) {
            LoginSheet(viewModel = viewModel, uiState = uiState)
        }

        if (showLogoutConfirm) {
            AlertDialog(
                onDismissRequest = { showLogoutConfirm = false },
                title = { Text("退出账号") },
                text = { Text("将退出网易云账号，并清除本机保存的登录凭据。") },
                confirmButton = {
                    TextButton(
                        onClick = {
                            showLogoutConfirm = false
                            viewModel.logout()
                        },
                    ) {
                        Text("退出", color = FavoriteRed)
                    }
                },
                dismissButton = {
                    TextButton(onClick = { showLogoutConfirm = false }) { Text("取消") }
                },
            )
        }
    }
}

@Composable
private fun LoginCard(onLogin: () -> Unit, backdrop: Backdrop) {
    GlassSurface(
        backdrop = backdrop,
        modifier = Modifier
            .fillMaxWidth()
            .padding(16.dp)
            .clickable(onClick = onLogin),
        shape = RoundedCornerShape(24.dp),
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                imageVector = Icons.Rounded.Person,
                contentDescription = null,
                tint = Color.White.copy(alpha = 0.8f),
                modifier = Modifier.size(48.dp),
            )
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f)) {
                Text("未登录", style = MaterialTheme.typography.titleMedium)
                Spacer(Modifier.height(4.dp))
                Text(
                    text = "登录网易云账号，同步红心收藏与歌单",
                    style = MaterialTheme.typography.bodySmall,
                    color = Color.White.copy(alpha = 0.55f),
                )
            }
            Icon(
                imageVector = Icons.Rounded.ChevronRight,
                contentDescription = null,
                tint = Color.White.copy(alpha = 0.5f),
            )
        }
    }
}

@Composable
private fun ProfileCard(user: UserProfile, backdrop: Backdrop, onLogout: () -> Unit) {
    GlassSurface(
        backdrop = backdrop,
        modifier = Modifier
            .fillMaxWidth()
            .padding(16.dp),
        shape = RoundedCornerShape(24.dp),
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            AsyncImage(
                model = Format.getOptimizedCoverUrl(user.avatarUrl, 200),
                contentDescription = "头像",
                modifier = Modifier
                    .size(56.dp)
                    .clip(CircleShape),
                contentScale = ContentScale.Crop,
            )
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f)) {
                Text(user.nickname, style = MaterialTheme.typography.titleMedium)
                if (!user.signature.isNullOrBlank()) {
                    Spacer(Modifier.height(4.dp))
                    Text(
                        text = user.signature,
                        style = MaterialTheme.typography.bodySmall,
                        color = Color.White.copy(alpha = 0.55f),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            TextButton(onClick = onLogout) {
                Text("退出账号", color = FavoriteRed, style = MaterialTheme.typography.labelLarge)
            }
        }
    }
}



private fun parseBase64QrBitmap(dataUri: String?): Bitmap? {
    if (dataUri.isNullOrBlank()) return null
    return try {
        val base64Str = if (dataUri.contains(",")) dataUri.substringAfter(",") else dataUri
        val bytes = Base64.decode(base64Str, Base64.DEFAULT)
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
    } catch (e: Exception) {
        null
    }
}

/** 网易云账号登录弹层：支持手机号验证码与二维码两种方式。 */
@Composable
private fun LoginSheet(viewModel: MainViewModel, uiState: MainUiState) {
    val qrBitmap = remember(uiState.qrImage) {
        parseBase64QrBitmap(uiState.qrImage)
    }
    var apiBaseUrl by remember(uiState.apiBaseUrl) { mutableStateOf(uiState.apiBaseUrl) }
    var phoneMode by rememberSaveable { mutableStateOf(false) }
    var countryCode by rememberSaveable { mutableStateOf("86") }
    var phone by rememberSaveable { mutableStateOf("") }
    var captcha by rememberSaveable { mutableStateOf("") }
    var captchaCountdown by remember { mutableIntStateOf(0) }

    LaunchedEffect(uiState.captchaSentAt) {
        while (uiState.captchaSentAt > 0L) {
            val remainingMillis = uiState.captchaSentAt + 60_000L - System.currentTimeMillis()
            captchaCountdown = ((remainingMillis + 999L) / 1_000L).toInt().coerceIn(0, 60)
            if (captchaCountdown == 0) break
            delay(250)
        }
    }

    Box(
        Modifier
            .fillMaxSize()
            .background(Color(0xCC0D0C12))
            .imePadding()
            .clickable { viewModel.closeLogin() },
        contentAlignment = Alignment.Center,
    ) {
        Box(
            modifier = Modifier
                .padding(horizontal = 24.dp, vertical = 16.dp)
                .fillMaxWidth()
                .clip(RoundedCornerShape(28.dp))
                .background(Color(0xFF22202A))
                .clickable(onClick = {}),
        ) {
            Column(
                modifier = Modifier
                    .padding(20.dp)
                    .verticalScroll(rememberScrollState()),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = if (phoneMode) Icons.Rounded.PhoneAndroid else Icons.Rounded.QrCodeScanner,
                        contentDescription = null,
                        tint = Color.White.copy(alpha = 0.9f),
                        modifier = Modifier.size(22.dp),
                    )
                    Spacer(Modifier.width(8.dp))
                    Text("登录网易云音乐", style = MaterialTheme.typography.titleMedium, color = Color.White)
                }
                Spacer(Modifier.height(12.dp))
                Row(Modifier.fillMaxWidth()) {
                    TextButton(
                        onClick = {
                            if (phoneMode) {
                                phoneMode = false
                                viewModel.startLogin()
                            }
                        },
                        modifier = Modifier.weight(1f),
                    ) {
                        Text(
                            "二维码登录",
                            color = if (!phoneMode) FavoriteRed else Color.White.copy(alpha = 0.55f),
                        )
                    }
                    TextButton(
                        onClick = {
                            if (!phoneMode) {
                                phoneMode = true
                                viewModel.openPhoneLogin()
                            }
                        },
                        modifier = Modifier.weight(1f),
                    ) {
                        Text(
                            "手机验证码",
                            color = if (phoneMode) FavoriteRed else Color.White.copy(alpha = 0.55f),
                        )
                    }
                }
                Spacer(Modifier.height(12.dp))

                if (phoneMode) {
                    Text(
                        text = "提示：网易云官方已对第三方验证码作风控限制。如收到报错或提示受限，推荐点击上方【二维码登录】使用 App 扫码瞬间完成登录",
                        color = Color(0xFFFBBF24),
                        style = MaterialTheme.typography.labelSmall,
                        modifier = Modifier.padding(bottom = 10.dp),
                    )
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        OutlinedTextField(
                            value = countryCode,
                            onValueChange = { countryCode = it.filter(Char::isDigit).take(4) },
                            label = { Text("国家代号") },
                            prefix = { Text("+") },
                            singleLine = true,
                            keyboardOptions = KeyboardOptions(
                                keyboardType = KeyboardType.Number,
                                imeAction = ImeAction.Next,
                            ),
                            modifier = Modifier.width(108.dp),
                        )
                        Spacer(Modifier.width(10.dp))
                        OutlinedTextField(
                            value = phone,
                            onValueChange = { phone = it.filter(Char::isDigit).take(20) },
                            label = { Text("手机号") },
                            singleLine = true,
                            keyboardOptions = KeyboardOptions(
                                keyboardType = KeyboardType.Phone,
                                imeAction = ImeAction.Next,
                            ),
                            modifier = Modifier.weight(1f),
                        )
                    }
                    Spacer(Modifier.height(10.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        OutlinedTextField(
                            value = captcha,
                            onValueChange = { captcha = it.filter(Char::isDigit).take(8) },
                            label = { Text("短信验证码") },
                            singleLine = true,
                            keyboardOptions = KeyboardOptions(
                                keyboardType = KeyboardType.NumberPassword,
                                imeAction = ImeAction.Done,
                            ),
                            modifier = Modifier.weight(1f),
                        )
                        Spacer(Modifier.width(8.dp))
                        TextButton(
                            onClick = { viewModel.sendPhoneCaptcha(phone, countryCode) },
                            enabled = phone.length >= 6 && captchaCountdown == 0 && !uiState.isCaptchaSending,
                        ) {
                            if (uiState.isCaptchaSending) {
                                CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
                            } else {
                                Text(if (captchaCountdown > 0) "${captchaCountdown}s" else "发送验证码")
                            }
                        }
                    }
                    Spacer(Modifier.height(14.dp))
                    Button(
                        onClick = { viewModel.loginWithPhoneCaptcha(phone, captcha, countryCode) },
                        enabled = phone.length >= 6 && captcha.length >= 4 && !uiState.isPhoneLoginLoading,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        if (uiState.isPhoneLoginLoading) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(20.dp),
                                strokeWidth = 2.dp,
                                color = Color.White,
                            )
                            Spacer(Modifier.width(8.dp))
                        }
                        Text(if (uiState.isPhoneLoginLoading) "正在登录" else "登录")
                    }
                    if (!uiState.phoneLoginMessage.isNullOrBlank()) {
                        Spacer(Modifier.height(8.dp))
                        Text(
                            text = uiState.phoneLoginMessage,
                            color = FavoriteRed,
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                } else {
                    when {
                        uiState.isLoginLoading -> {
                            Box(Modifier.size(200.dp), contentAlignment = Alignment.Center) {
                                CircularProgressIndicator(
                                    color = Color.White.copy(alpha = 0.7f),
                                    modifier = Modifier.size(48.dp),
                                )
                            }
                        }

                        qrBitmap != null -> {
                            AsyncImage(
                                model = qrBitmap,
                                contentDescription = "登录二维码",
                                modifier = Modifier.size(200.dp).clip(RoundedCornerShape(12.dp)),
                                contentScale = ContentScale.Fit,
                            )
                        }

                        !uiState.qrImage.isNullOrBlank() -> {
                            AsyncImage(
                                model = uiState.qrImage,
                                contentDescription = "登录二维码",
                                modifier = Modifier.size(200.dp).clip(RoundedCornerShape(12.dp)),
                                contentScale = ContentScale.Fit,
                            )
                        }

                        else -> {
                            Box(Modifier.size(200.dp), contentAlignment = Alignment.Center) {
                                Text(
                                    text = uiState.qrMessage ?: "正在获取二维码...",
                                    color = Color.White.copy(alpha = 0.7f),
                                    style = MaterialTheme.typography.bodyMedium,
                                )
                            }
                        }
                    }
                    Spacer(Modifier.height(8.dp))
                    Text(
                        text = uiState.qrMessage ?: "请使用网易云音乐 App 扫码",
                        color = Color.White.copy(alpha = 0.6f),
                        style = MaterialTheme.typography.bodySmall,
                    )
                    Text(
                        text = "二维码失效后点击重新获取",
                        color = FavoriteRed,
                        style = MaterialTheme.typography.labelSmall,
                        modifier = Modifier.clickable { viewModel.startLogin() }.padding(8.dp),
                    )
                }
            }
        }
    }
}
