import { Song, Playlist, UserProfile, LyricLine } from '../types/music';

// High Availability API Mirror List (Local Primary + High-Speed HTTPS Fallback Mirrors)
const API_BASE_ENDPOINTS = [
  'http://127.0.0.1:3000',
  'https://netease-cloud-music-api-beta-five.vercel.app',
  'https://music-api.he-tag.top',
];

class NeteaseApiService {
  private cookie: string = localStorage.getItem('netease_cookie') || '';
  private activeBaseIndex: number = 0;

  public setCookie(cookie: string) {
    this.cookie = cookie;
    localStorage.setItem('netease_cookie', cookie);
  }

  public getCookie(): string {
    return this.cookie;
  }

  public clearCookie() {
    this.cookie = '';
    localStorage.removeItem('netease_cookie');
  }

  // Resilient fetchApi with automatic failover mirror switching
  private async fetchApi<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const hasQuery = endpoint.includes('?');

    for (let i = 0; i < API_BASE_ENDPOINTS.length; i++) {
      const idx = (this.activeBaseIndex + i) % API_BASE_ENDPOINTS.length;
      const baseUrl = API_BASE_ENDPOINTS[idx];
      let url = `${baseUrl}${endpoint}${hasQuery ? '&' : '?'}timestamp=${Date.now()}`;

      if (this.cookie) {
        url += `&cookie=${encodeURIComponent(this.cookie)}`;
      }

      try {
        const response = await fetch(url, {
          ...options,
          headers: {
            'Content-Type': 'application/json',
            ...(options.headers || {}),
          },
        });

        if (response.ok) {
          this.activeBaseIndex = idx; // Lock on working API endpoint
          return await response.json();
        }
      } catch (error) {
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
        return {
          userId: res.profile.userId,
          nickname: res.profile.nickname,
          avatarUrl: res.profile.avatarUrl,
          signature: res.profile.signature,
          vipType: res.profile.vipType,
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

  // --- Playlist Songs ---
  public async getPlaylistSongs(playlistId: string | number): Promise<Song[]> {
    try {
      const res = await this.fetchApi<{ songs?: any[]; playlist?: { tracks: any[] } }>(
        `/playlist/track/all?id=${playlistId}&limit=50`
      );
      const tracks = res.songs || res.playlist?.tracks || [];
      return tracks.map((track) => this.formatTrackToSong(track));
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

  // --- Song Playable Audio URL ---
  public async getSongAudioUrl(songId: number): Promise<string> {
    try {
      const res = await this.fetchApi<{ data: { url: string }[] }>(`/song/url/v1?id=${songId}&level=exhigh`);
      if (res.data && res.data[0] && res.data[0].url) {
        return res.data[0].url.replace(/^http:/, 'https:');
      }
    } catch {
      // Fallback music stream URL
    }
    return `https://music.163.com/song/media/outer/url?id=${songId}.mp3`;
  }

  // --- Song Lyrics Parsing (Main LRC + Translation tlyric) ---
  public async getSongLyrics(songId: number): Promise<LyricLine[]> {
    try {
      const res = await this.fetchApi<{ lrc?: { lyric: string }; tlyric?: { lyric: string } }>(`/lyric?id=${songId}`);
      const mainLyrics = res.lrc?.lyric ? this.parseLrc(res.lrc.lyric) : [];
      const transLyrics = res.tlyric?.lyric ? this.parseLrc(res.tlyric.lyric) : [];

      if (transLyrics.length > 0) {
        return mainLyrics.map((line) => {
          const matched = transLyrics.find((t) => Math.abs(t.time - line.time) < 1.2);
          return {
            ...line,
            translation: matched?.text,
          };
        });
      }
      return mainLyrics;
    } catch {
      // Ignore
    }
    return [
      { time: 0, text: '♪ 纯音乐，请欣赏', translation: 'Enjoy the Instrumental' },
      { time: 10, text: 'Apple Music Fluid Visual Experience', translation: 'Apple Music 全景沉浸视听' },
    ];
  }

  // Parse LRC String into structured LyricLine array
  public parseLrc(lrcString: string): LyricLine[] {
    const lines = lrcString.split('\n');
    const lyrics: LyricLine[] = [];
    const timeReg = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/;

    for (const line of lines) {
      const match = timeReg.exec(line);
      if (match) {
        const minutes = parseInt(match[1], 10);
        const seconds = parseInt(match[2], 10);
        const millis = parseInt(match[3], 10);
        const time = minutes * 60 + seconds + (millis > 99 ? millis / 1000 : millis / 100);
        const text = line.replace(timeReg, '').trim();
        if (text) {
          lyrics.push({ time, text });
        }
      }
    }
    return lyrics.sort((a, b) => a.time - b.time);
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

    const isVip =
      track.fee === 1 || track.fee === 4 || track.fee === 8 || (track.fee && track.fee > 0);

    return {
      id: `netease-${track.id}`,
      name: track.name,
      artist: artistName,
      album: track.al?.name || track.album?.name || '未知专辑',
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
