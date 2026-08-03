package com.beta.musicplayer.data.util

/**
 * 格式化工具（移植自桌面端 src/utils/format.ts）
 */
object Format {
    /**
     * 清洗标题/歌手/专辑字符串：去除空字节、零宽字符、全角零、错误的结尾 0 残留。
     */
    fun cleanTitle(str: String?): String {
        if (str.isNullOrEmpty()) return ""
        var cleaned = str
            .replace(Regex("""[\u0000-\u001F\u007F-\u009F\u200B-\u200D\uFEFF\u00A0\x00]"""), "")
            .trim()
        cleaned = cleaned.replace(Regex("""[\x00]+"""), "").trim()
        cleaned = cleaned.replace(Regex("""([^\d\s])\s*[0０]$"""), "$1").trim()
        return cleaned
    }

    /** 125 -> "2:05" */
    fun formatTime(secs: Number): String {
        val s = secs.toFloat()
        if (s.isNaN() || s <= 0) return "0:00"
        val m = (s / 60).toInt()
        val sec = (s % 60).toInt()
        return "$m:${if (sec < 10) "0" else ""}$sec"
    }

    /** 剩余时间 -> "-1:15" */
    fun formatRemainingTime(secs: Number, total: Number): String {
        val cur = secs.toFloat()
        val tot = total.toFloat()
        if (tot.isNaN() || tot <= 0) return "-0:00"
        val rem = maxOf(0f, tot - cur)
        val m = (rem / 60).toInt()
        val sec = (rem % 60).toInt()
        return "-$m:${if (sec < 10) "0" else ""}$sec"
    }

    /** 网易云图片 CDN 加缩略参数，如 ?param=200y200 */
    fun getOptimizedCoverUrl(url: String?, size: Int = 300): String {
        if (url.isNullOrEmpty()) return ""
        if (url.contains("music.126.net") || url.contains("p1.music.126.net") || url.contains("p2.music.126.net")) {
            val clean = url.substringBefore('?')
            return "$clean?param=${size}y$size"
        }
        return url
    }
}
