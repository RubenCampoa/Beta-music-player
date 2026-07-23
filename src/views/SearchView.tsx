import React from 'react';
import { Search, Play, Music, Sparkles } from 'lucide-react';
import { usePlayerStore } from '../store/playerStore';
import { Song } from '../types/music';

export const SearchView: React.FC = () => {
  const { searchQuery, searchResults, isSearching, playSong, currentSong, isPlaying } =
    usePlayerStore();

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="space-y-6 pb-12 select-none animate-fadeIn">
      {/* Search View Header */}
      <div className="flex items-center justify-between glass-panel rounded-2xl p-6 border border-white/10">
        <div className="space-y-1">
          <div className="flex items-center space-x-2 text-apple-red text-xs font-bold uppercase tracking-wider">
            <Search className="w-4 h-4" />
            <span>网易云音乐搜索</span>
          </div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight flex items-center space-x-2">
            <span>搜索结果：</span>
            <span className="text-apple-red font-mono">“{searchQuery}”</span>
          </h1>
          <p className="text-xs text-white/50">
            共找到 {searchResults.length} 首相关单曲
          </p>
        </div>

        {searchResults.length > 0 && (
          <button
            onClick={() => searchResults[0] && playSong(searchResults[0], searchResults)}
            className="flex items-center space-x-2 bg-apple-red hover:bg-apple-red/90 text-white font-semibold text-xs px-5 py-2.5 rounded-full transition-all shadow-lg shadow-apple-red/20"
          >
            <Play className="w-4 h-4 fill-current ml-0.5" />
            <span>播放全部搜索结果</span>
          </button>
        )}
      </div>

      {/* Results Table */}
      <div className="glass-panel rounded-2xl overflow-hidden border border-white/10">
        {isSearching ? (
          <div className="py-20 text-center text-white/40 space-y-3">
            <Sparkles className="w-8 h-8 mx-auto animate-spin text-apple-red" />
            <p className="text-sm font-medium">正在全网搜索音乐...</p>
          </div>
        ) : searchResults.length === 0 ? (
          <div className="py-20 text-center text-white/40 space-y-2">
            <Music className="w-10 h-10 mx-auto opacity-30" />
            <p className="text-sm font-medium">未找到相关的歌曲，请重试其他关键字</p>
          </div>
        ) : (
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-white/10 text-white/40 uppercase tracking-wider font-semibold">
                <th className="py-3 px-4 w-12 text-center">#</th>
                <th className="py-3 px-4">标题</th>
                <th className="py-3 px-4">歌手</th>
                <th className="py-3 px-4">专辑</th>
                <th className="py-3 px-4 text-right">时长</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {searchResults.map((song: Song, idx: number) => {
                const isCurrent = currentSong?.id === song.id;
                return (
                  <tr
                    key={song.id}
                    onClick={() => playSong(song, searchResults)}
                    className={`group hover:bg-white/10 transition-colors cursor-pointer ${
                      isCurrent ? 'bg-white/15 text-apple-red font-semibold' : 'text-white/80'
                    }`}
                  >
                    <td className="py-3 px-4 text-center text-white/40 group-hover:text-white">
                      {isCurrent && isPlaying ? (
                        <Play className="w-3.5 h-3.5 text-apple-red fill-current mx-auto animate-pulse" />
                      ) : (
                        idx + 1
                      )}
                    </td>
                    <td className="py-3 px-4 flex items-center space-x-3">
                      <img
                        src={song.coverUrl}
                        alt={song.name}
                        className="w-9 h-9 rounded-md object-cover border border-white/10"
                      />
                      <span className="truncate max-w-[220px] text-white font-medium flex items-center space-x-1.5">
                        <span className="truncate">{song.name}</span>
                        {song.isVip && (
                          <span
                            title="VIP 曲目 (标准音质免费播放，极高/无损音质需会员)"
                            className="px-1.5 py-0.5 rounded text-[8px] bg-gradient-to-r from-amber-500 to-red-500 text-white font-black shrink-0 shadow-sm uppercase tracking-wider cursor-help"
                          >
                            VIP
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-white/70 truncate max-w-[150px]">
                      {song.artist}
                    </td>
                    <td className="py-3 px-4 text-white/50 truncate max-w-[150px]">
                      {song.album}
                    </td>
                    <td className="py-3 px-4 text-right text-white/50 font-mono">
                      {formatDuration(song.duration)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
