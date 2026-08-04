package com.beta.musicplayer.data.util

import com.beta.musicplayer.data.model.LyricLine
import com.beta.musicplayer.data.model.LyricWord

/**
 * LRC / YRC 歌词解析器（支持逐字时间戳）
 */
object LrcParser {
    private val tagReg = Regex("""\[(\d+):(\d{2})(?:[.:](\d{1,3}))?\]""")
    private val metaReg = Regex("""^\[(ti|ar|al|by|offset|length|re|ve):""", RegexOption.IGNORE_CASE)
    private val yrcLineTagReg = Regex("""^\[(\d+),(\d+)\]""")
    private val yrcWordTagReg = Regex("""\((\d+),(\d+),\d+\)([^(]+)""")

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
                    times.forEach { lyrics.add(LyricLine(time = it, text = text, isYrc = false)) }
                }
            }
        }
        return lyrics.sortedBy { it.time }
    }

    /** 解析网易云 YRC 逐字/逐音节歌词 */
    fun parseYrc(yrc: String?): List<LyricLine> {
        if (yrc.isNullOrBlank()) return emptyList()
        val lines = mutableListOf<LyricLine>()

        for (rawLine in yrc.split(Regex("""\r?\n"""))) {
            val line = rawLine.trim()
            if (line.isEmpty() || !line.startsWith("[")) continue

            val matchLine = yrcLineTagReg.find(line)
            val lineStartMs = matchLine?.groupValues?.get(1)?.toDoubleOrNull()
            if (lineStartMs != null) {
                val words = mutableListOf<LyricWord>()
                val sbText = StringBuilder()

                for (wordMatch in yrcWordTagReg.findAll(line)) {
                    val wordStartMs = wordMatch.groupValues[1].toDoubleOrNull() ?: continue
                    val wordDurMs = wordMatch.groupValues[2].toDoubleOrNull() ?: continue
                    val wordText = Format.cleanTitle(wordMatch.groupValues[3])
                    if (wordText.isNotEmpty()) {
                        words.add(
                            LyricWord(
                                startTime = wordStartMs / 1000.0,
                                duration = wordDurMs / 1000.0,
                                text = wordText
                            )
                        )
                        sbText.append(wordText)
                    }
                }

                val fullText = sbText.toString().trim()
                if (fullText.isNotEmpty()) {
                    lines.add(
                        LyricLine(
                            time = lineStartMs / 1000.0,
                            text = fullText,
                            isYrc = words.isNotEmpty(),
                            words = words,
                        )
                    )
                }
            }
        }
        return lines.sortedBy { it.time }
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
