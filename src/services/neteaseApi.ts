import { Song, Playlist, UserProfile, LyricLine } from '../types/music';
import { cleanTitle, combineMainAndTransLyrics } from '../utils/format';
import { parseYrc } from '../utils/yrc';
import { parseLrc as parseLrcCommon } from '../utils/lrc';
import { StorageKeys, getItem, setItem, removeItem } from '../utils/storage';
import {
  NeteaseTrack,
  NeteaseArtist,
  NeteasePlaylistItem,
  NeteaseQrKeyResponse,
  NeteaseQrImageResponse,
  NeteaseSearchResponse,
  NeteasePlaylistTracksResponse,
} from '../types/netease';

// High Availability API Mirror List (Local Primary + High-Speed HTTPS Fallback Mirrors)
const API_BASE_ENDPOINTS = [
  'http://127.0.0.1:3000',
  'https://netease-cloud-music-api-beta-five.vercel.app',
  'https://music-api.he-tag.top',
];

class NeteaseApiService {
  private cookie: string = getItem(StorageKeys.neteaseCookie) || '';
  private activeBaseIndex: number = 0;
  private audioUrlCache = new Map<string, { url: string; expiresAt: number }>();

  public setCookie(cookie: string) {
    const nextCookie = cookie.trim();
    if (nextCookie !== this.cookie) {
      // Signed playback URLs may have been resolved under a different
      // account. Never reuse them after login, logout, or account switching.
      this.audioUrlCache.clear();
    }
    this.cookie = nextCookie;
    if (nextCookie) setItem(StorageKeys.neteaseCookie, nextCookie);
    else removeItem(StorageKeys.neteaseCookie);
  }

  public getCookie(): string {
    return this.cookie;
  }

  public clearCookie() {
    this.cookie = '';
    this.audioUrlCache.clear();
    this.activeBaseIndex = 0;
    removeItem(StorageKeys.neteaseCookie);
  }

  // Resilient fetchApi with automatic failover mirror switching.
  // VIP URL generation can take several seconds while the API performs
  // encryption and account entitlement checks, so a 2.5s timeout is too short.
  private async fetchApi<T>(endpoint: string, options: RequestInit = {}, timeoutMs = 10000): Promise<T> {
    const hasQuery = endpoint.includes('?');
    // Authenticated requests must stay on the bundled local API. Sending a
    // MUSIC_U cookie to public mirrors exposes the user's account session.
    const endpointIndexes = this.cookie ? [0] : API_BASE_ENDPOINTS.map((_, index) => index);

    for (const offset of endpointIndexes) {
      const idx = this.cookie ? 0 : (this.activeBaseIndex + offset) % API_BASE_ENDPOINTS.length;
      const baseUrl = API_BASE_ENDPOINTS[idx];
      let url = `${baseUrl}${endpoint}${hasQuery ? '&' : '?'}timestamp=${Date.now()}`;

      if (this.cookie && idx === 0) {
        url += `&cookie=${encodeURIComponent(this.cookie)}`;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            ...(options.headers || {}),
          },
        });
        clearTimeout(timeoutId);

        if (response.ok) {
          this.activeBaseIndex = idx; // Lock on working API endpoint
          return await response.json();
        }
      } catch (error) {
        clearTimeout(timeoutId);
        console.warn(`NetEase API endpoint attempt failed [${baseUrl}${endpoint}], trying next mirror...`);
      }
    }

    throw new Error(`All NetEase API endpoints failed for [${endpoint}]`);
  }

  // --- QR Code Login Flow (Natively via api-enhanced) ---
  public async getQrKey(): Promise<string> {
    try {
      const res = await this.fetchApi<NeteaseQrKeyResponse>('/login/qr/key');
      return res.data?.unikey || res.unikey || res.data?.key || res.key || '';
    } catch {
      return '';
    }
  }

  public async getQrImage(key: string): Promise<string> {
    if (!key) return '';
    try {
      const res = await this.fetchApi<NeteaseQrImageResponse>(`/login/qr/create?key=${encodeURIComponent(key)}&qrimg=true`);
      return res.data?.qrimg || res.qrimg || res.data?.qrurl || '';
    } catch {
      return '';
    }
  }

  public async checkQrStatus(key: string): Promise<{ code: number; message: string; cookie?: string }> {
    const res = await this.fetchApi<{ code: number; message: string; cookie?: string }>(`/login/qr/check?key=${key}`);
    if (res.code === 803 && res.cookie) {
      this.setCookie(res.cookie);
    }
    return res;
  }

  // --- User Account & Profile ---
  public async getUserAccount(): Promise<UserProfile | null> {
    if (!this.cookie) return null;
    try {
      const res = await this.fetchApi<{
        code: number;
        profile: { userId: number; nickname: string; avatarUrl: string; signature?: string; vipType?: number };
      }>('/user/account');
      
      if (res.code === 200 && res.profile) {
        // /user/account is not consistent across API versions: some versions
        // omit profile.vipType and expose the current entitlement via
        // /user/subcount instead. Without this lookup a logged-in VIP user is
        // shown as non-VIP even though the playback cookie is valid.
        let vipType = res.profile.vipType;
        try {
          const sub = await this.fetchApi<{
            code?: number;
            subed?: boolean;
            associator?: { vipCode?: number };
            musicPackage?: { vipCode?: number };
            redplus?: { vipCode?: number };
          }>('/user/subcount');
          if (
            sub.subed ||
            (sub.associator?.vipCode ?? 0) > 0 ||
            (sub.musicPackage?.vipCode ?? 0) > 0 ||
            (sub.redplus?.vipCode ?? 0) > 0
          ) {
            vipType = vipType || 1;
          }
        } catch {
          // Keep profile.vipType when this optional entitlement lookup fails.
        }

        return {
          userId: res.profile.userId,
          nickname: res.profile.nickname,
          avatarUrl: res.profile.avatarUrl,
          signature: res.profile.signature,
          vipType,
          isLoggedIn: true,
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  // --- User Playlists ---
  public async getUserPlaylists(uid: number): Promise<Playlist[]> {
    try {
      const res = await this.fetchApi<{ playlist?: NeteasePlaylistItem[] }>(`/user/playlist?uid=${uid}`);
      return (res.playlist || []).map((pl: NeteasePlaylistItem) => ({
        id: pl.id,
        name: pl.name,
        coverImgUrl: pl.coverImgUrl || '',
        trackCount: pl.trackCount || 0,
        creatorName: pl.creator?.nickname,
        description: pl.description,
        isUserPlaylist: true,
      }));
    } catch {
      return [];
    }
  }

  // --- NetEase Liked Songs List (IDs) & Bi-directional Like Action ---
  public async getLikelist(uid: number): Promise<number[]> {
    try {
      const res = await this.fetchApi<{ ids?: number[] }>(`/likelist?uid=${uid}`);
      return res.ids || [];
    } catch {
      return [];
    }
  }

  public async likeSong(songId: number, like: boolean = true): Promise<boolean> {
    try {
      const res = await this.fetchApi<{ code?: number }>(`/like?id=${songId}&like=${like}`);
      return res.code === 200;
    } catch {
      return false;
    }
  }

  // --- Playlist Songs (Supports Unlimited Multi-Page Auto-Fetching) ---
  public async getPlaylistSongs(playlistId: string | number, allowFallback = true): Promise<Song[]> {
    try {
      let allTracks: NeteaseTrack[] = [];
      let offset = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const res = await this.fetchApi<NeteasePlaylistTracksResponse>(
          `/playlist/track/all?id=${playlistId}&limit=${pageSize}&offset=${offset}`
        );
        const tracks = res.songs || res.playlist?.tracks || [];
        if (!tracks || tracks.length === 0) {
          hasMore = false;
        } else {
          allTracks = allTracks.concat(tracks);
          if (tracks.length < pageSize) {
            hasMore = false;
          } else {
            offset += pageSize;
          }
        }
        // Safety threshold to avoid unexpected infinite memory loops
        if (offset >= 10000) break;
      }

      if (allTracks.length === 0) {
        return allowFallback ? this.getFallbackSongs() : [];
      }

      return allTracks.map((track) => this.formatTrackToSong(track));
    } catch {
      return allowFallback ? this.getFallbackSongs() : [];
    }
  }

  // --- Search Songs ---
  public async searchSongs(keywords: string): Promise<Song[]> {
    try {
      // First try /cloudsearch which natively includes track.al.picUrl for all search results
      const res = await this.fetchApi<NeteaseSearchResponse>(
        `/cloudsearch?keywords=${encodeURIComponent(keywords)}`
      );
      const songs = res.result?.songs;
      if (songs && songs.length > 0) {
        return songs.map((track) => this.formatTrackToSong(track));
      }
    } catch (e) {
      console.warn('Cloudsearch failed, trying /search fallback:', e);
    }

    try {
      // Fallback to /search if /cloudsearch is unavailable
      const res = await this.fetchApi<NeteaseSearchResponse>(
        `/search?keywords=${encodeURIComponent(keywords)}`
      );
      const songs = res.result?.songs || [];
      if (songs.length === 0) return [];

      // If search results lack picUrl, fetch full track details via /song/detail
      if (!songs[0].al?.picUrl && !songs[0].album?.picUrl) {
        const ids = songs.map((s: NeteaseTrack) => s.id).slice(0, 30).join(',');
        try {
          const detailRes = await this.fetchApi<{ songs?: NeteaseTrack[] }>(`/song/detail?ids=${ids}`);
          if (detailRes.songs && detailRes.songs.length > 0) {
            return detailRes.songs.map((track) => this.formatTrackToSong(track));
          }
        } catch {}
      }

      return songs.map((track) => this.formatTrackToSong(track));
    } catch {
      return [];
    }
  }

  // --- Song Playable Audio URL (Supports VIP signed CDN URLs, Meting Unblock & Multi-level fallback) ---
  public async getSongAudioUrl(songId: number, level: string = 'lossless', forceRefresh: boolean = false): Promise<string> {
    const cacheKey = `${songId}:${level}`;
    if (forceRefresh) {
      // The retry path must not reuse a signed URL that the media element
      // already failed to load (expired signature or dead CDN edge).
      this.audioUrlCache.delete(cacheKey);
    }
    const cached = this.audioUrlCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.url;
    }

    // Non-VIP tracks should start from standard quality instead of waiting
    // for lossless/exhigh requests that are unavailable to the account.
    const levels = Array.from(new Set([level, 'exhigh', 'standard']));

    // 1. Try official NetEase /song/url/v1 with authenticated VIP Cookie
    for (const lvl of levels) {
      try {
        const res = await this.fetchApi<{ data: { url: string; code?: number }[] }>(
          `/song/url/v1?id=${songId}&level=${lvl}`,
          {},
          4500,
        );
        if (res.data && res.data[0] && res.data[0].url) {
          const url = res.data[0].url;
          // Signed CDN URLs are short-lived. Cache briefly to avoid another
          // network round trip when the same track is replayed.
          this.audioUrlCache.set(cacheKey, { url, expiresAt: Date.now() + 5 * 60 * 1000 });
          return url; // Retain original CDN URL without forcing https to prevent SSL handshake timeouts
        }
      } catch {
        // Try next audio quality level
      }
    }

    // 2. Some VIP tracks return an empty player URL but do return the same
    // authenticated CDN address through the official download endpoint.
    for (const lvl of [level, 'exhigh']) {
      try {
        const res = await this.fetchApi<{ data: { url: string; code?: number }[] }>(
          `/song/download/url/v1?id=${songId}&level=${lvl}`,
          {},
          4500,
        );
        if (res.data && res.data[0] && res.data[0].url) {
          const url = res.data[0].url;
          this.audioUrlCache.set(cacheKey, { url, expiresAt: Date.now() + 5 * 60 * 1000 });
          return url;
        }
      } catch {
        // Try the next quality level or fallback endpoint.
      }
    }

    // 3. Try legacy NetEase /song/url?id=xxx&br=320000
    try {
      const res = await this.fetchApi<{ data: { url: string }[] }>(
        `/song/url?id=${songId}&br=320000`,
        {},
        4500,
      );
      if (res.data && res.data[0] && res.data[0].url) {
        const url = res.data[0].url;
        this.audioUrlCache.set(cacheKey, { url, expiresAt: Date.now() + 5 * 60 * 1000 });
        return url;
      }
    } catch {
      // Ignore
    }

    // 4. Unblock fallback via the bundled API. The official endpoints above
    // simulate the Android client, whose entitlement checks are stricter
    // than the web player's: even VIP accounts get an empty URL for many
    // tracks (digital albums, SVIP-only songs, etc.). With unblock=true
    // the API matches the track against alternative sources (kuwo/migu)
    // and returns a playable stream instead.
    try {
      const res = await this.fetchApi<{ data: { url: string }[] }>(
        `/song/url/v1?id=${songId}&level=exhigh&unblock=true`,
        {},
        12000,
      );
      if (res.data && res.data[0] && res.data[0].url) {
        const url = res.data[0].url;
        this.audioUrlCache.set(cacheKey, { url, expiresAt: Date.now() + 5 * 60 * 1000 });
        return url;
      }
    } catch {
      // Ignore unblock errors and fall through to the Meting mirror.
    }

    // 5. High-Speed Meting Unblock Fallback Stream (Resolves VIP & restricted NetEase songs)
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const metingRes = await fetch(`https://api.i-meto.com/meting/v2?server=netease&type=url&id=${songId}`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (metingRes.ok) {
        const metingData = await metingRes.json();
        if (metingData && metingData.url) {
          this.audioUrlCache.set(cacheKey, { url: metingData.url, expiresAt: Date.now() + 5 * 60 * 1000 });
          return metingData.url;
        }
      }
    } catch {
      // Ignore fallback error
    }

    // Do not return the public outer link here: for VIP/restricted tracks it
    // is usually not playable and makes the UI appear stuck at 0:00.
    return '';
  }

  // --- Song Lyrics Parsing (Main LRC + Translation tlyric) ---
  public async getSongLyrics(songId: number): Promise<LyricLine[]> {
    try {
      // /lyric/new returns lrc + tlyric + yrc (word-level karaoke) in one call.
      const res = await this.fetchApi<{
        lrc?: { lyric: string };
        tlyric?: { lyric: string };
        yrc?: { lyric: string };
        nolyric?: boolean;
        uncollected?: boolean;
      }>(`/lyric/new?id=${songId}`, {}, 2500);

      // NetEase's /lyric/new intermittently returns an empty tlyric (upstream
      // instability, especially without login/cookies). One retry with a
      // short delay recovers the translation in most of those cases; without
      // it the line would silently show no translation at all.
      if (!res.tlyric?.lyric && res.lrc?.lyric) {
        await new Promise((resolve) => setTimeout(resolve, 300));
        const retry = await this.fetchApi<{
          tlyric?: { lyric: string };
        }>(`/lyric/new?id=${songId}`, {}, 2500);
        if (retry.tlyric?.lyric) {
          res.tlyric = retry.tlyric;
        }
      }

      if (res.nolyric) {
        return [{ time: 0, text: '♪ 纯音乐，无歌词', translation: 'Instrumental Track' }];
      }
      if (res.uncollected) {
        return [{ time: 0, text: '暂无歌词' }];
      }

      const mainLyrics = res.lrc?.lyric ? this.parseLrc(res.lrc.lyric) : [];
      const transLyrics = res.tlyric?.lyric ? this.parseLrc(res.tlyric.lyric) : [];
      const yrcWords = parseYrc(res.yrc?.lyric);

      // YRC (word-level karaoke) is the authoritative source when present:
      // its timestamps can differ from the LRC's (different lyric revisions,
      // e.g. 后来: lrc 12.571s vs yrc 12.21s), so lines are built from YRC
      // itself instead of trying to match timestamps across sources.
      if (yrcWords.size > 0) {
        const yrcLines: LyricLine[] = [];
        for (const [time, words] of yrcWords) {
          yrcLines.push({
            time,
            text: words.map((word) => word.text).join(''),
            words,
          });
        }
        yrcLines.sort((a, b) => a.time - b.time);

        // Attach translation lines to the NEAREST tlyric timestamp within
        // a loose 1.5s tolerance (same as the plain-LRC path). The YRC and
        // tlyric timelines can drift by 0.3-0.5s (different lyric revisions,
        // e.g. 恋愛サーキュレーション: ~0.42s offset), so the old strict
        // 0.4s window silently dropped half the translations.
        if (transLyrics.length > 0) {
          for (const line of yrcLines) {
            let best: LyricLine | undefined;
            let bestDiff = 1.5;
            for (const trans of transLyrics) {
              const diff = Math.abs(trans.time - line.time);
              if (diff < bestDiff) {
                bestDiff = diff;
                best = trans;
              }
            }
            if (best) {
              line.translation = best.text;
            }
          }
        }
        return yrcLines;
      }

      if (mainLyrics.length > 0) {
        return combineMainAndTransLyrics(mainLyrics, transLyrics);
      }
    } catch {
      // Ignore
    }
    return [
      { time: 0, text: '暂无歌词' },
    ];
  }

  // Parse LRC String into structured LyricLine array
  public parseLrc(lrcString: string): LyricLine[] {
    return parseLrcCommon(lrcString, { filterMeta: true });
  }

  public cleanTitle(str?: string): string {
    return cleanTitle(str);
  }

  private formatTrackToSong(track: NeteaseTrack): Song {
    const artistName = track.ar
      ? track.ar.map((a: NeteaseArtist) => a.name).join(' / ')
      : track.artists
      ? track.artists.map((a: NeteaseArtist) => a.name).join(' / ')
      : '未知歌手';

    let rawCoverUrl =
      track.al?.picUrl ||
      track.album?.picUrl ||
      track.al?.pic_str ||
      (track.album?.picId ? `https://p1.music.126.net/${track.album.picId}.jpg` : undefined);

    if (!rawCoverUrl) {
      rawCoverUrl = 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=400&h=400&fit=crop';
    } else {
      rawCoverUrl = rawCoverUrl.replace(/^http:/, 'https:');
    }

    const fee = track.fee ?? track.privilege?.fee;
    const isVip = fee === 1 || fee === 4;

    return {
      id: `netease-${track.id}`,
      name: this.cleanTitle(track.name),
      artist: this.cleanTitle(artistName),
      album: this.cleanTitle(track.al?.name || track.album?.name || '未知专辑'),
      duration: Math.floor((track.dt || track.duration || 200000) / 1000),
      coverUrl: rawCoverUrl,
      audioUrl: `https://music.163.com/song/media/outer/url?id=${track.id}.mp3`,
      source: 'netease',
      neteaseId: track.id,
      isVip: isVip,
      fee: track.fee,
    };
  }

  public getFallbackSongs(): Song[] {
    return [
      {
        id: 'fallback-1',
        name: 'Stay (Live Session)',
        artist: 'The Kid LAROI & Justin Bieber',
        album: 'F*CK LOVE 3: OVER YOU',
        duration: 141,
        coverUrl: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=500&h=500&fit=crop',
        audioUrl: 'https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3?filename=lofi-study-112191.mp3',
        source: 'netease',
      },
      {
        id: 'fallback-2',
        name: 'Blinding Lights',
        artist: 'The Weeknd',
        album: 'After Hours',
        duration: 200,
        coverUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&h=500&fit=crop',
        audioUrl: 'https://cdn.pixabay.com/download/audio/2022/01/18/audio_d0a13f69d2.mp3?filename=flexing-11011.mp3',
        source: 'netease',
      }
    ];
  }
}

export const neteaseApi = new NeteaseApiService();
