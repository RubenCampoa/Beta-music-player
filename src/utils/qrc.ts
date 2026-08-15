import { LyricLine, LyricWord } from '../types/music';

// QQ Music QRC lines put each word's timing AFTER its text:
//   [190871,1984]For (190871,361)the (191232,172)first (191404,376)...
// The encrypted network payload first decrypts to XML, with the QRC document
// stored in the LyricContent attribute.
const QRC_LINE_RE = /^\[(-?\d+),(\d+)\](.*)$/;
const QRC_WORD_TIME_RE = /\((-?\d+),(\d+)(?:,\d+)?\)/g;

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

export function extractQrcContent(qrcDocument: string): string {
  if (!qrcDocument) return '';
  if (!qrcDocument.trimStart().startsWith('<')) return qrcDocument;

  const attribute = qrcDocument.match(/<Lyric_\d+\b[^>]*\bLyricContent=(['"])([\s\S]*?)\1\s*\/?\s*>/i);
  return attribute ? decodeXmlEntities(attribute[2]) : '';
}

export function parseQrc(qrcDocument?: string): LyricLine[] {
  const content = extractQrcContent(qrcDocument || '');
  if (!content) return [];

  const lines: LyricLine[] = [];
  for (const rawLine of content.split(/\r?\n/)) {
    const lineMatch = QRC_LINE_RE.exec(rawLine.trim());
    if (!lineMatch) continue;

    const lineTimeMs = Number(lineMatch[1]);
    const timedText = lineMatch[3];
    const words: LyricWord[] = [];
    let previousTimingEnd = 0;

    QRC_WORD_TIME_RE.lastIndex = 0;
    let timingMatch: RegExpExecArray | null;
    while ((timingMatch = QRC_WORD_TIME_RE.exec(timedText)) !== null) {
      // Literal parentheses are valid lyric text in QRC. Slicing between
      // numeric timing tokens preserves them as well as separately timed
      // spaces in English lyrics.
      const text = timedText.slice(previousTimingEnd, timingMatch.index);
      if (text) {
        words.push({
          text,
          time: Number(timingMatch[1]) / 1000,
          duration: Number(timingMatch[2]) / 1000,
        });
      }
      previousTimingEnd = timingMatch.index + timingMatch[0].length;
    }

    const trailingText = timedText.slice(previousTimingEnd);
    if (trailingText && words.length > 0) {
      words[words.length - 1].text += trailingText;
    }

    if (words.length === 0) continue;
    lines.push({
      time: lineTimeMs / 1000,
      text: words.map((word) => word.text).join(''),
      words,
    });
  }

  return lines.sort((a, b) => a.time - b.time);
}
