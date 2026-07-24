import React, { useEffect, useState } from 'react';
import { Play, Sparkles, Music, Disc, Radio, Heart, Compass } from 'lucide-react';
import { Song, Playlist } from '../types/music';
import { usePlayerStore } from '../store/playerStore';
import { neteaseApi } from '../services/neteaseApi';

export const ListenNowView: React.FC = () => {
  const { playSong, setSelectedPlaylist, user, playlists } = usePlayerStore();
  const [recommendSongs, setRecommendSongs] = useState<Song[]>(() => neteaseApi.getFallbackSongs());
  const [personalPlaylists, setPersonalPlaylists] = useState<Playlist[]>([
    {
      id: 3778678,
      name: '私人雷达 & 每日推荐',
      coverImgUrl: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=400&h=400&fit=crop',
      trackCount: 50,
      description: '根据你的听歌偏好个性化生成',
    },
    {
      id: 3779629,
      name: '惬意周末 · 情绪声场',
      coverImgUrl: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=400&h=400&fit=crop',
      trackCount: 30,
      description: '放松身心的轻柔旋律',
    },
    {
      id: 2884035,
      name: '深夜电台 · 沉浸人声',
      coverImgUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400&h=400&fit=crop',
      trackCount: 40,
      description: '温暖动听的夜间陪伴乐章',
    },
  ]);

  // Get dynamic greeting based on current local hour
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return '早上好';
    if (hour >= 12 && hour < 18) return '下午好';
    return '晚上好';
  };

  useEffect(() => {
    let isMounted = true;

    const loadContent = async () => {
      // If user logged in and has playlists, use them
      if (playlists && playlists.length > 0) {
        if (isMounted) setPersonalPlaylists(playlists.slice(0, 4));
      }

      try {
        const songs = await neteaseApi.getPlaylistSongs(3778678);
        if (isMounted && songs && songs.length > 0) {
          setRecommendSongs(songs.slice(0, 6));
        }
      } catch (e) {
        console.warn('Network load for recommend songs failed, keeping fallback data:', e);
      }
    };

    loadContent();

    return () => {
      isMounted = false;
    };
  }, [playlists]);

  return (
    <div className="space-y-8 pb-12 select-none animate-fadeIn">
      {/* Top Personalized Greeting Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-apple-red/80 via-purple-600/70 to-pink-600/60 p-8 border border-white/20 shadow-2xl">
        <div className="relative z-10 max-w-lg space-y-3">
          <div className="flex items-center space-x-2 text-white/80 text-xs font-bold uppercase tracking-wider">
            <Sparkles className="w-4 h-4 text-yellow-300" />
            <span>{getGreeting()}，{user?.nickname || '音乐爱好者'}</span>
          </div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">
            现在就听 · 为你推荐
          </h1>
          <p className="text-sm text-white/80 font-medium">
            为你量身定制的音乐专区，享受全景流体背景与沉浸歌词视觉。
          </p>
          <div className="pt-2">
            <button
              onClick={() => recommendSongs[0] && playSong(recommendSongs[0], recommendSongs)}
              className="flex items-center space-x-2 bg-white text-black font-semibold text-xs px-5 py-2.5 rounded-full hover:bg-white/90 hover:scale-105 transition-all shadow-lg"
            >
              <Play className="w-4 h-4 fill-current ml-0.5" />
              <span>播放个性化推荐</span>
            </button>
          </div>
        </div>
        <div className="absolute right-6 top-1/2 -translate-y-1/2 opacity-20 pointer-events-none">
          <Disc className="w-64 h-64 text-white animate-spin" style={{ animationDuration: '20s' }} />
        </div>
      </div>

      {/* Daily Recommendations */}
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
                <img
                  src={song.coverUrl}
                  alt={song.name}
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Play className="w-6 h-6 text-white fill-current ml-0.5" />
                </div>
              </div>
              <div className="flex flex-col truncate">
                <div className="flex items-center space-x-1.5 truncate">
                  <span className="text-sm font-semibold text-white group-hover:text-apple-red transition-colors truncate">
                    {neteaseApi.cleanTitle(song.name)}
                  </span>
                  {Boolean(song.isVip) && (
                    <span
                      title="VIP 曲目 (标准音质免费播放，极高/无损音质需会员)"
                      className="px-1.5 py-0.5 rounded text-[8px] bg-gradient-to-r from-amber-500 to-red-500 text-white font-black shrink-0 shadow-sm uppercase tracking-wider cursor-help"
                    >
                      VIP
                    </span>
                  )}
                </div>
                <span className="text-xs text-white/60 truncate">{neteaseApi.cleanTitle(song.artist)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Personal Mixes & Favorite Playlists */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-white tracking-tight flex items-center space-x-2">
          <Radio className="w-5 h-5 text-purple-400" />
          <span>专属歌单与推荐企划</span>
        </h2>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
          {personalPlaylists.map((pl) => (
            <div
              key={pl.id}
              onClick={() => setSelectedPlaylist(pl)}
              className="apple-card glass-panel rounded-2xl p-3.5 flex flex-col space-y-3 cursor-pointer group"
            >
              <div className="relative w-full aspect-square rounded-xl overflow-hidden border border-white/10 shadow-md">
                <img
                  src={pl.coverImgUrl}
                  alt={pl.name}
                  loading="lazy"
                  decoding="async"
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
