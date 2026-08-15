import { LyricLine } from '../types/music';

export const DEFAULT_COVER_PLACEHOLDER = './icon.png';

/**
 * Common Formatting Utilities for Music Player
 * Single source of truth for Title Sanitization, Time Formatting, and Image CDN scaling.
 */

/**
 * Sanitizes title/artist/album strings by stripping null bytes, zero-width characters,
 * fullwidth zeroes, and incorrect trailing 0 artifacts.
 */
export function cleanTitle(str?: string): string {
  if (!str) return '';
  let cleaned = str
    .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200D\uFEFF\u00A0\0]/g, '')
    .trim();
  cleaned = cleaned.replace(/[\u0000\0]+/g, '').trim();
  cleaned = cleaned.replace(/([^\d\s])\s*[0０]$/g, '$1').trim();
  return cleaned;
}

/**
 * Formats seconds into M:SS display string (e.g. 125 => "2:05").
 */
export function formatTime(secs: number): string {
  if (!secs || isNaN(secs)) return '0:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

/**
 * Formats remaining seconds into -M:SS display string (e.g. 125 remaining of 200 => "-1:15").
 */
export function formatRemainingTime(secs: number, total: number): string {
  if (!total || isNaN(total)) return '-0:00';
  const rem = Math.max(0, total - secs);
  const m = Math.floor(rem / 60);
  const s = Math.floor(rem % 60);
  return `-${m}:${s < 10 ? '0' : ''}${s}`;
}

/**
 * Optimizes NetEase & QQ Music Image CDN URLs by adding dynamic width/height thumbnail parameters.
 * Filters out broken 00000000000000 albummid URLs gracefully.
 */
export function getOptimizedCoverUrl(url?: string, size: number = 200): string {
  if (!url || url.includes('00000000000000') || /M0000+\.jpg/i.test(url)) {
    return DEFAULT_COVER_PLACEHOLDER;
  }

  let processed = url.trim()
    .replace(/&amp;/g, '&')
    .replace(/^\/\//, 'https://')
    .replace(/^http:/, 'https:')
    .replace('y.qq.com/music/photo_new/', 'y.gtimg.cn/music/photo_new/');

  if (processed.includes('music.126.net') || processed.includes('p1.music.126.net') || processed.includes('p2.music.126.net')) {
    const cleanUrl = processed.split('?')[0];
    return `${cleanUrl}?param=${size}y${size}`;
  }

  if (processed.includes('y.gtimg.cn/music/photo_new/')) {
    if (/M0000+[\._]/i.test(processed) || /M0000+\.jpg/i.test(processed)) {
      return DEFAULT_COVER_PLACEHOLDER;
    }
    const sizeStr = size >= 300 ? '300x300' : '150x150';
    return processed.replace(/R\d+x\d+M/, `R${sizeStr}M`);
  }

  return processed;
}

/**
 * Image onError event handler fallback to prevent broken UI icons.
 */
export function handleImageError(e: React.SyntheticEvent<HTMLImageElement, Event>) {
  const image = e.currentTarget;
  if (image.dataset.coverFallbackApplied === '1') return;
  image.dataset.coverFallbackApplied = '1';
  image.src = DEFAULT_COVER_PLACEHOLDER;
}

/**
 * Combines main lyrics and translation lyrics into a single deduplicated array.
 * Intelligently merges inline bilingual pairs (e.g. English line + Chinese line at same timestamp)
 * and eliminates duplicate standalone translation lines.
 */
export function combineMainAndTransLyrics(mainLyrics: LyricLine[], transLyrics: LyricLine[] = []): LyricLine[] {
  if (!mainLyrics || mainLyrics.length === 0) return [];

  // Step 1: Detect and merge inline bilingual pairs in mainLyrics (e.g. English line + Chinese line with identical timestamps)
  const mergedMain: LyricLine[] = [];
  const skipIndices = new Set<number>();

  for (let i = 0; i < mainLyrics.length; i++) {
    if (skipIndices.has(i)) continue;
    const current = mainLyrics[i];
    const next = mainLyrics[i + 1];

    const currentClean = cleanTitle(current.text);
    if (!currentClean) continue;

    if (
      next &&
      Math.abs(current.time - next.time) < 1.2 &&
      cleanTitle(next.text) !== currentClean
    ) {
      const currentHasCn = /[\u4e00-\u9fa5]/.test(currentClean);
      const nextHasCn = /[\u4e00-\u9fa5]/.test(next.text);

      if (!currentHasCn && nextHasCn) {
        mergedMain.push({
          time: current.time,
          text: currentClean,
          translation: cleanTitle(next.text),
        });
        skipIndices.add(i + 1);
        continue;
      }
    }

    mergedMain.push({
      ...current,
      text: currentClean,
      translation: current.translation ? cleanTitle(current.translation) : undefined,
    });
  }

  // Step 2: Attach external transLyrics if provided
  const result: LyricLine[] = [];
  for (const line of mergedMain) {
    let trans = line.translation;

    if (!trans && transLyrics.length > 0) {
      const matched = transLyrics.find((t) => Math.abs(t.time - line.time) < 1.5);
      if (matched && matched.text) {
        const cleanTrans = cleanTitle(matched.text);
        if (cleanTrans && cleanTrans !== line.text) {
          trans = cleanTrans;
        }
      }
    }

    result.push({
      ...line,
      translation: trans && trans !== line.text ? trans : undefined,
    });
  }

  // Step 3: Remove any standalone lines whose text is already attached as translation to a preceding line with the same timestamp
  const finalLyrics: LyricLine[] = [];
  for (let i = 0; i < result.length; i++) {
    const item = result[i];
    const prev = result[i - 1];
    if (
      prev &&
      prev.translation &&
      Math.abs(item.time - prev.time) < 1.5 &&
      cleanTitle(item.text) === prev.translation
    ) {
      continue;
    }
    finalLyrics.push(item);
  }

  return finalLyrics;
}
