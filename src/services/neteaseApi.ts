import { Song, Playlist, UserProfile, LyricLine } from '../types/music';
import { cleanTitle, getOptimizedCoverUrl } from '../utils/format';

export { cleanTitle, getOptimizedCoverUrl };

// High Availability API Mirror List (Local Primary + High-Speed HTTPS Fallback Mirrors)
const API_BASE_ENDPOINTS = [
  'http://127.0.0.1:3000',
  'https://netease-cloud-music-api-beta-five.vercel.app',
  'https://music-api.he-tag.top',
];

class NeteaseApiService {
  private cookie: string = localStorage.getItem('netease_cookie') || '';
  private activeBaseIndex: number = 0;
  private audioUrlCache = new Map<string, { url: string; expiresAt: number }>();

  public setCookie(cookie: string) {
    this.cookie = cookie;
    localStorage.setItem('netease_cookie', cookie);
  }

  public getCookie(): string {
    return this.cookie;
  }

  public clearCookie() {
    this.cookie = '';
    this.audioUrlCache.clear();
    this.activeBaseIndex = 0;
    localStorage.removeItem('netease_cookie');
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
      const res = await this.fetchApi<any>('/login/qr/key');
      return res.data?.unikey || res.unikey || res.data?.key || res.key || '';
    } catch {
      return '';
    }
  }

  public async getQrImage(key: string): Promise<string> {
    if (!key) return '';
    try {
      const res = await this.fetchApi<any>(`/login/qr/create?key=${encodeURIComponent(key)}&qrimg=true`);
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
      const res = await this.fetchApi<{ playlist: any[] }>(`/user/playlist?uid=${uid}`);
      return (res.playlist || []).map((pl) => ({
        id: pl.id,
        name: pl.name,
        coverImgUrl: pl.coverImgUrl,
        trackCount: pl.trackCount,
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
  public async getPlaylistSongs(playlistId: string | number): Promise<Song[]> {
    try {
      let allTracks: any[] = [];
      let offset = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const res = await this.fetchApi<{ songs?: any[]; playlist?: { tracks: any[] } }>(
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
        return this.getFallbackSongs();
      }

      return allTracks.map((track) => this.formatTrackToSong(track));
    } catch {
      return this.getFallbackSongs();
    }
  }

  // --- Search Songs ---
  public async searchSongs(keywords: string): Promise<Song[]> {
    try {
      // First try /cloudsearch which natively includes track.al.picUrl for all search results
      const res = await this.fetchApi<{ result?: { songs?: any[] }; code?: number }>(
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
      const res = await this.fetchApi<{ result?: { songs?: any[] } }>(
        `/search?keywords=${encodeURIComponent(keywords)}`
      );
      const songs = res.result?.songs || [];
      if (songs.length === 0) return [];

      // If search results lack picUrl, fetch full track details via /song/detail
      if (!songs[0].al?.picUrl && !songs[0].album?.picUrl) {
        const ids = songs.map((s: any) => s.id).slice(0, 30).join(',');
        try {
          const detailRes = await this.fetchApi<{ songs?: any[] }>(`/song/detail?ids=${ids}`);
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
  public async getSongAudioUrl(songId: number, level: string = 'lossless'): Promise<string> {
    const cacheKey = `${songId}:${level}`;
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

    // 4. High-Speed Meting Unblock Fallback Stream (Resolves VIP & restricted NetEase songs)
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
      const res = await this.fetchApi<{ lrc?: { lyric: string }; tlyric?: { lyric: string }; nolyric?: boolean; uncollected?: boolean }>(`/lyric?id=${songId}`);
      if (res.nolyric) {
        return [{ time: 0, text: '♪ 纯音乐，无歌词', translation: 'Instrumental Track' }];
      }
      if (res.uncollected) {
        return [{ time: 0, text: '暂无歌词' }];
      }

      const mainLyrics = res.lrc?.lyric ? this.parseLrc(res.lrc.lyric) : [];
      const transLyrics = res.tlyric?.lyric ? this.parseLrc(res.tlyric.lyric) : [];

      if (mainLyrics.length > 0) {
        if (transLyrics.length > 0) {
          return mainLyrics.map((line) => {
            const matched = transLyrics.find((t) => Math.abs(t.time - line.time) < 1.2);
            return {
              ...line,
              text: this.cleanTitle(line.text),
              translation: matched?.text ? this.cleanTitle(matched.text) : undefined,
            };
          });
        }
        return mainLyrics.map((line) => ({
          ...line,
          text: this.cleanTitle(line.text),
        }));
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
    if (!lrcString) return [];
    const lines = lrcString.split(/\r?\n/);
    const lyrics: LyricLine[] = [];
    const tagReg = /\[(\d+):(\d{2})(?:[\.\:](\d{1,3}))?\]/g;
    const metaReg = /^\[(ti|ar|al|by|offset|length|re|ve):/i;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || metaReg.test(trimmed)) continue;

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
        const text = this.cleanTitle(trimmed.replace(tagReg, '').trim());
        if (text) {
          for (const time of times) {
            lyrics.push({ time, text });
          }
        }
      }
    }
    return lyrics.sort((a, b) => a.time - b.time);
  }

  public cleanTitle(str?: string): string {
    return cleanTitle(str);
  }

  private formatTrackToSong(track: any): Song {
    const artistName = track.ar
      ? track.ar.map((a: any) => a.name).join(' / ')
      : track.artists
      ? track.artists.map((a: any) => a.name).join(' / ')
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
    const isVip = fee === 1;

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
        name: 'Stay (Apple Music Session)',
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
