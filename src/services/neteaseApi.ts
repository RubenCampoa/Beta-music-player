import { Song, Playlist, UserProfile, LyricLine } from '../types/music';

// NetEase API Base URL (Local Node Server deployed from api-enhanced)
const API_BASE = 'http://127.0.0.1:3000';

class NeteaseApiService {
  private cookie: string = localStorage.getItem('netease_cookie') || '';

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

  // Use standard GET request and pass cookie as a query parameter
  // which is fully natively supported by NeteaseCloudMusicApiEnhanced
  private async fetchApi<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const hasQuery = endpoint.includes('?');
    let url = `${API_BASE}${endpoint}${hasQuery ? '&' : '?'}timestamp=${Date.now()}`;
    
    // Explicitly pass cookie to bypass any browser CORS strictness
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
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.warn(`NetEase API Request Failed [${endpoint}]`, error);
      throw error;
    }
  }

  // --- QR Code Login Flow (Natively via api-enhanced) ---
  public async getQrKey(): Promise<string> {
    const res = await this.fetchApi<{ data: { unikey: string } }>('/login/qr/key');
    return res.data.unikey;
  }

  public async getQrImage(key: string): Promise<string> {
    const res = await this.fetchApi<{ data: { qrimg: string } }>(`/login/qr/create?key=${key}&qrimg=true`);
    return res.data.qrimg;
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
      const res = await this.fetchApi<{ result: { songs: any[] } }>(`/search?keywords=${encodeURIComponent(keywords)}`);
      return (res.result?.songs || []).map((track) => this.formatTrackToSong(track));
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
    const artistName = track.ar ? track.ar.map((a: any) => a.name).join(' / ') : track.artists ? track.artists.map((a: any) => a.name).join(' / ') : '未知歌手';
    const coverUrl = track.al?.picUrl || track.album?.picUrl || 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=400&h=400&fit=crop';
    const isVip = track.fee === 1 || track.fee === 4 || track.fee === 8 || (track.fee && track.fee > 0);

    return {
      id: `netease-${track.id}`,
      name: track.name,
      artist: artistName,
      album: track.al?.name || track.album?.name || '未知专辑',
      duration: Math.floor((track.dt || track.duration || 200000) / 1000),
      coverUrl: coverUrl.replace(/^http:/, 'https:'),
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
