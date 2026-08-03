package com.beta.musicplayer.data.util

import com.beta.musicplayer.data.model.LyricLine
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class LrcParserTest {

    @Test
    fun `parse - 基础时间与文本`() {
        val lrc = """
            [ti:测试]
            [ar:歌手]
            [00:12.34]第一行
            [00:20.00]第二行
            [00:30]第三行
        """.trimIndent()
        val lines = LrcParser.parse(lrc)
        assertEquals(3, lines.size)
        assertEquals(12.34, lines[0].time, 0.001)
        assertEquals("第一行", lines[0].text)
        assertEquals(20.0, lines[1].time, 0.001)
        assertEquals(30.0, lines[2].time, 0.001)
    }

    @Test
    fun `parse - 多时间标签展开为多行`() {
        val lrc = "[00:10.00][00:20.00]重复行"
        val lines = LrcParser.parse(lrc)
        assertEquals(2, lines.size)
        assertTrue(lines.all { it.text == "重复行" })
        assertEquals(10.0, lines[0].time, 0.001)
        assertEquals(20.0, lines[1].time, 0.001)
    }

    @Test
    fun `parse - 空与纯元数据`() {
        assertEquals(emptyList<LyricLine>(), LrcParser.parse(null))
        assertEquals(emptyList<LyricLine>(), LrcParser.parse(""))
        assertEquals(emptyList<LyricLine>(), LrcParser.parse("[ar:歌手]\n[al:专辑]"))
    }

    @Test
    fun `parse - 结果按时间排序`() {
        val lrc = "[00:30]C行\n[00:10]A行\n[00:20]B行"
        val lines = LrcParser.parse(lrc)
        assertEquals(listOf("A行", "B行", "C行"), lines.map { it.text })
    }

    @Test
    fun `mergeTranslation - 相近时间匹配翻译`() {
        val main = listOf(
            LyricLine(time = 10.0, text = "第一句"),
            LyricLine(time = 20.0, text = "第二句"),
        )
        val trans = listOf(LyricLine(time = 10.4, text = "Translation 1"))
        val merged = LrcParser.mergeTranslation(main, trans)
        assertEquals("Translation 1", merged[0].translation)
        assertEquals(null, merged[1].translation)
    }

    @Test
    fun `mergeTranslation - 无翻译时原样返回`() {
        val main = listOf(LyricLine(time = 1.0, text = "A"))
        val merged = LrcParser.mergeTranslation(main, emptyList())
        assertEquals(main, merged)
    }

    @Test
    fun `Format - cleanTitle 清洗控制字符与零宽字符`() {
        assertEquals("Hello", Format.cleanTitle("Hello\u0000"))
        assertEquals("Hello", Format.cleanTitle("\u200BHello\u200B"))
        assertEquals("歌名", Format.cleanTitle("歌名\u0000").trim())
        assertEquals("", Format.cleanTitle(null))
        assertEquals("", Format.cleanTitle("  "))
    }

    @Test
    fun `Format - 时间格式化`() {
        assertEquals("0:00", Format.formatTime(0))
        assertEquals("2:05", Format.formatTime(125))
        assertEquals("10:00", Format.formatTime(600))
        assertEquals("-1:15", Format.formatRemainingTime(125, 200))
    }
}
