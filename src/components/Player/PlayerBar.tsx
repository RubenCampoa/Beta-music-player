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
} from 'lucide-react';
import { usePlayerStore } from '../../store/playerStore';

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
    togglePlayPause,
    nextSong,
    prevSong,
    toggleRepeat,
    toggleShuffle,
    setVolume,
    toggleMute,
    setFullLyricsMode,
  } = usePlayerStore();

  const [isHoverProgress, setIsHoverProgress] = useState(false);

  // Hide bottom floating bar when in full lyrics mode to prevent duplicate controls
  if (isFullLyricsMode) return null;

  const formatTime = (secs: number) => {
    if (!secs || isNaN(secs)) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

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
    <footer className="h-20 w-full glass-player fixed bottom-0 left-0 right-0 z-[60] flex items-center justify-between px-6 select-none border-t border-white/10">
      {/* Current Playing Track Meta (Click to open full lyric mode) */}
      <div className="flex items-center space-x-3.5 w-1/4 min-w-[200px]">
        {currentSong ? (
          <div
            onClick={() => setFullLyricsMode(!isFullLyricsMode)}
            className="flex items-center space-x-3.5 cursor-pointer group"
            title="点击展开 Apple Music 歌词动效"
          >
            <div className="relative w-12 h-12 rounded-lg overflow-hidden border border-white/15 shadow-md shrink-0">
              <img
                src={currentSong.coverUrl}
                alt={currentSong.name}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              />
              <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <Quote className="w-5 h-5 text-white" />
              </div>
            </div>
            <div className="flex flex-col truncate">
              <span className="text-sm font-semibold text-white/95 truncate group-hover:text-apple-red transition-colors">
                {currentSong.name}
              </span>
              <span className="text-xs text-white/60 truncate group-hover:text-white/80 transition-colors">
                {currentSong.artist}
              </span>
            </div>
          </div>
        ) : (
          <div className="flex items-center space-x-3 text-white/40 text-xs">
            <div className="w-12 h-12 bg-white/5 rounded-lg border border-white/10 flex items-center justify-center">
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
              isShuffle ? 'text-apple-red bg-apple-red/10' : 'text-white/40 hover:text-white'
            }`}
            title="随机播放"
          >
            <Shuffle className="w-4 h-4" />
          </button>

          <button
            onClick={prevSong}
            className="text-white/80 hover:text-white hover:scale-110 active:scale-95 transition-all p-1"
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
            className="text-white/80 hover:text-white hover:scale-110 active:scale-95 transition-all p-1"
            title="下一首"
          >
            <SkipForward className="w-5 h-5 fill-current" />
          </button>

          <button
            onClick={toggleRepeat}
            className={`p-1.5 rounded-full transition-colors ${
              repeatMode !== 'off' ? 'text-apple-red bg-apple-red/10' : 'text-white/40 hover:text-white'
            }`}
            title="单曲/循环"
          >
            {repeatMode === 'one' ? <Repeat1 className="w-4 h-4" /> : <Repeat className="w-4 h-4" />}
          </button>
        </div>

        {/* Progress Bar */}
        <div className="w-full flex items-center space-x-2.5 text-[11px] font-mono text-white/50">
          <span>{formatTime(currentTime)}</span>
          <div
            onClick={handleProgressSeek}
            onMouseEnter={() => setIsHoverProgress(true)}
            onMouseLeave={() => setIsHoverProgress(false)}
            className="relative flex-1 h-1.5 bg-white/15 hover:h-2 rounded-full cursor-pointer overflow-hidden transition-all"
          >
            <div
              className="h-full bg-white rounded-full relative transition-all"
              style={{ width: `${progressPercent}%` }}
            >
              {isHoverProgress && (
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-white rounded-full shadow-md" />
              )}
            </div>
          </div>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* Right Volume & Lyric Toggle */}
      <div className="flex items-center justify-end space-x-4 w-1/4 min-w-[200px]">
        {/* Lyrics Button */}
        <button
          onClick={() => setFullLyricsMode(!isFullLyricsMode)}
          className={`p-2 rounded-lg transition-all ${
            isFullLyricsMode
              ? 'bg-apple-red text-white shadow-md shadow-apple-red/30 scale-105'
              : 'text-white/60 hover:bg-white/10 hover:text-white'
          }`}
          title="全屏歌词动效"
        >
          <Quote className="w-4 h-4" />
        </button>

        {/* Volume Controls */}
        <div className="flex items-center space-x-2 group">
          <button onClick={toggleMute} className="text-white/60 hover:text-white transition-colors">
            {isMuted || volume === 0 ? (
              <VolumeX className="w-4 h-4 text-white/40" />
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
            className="w-20 accent-white h-1 bg-white/20 rounded-lg cursor-pointer"
          />
        </div>
      </div>
    </footer>
  );
};
