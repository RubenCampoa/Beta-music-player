export type SongSource = 'netease' | 'local';

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
  isVip?: boolean;
  fee?: number;
}

export interface UserProfile {
  userId: number;
  nickname: string;
  avatarUrl: string;
  signature?: string;
  vipType?: number;
  isLoggedIn: boolean;
}

export interface Playlist {
  id: string | number;
  name: string;
  coverImgUrl: string;
  trackCount: number;
  creatorName?: string;
  description?: string;
  isUserPlaylist?: boolean;
}
