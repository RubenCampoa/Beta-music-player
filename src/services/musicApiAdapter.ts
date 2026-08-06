import { Platform, Song, Playlist, LyricLine, UserProfile } from '../types/music';
import { neteaseApi } from './neteaseApi';
import { qqMusicApi } from './qqMusicApi';

class MusicApiAdapter {
  public async search(platform: Platform, query: string, _page: number = 1): Promise<Song[]> {
    if (platform === 'qq') {
      return qqMusicApi.searchSongs(query, _page);
    }
    return neteaseApi.searchSongs(query);
  }

  public async getSongLyrics(song: Song): Promise<LyricLine[]> {
    if (song.source === 'qq' || song.songmid) {
      return qqMusicApi.getSongLyrics(song.songmid || song.id.replace('qq_', ''));
    }
    const neteaseId = song.neteaseId || parseInt(song.id.replace('netease_', ''), 10);
    return neteaseApi.getSongLyrics(isNaN(neteaseId) ? 0 : neteaseId);
  }

  public async getSongAudioUrl(song: Song, forceRefresh: boolean = false): Promise<string> {
    // Never short-circuit on song.audioUrl for online platforms: URLs carried
    // by queue/favorite objects are stale signed links that expire within
    // minutes. Always re-resolve; neteaseApi keeps its own freshness-checked
    // cache. Local files keep their stable path as-is.
    if (song.source === 'local') {
      return song.audioUrl;
    }
    if (song.source === 'qq' || song.songmid) {
      return qqMusicApi.getSongAudioUrl(song.songmid || song.id.replace('qq_', ''), { name: song.name, artist: song.artist });
    }
    const neteaseId = song.neteaseId || parseInt(song.id.replace('netease_', ''), 10);
    return neteaseApi.getSongAudioUrl(isNaN(neteaseId) ? 0 : neteaseId, 'lossless', forceRefresh);
  }

  public async getRecommendPlaylists(platform: Platform): Promise<Playlist[]> {
    if (platform === 'qq') {
      return qqMusicApi.getRecommendPlaylists();
    }
    return [
      {
        id: 3778678,
        name: '网易云热歌榜',
        coverImgUrl: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=500&h=500&fit=crop',
        trackCount: 100,
        description: '全网播放量最高热门单曲集合',
        platform: 'netease',
      },
      {
        id: 3779629,
        name: '云音乐新歌榜',
        coverImgUrl: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=500&h=500&fit=crop',
        trackCount: 100,
        description: '最新发行高赞潮流流行歌曲',
        platform: 'netease',
      },
      {
        id: 19723756,
        name: '云音乐飙升榜',
        coverImgUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&h=500&fit=crop',
        trackCount: 100,
        description: '近期热度飙升最快优质单曲',
        platform: 'netease',
      },
    ];
  }

  public async getRecommendSongs(platform: Platform): Promise<Song[]> {
    if (platform === 'qq') {
      return qqMusicApi.getRecommendSongs();
    }
    return neteaseApi.getPlaylistSongs(3778678, false);
  }

  public async getPlaylistSongs(platform: Platform, playlistId: string | number): Promise<Song[]> {
    if (platform === 'qq' || String(playlistId).startsWith('qq_')) {
      return qqMusicApi.getPlaylistSongs(playlistId);
    }
    const neteaseId = Number(String(playlistId).replace(/^(netease_|qq_)/, '')) || 3778678;
    return neteaseApi.getPlaylistSongs(neteaseId, false);
  }

  public async getUserAccount(platform: Platform): Promise<UserProfile | null> {
    if (platform === 'qq') {
      return qqMusicApi.getUserAccount();
    }
    return neteaseApi.getUserAccount();
  }
}

export const musicApiAdapter = new MusicApiAdapter();
