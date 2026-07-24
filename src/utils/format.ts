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
 * Optimizes NetEase Image CDN URLs by adding dynamic width/height thumbnail parameters.
 * E.g. param=100y100 for small list thumbnails, param=300y300 for cards, param=600y600 for full artwork.
 */
export function getOptimizedCoverUrl(url?: string, size: number = 200): string {
  if (!url) return '';
  if (url.includes('music.126.net') || url.includes('p1.music.126.net') || url.includes('p2.music.126.net')) {
    const cleanUrl = url.split('?')[0];
    return `${cleanUrl}?param=${size}y${size}`;
  }
  return url;
}
