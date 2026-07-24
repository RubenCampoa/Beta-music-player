import React, { useEffect, useState } from 'react';
import { Compass, Flame, Radio, Award, Disc, Play, Sparkles, Music2 } from 'lucide-react';
import { Song, Playlist } from '../types/music';
import { usePlayerStore } from '../store/playerStore';
import { neteaseApi } from '../services/neteaseApi';

export const BrowseView: React.FC = () => {
  const { playSong, setSelectedPlaylist, performSearch } = usePlayerStore();
  const [chartPlaylists, setChartPlaylists] = useState<Playlist[]>([]);
  const [hotSongs, setHotSongs] = useState<Song[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('all');

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
    // Official NetEase Top Charts
    const charts: Playlist[] = [
      {
        id: 3778678,
        name: '网易云热歌榜',
        coverImgUrl: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=500&h=500&fit=crop',
        trackCount: 100,
        description: '全网播放量最高热门单曲集合',
      },
      {
        id: 3779629,
        name: '云音乐新歌榜',
        coverImgUrl: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=500&h=500&fit=crop',
        trackCount: 100,
        description: '最新发行高赞潮流流行歌曲',
      },
      {
        id: 19723756,
        name: '云音乐飙升榜',
        coverImgUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&h=500&fit=crop',
        trackCount: 100,
        description: '近期热度飙升最快优质单曲',
      },
      {
        id: 2884035,
        name: '网易原创歌曲榜',
        coverImgUrl: 'https://images.unsplash.com/photo-1511379938547-c1f69419868d?w=500&h=500&fit=crop',
        trackCount: 100,
        description: '独立音乐人原创金曲排行榜',
      },
      {
        id: 71385702,
        name: 'ACG 音乐榜',
        coverImgUrl: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=500&h=500&fit=crop',
        trackCount: 100,
        description: '热门动漫、游戏原声与二次元名曲',
      },
      {
        id: 71384707,
        name: '欧美金曲榜',
        coverImgUrl: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=500&h=500&fit=crop',
        trackCount: 100,
        description: 'Billboard & 欧美流行排行榜',
      },
    ];

    setChartPlaylists(charts);

    // Fetch top songs for browse preview
    const loadHotSongs = async () => {
      const songs = await neteaseApi.getPlaylistSongs(3778678);
      if (songs && songs.length > 0) {
        setHotSongs(songs.slice(0, 10));
      } else {
        setHotSongs(neteaseApi.getFallbackSongs());
      }
    };

    loadHotSongs();
  }, []);

  const handleCategoryClick = (catName: string) => {
    if (catName === '全部探索') return;
    performSearch(catName);
  };

  return (
    <div className="space-y-8 pb-16 select-none animate-fadeIn">
      {/* Header Explore Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-purple-900/80 via-blue-900/70 to-indigo-950/90 p-8 border border-white/15 shadow-2xl">
        <div className="relative z-10 max-w-xl space-y-3">
          <div className="flex items-center space-x-2 text-cyan-400 text-xs font-bold uppercase tracking-wider">
            <Compass className="w-4 h-4 animate-spin" style={{ animationDuration: '15s' }} />
            <span>探索流行趋势与权威榜单</span>
          </div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">
            浏览 · 发现全新音乐风向
          </h1>
          <p className="text-sm text-white/70 font-medium leading-relaxed">
            实时同步网易云热歌榜、飙升榜、新歌榜及多样化曲风分类，探索音乐无限可能。
          </p>
        </div>
        <div className="absolute right-8 top-1/2 -translate-y-1/2 opacity-15 pointer-events-none">
          <Disc className="w-64 h-64 text-white animate-spin" style={{ animationDuration: '25s' }} />
        </div>
      </div>

      {/* Category Filter Chips */}
      <div className="flex items-center space-x-2 overflow-x-auto pb-1 no-scrollbar">
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => {
              setActiveCategory(cat.id);
              handleCategoryClick(cat.name);
            }}
            className={`px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all border ${
              activeCategory === cat.id
                ? 'bg-apple-red text-white border-apple-red shadow-lg shadow-apple-red/30 scale-105'
                : 'bg-white/5 text-white/70 border-white/10 hover:bg-white/10 hover:text-white'
            }`}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {/* Official Top Charts Section */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-white tracking-tight flex items-center space-x-2">
          <Award className="w-5 h-5 text-amber-400" />
          <span>权威音乐排行榜</span>
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
                  src={pl.coverImgUrl}
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
            <span>全网热歌速递</span>
          </h2>
          <span className="text-xs text-white/40">点击直接播放</span>
        </div>

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
                    src={song.coverUrl}
                    alt={song.name}
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
                  title="VIP 曲目 (标准音质免费播放，极高/无损音质需会员)"
                  className="px-1.5 py-0.5 rounded text-[8px] bg-gradient-to-r from-amber-500 to-red-500 text-white font-black shrink-0 shadow-sm uppercase tracking-wider cursor-help"
                >
                  VIP
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
