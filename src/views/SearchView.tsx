import React from 'react';
import { Search, Play, Music, Sparkles } from 'lucide-react';
import { usePlayerStore } from '../store/playerStore';
import { shallow } from 'zustand/shallow';
import { Song, Platform } from '../types/music';
import { getOptimizedCoverUrl, cleanTitle, DEFAULT_COVER_PLACEHOLDER } from '../utils/format';

export const SearchView: React.FC = () => {
  const {
    searchQuery,
    searchResults,
    searchPlatform,
    setSearchPlatform,
    performSearch,
    isSearching,
    playSong,
    currentSong,
    isPlaying,
  } = usePlayerStore(
    (state) => ({
      searchQuery: state.searchQuery,
      searchResults: state.searchResults,
      searchPlatform: state.searchPlatform,
      setSearchPlatform: state.setSearchPlatform,
      performSearch: state.performSearch,
      isSearching: state.isSearching,
      playSong: state.playSong,
      currentSong: state.currentSong,
      isPlaying: state.isPlaying,
    }),
    shallow,
  );

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handlePlatformChange = (platform: Platform) => {
    setSearchPlatform(platform);
    if (searchQuery) {
      performSearch(searchQuery, platform);
    }
  };

  return (
    <div className="space-y-6 pb-12 select-none animate-fadeIn">
      {/* Search View Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between glass-panel rounded-2xl p-6 border border-white/10 gap-4">
        <div className="space-y-1">
          <div className="flex items-center space-x-2 text-apple-red text-xs font-bold uppercase tracking-wider">
            <Search className="w-4 h-4" />
            <span>{searchPlatform === 'qq' ? 'QQ 音乐全网搜索' : '网易云音乐搜索'}</span>
          </div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight flex items-center space-x-2">
            <span>搜索结果：</span>
            <span className={searchPlatform === 'qq' ? 'text-emerald-400 font-mono' : 'text-apple-red font-mono'}>
              “{searchQuery}”
            </span>
          </h1>
          <p className="text-xs text-white/50">共找到 {searchResults.length} 首相关单曲</p>
        </div>

        {/* Platform Switching Tabs */}
        <div className="flex items-center space-x-3 self-stretch md:self-auto justify-between md:justify-end">
          <div className="flex items-center p-1 bg-white/10 rounded-full border border-white/15 backdrop-blur-md">
            <button
              onClick={() => handlePlatformChange('netease')}
              className={`flex items-center space-x-1.5 px-4 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                searchPlatform === 'netease'
                  ? 'bg-rose-500 text-white shadow-md'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              <div className="w-2 h-2 rounded-full bg-rose-300" />
              <span>网易云音乐</span>
            </button>

            <button
              onClick={() => handlePlatformChange('qq')}
              className={`flex items-center space-x-1.5 px-4 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                searchPlatform === 'qq'
                  ? 'bg-emerald-500 text-white shadow-md'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              <div className="w-2 h-2 rounded-full bg-emerald-300" />
              <span>QQ 音乐</span>
            </button>
          </div>

          {searchResults.length > 0 && (
            <button
              onClick={() => searchResults[0] && playSong(searchResults[0], searchResults)}
              className={`flex items-center space-x-2 font-semibold text-xs px-5 py-2.5 rounded-full transition-all shadow-lg text-white cursor-pointer ${
                searchPlatform === 'qq'
                  ? 'bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/20'
                  : 'bg-apple-red hover:bg-apple-red/90 shadow-apple-red/20'
              }`}
            >
              <Play className="w-4 h-4 fill-current ml-0.5" />
              <span>播放全部搜索结果</span>
            </button>
          )}
        </div>
      </div>

      {/* Results Table */}
      <div className="glass-panel rounded-2xl border border-white/10 overflow-x-auto">
        {isSearching ? (
          <div className="py-20 text-center text-white/40 space-y-3">
            <Sparkles
              className={`w-8 h-8 mx-auto animate-spin ${
                searchPlatform === 'qq' ? 'text-emerald-400' : 'text-apple-red'
              }`}
            />
            <p className="text-sm font-medium">
              正在 {searchPlatform === 'qq' ? 'QQ 音乐' : '网易云音乐'} 全网搜索...
            </p>
          </div>
        ) : searchResults.length === 0 ? (
          <div className="py-20 text-center text-white/40 space-y-2">
            <Music className="w-10 h-10 mx-auto opacity-30" />
            <p className="text-sm font-medium">未找到相关的歌曲，请重试其他关键字或切换平台</p>
          </div>
        ) : (
          <table className="w-full text-left text-xs border-collapse min-w-[600px]">
            <thead>
              <tr className="border-b border-white/10 text-white/40 uppercase tracking-wider font-semibold whitespace-nowrap">
                <th className="py-3 px-4 w-12 text-center">#</th>
                <th className="py-3 px-4">标题</th>
                <th className="py-3 px-4">歌手</th>
                <th className="py-3 px-4">专辑</th>
                <th className="py-3 px-4 text-center">平台</th>
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
                    <td className="py-3 px-4 text-center text-white/40 group-hover:text-white whitespace-nowrap">
                      {isCurrent && isPlaying ? (
                        <Play className="w-3.5 h-3.5 text-apple-red fill-current mx-auto animate-pulse" />
                      ) : (
                        idx + 1
                      )}
                    </td>
                    <td className="py-3 px-4 flex items-center space-x-3 whitespace-nowrap">
                      <img
                        src={getOptimizedCoverUrl(song.coverUrl, 100)}
                        alt={song.name}
                        loading="lazy"
                        decoding="async"
                        className="w-9 h-9 rounded-md object-cover border border-white/10 shrink-0"
                        onError={(e) => {
                          const img = e.currentTarget;
                          if (img.src !== DEFAULT_COVER_PLACEHOLDER) {
                            img.src = DEFAULT_COVER_PLACEHOLDER;
                          }
                        }}
                      />
                      <span className="truncate max-w-[220px] text-white font-medium flex items-center space-x-1.5">
                        <span className="truncate">{cleanTitle(song.name)}</span>
                        {Boolean(song.isVip) && (
                          <span
                            title="VIP 曲目"
                            className="px-1.5 py-0.5 rounded text-[8px] bg-gradient-to-r from-amber-500 to-red-500 text-white font-black shrink-0 shadow-sm uppercase tracking-wider cursor-help whitespace-nowrap"
                          >
                            VIP
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-white/70 truncate max-w-[150px] whitespace-nowrap">
                      {cleanTitle(song.artist)}
                    </td>
                    <td className="py-3 px-4 text-white/50 truncate max-w-[150px] whitespace-nowrap">
                      {cleanTitle(song.album)}
                    </td>
                    <td className="py-3 px-4 text-center whitespace-nowrap">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap inline-block shrink-0 ${
                          song.source === 'qq'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                        }`}
                      >
                        {song.source === 'qq' ? 'QQ 音乐' : '网易云'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right text-white/50 font-mono whitespace-nowrap">
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
