import { LyricLine, LyricWord } from '../types/music';

const KRC_LINE_RE = /^\[(-?\d+),(\d+)\](.*)$/;
const KRC_WORD_RE = /<(-?\d+),(\d+),\d+>([^<]*)/g;

/** Parse KuGou's decoded KRC format into the shared karaoke lyric model. */
export function parseKrc(krc?: string): LyricLine[] {
  if (!krc) return [];
  const lines: LyricLine[] = [];

    const offsetMatch = krc.match(/\[offset:(-?\d+)\]/i);
    const globalOffsetMs = offsetMatch ? parseInt(offsetMatch[1], 10) : 0;

    for (const rawLine of krc.split(/\r?\n/)) {
      const match = KRC_LINE_RE.exec(rawLine.trim());
      if (!match) continue;

      // Positive offset means the song's audio is shifted, so the lyrics should appear later.
      // Therefore, we ADD the offset to the timestamp to delay the lyrics.
      const lineStartMs = Number(match[1]) + globalOffsetMs;
      const timedText = match[3];
    const words: LyricWord[] = [];
    KRC_WORD_RE.lastIndex = 0;

    let wordMatch: RegExpExecArray | null;
    while ((wordMatch = KRC_WORD_RE.exec(timedText)) !== null) {
      const text = wordMatch[3];
      if (!text) continue;
      const offsetMs = Number(wordMatch[1]);
      const durationMs = Number(wordMatch[2]);
      words.push({
        text,
        time: (lineStartMs + offsetMs) / 1000,
        duration: durationMs / 1000,
      });
    }

    const text = words.map((word) => word.text).join('').trim();
    if (!text) continue;
    lines.push({ time: lineStartMs / 1000, text, words });
  }

  return lines.sort((a, b) => a.time - b.time);
}
