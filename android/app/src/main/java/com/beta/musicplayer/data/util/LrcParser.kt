package com.beta.musicplayer.data.util

import com.beta.musicplayer.data.model.LyricLine

/**
 * LRC 歌词解析器（移植自桌面端 src/services/neteaseApi.ts 的 parseLrc）
 */
object LrcParser {
    private val tagReg = Regex("""\[(\d+):(\d{2})(?:[.:](\d{1,3}))?\]""")
    private val metaReg = Regex("""^\[(ti|ar|al|by|offset|length|re|ve):""", RegexOption.IGNORE_CASE)

    fun parse(lrc: String?): List<LyricLine> {
        if (lrc.isNullOrBlank()) return emptyList()
        val lyrics = mutableListOf<LyricLine>()

        for (rawLine in lrc.split(Regex("""\r?\n"""))) {
            val line = rawLine.trim()
            if (line.isEmpty() || metaReg.containsMatchIn(line)) continue

            val times = mutableListOf<Double>()
            for (match in tagReg.findAll(line)) {
                val minutes = match.groupValues[1].toDoubleOrNull() ?: continue
                val seconds = match.groupValues[2].toDoubleOrNull() ?: continue
                var millis = 0.0
                val rawMs = match.groupValues[3]
                if (rawMs.isNotEmpty()) {
                    val ms = rawMs.toDoubleOrNull() ?: 0.0
                    millis = if (rawMs.length == 3) ms else ms * 10
                }
                times.add(minutes * 60 + seconds + millis / 1000)
            }

            if (times.isNotEmpty()) {
                val text = Format.cleanTitle(line.replace(tagReg, "").trim())
                if (text.isNotEmpty()) {
                    times.forEach { lyrics.add(LyricLine(time = it, text = text)) }
                }
            }
        }
        return lyrics.sortedBy { it.time }
    }

    /** 把主歌词与翻译歌词按时间匹配合并（|Δt| < 1.2s） */
    fun mergeTranslation(main: List<LyricLine>, translation: List<LyricLine>): List<LyricLine> {
        if (translation.isEmpty()) return main
        return main.map { line ->
            val matched = translation.minByOrNull { kotlin.math.abs(it.time - line.time) }
            if (matched != null && kotlin.math.abs(matched.time - line.time) < 1.2) {
                line.copy(translation = Format.cleanTitle(matched.text).ifEmpty { null })
            } else {
                line
            }
        }
    }
}
