// NetEase Cloud Music API raw response types (bundled local api-enhanced
// service). Field conventions follow the NetEase API responses: tracks use
// ar/al (cloudsearch / playlist) or artists/album (song/detail), both are
// declared so every access compiles.

export interface NeteaseArtist {
  id?: number;
  name: string;
}

export interface NeteaseAlbum {
  id?: number;
  name?: string;
  picUrl?: string;
  pic_str?: string;
  picId?: number;
}

export interface NeteasePrivilege {
  fee?: number;
}

export interface NeteaseTrack {
  id: number;
  name: string;
  ar?: NeteaseArtist[];
  artists?: NeteaseArtist[];
  al?: NeteaseAlbum;
  album?: NeteaseAlbum;
  dt?: number;
  duration?: number;
  fee?: number;
  privilege?: NeteasePrivilege;
}

export interface NeteasePlaylistItem {
  id: number | string;
  name: string;
  coverImgUrl?: string;
  trackCount?: number;
  creator?: { nickname?: string };
  description?: string;
}

export interface NeteaseQrKeyResponse {
  data?: { unikey?: string; key?: string };
  unikey?: string;
  key?: string;
}

export interface NeteaseQrImageResponse {
  data?: { qrimg?: string; qrurl?: string };
  qrimg?: string;
  qrurl?: string;
}

export interface NeteaseSearchResponse {
  result?: { songs?: NeteaseTrack[] };
  code?: number;
}

export interface NeteasePlaylistTracksResponse {
  songs?: NeteaseTrack[];
  playlist?: { tracks: NeteaseTrack[] };
}
