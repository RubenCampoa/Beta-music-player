import { LyricLine, Playlist, Song, UserProfile } from '../types/music';
import { StorageKeys, getItem, removeItem, setItem } from '../utils/storage';
import { parseKrc } from '../utils/krc';
import { parseLrc as parseSharedLrc } from '../utils/lrc';

const KUGOU_API_BASE = 'http://127.0.0.1:3400';
const KUGOU_LEGACY_SEARCH = 'http://mobilecdn.kugou.com/api/v3/search/song';
const KUGOU_LEGACY_PLAY = 'http://m.kugou.com/app/i/getSongInfo.php';

type JsonRecord = Record<string, any>;
type KugouApiError = Error & { status?: number; body?: JsonRecord };

function firstArray(...values: any[]): any[] {
  return values.find((value) => Array.isArray(value) && value.length > 0)
    || values.find(Array.isArray)
    || [];
}

function isRecord(value: any): value is JsonRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

// The local proxy normally forwards the KuGou response directly, but older
// builds can wrap it in `body`, and some endpoints add another `data` layer.
// Keep the service tolerant of both shapes so a proxy update does not break
// login, lyrics, or playback again.
function unwrapApiBody(value?: any): JsonRecord {
  let current = value;
  for (let index = 0; index < 2; index += 1) {
    if (!isRecord(current?.body)) break;
    current = current.body;
  }
  return isRecord(current) ? current : {};
}

function unwrapApiData(value?: any): JsonRecord {
  const body = unwrapApiBody(value);
  let current = body.data;
  for (let index = 0; index < 2; index += 1) {
    if (!isRecord(current?.data)) break;
    current = current.data;
  }
  return isRecord(current) ? current : body;
}

class KugouMusicApiService {
  private cookie = '';
  private audioUrlCache = new Map<string, { url: string; expiresAt: number }>();
  private qrImages = new Map<string, string>();
  private recommendPlaylistCache: Playlist[] | null = null;
  private deviceRegistrationPromise: Promise<void> | null = null;

  constructor() {
    // A session issued for standard KuGou cannot be used with the Concept
    // Edition (lite) API. Clear the legacy session once instead of keeping a
    // stale logged-in placeholder that can never return profile data.
    const storedPlatform = getItem(StorageKeys.kugouMusicPlatform);
    if (storedPlatform !== 'lite') {
      removeItem(StorageKeys.kugouMusicCookie);
      setItem(StorageKeys.kugouMusicPlatform, 'lite');
    }
    this.cookie = getItem(StorageKeys.kugouMusicCookie) || '';
  }

  public setCookie(cookie: string) {
    const nextCookie = cookie.trim();
    if (nextCookie !== this.cookie) {
      // A legacy/public URL resolved before login must not survive a switch
      // to a VIP account (and vice versa).
      this.audioUrlCache.clear();
      this.recommendPlaylistCache = null;
    }
    this.cookie = nextCookie;
    setItem(StorageKeys.kugouMusicPlatform, 'lite');
    if (this.cookie) setItem(StorageKeys.kugouMusicCookie, this.cookie);
    else removeItem(StorageKeys.kugouMusicCookie);
  }

  public getCookie(): string {
    return this.cookie;
  }

  private getCookieValue(name: string): string {
    const part = this.cookie
      .split(';')
      .map((value) => value.trim())
      .find((value) => value.toLowerCase().startsWith(`${name.toLowerCase()}=`));
    if (!part) return '';
    const value = part.slice(part.indexOf('=') + 1);
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  public clearCookie() {
    this.cookie = '';
    this.audioUrlCache.clear();
    removeItem(StorageKeys.kugouMusicCookie);
  }

  private mergeCookieValues(values: Record<string, any>) {
    const cookieMap = new Map<string, string>();
    for (const part of this.cookie.split(';')) {
      const separator = part.indexOf('=');
      if (separator > 0) cookieMap.set(part.slice(0, separator).trim(), part.slice(separator + 1).trim());
    }
    Object.entries(values).forEach(([name, value]) => {
      if (value !== undefined && value !== null && value !== '') cookieMap.set(name, String(value));
    });
    this.setCookie(Array.from(cookieMap.entries()).map(([name, value]) => `${name}=${value}`).join('; '));
  }

  /** Convert/refresh a web token into the Android API session when possible. */
  public async refreshLogin(): Promise<boolean> {
    if (!this.cookie) return false;
    try {
      const response = await this.fetchApi<JsonRecord>('/login/token', {}, 12000);
      const body = unwrapApiBody(response);
      const data = unwrapApiData(response);
      if (Number(body?.status ?? data?.status ?? 0) !== 1 || !data?.token || !data?.userid) return false;
      this.mergeCookieValues({
        token: data.token,
        userid: data.userid,
        vip_type: data.vip_type,
        vip_token: data.vip_token,
        t1: data.t1,
      });
      return true;
    } catch {
      return false;
    }
  }

  private async fetchApi<T = JsonRecord>(
    endpoint: string,
    params: Record<string, string | number | boolean | undefined> = {},
    timeoutMs = 10000,
  ): Promise<T> {
    const url = new URL(`${KUGOU_API_BASE}${endpoint}`);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
    });
    if (this.cookie && !url.searchParams.has('cookie')) url.searchParams.set('cookie', this.cookie);
    url.searchParams.set('timestamp', String(Date.now()));

    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url.toString(), { signal: controller.signal, cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(`KuGou API ${response.status}`) as KugouApiError;
        error.status = response.status;
        error.body = payload as JsonRecord;
        throw error;
      }
      return payload as T;
    } finally {
      window.clearTimeout(timer);
    }
  }

  private normalizeCoverUrl(value?: any): string {
    if (!value) return '';
    if (Array.isArray(value)) {
      for (const item of value) {
        const url = this.normalizeCoverUrl(item);
        if (url) return url;
      }
      return '';
    }
    const source = typeof value === 'string'
      ? value
      : value?.url
        || value?.src
        || value?.href
        || value?.image
        || value?.pic
        || value?.imgurl
        || value?.img_url
        || value?.cover
        || value?.large
        || value?.big
        || value?.origin
        || '';
    if (!source) return '';
    const normalized = String(source)
      .trim()
      .replace(/&amp;/gi, '&')
      .replace(/\{size\}/gi, '400')
      .replace(/\{width\}/gi, '400')
      .replace(/\{height\}/gi, '400')
      .replace(/\\/g, '/');
    return normalized.startsWith('//') ? `https:${normalized}` : normalized.replace(/^http:/i, 'https:');
  }

  private stripAudioExtension(value: string): string {
    return value
      .replace(/\.(?:mp3|flac|m4a|aac|wav|ogg|oga|ape|wma|aiff?)(?:[?#].*)?$/i, '')
      .trim();
  }

  private splitPlaylistTrackName(name: string, artist: string, singerNames: string[] = []): string {
    const separatorIndex = name.indexOf(' - ');
    if (separatorIndex <= 0) return name;

    const normalizeArtist = (value: string) => value
      .toLowerCase()
      .replace(/[\s/／、，,&&·.-]/g, '');
    const prefix = normalizeArtist(name.slice(0, separatorIndex));
    const knownArtists = [artist, ...singerNames]
      .map(normalizeArtist)
      .filter(Boolean);
    const combinedArtists = normalizeArtist(artist);

    // KuGou playlist rows commonly encode `歌手甲、歌手乙 - 歌名`, while
    // singerinfo uses `/`. Compare normalized identities before removing the
    // prefix so titles containing a dash remain intact.
    const matchesArtist = prefix === combinedArtists
      || (knownArtists.length > 0 && knownArtists.every((singer) => prefix.includes(singer)));
    return matchesArtist ? name.slice(separatorIndex + 3).trim() : name;
  }

  // KuGou does not use one stable `is_vip` flag across search, playlist and
  // privilege endpoints. Classify from the actual entitlement fields instead
  // of treating `privilege: 10` alone as paid: a playable/free resource can
  // still carry that value for an optional higher-quality variant.
  private getVipRequirement(raw?: JsonRecord): boolean | null {
    if (!raw || typeof raw !== 'object') return null;
    const transParam = raw.trans_param || raw.transParam || {};
    const payInfo = raw.pay_info || raw.payInfo || raw.pay || {};
    const downloadInfo = firstArray(raw.download, raw.download_info, raw.downloadInfo)[0] || {};
    const relatedGoods = firstArray(raw.relate_goods, raw.relateGoods);
    const value = (...candidates: any[]) => candidates.find((candidate) => candidate !== undefined && candidate !== null && candidate !== '');
    const number = (...candidates: any[]) => {
      const candidate = value(...candidates);
      const parsed = Number(candidate);
      return Number.isFinite(parsed) ? parsed : NaN;
    };
    const positiveFlag = (...candidates: any[]) => candidates.some((candidate) => {
      if (candidate === true) return true;
      if (typeof candidate === 'string' && /^(true|vip|paid|charge)$/i.test(candidate.trim())) return true;
      const parsed = Number(candidate);
      return Number.isFinite(parsed) && parsed > 0;
    });

    const explicitVip = positiveFlag(raw.is_vip, raw.isvip, raw.isVip, raw.vip, raw.vip_song, raw.vipSong);
    const musicPackAdvance = number(transParam.musicpack_advance, transParam.musicpackAdvance, raw.musicpack_advance);
    const payType = number(raw.pay_type, raw.payType, payInfo.pay_type, payInfo.payType, downloadInfo.pay_type, downloadInfo.payType);
    const price = number(raw.price, payInfo.price);
    const packagePrice = number(raw.pkg_price, raw.pkgPrice, payInfo.pkg_price, payInfo.pkgPrice);
    const fee = number(raw.fee, raw.fee_type, raw.feeType, payInfo.fee);
    const privilege = number(raw.privilege, raw.privilege_type, raw.privilegeType);
    const status = number(raw.status, raw.play_status, raw.playStatus);
    const payBlock = number(raw.pay_block_text, raw.payBlockText, transParam.pay_block_tpl, transParam.payBlockTpl);

    const relatedPaid = relatedGoods.some((item) => this.getVipRequirement({
      ...item,
      // Related quality records omit `download`; retain only their direct
      // entitlement fields and avoid recursively reading the parent row.
      download: undefined,
      relate_goods: undefined,
    }) === true);
    const hasMetadata = [musicPackAdvance, payType, price, packagePrice, fee, privilege, status, payBlock]
      .some((candidate) => Number.isFinite(candidate))
      || [raw.is_vip, raw.isvip, raw.isVip, raw.vip, raw.vip_song, raw.vipSong].some((candidate) => candidate !== undefined)
      || relatedGoods.length > 0;
    if (!hasMetadata) return null;

    // In Concept Edition cloud-playlist payloads `download[0].pay_type = 3`
    // is the reliable paid/VIP flag, even when the top-level privilege is 8.
    if (explicitVip || musicPackAdvance > 0 || payType > 0 || price > 0 || packagePrice > 0 || fee > 0 || relatedPaid) return true;
    if (privilege >= 10 && (!Number.isFinite(status) || status === 0)) return true;
    // A non-zero pay block without an available status is another variant
    // returned by older Concept Edition search responses.
    if (payBlock > 1 && (!Number.isFinite(status) || status === 0)) return true;
    return false;
  }

  private mapSongItem(raw: JsonRecord): Song | null {
    const hash = String(raw.hash || raw.filehash || raw.FileHash || raw.file_hash || '').trim();
    if (!hash) return null;

    const singerSource = raw.singerinfo || raw.singers || raw.singer_info || [];
    const singers = Array.isArray(singerSource) ? singerSource : [singerSource];
    const singerNames = singers.map((s) => String(s?.name || s?.singername || s?.singer_name || '')).filter(Boolean);
    const filename = this.stripAudioExtension(String(raw.filename || raw.file_name || raw.fileName || raw.name || ''));
    const artist = String(
      raw.singername || raw.singer_name || raw.author || raw.artist ||
      singerNames.join(' / ') ||
      filename.split(' - ')[0] || '未知歌手',
    );
    const rawName = this.stripAudioExtension(String(
      // `remark` is often a drama/album description, not a track title.
      raw.songname || raw.song_name || raw.title || raw.name || filename || raw.remark || '未知歌曲',
    ));
    const name = this.stripAudioExtension(this.splitPlaylistTrackName(rawName, artist, singerNames));
    const durationValue = Number(raw.duration ?? raw.interval ?? 0);
    const duration = durationValue > 10000 ? durationValue / 1000 : durationValue || Number(raw.timelen || 0) / 1000;
    const albumInfo = raw.albuminfo || raw.album_info || {};
    const transParam = raw.trans_param || raw.transParam || {};
    const trackInfo = raw.info || raw.audio_info || raw.song_info || {};
    const coverUrl = this.normalizeCoverUrl(
      // Account-playlist endpoints sometimes put the playlist cover in
      // `cover` for every row. Prefer an album/track image when supplied.
      raw.album_cover
      || raw.album_pic
      || raw.album_img
      || raw.album_imgurl
      || trackInfo.image
      || trackInfo.cover
      || trackInfo.pic
      || trackInfo.imgurl
      || albumInfo.cover
      || albumInfo.pic
      || albumInfo.imgurl
      || albumInfo.img
      || albumInfo.sizable_cover
      || raw.imgurl
      || raw.img_url
      || raw.img
      || raw.pic
      || raw.sizable_cover
      || raw.cover
      || raw.cover_url
      || raw.coverUrl
      || transParam.union_cover
      || transParam.unionCover
      || transParam.sizable_cover,
    );
    const isVip = this.getVipRequirement(raw) ?? false;

    return {
      id: `kg_${hash}`,
      name,
      artist,
      album: String(raw.album_name || raw.albumname || albumInfo.name || '未知专辑'),
      duration: Math.max(0, Math.round(duration)),
      coverUrl,
      audioUrl: '',
      source: 'kugou',
      kugouHash: hash,
      kugouAlbumId: raw.album_id ?? raw.albumid ?? albumInfo.id ?? '',
      kugouAlbumAudioId: raw.album_audio_id ?? raw.audio_id ?? raw.album_audioid ?? '',
      isVip,
      fee: Number(raw.fee ?? raw.fee_type ?? raw.pay_type ?? 0) || 0,
    };
  }

  private mapSongList(items: any[]): Song[] {
    const seen = new Set<string>();
    return items
      .map((item) => this.mapSongItem(item || {}))
      .filter((song): song is Song => Boolean(song && !seen.has(song.id) && seen.add(song.id)));
  }

  private extractPlaylistSongItems(response?: JsonRecord): any[] {
    const body = unwrapApiBody(response);
    const data = unwrapApiData(response);
    return firstArray(
      body?.data?.songs,
      body?.data?.info,
      body?.data?.lists,
      body?.data?.data?.songs,
      body?.data?.data?.info,
      body?.songs,
      body?.info,
      body?.lists,
      data?.songs,
      data?.info,
      data?.lists,
    );
  }

  private async enrichVipStatuses(songs: Song[]): Promise<Song[]> {
    const candidates = songs.filter((song) => Boolean(song.kugouHash)).slice(0, 120);
    if (candidates.length === 0) return songs;

    const batches: Song[][] = [];
    for (let index = 0; index < candidates.length; index += 40) {
      batches.push(candidates.slice(index, index + 40));
    }

    const resolvedStatuses = new Map<string, boolean>();
    const resolvedCovers = new Map<string, string>();
    await Promise.all(batches.map(async (batch) => {
      try {
        const response = await this.fetchApi<JsonRecord>('/privilege/lite', {
          hash: batch.map((song) => song.kugouHash).join(','),
          // `/privilege/lite` ignores `album_id`; it requires the audio row
          // identifier. Sending the wrong key made the enrichment silently
          // fall back to an incorrect free badge.
          AlbumAudioID: batch.map((song) => song.kugouAlbumAudioId || song.kugouAlbumId || 0).join(','),
        }, 12000);
        const body = unwrapApiBody(response);
        const data = unwrapApiData(response);
        const entries = firstArray(body?.data, body?.data?.data, body?.data?.info, data?.data, data?.info);
        entries.forEach((entry) => {
          const hash = String(entry?.hash || entry?.filehash || '').trim().toUpperCase();
          const isVip = this.getVipRequirement(entry);
          if (hash && isVip !== null) resolvedStatuses.set(hash, isVip);
          const cover = this.normalizeCoverUrl(
            entry?.info?.image
            || entry?.info?.cover
            || entry?.info?.imgurl
            || entry?.image
            || entry?.cover
            || entry?.imgurl,
          );
          if (hash && cover) resolvedCovers.set(hash, cover);
        });
      } catch {
        // Keep the source endpoint's status if the optional enrichment API is
        // unavailable; playback itself never waits for badge resolution.
      }
    }));

    if (resolvedStatuses.size === 0 && resolvedCovers.size === 0) return songs;
    return songs.map((song) => {
      const hash = String(song.kugouHash || '').toUpperCase();
      const resolvedVip = resolvedStatuses.get(hash);
      const coverUrl = resolvedCovers.get(hash);
      if (resolvedVip === undefined && !coverUrl) return song;
      return {
        ...song,
        // Paid markers from the source list and from the privilege endpoint
        // are both authoritative positive signals. Never let an incomplete
        // privilege row downgrade an already-paid track to free.
        ...(resolvedVip === undefined ? {} : { isVip: song.isVip === true || resolvedVip }),
        // The privilege endpoint returns the item-specific cover and is used
        // to correct cloud-list rows that repeat one playlist cover.
        ...(coverUrl ? { coverUrl } : {}),
      };
    });
  }

  /** Re-check metadata for persisted queue/favorite entries from older builds. */
  public async resolveSongMetadata(song: Song): Promise<Song> {
    if (!song.kugouHash && song.source !== 'kugou') return song;
    const [resolved] = await this.enrichVipStatuses([song]);
    let enriched = resolved || song;

    // KuGou's legacy public search endpoint and the /privilege/lite enrichment
    // often return songs without a cover image. Fetch it from the /song/url
    // detail endpoint (which always returns album art) so the fluid background
    // and artwork display work correctly.
    if (!enriched.coverUrl) {
      const hash = enriched.kugouHash || enriched.id.replace(/^kg_/, '');
      if (hash) {
        try {
          const detail = await this.fetchApi<JsonRecord>('/song/url', {
            hash,
            album_id: enriched.kugouAlbumId,
            album_audio_id: enriched.kugouAlbumAudioId,
            quality: '128',
          }, 8000);
          const cover = this.normalizeCoverUrl(this.findCoverUrl(detail));
          if (cover) enriched = { ...enriched, coverUrl: cover };
        } catch {
          // Cover fetch is best-effort; playback still works without it.
        }
      }
    }

    return enriched;
  }

  public async searchSongs(query: string, page = 1, pageSize = 30): Promise<Song[]> {
    if (this.cookie) {
      try {
        const response = await this.fetchApi<JsonRecord>('/search', { keywords: query, page, pagesize: pageSize });
        const items = firstArray(response?.data?.lists, response?.data?.info, response?.data?.songs, response?.lists);
        const songs = this.mapSongList(items);
        if (songs.length) return this.enrichVipStatuses(songs);
      } catch {
        // The upstream search endpoint can require a registered device. Fall
        // back to KuGou's public mobile search while keeping playback local.
      }
    }

    const url = new URL(KUGOU_LEGACY_SEARCH);
    url.searchParams.set('format', 'json');
    url.searchParams.set('keyword', query);
    url.searchParams.set('page', String(page));
    url.searchParams.set('pagesize', String(pageSize));
    url.searchParams.set('showtype', '1');
    const response = await fetch(url.toString(), { cache: 'no-store' });
    if (!response.ok) throw new Error(`KuGou search ${response.status}`);
    const payload = await response.json();
    return this.enrichVipStatuses(this.mapSongList(firstArray(payload?.data?.info, payload?.data?.lists)));
  }

  public async getRecommendPlaylists(): Promise<Playlist[]> {
    if (this.recommendPlaylistCache) return this.recommendPlaylistCache;
    const response = await this.fetchApi<JsonRecord>('/top/playlist', { category_id: 0 });
    const items = firstArray(response?.data?.special_list, response?.data?.info, response?.data?.lists);
    const playlists = items
      .map((item): Playlist | null => {
        const id = item.global_collection_id || item.specialid || item.id;
        if (!id) return null;
        return {
          id: `kg_pl_${id}`,
          name: String(item.specialname || item.name || '酷狗概念版歌单'),
          coverImgUrl: this.normalizeCoverUrl(item.imgurl || item.flexible_cover || item.pic),
          trackCount: Number(item.songcount || item.total || 0),
          creatorName: String(item.nickname || item.username || '酷狗概念版'),
          description: String(item.intro || item.description || ''),
          platform: 'kugou',
        };
      })
      .filter((item): item is Playlist => Boolean(item));
    this.recommendPlaylistCache = playlists;
    return playlists;
  }

  public async getRecommendSongs(): Promise<Song[]> {
    const playlists = await this.getRecommendPlaylists();
    for (const playlist of playlists.slice(0, 3)) {
      try {
        const songs = await this.getPlaylistSongs(playlist.id, 40);
        if (songs.length) return songs;
      } catch {
        // Try the next public playlist.
      }
    }
    return [];
  }

  public async getPlaylistSongs(playlistId: string | number, pageSize = 100): Promise<Song[]> {
    const id = String(playlistId);
    if (id === 'kg_daily') return this.getRecommendSongs();

    if (id.startsWith('kg_user_')) {
      const encodedIds = id.replace(/^kg_user_/, '').split('::');
      const listId = encodedIds[0];
      let globalCollectionId = '';
      if (encodedIds[1]) {
        try {
          globalCollectionId = decodeURIComponent(encodedIds[1]);
        } catch {
          globalCollectionId = encodedIds[1];
        }
      }

      try {
        const response = await this.fetchApi<JsonRecord>('/playlist/track/all/new', {
          listid: listId,
          userid: this.getCookieValue('userid'),
          token: this.getCookieValue('token'),
          pagesize: pageSize,
          page: 1,
        });
        const songs = this.mapSongList(this.extractPlaylistSongItems(response));
        if (songs.length || !globalCollectionId) return this.enrichVipStatuses(songs);
      } catch (error) {
        // Some Concept Edition collections expose a listid that the new
        // cloud-list endpoint rejects. If the same item also carries its
        // global_collection_id, retry through the public collection endpoint.
        if (!globalCollectionId) throw error;
      }

      if (globalCollectionId) {
        const response = await this.fetchApi<JsonRecord>('/playlist/track/all', {
          id: globalCollectionId,
          pagesize: pageSize,
          page: 1,
        }, 15000);
        return this.enrichVipStatuses(this.mapSongList(this.extractPlaylistSongItems(response)));
      }
      return [];
    }

    const collectionId = id.replace(/^kg_pl_/, '').replace(/^kugou_/, '');
    const response = await this.fetchApi<JsonRecord>('/playlist/track/all', {
      id: collectionId,
      pagesize: pageSize,
      page: 1,
    }, 15000);
    return this.enrichVipStatuses(this.mapSongList(this.extractPlaylistSongItems(response)));
  }

  private findAudioUrl(value: any, depth = 0): string {
    if (depth > 7 || value == null) return '';
    if (typeof value === 'string') {
      const candidate = value.trim();
      if (/^https?:\/\//i.test(candidate)) return candidate;
      return candidate.startsWith('//') ? `https:${candidate}` : '';
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        const url = this.findAudioUrl(item, depth + 1);
        if (url) return url;
      }
      return '';
    }
    if (typeof value === 'object') {
      for (const key of [
        'url', 'play_url', 'playUrl', 'audio_url', 'audioUrl', 'file_url', 'fileUrl',
        'backupUrl', 'backup_url', 'downurl', 'down_url', 'url_128', 'url_320',
        'url_flac', 'high_url',
      ]) {
        const url = this.findAudioUrl(value[key], depth + 1);
        if (url) return url;
      }
      for (const key of ['body', 'data', 'urls', 'info', 'result', 'response', 'extra', 'play_info', 'playInfo']) {
        const url = this.findAudioUrl(value[key], depth + 1);
        if (url) return url;
      }
    }
    return '';
  }

  /** Recursively search a Kugou API response for an album cover image URL. */
  private findCoverUrl(value: any, depth = 0): string {
    if (depth > 5 || value == null) return '';
    if (typeof value === 'string') {
      const candidate = value.trim();
      if (/^https?:\/\/.*\.(jpg|jpeg|png|webp)/i.test(candidate)) return candidate;
      if (candidate.startsWith('//') && /\.(jpg|jpeg|png|webp)/i.test(candidate)) return `https:${candidate}`;
      return '';
    }
    if (Array.isArray(value)) return '';
    if (typeof value === 'object') {
      for (const key of [
        'album_cover', 'album_img', 'album_pic', 'album_imgurl', 'albumCover',
        'image', 'img', 'imgurl', 'img_url', 'pic', 'cover', 'cover_url', 'coverUrl',
        'sizable_cover', 'author_image', 'trans_param',
      ]) {
        const url = this.findCoverUrl(value[key], depth + 1);
        if (url) return url;
      }
      for (const key of ['body', 'data', 'info', 'extra', 'authors']) {
        if (Array.isArray(value[key])) {
          for (const item of value[key]) {
            const url = this.findCoverUrl(item, depth + 1);
            if (url) return url;
          }
        } else {
          const url = this.findCoverUrl(value[key], depth + 1);
          if (url) return url;
        }
      }
    }
    return '';
  }

  private async registerDevice(): Promise<void> {
    try {
      const result = await this.fetchApi<JsonRecord>('/register/dev', {
        userid: this.getCookieValue('userid'),
        token: this.getCookieValue('token'),
      }, 7000);
      const body = unwrapApiBody(result);
      const data = unwrapApiData(result);
      const dfid = data?.dfid || data?.dfId || body?.dfid || body?.dfId || result?.dfid;
      if (dfid) {
        const parts = this.cookie.split(';').map((part) => part.trim()).filter(Boolean);
        const filtered = parts.filter((part) => !part.toLowerCase().startsWith('dfid='));
        this.setCookie([...filtered, `dfid=${dfid}`].join('; '));
      }
    } catch {
      // Device registration is best-effort and can be unavailable upstream.
    }
  }

  private async ensureDeviceRegistered(): Promise<void> {
    if (this.getCookieValue('dfid')) return;
    if (!this.deviceRegistrationPromise) {
      this.deviceRegistrationPromise = this.registerDevice().finally(() => {
        this.deviceRegistrationPromise = null;
      });
    }
    await this.deviceRegistrationPromise;
  }

  private isVerificationRequired(result?: JsonRecord | null): boolean {
    const body = unwrapApiBody(result);
    const data = unwrapApiData(result);
    return Number(body?.errcode || body?.error_code || data?.errcode || data?.error_code) === 20028;
  }

  private async completeSsaVerification(result?: JsonRecord | null): Promise<boolean> {
    const body = unwrapApiBody(result);
    const data = unwrapApiData(result);
    const eventid = String(body?.ssaCode || body?.ssa_code || data?.ssaCode || data?.ssa_code || '').trim();
    if (!eventid) return false;
    try {
      const response = await this.fetchApi<JsonRecord>('/sidedt', {
        eventid,
        userid: this.getCookieValue('userid'),
        dfid: this.getCookieValue('dfid'),
      }, 15000);
      const responseBody = unwrapApiBody(response);
      const responseData = unwrapApiData(response);
      return Number(responseBody?.status ?? responseData?.status ?? 0) === 1;
    } catch {
      return false;
    }
  }

  private async getLegacyAudioUrl(hash: string): Promise<string> {
    try {
      const url = new URL(KUGOU_LEGACY_PLAY);
      url.searchParams.set('cmd', 'playInfo');
      url.searchParams.set('hash', hash);
      const response = await fetch(url.toString(), {
        cache: 'no-store',
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) return '';
      const payload = await response.json();
      return this.findAudioUrl(payload);
    } catch {
      return '';
    }
  }

  public async getSongAudioUrl(song: Song, forceRefresh = false): Promise<string> {
    const hash = song.kugouHash || song.id.replace(/^kg_/, '');
    if (!hash) return '';
    const cached = this.audioUrlCache.get(hash);
    if (!forceRefresh && cached && cached.expiresAt > Date.now()) return cached.url;

    const isAuthenticated = Boolean(this.getCookieValue('token') && this.getCookieValue('userid'));
    // QR/WeChat sessions can contain a short-lived token but no vip_token yet.
    // Refresh once before asking for a high-quality URL so the Concept Edition
    // endpoint sees the same entitlement as the account page.
    if (isAuthenticated && !this.getCookieValue('vip_token')) await this.refreshLogin();

    const resolve = async () => {
      const qualities = isAuthenticated ? ['320', '128'] : ['128'];
      let lastResult: JsonRecord | null = null;
      for (const quality of qualities) {
        let result: JsonRecord;
        try {
          result = await this.fetchApi<JsonRecord>('/song/url', {
            hash,
            album_id: song.kugouAlbumId,
            album_audio_id: song.kugouAlbumAudioId,
            quality,
          }, 12000);
        } catch (error) {
          const apiError = error as KugouApiError;
          if (this.isVerificationRequired(apiError.body)) {
            return { url: '', result: apiError.body || null };
          }
          throw error;
        }
        lastResult = result;
        const url = this.findAudioUrl(result);
        if (url) return { url, result };
      }
      return { url: '', result: lastResult };
    };

    // KuGou's URL endpoint requires a registered device dfid before the
    // first request. Without it the server returns 20028 and a verification
    // payload even for an otherwise playable song.
    // Anonymous playback can still use the public mobile fallback; avoid
    // adding a device-registration timeout to every logged-out song.
    if (this.cookie || isAuthenticated) await this.ensureDeviceRegistered();
    let resolved = await resolve();
    let verificationRequired = this.isVerificationRequired(resolved.result);
    if (!resolved.url && verificationRequired) {
      // The upstream server may still issue an SSA challenge after dfid
      // registration. Try its built-in simulated-fingerprint verification
      // before falling back to a public URL or reporting a playback error.
      if (await this.completeSsaVerification(resolved.result)) {
        resolved = await resolve();
        verificationRequired = this.isVerificationRequired(resolved.result);
      }
    }
    if (!resolved.url) {
      // The Android endpoint can require a newly registered dfid even for a
      // free track. Use KuGou's mobile standard-quality URL immediately so
      // playback does not wait through repeated device-registration timeouts.
      const legacyUrl = await this.getLegacyAudioUrl(hash);
      if (legacyUrl) {
        this.audioUrlCache.set(hash, { url: legacyUrl, expiresAt: Date.now() + 10 * 60 * 1000 });
        return legacyUrl;
      }
    }
    if (!resolved.url && verificationRequired) {
      if (this.cookie || isAuthenticated) await this.ensureDeviceRegistered();
      resolved = await resolve();
    }
    if (resolved.url) {
      this.audioUrlCache.set(hash, { url: resolved.url, expiresAt: Date.now() + 15 * 60 * 1000 });
    }
    return resolved.url;
  }

  public async getSongLyrics(song: Song): Promise<LyricLine[]> {
    const hash = song.kugouHash || song.id.replace(/^kg_/, '');
    if (!hash) return [];
    const search = await this.fetchApi<JsonRecord>('/search/lyric', {
      hash,
      album_audio_id: song.kugouAlbumAudioId,
      duration: Math.round(song.duration * 1000),
    });
    const searchBody = unwrapApiBody(search);
    const searchData = unwrapApiData(search);
    let candidates = [
      ...firstArray(searchBody?.candidates, searchData?.candidates, searchBody?.data?.candidates, searchData?.info),
      ...(searchBody?.candidate ? [searchBody.candidate] : []),
      ...(searchData?.candidate ? [searchData.candidate] : []),
    ];
    let candidate = candidates.find((item) => item?.id && item?.accesskey);

    // A few older API builds only return a lyric candidate after receiving a
    // keyword. Hash/duration remains the first choice because it is exact.
    if (!candidate) {
      const fallbackSearch = await this.fetchApi<JsonRecord>('/search/lyric', {
        keywords: `${song.name} ${song.artist}`.trim(),
        hash,
        duration: Math.round(song.duration * 1000),
      }).catch(() => ({}));
      const fallbackBody = unwrapApiBody(fallbackSearch);
      const fallbackData = unwrapApiData(fallbackSearch);
      candidates = [
        ...firstArray(fallbackBody?.candidates, fallbackData?.candidates, fallbackBody?.data?.candidates, fallbackData?.info),
        ...(fallbackBody?.candidate ? [fallbackBody.candidate] : []),
        ...(fallbackData?.candidate ? [fallbackData.candidate] : []),
      ];
      candidate = candidates.find((item) => item?.id && item?.accesskey);
    }
    if (!candidate?.id || !candidate?.accesskey) return [];

    for (const format of ['krc', 'lrc']) {
      try {
        const lyric = await this.fetchApi<JsonRecord>('/lyric', {
          id: candidate.id,
          accesskey: candidate.accesskey,
          fmt: format,
          decode: true,
        });
        const lyricBody = unwrapApiBody(lyric);
        const lyricData = unwrapApiData(lyric);
        const content = String(
          lyricBody?.decodeContent
          || lyricData?.decodeContent
          || lyricBody?.content
          || lyricData?.content
          || lyricBody?.lyric
          || lyricData?.lyric
          || '',
        ).replace(/^\uFEFF/, '');
        if (!content) continue;
        const karaoke = parseKrc(content);
        if (karaoke.length) return karaoke;
        const plainLyrics = parseSharedLrc(content, { filterMeta: true });
        if (plainLyrics.length) return plainLyrics;
      } catch {
        // Try the other lyric format before reporting that this song has no
        // usable lyric data.
      }
    }
    return [];
  }

  public async getQrKey(): Promise<string> {
    const response = await this.fetchApi<JsonRecord>('/login/qr/key');
    const key = String(response?.data?.qrcode || response?.data?.key || response?.unikey || '');
    const image = response?.data?.qrcode_img;
    if (key && image) this.qrImages.set(key, String(image));
    return key;
  }

  public async getQrImage(key: string): Promise<string> {
    const cached = this.qrImages.get(key);
    if (cached) return cached;
    const response = await this.fetchApi<JsonRecord>('/login/qr/create', { key, qrimg: true });
    return String(response?.data?.base64 || response?.data?.qrcode_img || '');
  }

  public async getWeChatQr(): Promise<{ uuid: string; image: string }> {
    const response = await this.fetchApi<JsonRecord>('/login/wx/create', {}, 20000);
    const qrcode = response?.qrcode || response?.data?.qrcode || {};
    const uuid = String(response?.uuid || response?.data?.uuid || '');
    const rawImage = String(qrcode?.qrcodebase64 || qrcode?.base64 || '');
    const image = rawImage
      ? rawImage.startsWith('data:image/') ? rawImage : `data:image/jpeg;base64,${rawImage}`
      : '';
    return { uuid, image };
  }

  public async checkWeChatQr(uuid: string): Promise<{ code: number; message: string; wxCode?: string }> {
    const response = await this.fetchApi<JsonRecord>('/login/wx/check', {
      uuid,
      timestamp: Date.now(),
    }, 30000);
    const status = Number(response?.wx_errcode ?? response?.data?.wx_errcode ?? 408);
    if (status === 402) return { code: 800, message: '二维码已过期' };
    if (status === 403) return { code: 804, message: '已拒绝微信登录' };
    if (status === 404) return { code: 802, message: '已扫码，请确认登录' };
    if (status === 405) {
      const wxCode = String(response?.wx_code || response?.data?.wx_code || '');
      return wxCode ? { code: 803, message: '微信登录确认成功', wxCode } : { code: 801, message: '等待登录凭证' };
    }
    return { code: 801, message: '等待微信扫码' };
  }

  public async loginWithWeChatCode(code: string): Promise<boolean> {
    if (!code) return false;
    try {
      const response = await this.fetchApi<JsonRecord>('/login/openplat', { code }, 30000);
      // Depending on the installed KuGouMusicApi build, the HTTP proxy can
      // return the upstream body directly or wrap it in `body`.
      const body = unwrapApiBody(response);
      const data = unwrapApiData(response);
      const token = data?.token || data?.access_token || '';
      const userId = data?.userid || data?.user_id || '';
      if (Number(body?.status ?? data?.status ?? 0) !== 1 || !token || !userId) return false;
      this.mergeCookieValues({
        token,
        userid: userId,
        vip_type: data?.vip_type,
        vip_token: data?.vip_token,
        t1: data?.t1,
      });
      // openplat may return a token that is valid for login but missing the
      // current Concept Edition entitlement fields. Ask /login/token once so
      // subsequent audio requests do not incorrectly look like free access.
      await this.refreshLogin();
      return true;
    } catch {
      return false;
    }
  }

  public async checkQrStatus(key: string): Promise<{ code: number; message: string; cookie?: string }> {
    const response = await this.fetchApi<JsonRecord>('/login/qr/check', { key });
    const status = Number(response?.data?.status ?? response?.status ?? 0);
    if (status === 0) return { code: 800, message: '二维码已过期' };
    if (status === 2) return { code: 802, message: '已扫码，请确认登录' };
    if (status !== 4) return { code: 801, message: '等待扫码' };

    const data = response?.data || {};
    const cookieParts: string[] = [];
    const add = (name: string, value: any) => value !== undefined && value !== '' && cookieParts.push(`${name}=${value}`);
    add('token', data.token);
    add('userid', data.userid || data.user_id);
    add('vip_token', data.vip_token);
    add('refresh_token', data.refresh_token);
    const cookie = cookieParts.join('; ');
    if (cookie) this.setCookie(cookie);
    return { code: 803, message: '登录成功', cookie };
  }

  private unwrapUserData(response?: JsonRecord): JsonRecord {
    const data = response?.data || response?.user || response || {};
    const nested = [
      data?.user_info,
      data?.userinfo,
      data?.user,
      data?.profile,
      data?.info,
      data?.data?.user_info,
      data?.data?.userinfo,
      data?.data?.user,
      data?.data?.profile,
      data?.data?.info,
    ];
    return nested.find((value) => value && typeof value === 'object' && !Array.isArray(value)) || data;
  }

  private extractVipType(user: JsonRecord, vipResponse: JsonRecord): number {
    const vipData = vipResponse?.data?.data || vipResponse?.data || vipResponse || {};
    const candidates = [
      user?.vip_type,
      user?.viptype,
      user?.vipType,
      user?.is_vip,
      user?.isVip,
      user?.vip?.vip_type,
      user?.vip?.viptype,
      user?.vip?.is_vip,
      vipData?.vip_type,
      vipData?.viptype,
      vipData?.vipType,
      vipData?.is_vip,
      vipData?.isVip,
      vipData?.vip?.vip_type,
      vipData?.vip?.viptype,
      vipData?.vip?.is_vip,
      vipData?.union_vip?.vip_type,
      vipData?.union_vip?.is_vip,
      this.cookie.match(/(?:^|;\s*)vip_type=([^;]+)/i)?.[1],
    ];

    const values = candidates
      .map((value) => (typeof value === 'boolean' ? (value ? 1 : 0) : Number(value)))
      .filter((value) => Number.isFinite(value));
    return values.find((value) => value > 0) ?? values[0] ?? 0;
  }

  public async getUserAccount(): Promise<UserProfile | null> {
    if (!this.cookie) return null;
    let userid = this.getCookieValue('userid');
    let token = this.getCookieValue('token');
    if (userid && token && !this.getCookieValue('vip_token')) await this.refreshLogin();
    // `/login/token` can rotate both values. Use the refreshed pair for the
    // explicit query parameters below instead of the stale pre-refresh pair.
    userid = this.getCookieValue('userid');
    token = this.getCookieValue('token');
    const [detailResponse, vipResponse] = await Promise.all([
      // Pass the two values explicitly as well as through `cookie`. This
      // avoids losing them when a proxy or an older API server does not parse
      // a URL-encoded cookie query parameter before building the signed body.
      this.fetchApi<JsonRecord>('/user/detail', { userid, token }, 12000).catch(() => ({})),
      // `/user/detail` does not consistently include union-VIP state. The
      // dedicated endpoint is required for Concept Edition accounts.
      this.fetchApi<JsonRecord>('/user/vip/detail', {}, 12000).catch(() => ({})),
    ]);
    const user = this.unwrapUserData(detailResponse);
    const account = user?.account || user?.user_account || user?.profile || {};
    const userId = user?.userid
      || user?.user_id
      || user?.userId
      || user?.uid
      || account?.userid
      || account?.user_id
      || account?.userId
      || this.cookie.match(/(?:^|;\s*)userid=([^;]+)/i)?.[1];
    if (!userId) return null;
    const vipType = this.extractVipType(user, vipResponse);
    const vipData = unwrapApiData(vipResponse);
    const vipToken = String(
      vipData?.vip_token
      || vipData?.vipToken
      || vipData?.union_vip?.vip_token
      || vipData?.union_vip?.vipToken
      || '',
    );
    this.mergeCookieValues({ vip_type: vipType, vip_token: vipToken });
    return {
        userId,
      nickname: String(
        user?.nickname
        || user?.username
        || user?.nick_name
        || user?.user_name
        || user?.uname
        || user?.user_nickname
        || account?.nickname
        || account?.username
        || '酷狗概念版用户',
      ),
      avatarUrl: this.normalizeCoverUrl(
        user?.pic
        || user?.avatar
        || user?.avatarurl
        || user?.avatar_url
        || user?.headimg
        || user?.head_url
        || user?.headurl
        || user?.user_pic
        || user?.userpic
        || user?.user_avatar
        || account?.pic
        || account?.avatar
        || account?.avatar_url,
      ),
      signature: String(user?.signature || user?.description || user?.intro || user?.user_signature || ''),
      vipType,
      isLoggedIn: true,
      platform: 'kugou',
    };
  }

  private extractPlaylistCover(playlist: JsonRecord): string {
    return this.normalizeCoverUrl(
      playlist?.pic
      || playlist?.imgurl
      || playlist?.img_url
      || playlist?.picurl
      || playlist?.pic_url
      || playlist?.cover
      || playlist?.cover_url
      || playlist?.coverUrl
      || playlist?.cover_image
      || playlist?.coverImage
      || playlist?.flexible_cover
      || playlist?.sizable_cover
      || playlist?.cover_img_url
      || playlist?.list_cover
      || playlist?.list_cover_url
      || playlist?.collection_cover
      || playlist?.collection_cover_url
      || playlist?.list_pic
      || playlist?.list_pic_url
      || playlist?.list_img
      || playlist?.list_imgurl
      || playlist?.cover_pic
      || playlist?.cover_pic_url
      || playlist?.collection_pic
      || playlist?.collection_img
      || playlist?.collection_imgurl
      || playlist?.data?.cover
      || playlist?.data?.imgurl
      || playlist?.data?.pic
      || playlist?.image_url
      || playlist?.imageUrl
      || playlist?.image,
    );
  }

  private async getPlaylistFallbackCover(playlist: Playlist): Promise<string> {
    try {
      const playlistId = String(playlist.id);
      if (playlist.kugouGlobalCollectionId || playlistId.startsWith('kg_pl_')) {
        const collectionId = playlist.kugouGlobalCollectionId
          || playlistId.replace(/^kg_pl_/, '');
        const response = await this.fetchApi<JsonRecord>('/playlist/track/all', {
          id: collectionId,
          pagesize: 1,
          page: 1,
        }, 9000);
        return this.mapSongList(this.extractPlaylistSongItems(response))[0]?.coverUrl || '';
      }

      const userListId = playlistId.match(/^kg_user_([^:]+)/)?.[1] || '';
      if (!userListId) return '';
      const response = await this.fetchApi<JsonRecord>('/playlist/track/all/new', {
        listid: userListId,
        userid: this.getCookieValue('userid'),
        token: this.getCookieValue('token'),
        pagesize: 1,
        page: 1,
      }, 9000);
      return this.mapSongList(this.extractPlaylistSongItems(response))[0]?.coverUrl || '';
    } catch {
      return '';
    }
  }

  public async getUserPlaylists(): Promise<Playlist[]> {
    if (!this.cookie) return [];
    const response = await this.fetchApi<JsonRecord>('/user/playlist', {
      page: 1,
      pagesize: 50,
      userid: this.getCookieValue('userid'),
      token: this.getCookieValue('token'),
    });
    const responseBody = unwrapApiBody(response);
    const responseData = unwrapApiData(response);
    const items = firstArray(
      Array.isArray(response) ? response : undefined,
      responseBody?.data?.data?.info,
      responseBody?.data?.data?.lists,
      responseBody?.data?.data?.list,
      responseBody?.data?.data?.collections,
      response?.data?.info,
      response?.data?.lists,
      response?.data?.list,
      response?.data?.listinfo,
      response?.data?.list_info,
      response?.data?.collections,
      response?.data?.collection,
      response?.data?.data?.info,
      response?.data?.data?.lists,
      response?.data?.data?.list,
      response?.data?.data?.listinfo,
      response?.data?.data?.list_info,
      response?.data?.data?.collections,
      response?.data?.data?.collection,
      response?.info,
      response?.lists,
      response?.list,
      response?.listinfo,
      response?.list_info,
      response?.collections,
      response?.collection,
      response?.data,
      responseData?.info,
      responseData?.lists,
      responseData?.list,
      responseData?.collections,
      responseData?.collection,
    );
    const playlists = items
      .map((item): Playlist | null => {
        const playlist = item?.info && typeof item.info === 'object' && !Array.isArray(item.info)
          ? { ...item, ...item.info }
          : item;
        const listId = playlist.listid
          || playlist.list_id
          || playlist.listId
          || playlist.specialid
          || playlist.special_id;
        const globalCollectionId = playlist.global_collection_id || playlist.global_collectionid;
        const fallbackId = listId
          || globalCollectionId
          || playlist.collection_id
          || playlist.collectionId
          || playlist.id;
        if (!fallbackId) return null;
        const id = listId
          ? `kg_user_${listId}${globalCollectionId ? `::${encodeURIComponent(String(globalCollectionId))}` : ''}`
          : globalCollectionId
            ? `kg_pl_${globalCollectionId}`
            : `kg_user_${fallbackId}`;
        return {
          id,
          name: String(playlist.name || playlist.specialname || playlist.listname || playlist.title || '酷狗概念版歌单'),
          coverImgUrl: this.extractPlaylistCover(playlist),
          trackCount: Number(playlist.count || playlist.songcount || playlist.song_count || playlist.total || playlist.track_count || playlist.song_num || 0),
          creatorName: String(playlist.nickname || playlist.username || playlist.creator || playlist.creator_name || ''),
          isUserPlaylist: true,
          platform: 'kugou',
          kugouGlobalCollectionId: globalCollectionId ? String(globalCollectionId) : undefined,
        };
      })
      .filter((item): item is Playlist => Boolean(item));

    const missingCoverPlaylists = playlists.filter(
      (playlist) => !playlist.coverImgUrl && playlist.kugouGlobalCollectionId,
    );
    if (missingCoverPlaylists.length > 0) {
      try {
        const response = await this.fetchApi<JsonRecord>('/playlist/detail', {
          ids: missingCoverPlaylists.map((playlist) => playlist.kugouGlobalCollectionId).join(','),
        }, 12000);
        const responseBody = unwrapApiBody(response);
        const responseData = unwrapApiData(response);
        const detailItems = firstArray(
          Array.isArray(response) ? response : undefined,
          responseBody?.data?.data?.info,
          responseBody?.data?.data?.lists,
          responseBody?.data?.data?.list,
          response?.data?.info,
          response?.data?.lists,
          response?.data?.list,
          response?.data?.data?.info,
          response?.data?.data?.lists,
          response?.data,
          response?.info,
          response?.lists,
          responseData?.info,
          responseData?.lists,
          responseData?.list,
        );
        const coverByCollectionId = new Map<string, string>();
        detailItems.forEach((item) => {
          const detail = item?.info && typeof item.info === 'object' && !Array.isArray(item.info)
            ? { ...item, ...item.info }
            : item;
          const collectionId = detail?.global_collection_id
            || detail?.global_collectionid
            || detail?.collection_id
            || detail?.gid
            || detail?.id;
          const cover = this.extractPlaylistCover(detail || {});
          if (collectionId && cover) coverByCollectionId.set(String(collectionId), cover);
        });
        playlists.forEach((playlist) => {
          if (playlist.coverImgUrl || !playlist.kugouGlobalCollectionId) return;
          const cover = coverByCollectionId.get(playlist.kugouGlobalCollectionId);
          if (cover) playlist.coverImgUrl = cover;
        });
      } catch {
        // Keep the playlist list usable even when the optional cover request
        // is rejected; the list endpoint data remains valid.
      }
    }

    // The special `我喜欢` list and some private collections omit their
    // cover in `/user/playlist`. Their first track still carries the correct
    // artwork, so use it as a deterministic last-resort cover instead of
    // showing the generic music-note placeholder.
    const fallbackTargets = playlists.filter((playlist) => !playlist.coverImgUrl).slice(0, 8);
    if (fallbackTargets.length > 0) {
      const fallbackCovers = await Promise.all(
        fallbackTargets.map(async (playlist) => ({
          id: playlist.id,
          cover: await this.getPlaylistFallbackCover(playlist),
        })),
      );
      const coverByPlaylistId = new Map(
        fallbackCovers.filter((item) => item.cover).map((item) => [String(item.id), item.cover]),
      );
      return playlists.map((playlist) => ({
        ...playlist,
        coverImgUrl: playlist.coverImgUrl || coverByPlaylistId.get(String(playlist.id)) || '',
      }));
    }
    return playlists;
  }
}

export const kugouMusicApi = new KugouMusicApiService();
