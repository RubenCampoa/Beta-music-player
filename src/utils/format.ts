import { LyricLine } from '../types/music';

export const DEFAULT_COVER_PLACEHOLDER = 'https://y.gtimg.cn/mediaplayer/player/img/cover_default.png';

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

  let processed = url
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
  if (e.currentTarget.src !== DEFAULT_COVER_PLACEHOLDER) {
    e.currentTarget.src = DEFAULT_COVER_PLACEHOLDER;
  }
}
