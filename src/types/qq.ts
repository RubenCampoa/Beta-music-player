// QQ Music API raw response types.
// These mirror the shapes returned by the local @sansenjian/qq-music-api
// server. QQ returns several field-name conventions (web: songname/songmid/
// payplay/paytrackmouth; musicu: name/mid/pay_play/pay_month; rank: title/
// songId/singerName), so every accessed field is declared here.

export interface QQPay {
  // web style (search / getLyric paths)
  payplay?: number | string;
  payPlay?: number | string;
  paytrackmouth?: number;
  payalbum?: number;
  paydownload?: number;
  payinfo?: number;
  paytrackprice?: number;
  // musicu style (song detail / playlist paths)
  pay_play?: number | string;
  pay_month?: number;
  pay_status?: number;
  price_track?: number;
}

export interface QQSongSinger {
  mid?: string;
  name?: string;
  title?: string;
}

export interface QQSongAlbum {
  id?: number | string;
  mid?: string;
  pmid?: string;
  name?: string;
  title?: string;
  pic?: string;
  cover?: string;
  img?: string;
}

// A raw song item from search / rank / playlist / song-detail responses.
export interface QQSongItem {
  // ids
  id?: number | string;
  songmid?: string;
  mid?: string;
  songId?: number;
  songid?: number;
  // names (three conventions)
  songname?: string;
  name?: string;
  title?: string;
  // artist
  singer?: QQSongSinger[] | string;
  singerName?: string;
  singerMid?: string;
  singer_mid?: string;
  singermid?: string;
  // album
  album?: QQSongAlbum;
  albummid?: string;
  album_mid?: string;
  albumMid?: string;
  albumname?: string;
  albumid?: number | string;
  albumId?: number | string;
  // timing / media
  interval?: number;
  duration?: number;
  strMediaMid?: string;
  media_mid?: string;
  mediamid?: string;
  file?: { media_mid?: string; mediaMid?: string };
  // covers (three conventions)
  cover?: string;
  pic?: string;
  img?: string;
  // VIP / pay flags
  isvip?: number;
  is_vip?: number;
  vip?: number;
  vip_type?: number;
  pay?: QQPay;
  pay_info?: QQPay;
}

export interface QQSearchResponse {
  response?: {
    data?: {
      song?: { list?: QQSongItem[] };
    };
  };
}

// /getRanks → musicu.fcg ToplistInfoServer.GetDetail
export interface QQRankResponse {
  response?: {
    req_1?: {
      data?: {
        data?: {
          song?: Record<string, QQSongItem>;
        };
      };
    };
  };
}

// /getSongInfo → get_song_detail_yqq
export interface QQSongInfoResponse {
  response?: {
    songinfo?: {
      data?: {
        track_info?: { pay?: QQPay };
      };
    };
  };
}

// /getMusicPlay → playUrl per songmid
export interface QQPlayUrlResponse {
  data?: {
    playUrl?: Record<string, { url?: string; error?: string }>;
  };
}

// /getLyric
export interface QQLyricResponse {
  response?: {
    lyric?: string;
    trans?: string;
    qrc?: number;
    crypt?: number;
    qrc_t?: number;
  };
}

export interface QQPlaylistItem {
  dissid?: string | number;
  id?: string | number;
  dissname?: string;
  name?: string;
  title?: string;
  imgurl?: string;
  picurl?: string;
  songnum?: number;
  listennum?: number;
  introduction?: string;
}

export interface QQPlaylistListResponse {
  response?: { data?: { list?: QQPlaylistItem[] } };
}

export interface QQPlaylistDetailResponse {
  response?: { cdlist?: Array<{ songlist?: QQSongItem[] }> };
}

export interface QQUserPlaylistItem extends QQPlaylistItem {
  tid?: string | number;
  cid?: string | number;
  coverUrl?: string;
  logo?: string;
  cover?: string;
  song_cnt?: number;
  songCount?: number;
  subtitle?: string;
  nickname?: string;
  nick?: string;
  creator?: { nick?: string };
}

export interface QQUserPlaylistsResponse {
  response?: { data?: { playlists?: QQUserPlaylistItem[] } };
}

export interface QQUserInfo {
  nick?: string;
  nickname?: string;
  name?: string;
  avatarUrl?: string;
  headimg?: string;
  headImg?: string;
  avatar?: string;
  isvip?: number;
  vip_type?: number;
  greenvip?: number;
  is_green_vip?: number;
  sign?: string;
  signature?: string;
}

export interface QQUserDetailResponse {
  response?: { data?: { creator?: QQUserInfo; userinfo?: QQUserInfo } };
}

export interface QQQrResponse {
  ptqrtoken?: string;
  qrsig?: string;
  img?: string;
  response?: { ptqrtoken?: string; qrsig?: string; img?: string };
}

export interface QQLoginCheckResponse {
  response?: { isOk?: boolean; message?: string; session?: string; refresh?: boolean };
  isOk?: boolean;
  message?: string;
  session?: string;
  refresh?: boolean;
}
