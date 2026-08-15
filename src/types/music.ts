export type SongSource = 'netease' | 'qq' | 'kugou' | 'local';

export type Platform = 'netease' | 'qq' | 'kugou';

export interface LyricWord {
  text: string;
  time: number; // in seconds (word start)
  duration?: number; // in seconds (word duration, for partial-highlight progress)
}

export interface LyricLine {
  time: number; // in seconds
  text: string;
  translation?: string;
  words?: LyricWord[]; // word-level timing (karaoke), when available
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
  kugouHash?: string;
  kugouAlbumId?: number | string;
  kugouAlbumAudioId?: number | string;
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
  kugouGlobalCollectionId?: string;
}
