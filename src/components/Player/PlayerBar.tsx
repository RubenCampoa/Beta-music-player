import React, { useState } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Repeat,
  Repeat1,
  Shuffle,
  Volume2,
  VolumeX,
  Quote,
  Music,
  ListMusic,
  Heart,
  Tv,
} from 'lucide-react';
import { usePlayerStore } from '../../store/playerStore';
import { neteaseApi, getOptimizedCoverUrl } from '../../services/neteaseApi';
import { formatTime, formatRemainingTime } from '../../utils/format';

export const PlayerBar: React.FC = () => {
  const {
    currentSong,
    isPlaying,
    currentTime,
    duration,
    volume,
    isMuted,
    repeatMode,
    isShuffle,
    isFullLyricsMode,
    isQueueOpen,
    togglePlayPause,
    nextSong,
    prevSong,
    toggleRepeat,
    toggleShuffle,
    setVolume,
    toggleMute,
    setFullLyricsMode,
    toggleQueueDrawer,
    toggleFavorite,
    isFavorite,
  } = usePlayerStore();

  const [isDesktopLyricActive, setIsDesktopLyricActive] = useState(false);

  React.useEffect(() => {
    if (window.electronAPI?.onDesktopLyricStatusChange) {
      const cleanup = window.electronAPI.onDesktopLyricStatusChange((active) => {
        setIsDesktopLyricActive(active);
      });
      return cleanup;
    }
  }, []);

  const handleProgressSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percent = Math.max(0, Math.min(1, clickX / rect.width));
    const seekTime = percent * duration;

    // Dispatch custom audio-seek event to AudioController
    window.dispatchEvent(new CustomEvent('audio-seek', { detail: seekTime }));
  };

  const progressPercent = duration ? Math.min(100, (currentTime / duration) * 100) : 0;

  return (
    <footer className="player-dock h-20 w-full glass-player fixed bottom-0 left-0 right-0 z-[60] flex items-center justify-between px-6 select-none border-t border-black/8">
      {/* Current Playing Track Meta (Click to open full lyric mode) */}
      <div className="flex items-center space-x-3.5 w-1/4 min-w-[200px]">
        {currentSong ? (
          <div className="flex items-center space-x-3.5">
            <div
              onClick={() => setFullLyricsMode(!isFullLyricsMode)}
              className="flex items-center space-x-3.5 cursor-pointer group truncate"
              title="点击展开 Apple Music 歌词动效"
            >
              <div className="relative w-12 h-12 rounded-lg overflow-hidden border border-black/10 shadow-md shrink-0">
                <img
                  src={getOptimizedCoverUrl(currentSong.coverUrl, 200)}
                  alt={currentSong.name}
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
                <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Quote className="w-5 h-5 text-white" />
                </div>
              </div>
              <div className="flex flex-col truncate">
                <span className="text-sm font-semibold text-[#263246] truncate group-hover:text-apple-red transition-colors">
                  {neteaseApi.cleanTitle(currentSong.name)}
                </span>
                <span className="text-xs text-[#8a94a3] truncate group-hover:text-[#4b586d] transition-colors">
                  {neteaseApi.cleanTitle(currentSong.artist)}
                </span>
              </div>
            </div>
            <button
              onClick={() => toggleFavorite(currentSong)}
              className="p-1.5 rounded-full hover:bg-black/5 transition-all shrink-0 cursor-pointer"
              title={isFavorite(currentSong.id) ? '取消收藏' : '收藏歌曲'}
            >
              <Heart
                className={`w-4 h-4 transition-all ${
                  isFavorite(currentSong.id)
                    ? 'fill-current text-apple-red'
                    : 'text-[#9aa3af] hover:text-[#263246]'
                }`}
              />
            </button>
          </div>
        ) : (
          <div className="flex items-center space-x-3 text-[#9aa3af] text-xs">
            <div className="w-12 h-12 bg-black/5 rounded-lg border border-black/8 flex items-center justify-center">
              <Music className="w-5 h-5 opacity-40" />
            </div>
            <span>未在播放</span>
          </div>
        )}
      </div>

      {/* Center Controls & Progress Scrubbing */}
      <div className="flex flex-col items-center justify-center w-2/4 max-w-xl space-y-1.5">
        {/* Buttons */}
        <div className="flex items-center space-x-5">
          <button
            onClick={toggleShuffle}
            className={`p-1.5 rounded-full transition-colors ${
              isShuffle ? 'text-apple-red bg-apple-red/10' : 'text-[#9aa3af] hover:text-[#263246]'
            }`}
            title="随机播放"
          >
            <Shuffle className="w-4 h-4" />
          </button>

          <button
            onClick={prevSong}
            className="text-[#657083] hover:text-[#263246] hover:scale-110 active:scale-95 transition-all p-1"
            title="上一首"
          >
            <SkipBack className="w-5 h-5 fill-current" />
          </button>

          <button
            onClick={togglePlayPause}
            className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-lg shadow-white/10"
            title={isPlaying ? '暂停' : '播放'}
          >
            {isPlaying ? (
              <Pause className="w-5 h-5 fill-current" />
            ) : (
              <Play className="w-5 h-5 fill-current ml-0.5" />
            )}
          </button>

          <button
            onClick={nextSong}
            className="text-[#657083] hover:text-[#263246] hover:scale-110 active:scale-95 transition-all p-1"
            title="下一首"
          >
            <SkipForward className="w-5 h-5 fill-current" />
          </button>

          <button
            onClick={toggleRepeat}
            className={`p-1.5 rounded-full transition-colors ${
              repeatMode !== 'off' ? 'text-apple-red bg-apple-red/10' : 'text-[#9aa3af] hover:text-[#263246]'
            }`}
            title="单曲/循环"
          >
            {repeatMode === 'one' ? <Repeat1 className="w-4 h-4" /> : <Repeat className="w-4 h-4" />}
          </button>
        </div>

        {/* Progress Bar */}
        <div className="w-full flex items-center space-x-2.5 text-[11px] font-mono text-[#9aa3af]">
          <span>{formatTime(currentTime)}</span>
          <div
            onClick={handleProgressSeek}
            className="progress-track relative flex-1 h-1.5 hover:h-2 rounded-full cursor-pointer overflow-visible transition-all"
          >
            <div
              className="progress-fill h-full rounded-full relative transition-[width] duration-150 ease-out"
              style={{ width: `${progressPercent}%` }}
            >
              <div className="progress-thumb absolute right-0 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full shadow-md" />
            </div>
          </div>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* Right Volume, Queue Drawer & Lyric Toggle */}
      <div className="flex items-center justify-end space-x-3 w-1/4 min-w-[200px]">
        {/* Queue Drawer Button */}
        <button
          onClick={toggleQueueDrawer}
          className={`p-2 rounded-lg transition-all ${
            isQueueOpen
              ? 'bg-apple-red text-white shadow-md shadow-apple-red/30 scale-105'
              : 'text-[#7c8796] hover:bg-black/5 hover:text-[#263246]'
          }`}
          title="播放队列"
        >
          <ListMusic className="w-4 h-4" />
        </button>

        {/* Desktop Lyric Button */}
        <button
          onClick={() => window.electronAPI?.toggleDesktopLyric?.()}
          className={`p-2 rounded-lg transition-all ${
            isDesktopLyricActive
              ? 'bg-apple-red text-white shadow-md shadow-apple-red/30 scale-105'
              : 'text-[#7c8796] hover:bg-black/5 hover:text-[#263246]'
          }`}
          title="桌面歌词 (网易云同款桌面浮动窗口)"
        >
          <Tv className="w-4 h-4" />
        </button>

        {/* Lyrics Button */}
        <button
          onClick={() => setFullLyricsMode(!isFullLyricsMode)}
          className={`p-2 rounded-lg transition-all ${
            isFullLyricsMode
              ? 'bg-apple-red text-white shadow-md shadow-apple-red/30 scale-105'
              : 'text-[#7c8796] hover:bg-black/5 hover:text-[#263246]'
          }`}
          title="全屏歌词动效"
        >
          <Quote className="w-4 h-4" />
        </button>

        {/* Volume Controls */}
        <div className="flex items-center space-x-2 group">
          <button onClick={toggleMute} className="text-[#7c8796] hover:text-[#263246] transition-colors">
            {isMuted || volume === 0 ? (
              <VolumeX className="w-4 h-4 text-[#9aa3af]" />
            ) : (
              <Volume2 className="w-4 h-4" />
            )}
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={isMuted ? 0 : volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            className="w-20 accent-[#263246] h-1 bg-black/10 rounded-lg cursor-pointer"
          />
        </div>
      </div>
    </footer>
  );
};
