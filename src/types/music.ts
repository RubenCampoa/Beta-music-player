export type SongSource = 'netease' | 'qq' | 'local';

export type Platform = 'netease' | 'qq';

export interface LyricLine {
  time: number; // in seconds
  text: string;
  translation?: string;
}

export interface Song {
  id: string;
  name: string;
  artist: string;
  album: string;
  duration: number; // in seconds
  coverUrl: string;
  audioUrl: string;
  source: SongSource;
  lyric?: LyricLine[];
  filePath?: string; // For local files
  neteaseId?: number;
  songmid?: string;
  mediaMid?: string;
  isVip?: boolean;
  fee?: number;
}

export interface UserProfile {
  userId: number | string;
  nickname: string;
  avatarUrl: string;
  signature?: string;
  vipType?: number;
  isLoggedIn: boolean;
  platform?: Platform;
}

export interface Playlist {
  id: string | number;
  name: string;
  coverImgUrl: string;
  trackCount: number;
  creatorName?: string;
  description?: string;
  isUserPlaylist?: boolean;
  platform?: Platform;
}
