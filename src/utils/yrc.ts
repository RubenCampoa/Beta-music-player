import { LyricWord } from '../types/music';

// NetEase YRC (逐字歌词 / word-level karaoke) parser.
//
// A YRC document is one JSONL line per entry:
//   - Meta lines: {"t":0,"c":[{"tx":"作词: "},{"tx":"张国祥","li":"http://..."}]}
//     (carry artist/album links; not rendered as lyrics)
//   - Lyric lines: [23990,4920](23990,350,0)你(24340,480,0)的(24820,390,0)身...
//     [lineStartMs, lineDurationMs](wordStartMs, wordDurationMs,0)word...
//
// Only lyric lines are parsed. The returned map keys are the line start
// times in seconds (same basis as LyricLine.time), values are the word
// fragments with their own start times in seconds.

const YRC_LINE_RE = /^\[(\d+),(\d+)\](.*)$/;
const YRC_WORD_RE = /\((\d+),(\d+),(\d+)\)([^()]*)/g;

export function parseYrc(yrcString?: string): Map<number, LyricWord[]> {
  const result = new Map<number, LyricWord[]>();
  if (!yrcString) return result;

  for (const rawLine of yrcString.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    // Skip JSONL meta lines (they start with '{').
    if (line.startsWith('{')) continue;

    const lineMatch = YRC_LINE_RE.exec(line);
    if (!lineMatch) continue;

    const lineTime = Number(lineMatch[1]) / 1000;
    const content = lineMatch[3];
    const words: LyricWord[] = [];

    YRC_WORD_RE.lastIndex = 0;
    let wordMatch: RegExpExecArray | null;
    while ((wordMatch = YRC_WORD_RE.exec(content)) !== null) {
      const text = wordMatch[4];
      if (!text.trim()) continue;
      words.push({
        text,
        time: Number(wordMatch[1]) / 1000,
        duration: Number(wordMatch[2]) / 1000,
      });
    }

    if (words.length > 0) {
      result.set(lineTime, words);
    }
  }

  return result;
}
