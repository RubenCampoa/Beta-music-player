import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, Unlock, Play, Pause, SkipBack, SkipForward, X, Type, Disc, Sparkles } from 'lucide-react';
import { Song, LyricLine } from '../../types/music';

interface DesktopLyricPayload {
  song: Song | null;
  currentLyricIndex: number;
  lyrics: LyricLine[];
  isPlaying: boolean;
  progressPercent: number;
}

export const DesktopLyricView: React.FC = () => {
  const [data, setData] = useState<DesktopLyricPayload>({
    song: null,
    currentLyricIndex: -1,
    lyrics: [],
    isPlaying: false,
    progressPercent: 0,
  });

  const [isLocked, setIsLocked] = useState<boolean>(false);
  const [fontSize, setFontSize] = useState<'normal' | 'large'>('large');
  const [colorTheme, setColorTheme] = useState<'cyan' | 'red' | 'white'>('cyan');

  // Receive real-time lyric data from main window via IPC
  useEffect(() => {
    if (window.electronAPI?.onDesktopLyricData) {
      const cleanup = window.electronAPI.onDesktopLyricData((payload) => {
        setData(payload);
      });
      return cleanup;
    }
  }, []);

  const handleToggleLock = () => {
    const nextLocked = !isLocked;
    setIsLocked(nextLocked);
    if (window.electronAPI?.setIgnoreMouseEvents) {
      window.electronAPI.setIgnoreMouseEvents(nextLocked);
    }
  };

  const handleMediaAction = (action: string) => {
    if (window.electronAPI?.sendDesktopLyricAction) {
      window.electronAPI.sendDesktopLyricAction(action);
    }
  };

  const handleClose = () => {
    if (window.electronAPI?.toggleDesktopLyric) {
      window.electronAPI.toggleDesktopLyric();
    }
  };

  const currentLine = data.lyrics[data.currentLyricIndex];
  const nextLine = data.lyrics[data.currentLyricIndex + 1];

  // Dynamic Theme Styling with high-contrast text shadow for transparent desktop overlay
  const themeClasses = {
    cyan: {
      text: 'text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-sky-200 to-teal-100 drop-shadow-[0_2px_12px_rgba(0,0,0,0.95)]',
      glow: 'shadow-none',
      next: 'text-cyan-200/60 drop-shadow-[0_1px_6px_rgba(0,0,0,0.9)]',
    },
    red: {
      text: 'text-transparent bg-clip-text bg-gradient-to-r from-red-400 via-pink-300 to-rose-100 drop-shadow-[0_2px_12px_rgba(0,0,0,0.95)]',
      glow: 'shadow-none',
      next: 'text-rose-200/60 drop-shadow-[0_1px_6px_rgba(0,0,0,0.9)]',
    },
    white: {
      text: 'text-white drop-shadow-[0_2px_14px_rgba(0,0,0,0.95)] font-extrabold',
      glow: 'shadow-none',
      next: 'text-white/60 drop-shadow-[0_1px_6px_rgba(0,0,0,0.9)]',
    },
  }[colorTheme];

  return (
    <div
      className="relative w-full h-screen flex flex-col justify-center items-center px-4 select-none overflow-hidden group bg-transparent border-none shadow-none"
      style={
        {
          WebkitAppRegion: isLocked ? 'no-drag' : 'drag',
        } as React.CSSProperties
      }
    >
      {/* Top Floating Control Bar (Shows on Hover when unlocked) */}
      {!isLocked && (
        <div
          className="absolute top-2 right-4 flex items-center space-x-2 bg-black/70 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/15 opacity-0 group-hover:opacity-100 transition-opacity duration-300 shadow-xl z-50"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          {/* Lock Button */}
          <button
            onClick={handleToggleLock}
            className="p-1 rounded-full text-white/70 hover:text-amber-400 hover:bg-white/10 transition-colors"
            title="锁定歌词 (按键穿透，不干扰鼠标)"
          >
            <Unlock className="w-3.5 h-3.5" />
          </button>

          {/* Media Playback Controls */}
          <div className="h-3 w-px bg-white/20 my-auto" />
          <button
            onClick={() => handleMediaAction('prev-song')}
            className="p-1 rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            title="上一首"
          >
            <SkipBack className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => handleMediaAction('toggle-play')}
            className="p-1.5 rounded-full bg-apple-red text-white hover:bg-apple-pink transition-colors shadow-sm"
            title={data.isPlaying ? '暂停' : '播放'}
          >
            {data.isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-current" />}
          </button>
          <button
            onClick={() => handleMediaAction('next-song')}
            className="p-1 rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            title="下一首"
          >
            <SkipForward className="w-3.5 h-3.5" />
          </button>

          {/* Style & Theme Toggles */}
          <div className="h-3 w-px bg-white/20 my-auto" />
          <button
            onClick={() => setFontSize(fontSize === 'normal' ? 'large' : 'normal')}
            className="p-1 rounded-full text-white/70 hover:text-cyan-300 hover:bg-white/10 transition-colors"
            title="切换歌词字号"
          >
            <Type className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setColorTheme(colorTheme === 'cyan' ? 'red' : colorTheme === 'red' ? 'white' : 'cyan')}
            className="p-1 rounded-full text-white/70 hover:text-pink-400 hover:bg-white/10 transition-colors"
            title="切换歌词主题颜色"
          >
            <Sparkles className="w-3.5 h-3.5" />
          </button>

          {/* Close Button */}
          <div className="h-3 w-px bg-white/20 my-auto" />
          <button
            onClick={handleClose}
            className="p-1 rounded-full text-white/50 hover:text-red-400 hover:bg-white/10 transition-colors"
            title="关闭桌面歌词"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Unlock floating hint button if locked */}
      {isLocked && (
        <button
          onClick={handleToggleLock}
          className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 text-amber-400 opacity-20 hover:opacity-100 transition-opacity z-50 cursor-pointer"
          title="解锁歌词悬浮框"
        >
          <Lock className="w-3.5 h-3.5" />
        </button>
      )}

      {/* Track info tag */}
      {data.song && (
        <div className="absolute top-2 left-4 flex items-center space-x-2 opacity-50 group-hover:opacity-90 transition-opacity">
          <Disc className={`w-3.5 h-3.5 text-white/80 ${data.isPlaying ? 'animate-spin' : ''}`} />
          <span className="text-[11px] font-semibold text-white/80 tracking-wide truncate max-w-[240px]">
            {data.song.name} - {data.song.artist}
          </span>
        </div>
      )}

      {/* Lyric Body Container with 1.5-Line Glide Animation */}
      <div className="w-full flex flex-col items-center justify-center space-y-1 text-center py-2">
        <AnimatePresence mode="popLayout">
          {currentLine ? (
            <motion.div
              key={`line-${data.currentLyricIndex}-${currentLine.text}`}
              initial={{ opacity: 0, y: 22, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -22, scale: 0.95 }}
              transition={{ duration: 0.45, ease: [0.25, 1, 0.5, 1] }}
              className="flex flex-col items-center justify-center space-y-1"
            >
              {/* Primary Highlighting Line (Line 1) */}
              <div
                className={`font-black tracking-tight leading-snug transition-all duration-300 ${
                  fontSize === 'large' ? 'text-2xl md:text-3xl' : 'text-xl md:text-2xl'
                } ${themeClasses.text}`}
              >
                {currentLine.text}
              </div>

              {/* Chinese Translation Line (if available) */}
              {currentLine.translation && (
                <div className="text-xs md:text-sm font-semibold text-white/75 drop-shadow-[0_1px_4px_rgba(0,0,0,0.6)]">
                  {currentLine.translation}
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-sm font-bold text-white/50 tracking-wider flex items-center space-x-2"
            >
              <Disc className="w-4 h-4 animate-spin text-apple-red" />
              <span>Beta Music Player 纯享聆听中</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 0.5 Line Preview (Next Lyric Line previewing below during switching) */}
        {nextLine && (
          <motion.div
            key={`next-${data.currentLyricIndex + 1}-${nextLine.text}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 0.45, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            className={`text-xs md:text-sm font-medium truncate max-w-[90%] transition-colors ${themeClasses.next}`}
          >
            {nextLine.text}
          </motion.div>
        )}
      </div>

      {/* Bottom Progress Line */}
      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/10 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-cyan-400 via-apple-red to-pink-500 transition-all duration-300"
          style={{ width: `${Math.min(100, Math.max(0, data.progressPercent))}%` }}
        />
      </div>
    </div>
  );
};
