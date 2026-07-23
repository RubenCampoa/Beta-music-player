import React, { useEffect, useState } from 'react';
import { Play, Sparkles, Music, Disc } from 'lucide-react';
import { Song, Playlist } from '../types/music';
import { usePlayerStore } from '../store/playerStore';
import { neteaseApi } from '../services/neteaseApi';

export const ListenNowView: React.FC = () => {
  const { playSong, setSelectedPlaylist } = usePlayerStore();
  const [recommendSongs, setRecommendSongs] = useState<Song[]>([]);
  const [featuredPlaylists, setFeaturedPlaylists] = useState<Playlist[]>([]);

  useEffect(() => {
    // Load default recommend songs and featured playlists
    const loadContent = async () => {
      const fallback = neteaseApi.getFallbackSongs();
      setRecommendSongs(fallback);

      setFeaturedPlaylists([
        {
          id: 3778678,
          name: '热歌榜 (Top Songs)',
          coverImgUrl: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=400&h=400&fit=crop',
          trackCount: 100,
        },
        {
          id: 3779629,
          name: '新歌榜 (New Releases)',
          coverImgUrl: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=400&h=400&fit=crop',
          trackCount: 100,
        },
        {
          id: 2884035,
          name: '原创榜 (Original Beats)',
          coverImgUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400&h=400&fit=crop',
          trackCount: 100,
        },
      ]);
    };

    loadContent();
  }, []);

  return (
    <div className="space-y-8 pb-12 select-none animate-fadeIn">
      {/* Top Banner Feature Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-apple-red/80 via-purple-600/70 to-pink-600/60 p-8 border border-white/20 shadow-2xl">
        <div className="relative z-10 max-w-lg space-y-3">
          <div className="flex items-center space-x-2 text-white/80 text-xs font-bold uppercase tracking-wider">
            <Sparkles className="w-4 h-4 text-yellow-300" />
            <span>BETA MUSIC PLAYER 音频特辑</span>
          </div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">
            全景沉浸 · 动效声场
          </h1>
          <p className="text-sm text-white/80 font-medium">
            配合 Beta Music Player 独家流体与高精度全景歌词动效，带来极致听觉与视觉盛宴。
          </p>
          <div className="pt-2">
            <button
              onClick={() => recommendSongs[0] && playSong(recommendSongs[0], recommendSongs)}
              className="flex items-center space-x-2 bg-white text-black font-semibold text-xs px-5 py-2.5 rounded-full hover:bg-white/90 hover:scale-105 transition-all shadow-lg"
            >
              <Play className="w-4 h-4 fill-current ml-0.5" />
              <span>立即播放精选推荐</span>
            </button>
          </div>
        </div>
        <div className="absolute right-6 top-1/2 -translate-y-1/2 opacity-20 pointer-events-none">
          <Disc className="w-64 h-64 text-white animate-spin" style={{ animationDuration: '20s' }} />
        </div>
      </div>

      {/* Featured Recommendations */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-white tracking-tight flex items-center space-x-2">
          <Music className="w-5 h-5 text-apple-red" />
          <span>每日推荐歌曲</span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {recommendSongs.map((song) => (
            <div
              key={song.id}
              onClick={() => playSong(song, recommendSongs)}
              className="apple-card glass-panel rounded-xl p-3 flex items-center space-x-3 cursor-pointer group"
            >
              <div className="relative w-14 h-14 rounded-lg overflow-hidden shrink-0 border border-white/10">
                <img src={song.coverUrl} alt={song.name} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Play className="w-6 h-6 text-white fill-current ml-0.5" />
                </div>
              </div>
              <div className="flex flex-col truncate">
                <div className="flex items-center space-x-1.5 truncate">
                  <span className="text-sm font-semibold text-white group-hover:text-apple-red transition-colors truncate">
                    {song.name}
                  </span>
                  {song.isVip && (
                    <span className="px-1.5 py-0.5 rounded text-[8px] bg-gradient-to-r from-amber-500 to-red-500 text-white font-black shrink-0 shadow-sm uppercase tracking-wider">
                      VIP
                    </span>
                  )}
                </div>
                <span className="text-xs text-white/60 truncate">{song.artist}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Featured Playlists */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-white tracking-tight">
          热门榜单与歌单
        </h2>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
          {featuredPlaylists.map((pl) => (
            <div
              key={pl.id}
              onClick={() => setSelectedPlaylist(pl)}
              className="apple-card glass-panel rounded-2xl p-3.5 flex flex-col space-y-3 cursor-pointer group"
            >
              <div className="relative w-full aspect-square rounded-xl overflow-hidden border border-white/10 shadow-md">
                <img
                  src={pl.coverImgUrl}
                  alt={pl.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Play className="w-10 h-10 text-white fill-current" />
                </div>
              </div>
              <div className="flex flex-col space-y-0.5">
                <span className="text-sm font-bold text-white truncate">{pl.name}</span>
                <span className="text-xs text-white/50">{pl.trackCount} 首歌曲</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
