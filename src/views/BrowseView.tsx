import React, { useEffect, useState } from 'react';
import { Compass, Flame, Award, Disc, Play } from 'lucide-react';
import { Song, Playlist } from '../types/music';
import { usePlayerStore } from '../store/playerStore';
import { shallow } from 'zustand/shallow';
import { getOptimizedCoverUrl } from '../utils/format';
import { neteaseApi } from '../services/neteaseApi';
import { musicApiAdapter } from '../services/musicApiAdapter';

export const BrowseView: React.FC = () => {
  const { playSong, setSelectedPlaylist, activePlatform } = usePlayerStore(
    (state) => ({
      playSong: state.playSong,
      setSelectedPlaylist: state.setSelectedPlaylist,
      activePlatform: state.activePlatform,
    }),
    shallow,
  );
  const [chartPlaylists, setChartPlaylists] = useState<Playlist[]>([]);
  const [hotSongs, setHotSongs] = useState<Song[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [isCategoryLoading, setIsCategoryLoading] = useState<boolean>(false);

  const categories = [
    { id: 'all', name: '全部探索' },
    { id: 'pop', name: '华语流行' },
    { id: 'western', name: '欧美金曲' },
    { id: 'acg', name: '动漫二次元' },
    { id: 'lofi', name: '治愈 Lo-Fi' },
    { id: 'rock', name: '摇滚朋克' },
    { id: 'electronic', name: '电子电音' },
  ];

  useEffect(() => {
    let isMounted = true;
    const loadBrowseData = async () => {
      try {
        const playlists = await musicApiAdapter.getRecommendPlaylists(activePlatform);
        if (isMounted) {
          setChartPlaylists(playlists);
        }
        const songs = await musicApiAdapter.getRecommendSongs(activePlatform);
        if (isMounted) {
          setHotSongs(songs);
        }
      } catch {
        // Fallback
      }
    };

    loadBrowseData();
    return () => {
      isMounted = false;
    };
  }, [activePlatform]);

  const handleCategoryClick = async (catId: string, catName: string) => {
    setActiveCategory(catId);
    if (catId === 'all') {
      const songs = await musicApiAdapter.getRecommendSongs(activePlatform);
      setHotSongs(songs);
      return;
    }

    setIsCategoryLoading(true);
    try {
      const categorySongs = await musicApiAdapter.search(activePlatform, catName);
      if (categorySongs.length > 0) {
        setHotSongs(categorySongs.slice(0, 10));
      }
    } catch {
      // Keep current
    } finally {
      setIsCategoryLoading(false);
    }
  };

  return (
    <div className="space-y-8 pb-16 select-none animate-fadeIn">
      {/* Header Explore Banner (High Contrast Liquid Glass Design) */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-rose-950/70 via-purple-950/50 to-slate-900/80 p-8 border border-white/15 shadow-2xl backdrop-blur-xl">
        <div className="relative z-10 max-w-xl space-y-3">
          <div className="flex items-center space-x-2 text-rose-400 text-xs font-extrabold uppercase tracking-wider">
            <Compass className="w-4 h-4 animate-spin" style={{ animationDuration: '15s' }} />
            <span>探索流行趋势与权威榜单 ({activePlatform === 'qq' ? 'QQ 音乐' : '网易云音乐'})</span>
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight drop-shadow-md">
            浏览 · 发现全新音乐风向
          </h1>
          <p className="text-sm text-white/80 font-medium leading-relaxed">
            实时同步{activePlatform === 'qq' ? 'QQ 音乐巅峰榜、飙升榜' : '网易云热歌榜、新歌榜'}及多样化曲风分类，探索音乐无限可能。
          </p>
        </div>
        <div className="absolute right-8 top-1/2 -translate-y-1/2 opacity-20 pointer-events-none">
          <Disc className="w-64 h-64 text-rose-300 animate-spin" style={{ animationDuration: '25s' }} />
        </div>
      </div>

      {/* Category Filter Chips (Clean capsule style with no rectangular bleeding shadows) */}
      <div className="flex items-center space-x-2.5 overflow-x-auto py-2 no-scrollbar">
        {categories.map((cat) => {
          const isActive = activeCategory === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => handleCategoryClick(cat.id, cat.name)}
              className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all cursor-pointer border ${
                isActive
                  ? 'bg-rose-500 text-white border-rose-500 shadow-md shadow-rose-500/20'
                  : 'bg-white/5 text-white/70 border-white/10 hover:bg-white/10 hover:text-white'
              }`}
            >
              {cat.name}
            </button>
          );
        })}
      </div>

      {/* Official Top Charts Section */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-white tracking-tight flex items-center space-x-2">
          <Award className="w-5 h-5 text-amber-400" />
          <span>{activePlatform === 'qq' ? 'QQ 音乐热门榜单' : '网易云权威榜单'}</span>
        </h2>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {chartPlaylists.map((pl) => (
            <div
              key={pl.id}
              onClick={() => setSelectedPlaylist(pl)}
              className="apple-card glass-panel rounded-2xl p-3 flex flex-col space-y-2.5 cursor-pointer group"
            >
              <div className="relative w-full aspect-square rounded-xl overflow-hidden border border-white/10 shadow-md">
                <img
                  src={getOptimizedCoverUrl(pl.coverImgUrl, 300)}
                  alt={pl.name}
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Play className="w-8 h-8 text-white fill-current" />
                </div>
              </div>
              <div className="flex flex-col space-y-0.5">
                <span className="text-xs font-bold text-white truncate">{pl.name}</span>
                <span className="text-[10px] text-white/50 truncate">{pl.description}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Trending Hot Songs List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center space-x-2">
            <Flame className="w-5 h-5 text-apple-red" />
            <span>
              {activeCategory === 'all'
                ? '全网热歌速递'
                : `${categories.find((c) => c.id === activeCategory)?.name || ''} 精选曲目`}
            </span>
          </h2>
          <span className="text-xs text-white/40">点击直接播放</span>
        </div>

        {isCategoryLoading ? (
          <div className="py-12 text-center text-xs text-white/40">正在分类获取音乐中...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {hotSongs.map((song, idx) => (
              <div
                key={`${song.id}-${idx}`}
                onClick={() => playSong(song, hotSongs)}
                className="apple-card glass-panel rounded-xl p-2.5 flex items-center justify-between cursor-pointer group border border-white/5 hover:border-white/20"
              >
                <div className="flex items-center space-x-3 truncate">
                  <span className="w-6 text-center text-xs font-bold font-mono text-white/40 group-hover:text-apple-red">
                    {idx + 1}
                  </span>

                  <div className="relative w-11 h-11 rounded-lg overflow-hidden shrink-0 border border-white/10">
                    <img
                      src={getOptimizedCoverUrl(song.coverUrl, 120)}
                      alt={song.name}
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Play className="w-4 h-4 text-white fill-current" />
                    </div>
                  </div>

                  <div className="flex flex-col truncate">
                    <span className="text-xs font-bold text-white group-hover:text-apple-red transition-colors truncate">
                      {neteaseApi.cleanTitle(song.name)}
                    </span>
                    <span className="text-[11px] text-white/60 truncate">{neteaseApi.cleanTitle(song.artist)}</span>
                  </div>
                </div>

                {Boolean(song.isVip) && (
                  <span
                    title="VIP 曲目"
                    className="px-1.5 py-0.5 rounded text-[8px] bg-gradient-to-r from-amber-500 to-red-500 text-white font-black shrink-0 shadow-sm uppercase tracking-wider cursor-help"
                  >
                    VIP
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
