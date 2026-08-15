import React, { useEffect, useState } from 'react';
import { ArrowRight, Clock3, Heart, Play, Sparkles } from 'lucide-react';
import { Platform, Song, Playlist } from '../types/music';
import { usePlayerStore } from '../store/playerStore';
import { neteaseApi } from '../services/neteaseApi';
import { DEFAULT_COVER_PLACEHOLDER, getOptimizedCoverUrl, handleImageError } from '../utils/format';
import { musicApiAdapter } from '../services/musicApiAdapter';
import { getPlatformName } from '../utils/platform';
import { shallow } from 'zustand/shallow';

const fallbackPlaylists: Playlist[] = [
  {
    id: 3778678,
    name: '私人漫游',
    // Do not use a third-party demo image here. Once recommendations arrive,
    // the real song artwork is used as the card cover instead.
    coverImgUrl: '',
    trackCount: 50,
    description: 'Roaming FM · 随心而行的电台',
  },
  {
    id: 3779629,
    name: '私人雷达',
    coverImgUrl: '',
    trackCount: 30,
    description: 'Private Radar · 捕捉你错过的好歌',
  },
];

const createFallbackPlaylists = (platform: Platform): Playlist[] => {
  const platformName = getPlatformName(platform);
  const ids = platform === 'netease'
    ? [3778678, 3779629]
    : platform === 'qq'
      ? ['qq_daily', 'qq_personal']
      : ['kg_daily', 'kg_personal'];

  // Loading cards must carry their source: a delayed QQ response must never
  // survive a switch to KuGou and be shown as a KuGou collection.
  return [
    { id: ids[0], name: `${platformName} 每日推荐`, coverImgUrl: '', trackCount: 0, description: `${platformName} 个性化推荐`, platform },
    { id: ids[1], name: `${platformName} 私人电台`, coverImgUrl: '', trackCount: 0, description: `${platformName} 为你发现好音乐`, platform },
  ];
};

const belongsToPlatform = (playlist: Playlist, platform: Platform) => {
  if (playlist.platform) return playlist.platform === platform;
  const id = String(playlist.id);
  // Persisted data from earlier versions may lack `platform`. Only retain the
  // legacy NetEase IDs in NetEase mode; do not guess for QQ/KuGou.
  return platform === 'netease' && !id.startsWith('qq_') && !id.startsWith('kg_');
};

// The NetEase recommendation adapter historically used Unsplash images as
// placeholders. They are unreliable in the packaged app and trigger the
// generic music-note icon. Prefer artwork returned by the active provider for
// these synthetic home cards, while keeping real user-playlist covers intact.
const isSyntheticCover = (url?: string) =>
  !url ||
  /images\.unsplash\.com/i.test(url) ||
  /(?:^|[\\/])(?:icon|app-icon)\.png(?:$|\?)/i.test(url);

const getPlaylistDisplayCover = (playlist: Playlist, fallbackSong: Song | undefined, size: number) => {
  const source = isSyntheticCover(playlist.coverImgUrl) ? fallbackSong?.coverUrl || playlist.coverImgUrl : playlist.coverImgUrl;
  return getOptimizedCoverUrl(source, size);
};

const createCoverErrorHandler = (fallbackUrl?: string) => (event: React.SyntheticEvent<HTMLImageElement, Event>) => {
  const image = event.currentTarget;
  const fallback = fallbackUrl ? getOptimizedCoverUrl(fallbackUrl) : DEFAULT_COVER_PLACEHOLDER;

  // If a playlist cover is unavailable, retry once with a real recommendation
  // cover before falling back to the app icon. This avoids showing the icon for
  // the home cards just because one CDN host is unreachable.
  if (
    fallback !== DEFAULT_COVER_PLACEHOLDER &&
    fallback !== image.src &&
    image.dataset.recommendCoverFallback !== '1'
  ) {
    image.dataset.recommendCoverFallback = '1';
    image.src = fallback;
    return;
  }

  handleImageError(event);
};

const formatTrackDuration = (song: Song, index: number) => {
  const duration = Number(song.duration || 0);
  if (duration > 0) {
    const minutes = Math.floor(duration / 60);
    const seconds = Math.floor(duration % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
  }
  return `${3 + (index % 2)}:${index % 2 ? '17' : '16'}`;
};

export const ListenNowView: React.FC = () => {
  const { playSong, setActiveTab, setSelectedPlaylist, user, playlists, activePlatform } = usePlayerStore(
    (state) => ({
      playSong: state.playSong,
      setActiveTab: state.setActiveTab,
      setSelectedPlaylist: state.setSelectedPlaylist,
      user: state.user,
      playlists: state.playlists,
      activePlatform: state.activePlatform,
    }),
    shallow,
  );
  const [recommendSongs, setRecommendSongs] = useState<Song[]>([]);
  const [isRecommendationsLoading, setIsRecommendationsLoading] = useState(true);
  const [personalPlaylists, setPersonalPlaylists] = useState<Playlist[]>(() => createFallbackPlaylists(activePlatform));

  useEffect(() => {
    const providerPlaylists = (playlists || []).filter((playlist) => belongsToPlatform(playlist, activePlatform));
    setPersonalPlaylists(providerPlaylists.length > 0 ? providerPlaylists.slice(0, 4) : createFallbackPlaylists(activePlatform));
  }, [playlists, activePlatform]);

  useEffect(() => {
    let isMounted = true;
    const requestedPlatform = activePlatform;

    const loadRecommendations = async () => {
      // Do not leave the previous platform's songs/covers visible while the
      // new platform is being fetched.
      setRecommendSongs([]);
      setPersonalPlaylists(createFallbackPlaylists(requestedPlatform));
      setIsRecommendationsLoading(true);
      try {
        const songs = await musicApiAdapter.getRecommendSongs(activePlatform);
        if (isMounted && usePlayerStore.getState().activePlatform === requestedPlatform) {
          setRecommendSongs(songs.slice(0, 8));
        }
        const recPlaylists = await musicApiAdapter.getRecommendPlaylists(requestedPlatform);
        if (isMounted && usePlayerStore.getState().activePlatform === requestedPlatform && recPlaylists.length > 0) {
          setPersonalPlaylists(recPlaylists.slice(0, 4));
        }
      } catch (error) {
        console.warn('Network load for recommend songs failed:', error);
        if (isMounted && usePlayerStore.getState().activePlatform === requestedPlatform) setRecommendSongs([]);
      } finally {
        if (isMounted && usePlayerStore.getState().activePlatform === requestedPlatform) setIsRecommendationsLoading(false);
      }
    };

    loadRecommendations();
    return () => {
      isMounted = false;
    };
  }, [activePlatform]);

  const firstSong = recommendSongs[0];
  const coverStack = recommendSongs.slice(0, 3);
  const dailyPlaylist: Playlist = {
    id: activePlatform === 'qq' ? 'qq_daily' : activePlatform === 'kugou' ? 'kg_daily' : 3778678,
    name: activePlatform === 'netease' ? '每日推荐' : `${getPlatformName(activePlatform)} · 每日推荐`,
    coverImgUrl: firstSong?.coverUrl || createFallbackPlaylists(activePlatform)[0].coverImgUrl,
    trackCount: recommendSongs.length,
    description: `从你的 ${getPlatformName(activePlatform)} 听歌轨迹中精选的每日推荐歌曲`,
    platform: activePlatform,
  };

  const openDailyPlaylist = () => {
    setActiveTab('playlist');
    setSelectedPlaylist(dailyPlaylist);
  };

  return (
    <div className="home-page animate-fadeIn">
      <div className="home-heading">
        <div>
          <p className="home-eyebrow">{user?.nickname ? `下午好，${user.nickname}` : '下午好'}</p>
          <h1 className="flex items-center space-x-3">
            <span>现在就听</span>
            <span
              className={`text-xs px-2.5 py-0.5 rounded-full font-bold border ${
                activePlatform === 'qq'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : activePlatform === 'kugou'
                    ? 'bg-sky-50 text-sky-700 border-sky-200'
                    : 'bg-rose-50 text-rose-700 border-rose-200'
              }`}
            >
              {activePlatform === 'qq' ? '🟢 QQ 音乐' : activePlatform === 'kugou' ? '🔵 酷狗概念版' : '🔴 网易云'}
            </span>
          </h1>
          <p className="home-subtitle">
            精选 {getPlatformName(activePlatform)}推荐，陪你度过每一个当下。
          </p>
        </div>
        <div className="home-date-chip">
          {new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' })}
        </div>
      </div>

      <section className="daily-hero">
        <div className="daily-hero-copy">
          <div className="daily-index">01</div>
          <div className="daily-meta">
            每日推荐 <span>·</span> 为你精选
          </div>
          <h2>每日推荐</h2>
          <p className="daily-label">DAILY MIX</p>
          <p className="daily-description">
            从你的听歌轨迹里，挑出今天最适合你的声音。每一首歌，都有它出现的理由。
          </p>
          <div className="daily-actions">
            <button
              type="button"
              onClick={() => firstSong && playSong(firstSong, recommendSongs)}
              disabled={isRecommendationsLoading || !firstSong}
              className="primary-action disabled:cursor-not-allowed disabled:opacity-55"
            >
              <Play className="h-3.5 w-3.5 fill-current" />
              {isRecommendationsLoading ? '加载推荐中' : '播放全部'}
            </button>
            <button type="button" onClick={openDailyPlaylist} className="secondary-action">
              查看全部 <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="daily-art-stack" role="group" aria-label="每日推荐封面">
          {coverStack.map((song, index) => (
            <button
              key={song.id || index}
              type="button"
              onClick={() => playSong(song, recommendSongs)}
              className={`daily-art daily-art-button daily-art-${index}`}
              aria-label={`播放 ${neteaseApi.cleanTitle(song.name)} - ${neteaseApi.cleanTitle(song.artist)}`}
            >
              <img src={getOptimizedCoverUrl(song.coverUrl, 420)} alt="" draggable={false} decoding="async" onError={handleImageError} />
              <span className="daily-art-play" aria-hidden="true">
                <Play className="h-5 w-5 fill-current" />
              </span>
            </button>
          ))}
          {!coverStack.length && <div className="daily-art daily-art-placeholder" />}
        </div>
      </section>

      <section className="quick-mixes" aria-label="快捷歌单">
        {personalPlaylists.slice(0, 2).map((playlist, index) => (
          <button
            key={playlist.id}
            onClick={() => setSelectedPlaylist(playlist)}
            className="quick-mix-card"
          >
            <div className={`quick-mix-art quick-mix-art-${index}`}>
              <img
                src={getPlaylistDisplayCover(playlist, coverStack[index] || coverStack[0], 180)}
                alt=""
                loading="lazy"
                decoding="async"
                onError={createCoverErrorHandler(coverStack[index]?.coverUrl || coverStack[0]?.coverUrl)}
              />
            </div>
            <div className="min-w-0 text-left">
              <h3>{playlist.name}</h3>
              <p>
                {playlist.description ||
                  playlist.creatorName ||
                  `${getPlatformName(activePlatform)} 歌单`}
              </p>
            </div>
            <span className="quick-mix-arrow">
              <ArrowRight className="h-3.5 w-3.5" />
            </span>
          </button>
        ))}
      </section>

      <section className="home-section">
        <div className="section-heading-row">
          <div>
            <p className="section-kicker">CURATED FOR YOU</p>
            <h2>今日为你精选</h2>
          </div>
          <button type="button" className="section-link" onClick={openDailyPlaylist}>
            完整歌单 <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="track-grid">
          {recommendSongs.slice(0, 8).map((song, index) => (
            <button key={song.id || index} onClick={() => playSong(song, recommendSongs)} className="track-row">
              <span className="track-number">{String(index + 1).padStart(2, '0')}</span>
              <div className="track-cover-wrap">
                <img
                  src={getOptimizedCoverUrl(song.coverUrl, 120)}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="track-cover"
                  onError={handleImageError}
                />
                <span className="track-play">
                  <Play className="h-3.5 w-3.5 fill-current" />
                </span>
              </div>
              <div className="min-w-0 flex-1 text-left">
                <div className="track-name-line">
                  <span className="track-name">{neteaseApi.cleanTitle(song.name)}</span>
                  {song.isVip && <span className="vip-pill">VIP</span>}
                </div>
                <span className="track-artist">{neteaseApi.cleanTitle(song.artist)}</span>
              </div>
              <span className="track-duration">
                <Clock3 className="h-3 w-3" />
                {formatTrackDuration(song, index)}
              </span>
              <Heart className="track-heart h-4 w-4" />
            </button>
          ))}
        </div>
      </section>

      <section className="home-section playlist-section">
        <div className="section-heading-row">
          <div>
            <p className="section-kicker">YOUR LIBRARY</p>
            <h2>专属歌单</h2>
          </div>
          <Sparkles className="h-4 w-4 text-[#9aa3b4]" />
        </div>
        <div className="playlist-grid">
          {personalPlaylists.slice(0, 4).map((playlist, index) => (
            <button key={playlist.id} onClick={() => setSelectedPlaylist(playlist)} className="playlist-card">
              <img
                src={getPlaylistDisplayCover(playlist, coverStack[index] || coverStack[0], 320)}
                alt=""
                loading="lazy"
                decoding="async"
                onError={createCoverErrorHandler(
                  coverStack[index]?.coverUrl || coverStack[0]?.coverUrl,
                )}
              />
              <div className="playlist-card-overlay" />
              <span className="playlist-card-play">
                <Play className="h-4 w-4 fill-current" />
              </span>
              <div className="playlist-card-copy">
                <strong>{playlist.name}</strong>
                <span>
                  {playlist.trackCount > 0 ? `${playlist.trackCount} 首歌曲` : playlist.description || `${getPlatformName(activePlatform)} 歌单`}
                </span>
              </div>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
};
