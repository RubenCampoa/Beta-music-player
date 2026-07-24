import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  Disc,
  Music,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Repeat,
  Repeat1,
  Shuffle,
  Volume2,
  VolumeX,
  Heart,
  Sparkles,
  X,
  Minimize2,
  Maximize,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { usePlayerStore } from '../../store/playerStore';
import { neteaseApi, getOptimizedCoverUrl } from '../../services/neteaseApi';
import { formatTime, formatRemainingTime } from '../../utils/format';

export const AppleLyricView: React.FC = () => {
  const {
    currentSong,
    currentTime,
    duration,
    isPlaying,
    volume,
    isMuted,
    repeatMode,
    isShuffle,
    lyrics,
    isFullLyricsMode,
    setFullLyricsMode,
    togglePlayPause,
    nextSong,
    prevSong,
    toggleRepeat,
    toggleShuffle,
    setVolume,
    toggleMute,
    setToastMessage,
    toggleFavorite,
    isFavorite,
    enableLyricAnimation,
    enableLyricGlow,
    enableLyricBlur,
    enableArtworkAnimation,
    lyricFontSize,
  } = usePlayerStore();

  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const [translateY, setTranslateY] = useState<number>(0);
  const [isHoverProgress, setIsHoverProgress] = useState(false);
  const [isWindowFullScreen, setIsWindowFullScreen] = useState(false);
  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    if (!isFullLyricsMode) return;

    if (window.electronAPI?.onFullScreenChange) {
      window.electronAPI.isFullScreen?.().then((fs) => setIsWindowFullScreen(fs));
      const cleanup = window.electronAPI.onFullScreenChange((fs) => {
        setIsWindowFullScreen(fs);
      });
      return cleanup;
    } else {
      const handleFsChange = () => setIsWindowFullScreen(!!document.fullscreenElement);
      document.addEventListener('fullscreenchange', handleFsChange);
      return () => document.removeEventListener('fullscreenchange', handleFsChange);
    }
  }, [isFullLyricsMode]);

  // De-bounce React re-renders to only update activeIndex on line changes
  useEffect(() => {
    const unsub = usePlayerStore.subscribe((state) => {
      // 150ms natural vocal alignment offset
      const syncTime = state.currentTime + 0.15;
      const stateLyrics = state.lyrics;
      let newIndex = -1;
      for (let i = 0; i < stateLyrics.length; i++) {
        if (syncTime >= stateLyrics[i].time) {
          newIndex = i;
        } else {
          break;
        }
      }
      setActiveIndex((prev) => (prev !== newIndex ? newIndex : prev));
    });

    return () => unsub();
  }, []);

  // Stable position offset calculation without layout reflow jank
  useEffect(() => {
    if (activeIndex >= 0 && lineRefs.current[activeIndex]) {
      const activeEl = lineRefs.current[activeIndex];
      if (activeEl) {
        const top = activeEl.offsetTop;
        const height = activeEl.offsetHeight;
        setTranslateY(Math.max(0, top - 190 + height / 2));
      }
    } else if (activeIndex === -1) {
      setTranslateY(0);
    }
  }, [activeIndex, lyrics.length]);

  // ESC Key listener to exit full lyrics mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullLyricsMode) {
        setFullLyricsMode(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullLyricsMode, setFullLyricsMode]);

  if (!isFullLyricsMode) return null;

  const handleLyricClick = (time: number) => {
    window.dispatchEvent(new CustomEvent('audio-seek', { detail: time }));
  };

  const handleProgressSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percent = Math.max(0, Math.min(1, clickX / rect.width));
    const seekTime = percent * duration;
    window.dispatchEvent(new CustomEvent('audio-seek', { detail: seekTime }));
  };

  const progressPercent = duration ? Math.min(100, (currentTime / duration) * 100) : 0;

  const handleToggleWindowFullScreen = () => {
    if (window.electronAPI?.toggleFullScreen) {
      window.electronAPI.toggleFullScreen();
    } else {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.35, ease: [0.25, 1, 0.5, 1] }}
      className="fixed inset-0 z-50 flex flex-col justify-between p-8 pt-6 pb-8 select-none bg-[#0a0c14]/80 backdrop-blur-3xl overflow-hidden transform-gpu"
    >
      {/* Top Bar: Pull handle & Close buttons (z-50 isolate above lyrics) */}
      <div className="relative z-50 flex items-center justify-between w-full px-2 no-drag pointer-events-auto">
        <div className="flex items-center space-x-3 no-drag">
          <button
            onClick={() => setFullLyricsMode(false)}
            className="w-11 h-11 rounded-full bg-white/10 hover:bg-white/25 text-white/80 hover:text-white flex items-center justify-center transition-all duration-200 backdrop-blur-md border border-white/15 hover:scale-105 active:scale-95 cursor-pointer shadow-md shrink-0 no-drag"
            title="退出歌词全景模式 (或按 ESC 键)"
          >
            <ChevronDown className="w-6 h-6" />
          </button>
        </div>

        <div
          onClick={() => setFullLyricsMode(false)}
          className="w-20 h-2 bg-white/30 hover:bg-white/60 rounded-full cursor-pointer absolute left-1/2 -translate-x-1/2 top-5 transition-all hover:scale-105 no-drag shadow-sm"
          title="点击缩小歌词模式"
        />

        <div className="flex items-center space-x-3 no-drag relative z-[100]">
          {/* Software Window Fullscreen Toggle Button */}
          <button
            onClick={handleToggleWindowFullScreen}
            className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-full border text-xs font-bold backdrop-blur-md transition-all hover:scale-105 active:scale-95 cursor-pointer shadow-md no-drag relative z-[100] pointer-events-auto ${
              isWindowFullScreen
                ? 'bg-apple-red text-white border-apple-red shadow-apple-red/30'
                : 'bg-white/10 hover:bg-white/25 text-white/90 border-white/15'
            }`}
            title={isWindowFullScreen ? '取消软件窗口全屏覆盖' : '将软件窗口设置为全屏覆盖模式'}
          >
            {isWindowFullScreen ? (
              <>
                <Minimize2 className="w-4 h-4" />
                <span>取消全屏覆盖</span>
              </>
            ) : (
              <>
                <Maximize className="w-4 h-4 text-emerald-400" />
                <span>全屏覆盖</span>
              </>
            )}
          </button>

          <button
            onClick={() => setFullLyricsMode(false)}
            className="flex items-center space-x-1.5 text-white/80 hover:text-white bg-black/30 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-white/10 shadow-sm transition-colors no-drag"
            title="关闭全屏歌词界面"
          >
            <X className="w-4 h-4 text-white/60 hover:text-red-400 transition-colors" />
            <span>关闭</span>
          </button>
        </div>
      </div>

      {/* Main Split Layout: Left Player Column vs Right Dual-Line Lyrics */}
      <div className="flex-1 flex items-center justify-center max-w-6xl w-full mx-auto grid grid-cols-1 md:grid-cols-2 gap-12 z-10 py-2">
        {/* Left Column: Artwork + Metadata + Integrated Progress & Controls */}
        <div className="flex flex-col items-center md:items-start justify-center space-y-5 max-w-md w-full mx-auto">
          {/* Floating Album Artwork */}
          <motion.div
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{
              duration: enableArtworkAnimation ? 0.8 : 0.05,
              ease: [0.16, 1, 0.3, 1],
            }}
            className="relative group w-72 h-72 md:w-80 md:h-80 rounded-2xl overflow-hidden border border-white/20 shadow-[0_30px_70px_-15px_rgba(0,0,0,0.85)] transform-gpu mx-auto md:mx-0"
          >
            {currentSong ? (
              <img
                src={getOptimizedCoverUrl(currentSong.coverUrl, 600)}
                alt={currentSong.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-white/5 flex items-center justify-center">
                <Music className="w-16 h-16 text-white/30" />
              </div>
            )}
          </motion.div>

          {/* Song Meta + Action Button */}
          {currentSong && (
            <div className="w-full flex items-center justify-between pt-1">
              <div className="flex flex-col truncate pr-2">
                <h2 className="text-2xl font-bold text-white tracking-tight truncate drop-shadow-md">
                  {neteaseApi.cleanTitle(currentSong.name)}
                </h2>
                <p className="text-base text-white/70 font-medium truncate drop-shadow">
                  {neteaseApi.cleanTitle(currentSong.artist)}
                </p>
              </div>
              <button
                onClick={() => toggleFavorite(currentSong)}
                className={`p-2.5 rounded-full backdrop-blur-md transition-all shrink-0 border border-white/15 hover:scale-105 active:scale-95 cursor-pointer shadow-md ${
                  isFavorite(currentSong.id)
                    ? 'bg-apple-red/20 text-apple-red border-apple-red/40'
                    : 'bg-white/10 text-white/70 hover:text-white'
                }`}
                title={isFavorite(currentSong.id) ? '取消收藏歌曲' : '收藏歌曲'}
              >
                <Heart
                  className={`w-5 h-5 transition-all ${
                    isFavorite(currentSong.id) ? 'fill-current text-apple-red' : ''
                  }`}
                />
              </button>
            </div>
          )}

          {/* Interactive Progress Bar & Hi-Res Lossless Badge */}
          <div className="w-full space-y-1.5 pt-1">
            <div
              onClick={handleProgressSeek}
              onMouseEnter={() => setIsHoverProgress(true)}
              onMouseLeave={() => setIsHoverProgress(false)}
              className="relative w-full h-2 bg-white/20 hover:h-2.5 rounded-full cursor-pointer overflow-hidden transition-all"
            >
              <div
                className="h-full bg-white rounded-full relative transition-all"
                style={{ width: `${progressPercent}%` }}
              >
                {isHoverProgress && (
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-md" />
                )}
              </div>
            </div>

            <div className="flex items-center justify-between text-xs font-mono text-white/50 px-0.5">
              <span>{formatTime(currentTime)}</span>

              {/* Center Audio Quality Badge */}
              <div className="flex items-center space-x-1 bg-white/10 text-white/70 px-2 py-0.5 rounded-full text-[10px] font-semibold border border-white/10">
                <Sparkles className="w-3 h-3 text-cyan-400" />
                <span>高解析无损</span>
              </div>

              <span>{formatRemainingTime(currentTime, duration)}</span>
            </div>
          </div>

          {/* Playback Control Buttons Row */}
          <div className="w-full flex items-center justify-center space-x-6 pt-1">
            <button
              onClick={toggleShuffle}
              className={`p-2 rounded-full transition-colors ${
                isShuffle ? 'text-apple-red bg-apple-red/10' : 'text-white/50 hover:text-white'
              }`}
              title="随机播放"
            >
              <Shuffle className="w-5 h-5" />
            </button>

            <button
              onClick={prevSong}
              className="text-white/80 hover:text-white hover:scale-110 active:scale-95 transition-all p-1"
              title="上一首"
            >
              <SkipBack className="w-6 h-6 fill-current" />
            </button>

            <button
              onClick={togglePlayPause}
              className="w-12 h-12 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-xl shadow-white/10"
              title={isPlaying ? '暂停' : '播放'}
            >
              {isPlaying ? (
                <Pause className="w-6 h-6 fill-current" />
              ) : (
                <Play className="w-6 h-6 fill-current ml-0.5" />
              )}
            </button>

            <button
              onClick={nextSong}
              className="text-white/80 hover:text-white hover:scale-110 active:scale-95 transition-all p-1"
              title="下一首"
            >
              <SkipForward className="w-6 h-6 fill-current" />
            </button>

            <button
              onClick={toggleRepeat}
              className={`p-2 rounded-full transition-colors ${
                repeatMode !== 'off' ? 'text-apple-red bg-apple-red/10' : 'text-white/50 hover:text-white'
              }`}
              title="单曲/循环"
            >
              {repeatMode === 'one' ? <Repeat1 className="w-5 h-5" /> : <Repeat className="w-5 h-5" />}
            </button>
          </div>

          {/* Volume Control Bar */}
          <div className="w-full flex items-center space-x-3 pt-1">
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
              className="flex-1 accent-white h-1.5 bg-white/20 rounded-lg cursor-pointer"
            />
            <Volume2 className="w-4 h-4 text-white/40" />
          </div>
        </div>

        {/* Right Column: 100% Continuous Reflow-Free Dual-Line Lyric Engine */}
        <div className="h-[480px] overflow-visible relative px-4 md:px-8 flex flex-col items-start justify-start">
          {lyrics.length === 0 ? (
            <div className="text-white/40 text-lg font-medium italic my-auto">
              暂无歌词
            </div>
          ) : (
            <motion.div
              animate={{ y: -translateY }}
              transition={{
                duration: enableLyricAnimation ? 0.65 : 0.05,
                ease: [0.25, 0.8, 0.25, 1.0],
              }}
              className="w-full flex flex-col space-y-6 items-start pt-32 pb-48 pr-16 transform-gpu"
            >
              {lyrics.map((line, idx) => {
                const isActive = idx === activeIndex;
                const distance = Math.abs(idx - activeIndex);

                // Proportional opacity gradient based on line distance
                let targetOpacity = 0.22;
                if (isActive) targetOpacity = 1;
                else if (distance === 1) targetOpacity = 0.62;
                else if (distance === 2) targetOpacity = 0.42;
                else if (distance === 3) targetOpacity = 0.28;

                // Gradient Depth-of-Field Blur (DOF): 0px -> 1.5px -> 3.5px -> 5.5px -> 8px
                let targetBlur = 0;
                if (enableLyricBlur) {
                  if (distance === 0) targetBlur = 0;
                  else if (distance === 1) targetBlur = 1.5;
                  else if (distance === 2) targetBlur = 3.5;
                  else if (distance === 3) targetBlur = 5.5;
                  else targetBlur = Math.min(9, 5.5 + (distance - 3) * 1.2);
                }

                return (
                  <motion.div
                    key={idx}
                    ref={(el) => (lineRefs.current[idx] = el)}
                    onClick={() => handleLyricClick(line.time)}
                    animate={{
                      scale: isActive ? (lyricFontSize === 'large' ? 1.25 : 1.1) : 0.95,
                      opacity: targetOpacity,
                      filter: `blur(${targetBlur}px)`,
                    }}
                    transition={{
                      duration: enableLyricAnimation ? 0.65 : 0.05,
                      ease: [0.25, 0.8, 0.25, 1.0],
                    }}
                    className="cursor-pointer text-left origin-left transform-gpu space-y-1"
                  >
                    {/* Main Lyric Line */}
                    <div
                      className={`font-extrabold tracking-tight block ${
                        isActive ? 'text-white' : 'text-white/50 hover:text-white/80'
                      } ${lyricFontSize === 'large' ? 'text-2xl md:text-3xl' : 'text-xl md:text-2xl'}`}
                      style={{
                        textShadow: enableLyricGlow && isActive
                          ? '0 0 24px rgba(255, 255, 255, 0.95), 0 0 45px rgba(255, 45, 85, 0.45)'
                          : 'none',
                      }}
                    >
                      {neteaseApi.cleanTitle(line.text)}
                    </div>

                    {/* Translated Lyric Sub-line (if available) */}
                    {line.translation && (
                      <div
                        className={`font-semibold tracking-wide block ${
                          isActive ? 'text-white/80' : 'text-white/30'
                        } ${lyricFontSize === 'large' ? 'text-base md:text-lg' : 'text-xs md:text-sm'}`}
                      >
                        {neteaseApi.cleanTitle(line.translation)}
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </motion.div>
          )}
        </div>
      </div>
    </motion.div>
  );
};
