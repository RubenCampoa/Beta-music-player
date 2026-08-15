// Typed localStorage helpers. Keys are centralized here so they can't be
// mistyped across the app; loadJSON mirrors the app's existing behavior
// (fallback on missing/parse error) so callers behave identically.

export const StorageKeys = {
  searchHistory: 'search_history',
  favoriteSongs: 'favorite_songs',
  autoCheckUpdate: 'auto_check_update',
  activePlatform: 'active_platform',
  neteaseCookie: 'netease_cookie',
  qqMusicCookie: 'qq_music_cookie',
  kugouMusicCookie: 'kugou_music_cookie',
  // Concept Edition and standard KuGou sessions are not interchangeable.
  kugouMusicPlatform: 'kugou_music_platform',
  desktopLyricColorPreset: 'desktop_lyric_color_preset',
} as const;

export function getItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function setItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage may be unavailable (private mode / quota); ignore.
  }
}

export function removeItem(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw !== null ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function saveJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}
