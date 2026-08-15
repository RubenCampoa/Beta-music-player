import { Song, Playlist, LyricLine, UserProfile } from '../types/music';
import { decryptQrc } from 'qrc-decoder';
import { cleanTitle, DEFAULT_COVER_PLACEHOLDER, combineMainAndTransLyrics } from '../utils/format';
import { parseLrc as parseLrcCommon } from '../utils/lrc';
import { parseQrc } from '../utils/qrc';
import { StorageKeys, getItem, setItem, removeItem } from '../utils/storage';
import {
  QQSongItem,
  QQSongSinger,
  QQSearchResponse,
  QQRankResponse,
  QQPlayUrlResponse,
  QQLyricResponse,
  QQPlaylistListResponse,
  QQPlaylistDetailResponse,
  QQPlaylistItem,
  QQUserPlaylistsResponse,
  QQUserPlaylistItem,
  QQUserDetailResponse,
  QQQrResponse,
  QQLoginCheckResponse,
} from '../types/qq';

// Local qq-music-api HTTP server (started by Electron main process on port 3200).
// All QQ Music requests are proxied through this local server, which handles
// Referer/Cookie injection, GBK decoding, and VKey resolution internally.
const QQ_API_BASE = 'http://127.0.0.1:3200';

// --- Strict search-hit matching for rank/playlist track resolution ---
// Rank songs carry no pay info and only a numeric songId, so the app resolves
// the real songmid + VIP status by searching. Naively taking the first result
// (or any same-artist hit) mislabels free/VIP when the search surfaces a
// different version (Live/DJ/cover/remix) of the same song — e.g. a free
// cover resolving to the VIP original, or vice versa. Matching is therefore
// strict: never fall back to an unmatched first result.
const VERSION_TAGS = /live|现场|dj|伴奏|remix|翻唱|cover|演唱会|演奏|纯音乐|串烧|remake|rework/i;

const normalizeTitle = (title?: string): string =>
  (title || '').toLowerCase().replace(/[（(].*?[）)]/g, '').replace(/\s+/g, '');

const normalizeExactTitle = (title?: string): string =>
  (title || '').toLowerCase().replace(/[\s·•・_\-—–－]/g, '');

// Pick the best search hit for (name, artist). Returns null when nothing
// matches well enough — the caller keeps the original rank info instead of
// risking a wrong song's VIP status / songmid.
function findMatchingSearchHit(songs: QQSongItem[], name: string, artist: string): QQSongItem | null {
  if (!songs || songs.length === 0) return null;

  const targetTitle = normalizeTitle(name);
  const targetHasVersionTag = VERSION_TAGS.test(name || '');
  const singerMatch = (s: QQSongItem) => {
    const singers = Array.isArray(s.singer) ? s.singer.map((x: QQSongSinger) => x.name || '').join(' / ') : '';
    return singers.toLowerCase().includes((artist || '').toLowerCase());
  };
  const exactTitleMatch = (s: QQSongItem) =>
    normalizeExactTitle(s.songname || s.name) === normalizeExactTitle(name);
  const titleMatch = (s: QQSongItem) => normalizeTitle(s.songname || s.name) === targetTitle;
  const noVersionTag = (s: QQSongItem) => !VERSION_TAGS.test(s.songname || s.name || '');

  const candidates = artist && artist !== '未知歌手' ? songs.filter(singerMatch) : songs;
  if (candidates.length === 0) return null;

  // Keep Live/remix/cover variants distinct whenever the API provides an
  // exact title. Different releases of the same base title can have different
  // playback permissions and artwork.
  const exactHit = candidates.find(exactTitleMatch);
  if (exactHit) return exactHit;

  // Prefer a clean (no version marker) title-equal hit.
  const cleanHit = candidates.find((s) => titleMatch(s) && (targetHasVersionTag || noVersionTag(s)));
  if (cleanHit) return cleanHit;

  // Finally accept a base-title match when the exact release is unavailable.
  return candidates.find(titleMatch) || null;
}

class QQMusicApiService {
  private qqCookie: string = '';

  constructor() {
    this.qqCookie = getItem(StorageKeys.qqMusicCookie) || '';
    this.syncCookieToMain(this.qqCookie);
  }

  private syncCookieToMain(cookie: string) {
    try {
      window.electronAPI?.setQqCookie?.(cookie);
    } catch {
      // Not running in Electron context
    }
  }

  public setCookie(cookie: string) {
    this.qqCookie = cookie;
    setItem(StorageKeys.qqMusicCookie, cookie);
    this.syncCookieToMain(cookie);
  }

  public clearCookie() {
    this.qqCookie = '';
    removeItem(StorageKeys.qqMusicCookie);
    this.syncCookieToMain('');
  }

  public getCookie(): string {
    return this.qqCookie;
  }

  private parseUinFromCookie(): string | null {
    if (!this.qqCookie) return null;
    const match = this.qqCookie.match(/(?:uin|p_uin|wx_uin)=o?(\d+)/i);
    if (match && match[1] !== '0') {
      return match[1];
    }
    return null;
  }

  // Core fetch helper for the local qq-music-api server.
  // All responses are JSON; errors return null so callers can fall back.
  private async fetchApi<T>(endpoint: string, timeoutMs = 10000): Promise<T | null> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(`${QQ_API_BASE}${endpoint}`, {
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
      });
      clearTimeout(timeoutId);
      if (!res.ok) return null;
      return (await res.json()) as T;
    } catch {
      return null;
    }
  }

  // Build a cookie query param string for authenticated endpoints.
  private cookieParam(): string {
    return this.qqCookie ? `&cookie=${encodeURIComponent(this.qqCookie)}` : '';
  }

  // Helper to check if a song requires VIP / payment.
  // The authoritative signal is "playback restricted": a song whose anonymous
  // 128k stream is unavailable (payplay / pay_play === 1, e.g. 晴天). The
  // Green-VIP markers (paytrackmouth / pay_month === 1) alone do NOT make a
  // song VIP — they only gate the higher qualities (320k / lossless), while
  // the 128k stream still plays for free (e.g. 安和桥: payplay 0,
  // paytrackmouth 1, verified playable anonymously). Marking those as VIP is
  // exactly the mislabel reported by users.
  private checkIsVip(item: QQSongItem): boolean {
    if (!item) return false;

    const pay = item.pay || item.pay_info;
    const rawPayPlay = pay?.payplay ?? pay?.pay_play ?? pay?.payPlay;

    // payplay/pay_play is the authoritative playback permission. It must be
    // checked before generic VIP flags: pay_month=1 or vip=1 may only mean
    // that lossless quality/downloads require Green VIP while 128k playback
    // remains free.
    if (rawPayPlay !== undefined && rawPayPlay !== null && rawPayPlay !== '') {
      return Number(rawPayPlay) === 1;
    }

    // Older endpoints sometimes omit the pay object entirely. Only then use
    // the broad flags as a best-effort fallback.
    return (
      Number(item.isvip) === 1 ||
      Number(item.is_vip) === 1 ||
      Number(item.vip) === 1 ||
      Number(item.vip_type ?? 0) > 0
    );
  }

  private hasPlaybackPayFlag(item: QQSongItem): boolean {
    const pay = item.pay || item.pay_info;
    return pay?.payplay !== undefined || pay?.pay_play !== undefined || pay?.payPlay !== undefined;
  }

  private normalizeCoverUrl(raw?: string): string {
    if (!raw || typeof raw !== 'string') return DEFAULT_COVER_PLACEHOLDER;

    const normalized = raw
      .trim()
      .replace(/&amp;/g, '&')
      .replace(/^\/\//, 'https://')
      .replace(/^http:/, 'https:')
      .replace('y.qq.com/music/photo_new/', 'y.gtimg.cn/music/photo_new/');

    if (!normalized || normalized.includes('00000000000000') || /M0000+\.jpg/i.test(normalized)) {
      return DEFAULT_COVER_PLACEHOLDER;
    }
    return normalized;
  }

  // --- Cover URL builder with graceful fallbacks ---
  private buildCoverUrl(albummid?: string, singermid?: string, albumId?: number | string): string {
    const isValidMid = (mid?: string) =>
      Boolean(mid && typeof mid === 'string' && !/^0+$/.test(mid) && mid.length >= 8);

    if (isValidMid(albummid)) {
      return `https://y.gtimg.cn/music/photo_new/T002R300x300M000${albummid}.jpg`;
    }

    const numericAlbumId = Number(albumId);
    if (Number.isFinite(numericAlbumId) && numericAlbumId > 0) {
      const bucket = numericAlbumId % 100;
      return `https://imgcache.qq.com/music/photo/album_300/${bucket}/300_albumpic_${numericAlbumId}_0.jpg`;
    }

    if (isValidMid(singermid)) {
      return `https://y.gtimg.cn/music/photo_new/T001R300x300M000${singermid}.jpg`;
    }
    return DEFAULT_COVER_PLACEHOLDER;
  }

  // Map a raw QQ Music song item (from search / toplist / playlist responses)
  // to the app's Song type. Handles both old-style (songmid, songname) and
  // new-style (mid, name) field names.
  private mapSongItem(item: QQSongItem): Song {
    const songmid = item.songmid || item.mid || (item.songId ? String(item.songId) : '');

    const rawAlbumMid =
      item.albummid ||
      item.album_mid ||
      item.albumMid ||
      item.album?.mid ||
      item.album?.pmid?.replace(/_\d+$/, '');

    const albummid =
      rawAlbumMid && typeof rawAlbumMid === 'string' && !/^0+$/.test(rawAlbumMid) && rawAlbumMid.length >= 8
        ? rawAlbumMid
        : undefined;

    const rawSingerMid =
      Array.isArray(item.singer) && item.singer[0]?.mid
        ? item.singer[0].mid
        : item.singerMid || item.singer_mid || item.singermid || undefined;

    const singermid =
      rawSingerMid && typeof rawSingerMid === 'string' && !/^0+$/.test(rawSingerMid) && rawSingerMid.length >= 8
        ? rawSingerMid
        : undefined;

    const rawCover =
      item.cover ||
      item.pic ||
      item.img ||
      item.album?.pic ||
      item.album?.cover ||
      item.album?.img;

    const normalizedRawCover = this.normalizeCoverUrl(rawCover);
    const coverUrl = normalizedRawCover !== DEFAULT_COVER_PLACEHOLDER
      ? normalizedRawCover
      : this.buildCoverUrl(
          albummid,
          singermid,
          item.albumid ?? item.albumId ?? item.album?.id
        );

    const artistName = Array.isArray(item.singer)
      ? item.singer.map((s: QQSongSinger) => s.name || s.title || '').filter(Boolean).join(' / ')
      : item.singer || item.singerName || '未知歌手';

    return {
      id: `qq_${songmid || item.songid || item.songId}`,
      name: cleanTitle(item.songname || item.name || item.title || '未知歌曲'),
      artist: cleanTitle(artistName),
      album: cleanTitle(item.albumname || item.album?.name || item.album?.title || 'QQ音乐'),
      duration: item.interval || item.duration || 210,
      coverUrl,
      audioUrl: '',
      source: 'qq',
      songmid,
      mediaMid: item.strMediaMid || item.media_mid || item.mediamid || item.file?.media_mid || item.file?.mediaMid,
      isVip: this.checkIsVip(item),
    } as Song;
  }

  // --- QQ Music Search API ---
  // GET /getSearchByKey?key=xxx&limit=30&page=1
  public async searchSongs(query: string, page: number = 1, pageSize: number = 30): Promise<Song[]> {
    if (!query.trim()) return [];

    const data = await this.fetchApi<QQSearchResponse>(
      `/getSearchByKey?key=${encodeURIComponent(query)}&limit=${pageSize}&page=${page}`
    );

    const songList = data?.response?.data?.song?.list || [];
    if (songList.length > 0) {
      return songList.map((item: QQSongItem) => this.mapSongItem(item));
    }

    return this.getFallbackSongs(query);
  }

  // --- QQ Music Toplist / Ranks API ---
  // GET /getRanks?topId=4&limit=100&page=0
  // The musicu.fcg ToplistInfoServer.GetDetail response nests songs under
  // response.req_1.data.data.song as an array-like object (numeric keys).
  //
  // Rank songs use different field names (songId, title, singerName) and
  // lack both a proper songmid and pay/VIP info. Resolve only the number the
  // caller is going to render and cap concurrency to avoid blocking the UI.
  public async getToplistSongs(topid: number = 26, resolveLimit: number = 50): Promise<Song[]> {
    const data = await this.fetchApi<QQRankResponse>(
      `/getRanks?topId=${topid}&limit=100&page=0`
    );

    const songObj = data?.response?.req_1?.data?.data?.song;
    // song is an array-like object with numeric keys, not { list: [...] }
    const songList = songObj ? Object.values(songObj) : [];

    if (songList.length === 0) return [];

    // Map basic song info from rank data
    const songs = songList.map((item: QQSongItem) => this.mapSongItem(item));

    const indices = Array.from(
      { length: Math.min(Math.max(0, resolveLimit), songs.length) },
      (_, index) => index
    );
    await this.enrichSongsBySearch(songs, indices);

    return songs;
  }

  private async enrichSongsBySearch(songs: Song[], indices: number[]): Promise<void> {
    if (indices.length === 0) return;

    let cursor = 0;
    const worker = async () => {
      while (cursor < indices.length) {
        const index = indices[cursor++];
        const original = songs[index];
        if (!original) continue;
        const resolved = await this.resolveSongBySearch(original.name, original.artist);
        if (!resolved) continue;
        songs[index] = resolved;
      }
    };

    const workerCount = Math.min(6, indices.length);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));
  }

  // --- QQ Music Audio Playback URL Resolver ---
  // GET /getMusicPlay?songmid=xxx&quality=xxx&cookie=xxx
  // Response: { data: { playUrl: { [songmid]: { url, error } } } }
  //
  // Quality 320 (M800) is VIP-only and returns empty for free songs.
  // Quality 128 (M500) works for free songs without login.
  // We try quality levels in order: 128 first (most compatible), then 320
  // (if logged in for VIP songs), then m4a as a last resort.
  //
  // Rank songs from getRanks only have a numeric songId (not a proper
  // songmid string like "003rJSwm3TechU"). When we detect a numeric-only
  // songmid, we resolve the real songmid by searching for the song by name,
  // then retry getMusicPlay with the resolved mid.
  public async getSongAudioUrl(songmid: string, songInfo?: { name: string; artist: string }): Promise<string> {
    if (!songmid) return '';

    // If songmid is all digits, it's a numeric songId from getRanks — resolve
    // the real songmid via search before requesting the play URL.
    if (/^\d+$/.test(songmid) && songInfo) {
      const resolved = await this.resolveSongmidBySearch(songInfo.name, songInfo.artist);
      if (resolved) songmid = resolved;
    }

    // Build quality fallback chain: 128 always works for free songs;
    // 320 and m4a are tried as fallbacks for better quality or VIP songs.
    const qualities = this.qqCookie
      ? ['128', '320', 'm4a']
      : ['128', 'm4a'];

    for (const quality of qualities) {
      const data = await this.fetchApi<QQPlayUrlResponse>(
        `/getMusicPlay?songmid=${encodeURIComponent(songmid)}&quality=${quality}${this.cookieParam()}`
      );

      const playUrl = data?.data?.playUrl?.[songmid];
      if (playUrl?.url) {
        return playUrl.url;
      }
    }

    return '';
  }

  // Resolve a proper songmid (e.g. "003rJSwm3TechU") by searching for the
  // song by name + artist. Used as a fallback for rank songs that only have
  // a numeric songId.
  private async resolveSongmidBySearch(name: string, artist: string): Promise<string | null> {
    try {
      const query = artist && artist !== '未知歌手' ? `${name} ${artist}` : name;
      const data = await this.fetchApi<QQSearchResponse>(
        `/getSearchByKey?key=${encodeURIComponent(query)}&limit=5`
      );
      const songs = data?.response?.data?.song?.list || [];
      const hit = findMatchingSearchHit(songs, name, artist);
      return hit?.songmid || hit?.mid || null;
    } catch {
      // Search failed, return null
    }
    return null;
  }

  // Resolve a full Song object (with songmid, VIP status, cover) by searching
  // for the song by name + artist. Used to enrich rank songs that lack pay
  // info and proper songmid. Strict matching (see findMatchingSearchHit) —
  // never falls back to an unmatched first result.
  private async resolveSongBySearch(name: string, artist: string): Promise<Song | null> {
    try {
      const query = artist && artist !== '未知歌手' ? `${name} ${artist}` : name;
      const data = await this.fetchApi<QQSearchResponse>(
        `/getSearchByKey?key=${encodeURIComponent(query)}&limit=5`
      );
      const songs = data?.response?.data?.song?.list || [];
      const hit = findMatchingSearchHit(songs, name, artist);
      return hit ? this.mapSongItem(hit) : null;
    } catch {
      // Search failed
    }
    return null;
  }

  // Smartly decode a lyric string that might be base64, hex, or plain text
  private decodeLyricString(str: string): string {
    if (!str || typeof str !== 'string') return '';
    // If it already looks like plain LRC text (starts with [00: or similar), return as is.
    if (str.trim().startsWith('[')) return str;

    // The musicu API sometimes returns hex-encoded strings. Check if it's purely hex.
    const isHex = /^[0-9a-fA-F]+$/.test(str);
    if (isHex && str.length % 2 === 0) {
      try {
        const bytes = new Uint8Array(str.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)));
        const decoded = new TextDecoder().decode(bytes);
        if (decoded.includes('[')) return decoded;
      } catch {
        // Fall back to base64
      }
    }

    // Try base64 decoding (using atob safely for utf-8)
    try {
      const binString = atob(str);
      const bytes = new Uint8Array(binString.length);
      for (let i = 0; i < binString.length; i++) {
        bytes[i] = binString.charCodeAt(i);
      }
      return new TextDecoder().decode(bytes);
    } catch {
      return str;
    }
  }

  private decodeQrcField(str?: string): string {
    if (!str) return '';
    if (/^[0-9a-fA-F]+$/.test(str) && str.length % 16 === 0) {
      try {
        return decryptQrc(str);
      } catch {
        // Older/non-QRC responses can still be plain LRC or Base64 LRC.
      }
    }
    return this.decodeLyricString(str);
  }

  // --- QQ Music Lyrics Parsing ---
  // GET /getLyric?songmid=xxx&cookie=xxx
  // QRC-capable songs return encrypted word-level data; older songs fall
  // back to plain/Base64 LRC. Translation is a companion timed LRC document.
  public async getSongLyrics(songmid: string): Promise<LyricLine[]> {
    if (!songmid) return [{ time: 0, text: '暂无歌词' }];

    const data = await this.fetchApi<QQLyricResponse>(
      `/getLyric?songmid=${encodeURIComponent(songmid)}${this.cookieParam()}`
    );

    const lyricRaw = data?.response?.lyric;
    if (lyricRaw && typeof lyricRaw === 'string') {
      const transRaw = data?.response?.trans;
      const transLyrics = transRaw
        ? this.parseLrc(this.decodeQrcField(transRaw))
        : [];

      if (data?.response?.qrc === 1) {
        const qrcLyrics = this.filterQqParsedLines(parseQrc(this.decodeQrcField(lyricRaw)));
        if (qrcLyrics.length > 0) {
          return combineMainAndTransLyrics(qrcLyrics, transLyrics);
        }
      }

      const lyricStr = this.decodeQrcField(lyricRaw);
      const mainLyrics = this.parseLrc(this.filterQqMetaLines(lyricStr));
      return combineMainAndTransLyrics(mainLyrics, transLyrics);
    }

    return [
      { time: 0, text: '♪ QQ 音乐全景无损声效' },
      { time: 5, text: '支持同步歌词显示与沉浸式高保真音效' },
    ];
  }

  // QQ lyrics embed metadata rows with timestamps, e.g. the first line is
  // "[00:00.00]搁浅 - 周杰伦 (Jay Chou)" followed by "[00:04.08]词：宋健彰" /
  // "[00:08.17]曲：周杰伦". Without filtering these the first lyric line is
  // time 0, which breaks the pre-chorus countdown dots (activeIndex is never
  // -1). Strip personnel rows everywhere, and the title row only when it is
  // the very first line at time 0 (a real lyric line is never exactly this).
  private filterQqMetaLines(lrc: string): string {
    if (!lrc) return lrc;
    const QQ_PERSONNEL_LINE = /^(词|作词|曲|作曲|编曲|制作人|制作|和声|录音|混音|母带|监制|出品|发行|企划|统筹|文案|封面|OP|SP)[：:]\s*/;
    // Title row is "歌名 - 歌手 (备注)". QQ uses half-width '-', full-width
    // '－' (U+FF0D), en/em dashes, with or without spaces, and song names may
    // carry bracketed subtitles before the dash (e.g. "甲乙丙丁 (你我怎么两清) - 李佳薇").
    const QQ_TITLE_LINE = /^.+[-—–－]\s*\S.*$/;
    let firstTimedIdx = -1;
    return lrc
      .split(/\r?\n/)
      .map((line, idx) => {
        const m = line.match(/\[(\d+):(\d{2})(?:[\.:]\d{1,3})?\]/);
        // Rows without a timestamp ([ti:...], [ar:...], [al:...], blank) are
        // metadata — drop them entirely so the title row (the first timed
        // row) keeps its "first" position regardless of leading meta rows.
        if (!m) return '';
        if (firstTimedIdx === -1) firstTimedIdx = idx;
        const time = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
        const text = line.replace(/\[[^\]]*\]/g, '').trim();
        if (QQ_PERSONNEL_LINE.test(text)) return '';
        if (idx === firstTimedIdx && time === 0 && QQ_TITLE_LINE.test(text)) return '';
        return line;
      })
      .filter((l) => l !== '')
      .join('\n');
  }

  private filterQqParsedLines(lines: LyricLine[]): LyricLine[] {
    const personnelLine = /^(词|作词|曲|作曲|编曲|制作人|制作|和声|录音|混音|母带|监制|出品|发行|企划|统筹|文案|封面|OP|SP)[：:]\s*/;
    const titleLine = /^.+[-—–－]\s*\S.*$/;
    let firstTimedLine = true;

    return lines.filter((line) => {
      const text = line.text.trim();
      if (!text) return false;
      if (personnelLine.test(text)) return false;
      if (firstTimedLine) {
        firstTimedLine = false;
        if (line.time === 0 && titleLine.test(text)) return false;
      }
      return true;
    });
  }

  public parseLrc(lrcString: string): LyricLine[] {
    return parseLrcCommon(lrcString);
  }

  // --- QQ Music Recommendations & Playlists ---
  // GET /getSongLists?limit=20&page=0&sortId=5&categoryId=10000000
  public async getRecommendPlaylists(): Promise<Playlist[]> {
    const data = await this.fetchApi<QQPlaylistListResponse>(
      `/getSongLists?limit=20&page=0&sortId=5&categoryId=10000000`
    );

    const list = data?.response?.data?.list || [];

    if (list.length > 0) {
      return list.map((item: QQPlaylistItem) => {
        const dissid = item.dissid || item.id;
        const rawImg = item.imgurl || item.picurl || '';
        const coverImgUrl = this.normalizeCoverUrl(rawImg);

        return {
          id: `qq_pl_${dissid}`,
          name: cleanTitle(item.dissname || item.title || 'QQ音乐热门推荐歌单'),
          coverImgUrl,
          trackCount: Number(item.songnum) || 0,
          description: cleanTitle(
            item.introduction || `播放量：${Math.floor((item.listennum || 10000) / 10000)}万`
          ),
          platform: 'qq',
        };
      });
    }

    return [
      {
        id: 'qq_pl_1001',
        name: 'QQ 音乐 · 流行热歌榜 TOP50',
        coverImgUrl: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=500&h=500&fit=crop',
        trackCount: 50,
        description: 'QQ 音乐最受关注的热门流行单曲推荐',
        platform: 'qq',
      },
      {
        id: 'qq_pl_1002',
        name: 'QQ 音乐 · 巅峰榜·飙升榜',
        coverImgUrl: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=500&h=500&fit=crop',
        trackCount: 30,
        description: '实时飙升热度最高的音乐趋势榜',
        platform: 'qq',
      },
      {
        id: 'qq_pl_1003',
        name: 'QQ 音乐 · 华语金曲精选',
        coverImgUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&h=500&fit=crop',
        trackCount: 40,
        description: '典藏华语流行好歌推荐',
        platform: 'qq',
      },
      {
        id: 'qq_pl_1004',
        name: 'QQ 音乐 · 独立音乐人摇滚榜',
        coverImgUrl: 'https://images.unsplash.com/photo-1511379938547-c1f69419868d?w=500&h=500&fit=crop',
        trackCount: 35,
        description: '独立原创力量与摇滚碰撞',
        platform: 'qq',
      },
    ];
  }

  // Fetch Playlist Songs Detail
  // GET /getSongListDetail?disstid=xxx
  public async getPlaylistSongs(playlistId: string | number): Promise<Song[]> {
    const rawId = String(playlistId).replace(/^qq_pl_/, '');

    // Hardcoded toplist shortcuts
    if (rawId === '1001') {
      const songs = await this.getToplistSongs(26);
      if (songs.length > 0) return songs;
    }
    if (rawId === '1002') {
      const songs = await this.getToplistSongs(62);
      if (songs.length > 0) return songs;
    }
    if (rawId === '1003') {
      const songs = await this.getToplistSongs(59);
      if (songs.length > 0) return songs;
    }
    if (rawId === '1004') {
      const songs = await this.getToplistSongs(52);
      if (songs.length > 0) return songs;
    }

    const data = await this.fetchApi<QQPlaylistDetailResponse>(
      `/getSongListDetail?disstid=${encodeURIComponent(rawId)}`
    );

    const cd = data?.response?.cdlist?.[0];
    const songList = cd?.songlist || [];

    if (songList.length > 0) {
      const songs = songList.map((item: QQSongItem) => this.mapSongItem(item));
      const missingMetadataIndices = songList
        .map((item, index) => ({ item, index }))
        .filter(({ item }) => !this.hasPlaybackPayFlag(item))
        .slice(0, 50)
        .map(({ index }) => index);
      await this.enrichSongsBySearch(songs, missingMetadataIndices);
      return songs;
    }

    // Final fallback: search by genre keyword
    const searchQueries: Record<string, string> = {
      '1001': '华语热歌',
      '1002': '飙升',
      '1003': '经典流行',
      '1004': '摇滚',
    };

    const query = searchQueries[rawId] || 'QQ音乐精选';
    return this.searchSongs(query);
  }

  public async getRecommendSongs(): Promise<Song[]> {
    const songs = await this.getToplistSongs(26, 15);
    if (songs.length > 0) {
      return songs.slice(0, 15);
    }
    return this.getFallbackSongs('QQ音乐热歌');
  }

  private getFallbackSongs(query: string): Song[] {
    return [
      {
        id: 'qq_rec_01',
        name: `${query} · 晴天`,
        artist: '周杰伦',
        album: '叶惠美',
        duration: 269,
        coverUrl: 'https://y.gtimg.cn/music/photo_new/T002R300x300M0000030E2vj2A2fVb.jpg',
        audioUrl: '',
        source: 'qq',
        songmid: '0030E2vj2A2fVb',
        isVip: true,
      },
      {
        id: 'qq_rec_02',
        name: '孤勇者',
        artist: '陈奕迅',
        album: '孤勇者',
        duration: 256,
        coverUrl: 'https://y.gtimg.cn/music/photo_new/T002R300x300M000001B2vj2A2fVb.jpg',
        audioUrl: '',
        source: 'qq',
        songmid: '001B2vj2A2fVb',
        isVip: true,
      },
      {
        id: 'qq_rec_03',
        name: '七里香',
        artist: '周杰伦',
        album: '七里香',
        duration: 299,
        coverUrl: 'https://y.gtimg.cn/music/photo_new/T002R300x300M000003a2vj2A2fVb.jpg',
        audioUrl: '',
        source: 'qq',
        songmid: '003a2vj2A2fVb',
        isVip: true,
      },
    ];
  }

  // --- QQ Music User Playlists ---
  // GET /user/getUserPlaylists?uin=xxx&cookie=xxx
  // Response: { response: { code: 0, data: { playlists: [...] } } }
  public async getUserPlaylists(): Promise<Playlist[]> {
    const uin = this.parseUinFromCookie();
    if (!uin) return [];

    const data = await this.fetchApi<QQUserPlaylistsResponse>(
      `/user/getUserPlaylists?uin=${uin}&limit=50${this.cookieParam()}`
    );

    const playlists: QQUserPlaylistItem[] = data?.response?.data?.playlists || [];
    if (playlists.length === 0) return [];

    const seen = new Set<string>();
    const result: Playlist[] = [];

    for (const item of playlists) {
      const dissid = item.dissid ?? item.tid ?? item.cid ?? item.id;
      if (dissid === undefined || dissid === null) continue;
      const plId = `qq_pl_${dissid}`;
      if (seen.has(plId)) continue;
      seen.add(plId);

      const rawCover = item.coverUrl || item.logo || item.imgurl || item.picurl || item.cover || '';
      const coverImgUrl = this.normalizeCoverUrl(rawCover);

      let trackCount = Number(item.songnum ?? item.song_cnt ?? item.songCount ?? 0);
      if (!trackCount && typeof item.subtitle === 'string') {
        const m = item.subtitle.match(/(\d+)/);
        if (m) trackCount = parseInt(m[1], 10) || 0;
      }

      result.push({
        id: plId,
        name: cleanTitle(item.title || item.dissname || item.name || 'QQ音乐歌单'),
        coverImgUrl,
        trackCount,
        creatorName: cleanTitle(item.creator?.nick || item.nickname || item.nick || ''),
        description: cleanTitle(item.introduction || item.subtitle || ''),
        isUserPlaylist: true,
        platform: 'qq',
      });
    }

    return result;
  }

  // --- QQ Music User Profile Auth ---
  // GET /user/getUserDetail?uin=xxx&cookie=xxx
  // Response: { response: { code: 0, data: { creator: { ... }, ... } } }
  public async getUserAccount(): Promise<UserProfile | null> {
    if (!this.qqCookie) return null;

    const uin = this.parseUinFromCookie();
    if (!uin) return null;

    const fallbackAvatar = `https://q.qlogo.cn/headimg_dl?dst_uin=${uin}&spec=140`;
    let nickname = '';
    let avatarUrl = fallbackAvatar;
    let vipType = 0;
    let signature = 'QQ 音乐用户';

    const data = await this.fetchApi<QQUserDetailResponse>(
      `/user/getUserDetail?uin=${uin}${this.cookieParam()}`
    );

    const creator = data?.response?.data?.creator || data?.response?.data?.userinfo || null;
    if (creator) {
      nickname = creator.nick || creator.nickname || creator.name || '';
      avatarUrl = creator.avatarUrl || creator.headimg || creator.headImg || creator.avatar || fallbackAvatar;
      avatarUrl = avatarUrl.replace(/^http:/, 'https:');
      if (creator.isvip === 1 || (creator.vip_type ?? 0) > 0 || creator.greenvip === 1 || creator.is_green_vip === 1) {
        vipType = 1;
        signature = 'QQ 音乐绿钻会员';
      }
      if (creator.sign || creator.signature) {
        signature = cleanTitle(creator.sign || creator.signature);
      }
    }

    // Cookie-based fallback for the nickname
    if (!nickname) {
      const nicknameMatch = this.qqCookie.match(/nick=([^;]+)/i);
      nickname = nicknameMatch ? decodeURIComponent(nicknameMatch[1]) : `QQ用户_${uin.slice(-4)}`;
    }

    return {
      userId: uin,
      nickname,
      avatarUrl,
      signature,
      vipType,
      isLoggedIn: true,
      platform: 'qq',
    };
  }

  // --- QQ Music QR Code Login ---
  // GET /getQQLoginQr → returns { img, ptqrtoken, qrsig } directly (no response wrapper)
  // The img field is a base64 data URI for the QR code image.
  public async getQrKey(): Promise<string> {
    const data = await this.fetchApi<QQQrResponse>(`/getQQLoginQr`);
    if (!data) return '';
    const ptqrtoken = data.ptqrtoken || data.response?.ptqrtoken || '';
    const qrsig = data.qrsig || data.response?.qrsig || '';
    const img = data.img || data.response?.img || '';
    return JSON.stringify({ ptqrtoken, qrsig, img });
  }

  public async getQrImage(qrKey: string): Promise<string> {
    try {
      const parsed = JSON.parse(qrKey);
      return parsed.img || '';
    } catch {
      return '';
    }
  }

  // POST /checkQQLoginQr with { ptqrtoken, qrsig }
  // Response: { isOk: boolean, message: string, session?: string, refresh?: boolean }
  public async checkQrStatus(qrKey: string): Promise<{ code: number; message: string; cookie?: string }> {
    try {
      const { ptqrtoken, qrsig } = JSON.parse(qrKey);
      if (!ptqrtoken || !qrsig) {
        return { code: 800, message: '二维码参数缺失' };
      }

      const res = await fetch(`${QQ_API_BASE}/checkQQLoginQr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ptqrtoken, qrsig }),
      });
      if (!res.ok) return { code: 800, message: '检查扫码状态失败' };

      const data = (await res.json()) as QQLoginCheckResponse;
      const result = data?.response || data;

      if (result.isOk) {
        const cookie = result.session || '';
        if (cookie) {
          this.setCookie(cookie);
          return { code: 803, message: '登录成功', cookie };
        }
        return { code: 803, message: '登录成功' };
      }

      if (result.refresh) {
        return { code: 800, message: '二维码已过期，请重新获取' };
      }

      // Not scanned yet — check if the response text indicates "已扫描"
      return { code: 801, message: result.message || '请使用 QQ 音乐 / 微信 App 扫码登录' };
    } catch {
      return { code: 800, message: '请使用 QQ 音乐 / 微信 App 扫码登录' };
    }
  }
}

export const qqMusicApi = new QQMusicApiService();
