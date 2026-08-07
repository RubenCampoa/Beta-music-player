import { LyricLine } from '../types/music';
import { cleanTitle } from './format';

// Shared LRC parser used by both the NetEase and QQ Music services.
// `filterMeta` drops header/credit lines ([ti:], [ar:], [al:], [by:],
// [offset:], [length:], [re:], [ve:]) — NetEase passes true; QQ keeps its
// historical behavior (no filtering).
export function parseLrc(
  lrcString: string,
  options: { filterMeta?: boolean } = {},
): LyricLine[] {
  if (!lrcString) return [];
  const lines = lrcString.split(/\r?\n/);
  const lyrics: LyricLine[] = [];
  const tagReg = /\[(\d+):(\d{2})(?:[\.\:](\d{1,3}))?\]/g;
  const metaReg = /^\[(ti|ar|al|by|offset|length|re|ve):/i;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (options.filterMeta && metaReg.test(trimmed)) continue;

    let match;
    const times: number[] = [];
    tagReg.lastIndex = 0;

    while ((match = tagReg.exec(trimmed)) !== null) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      let millis = 0;
      if (match[3]) {
        const rawMs = match[3];
        millis = rawMs.length === 3 ? parseInt(rawMs, 10) : parseInt(rawMs, 10) * 10;
      }
      times.push(minutes * 60 + seconds + millis / 1000);
    }

    if (times.length > 0) {
      const text = cleanTitle(trimmed.replace(tagReg, '').trim());
      if (text) {
        for (const time of times) {
          lyrics.push({ time, text });
        }
      }
    }
  }
  return lyrics.sort((a, b) => a.time - b.time);
}
