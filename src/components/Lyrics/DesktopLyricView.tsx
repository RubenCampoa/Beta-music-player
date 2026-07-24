import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Lock,
  Unlock,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  X,
  Type,
  Move,
  Palette,
} from 'lucide-react';
import { cleanTitle } from '../../utils/format';

interface LyricLine {
  time: number;
  text: string;
  translation?: string;
}

interface DesktopLyricData {
  currentSong?: {
    name: string;
    artist: string;
    coverUrl?: string;
  } | null;
  lyrics: LyricLine[];
  currentTime: number;
  isPlaying: boolean;
}

export interface ColorPreset {
  id: string;
  name: string;
  activeTextColor: string;
  activeTextShadow: string;
  subTextColor: string;
}

export const COLOR_PRESETS: ColorPreset[] = [
  {
    id: 'apple-red',
    name: '经典炫红 (默认)',
    activeTextColor: 'text-white',
    activeTextShadow: 'drop-shadow-[0_2px_12px_rgba(255,45,85,0.85)] drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)]',
    subTextColor: 'text-white/60',
  },
  {
    id: 'cyber-purple',
    name: '霓虹梦紫',
    activeTextColor: 'text-fuchsia-200',
    activeTextShadow: 'drop-shadow-[0_2px_12px_rgba(217,70,239,0.9)] drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)]',
    subTextColor: 'text-fuchsia-200/55',
  },
  {
    id: 'ocean-cyan',
    name: '深海蔚蓝',
    activeTextColor: 'text-cyan-200',
    activeTextShadow: 'drop-shadow-[0_2px_12px_rgba(56,189,248,0.9)] drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)]',
    subTextColor: 'text-cyan-200/55',
  },
  {
    id: 'emerald-gold',
    name: '翡翠金流',
    activeTextColor: 'text-emerald-200',
    activeTextShadow: 'drop-shadow-[0_2px_12px_rgba(52,211,153,0.9)] drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)]',
    subTextColor: 'text-emerald-200/55',
  },
  {
    id: 'sunset-orange',
    name: '日落灼橙',
    activeTextColor: 'text-amber-200',
    activeTextShadow: 'drop-shadow-[0_2px_12px_rgba(251,146,60,0.9)] drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)]',
    subTextColor: 'text-amber-200/55',
  },
  {
    id: 'pure-white',
    name: '纯白强光',
    activeTextColor: 'text-white',
    activeTextShadow: 'drop-shadow-[0_2px_12px_rgba(255,255,255,0.9)] drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)]',
    subTextColor: 'text-white/60',
  },
];

export const DesktopLyricView: React.FC = () => {
  const [data, setData] = useState<DesktopLyricData>({
    lyrics: [],
    currentTime: 0,
    isPlaying: false,
  });

  const [isLocked, setIsLocked] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [fontSize, setFontSize] = useState<'medium' | 'large' | 'xlarge'>('large');
  const [colorIndex, setColorIndex] = useState<number>(() => {
    const saved = localStorage.getItem('desktop_lyric_color_preset');
    return saved ? parseInt(saved, 10) || 0 : 0;
  });

  const [isDragging, setIsDragging] = useState(false);
  const dragPosRef = useRef<{ x: number; y: number } | null>(null);

  const activeTheme = COLOR_PRESETS[colorIndex % COLOR_PRESETS.length];

  // Subscribe to OS physical mouse cursor hover status from Electron Main Process
  useEffect(() => {
    if (window.electronAPI?.onDesktopLyricHover) {
      const cleanup = window.electronAPI.onDesktopLyricHover((hovered) => {
        setIsHovered(hovered);
      });
      return cleanup;
    }
  }, []);

  // Mouse Drag Window Position Handler
  const handleMouseDown = (e: React.MouseEvent) => {
    if (isLocked) return;
    const target = e.target as HTMLElement;
    if (target.closest('.no-drag-control') || target.tagName === 'BUTTON' || target.tagName === 'INPUT') {
      return;
    }
    setIsDragging(true);
    dragPosRef.current = { x: e.screenX, y: e.screenY };
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragPosRef.current) return;
      const deltaX = e.screenX - dragPosRef.current.x;
      const deltaY = e.screenY - dragPosRef.current.y;
      dragPosRef.current = { x: e.screenX, y: e.screenY };
      window.electronAPI?.moveDesktopLyricWindow?.({ deltaX, deltaY });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      dragPosRef.current = null;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  // Sync data from Electron IPC
  useEffect(() => {
    if (window.electronAPI?.onDesktopLyricData) {
      const cleanup = window.electronAPI.onDesktopLyricData((payload) => {
        setData(payload);
      });
      return cleanup;
    }
  }, []);

  // Compute active lyric line and next preview line
  const { lyrics, currentTime, currentSong, isPlaying } = data;
  const syncTime = currentTime + 0.15;

  let activeIndex = -1;
  for (let i = 0; i < lyrics.length; i++) {
    if (syncTime >= lyrics[i].time) {
      activeIndex = i;
    } else {
      break;
    }
  }

  const activeLine = activeIndex >= 0 ? lyrics[activeIndex] : null;
  const nextLine = activeIndex >= 0 && activeIndex + 1 < lyrics.length ? lyrics[activeIndex + 1] : null;

  // STRICTLY AT MOST 2 LINES DISPLAYED: Line 1 (Active) & Line 2 (Upcoming Preview)
  const line1Text = activeLine ? cleanTitle(activeLine.text) : (currentSong ? cleanTitle(currentSong.name) : 'Beta Music Player');
  const line2Text = activeLine?.translation
    ? cleanTitle(activeLine.translation)
    : nextLine
    ? cleanTitle(nextLine.text)
    : currentSong
    ? cleanTitle(currentSong.artist)
    : '桌面歌词';

  const handleTopBarMouseEnter = () => {
    if (isLocked) {
      window.electronAPI?.setDesktopLyricIgnoreMouse?.(false);
    }
  };

  const handleTopBarMouseLeave = () => {
    if (isLocked) {
      window.electronAPI?.setDesktopLyricIgnoreMouse?.(true);
    }
  };

  const handleToggleLock = (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextLocked = !isLocked;
    setIsLocked(nextLocked);
    window.electronAPI?.setDesktopLyricIgnoreMouse?.(nextLocked);
  };

  const handleAction = (action: string, e: React.MouseEvent) => {
    e.stopPropagation();
    window.electronAPI?.sendDesktopLyricAction?.(action);
  };

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.electronAPI?.closeDesktopLyric?.();
  };

  const cycleFontSize = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (fontSize === 'medium') setFontSize('large');
    else if (fontSize === 'large') setFontSize('xlarge');
    else setFontSize('medium');
  };

  const cycleColorPreset = (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextIdx = (colorIndex + 1) % COLOR_PRESETS.length;
    setColorIndex(nextIdx);
    localStorage.setItem('desktop_lyric_color_preset', String(nextIdx));
  };

  const getFontSizeClasses = () => {
    if (fontSize === 'medium') return { line1: 'text-xl md:text-2xl', line2: 'text-xs md:text-sm' };
    if (fontSize === 'xlarge') return { line1: 'text-3xl md:text-4xl', line2: 'text-sm md:text-base' };
    return { line1: 'text-2xl md:text-3xl', line2: 'text-xs md:text-sm' };
  };

  const fontClasses = getFontSizeClasses();

  return (
    <div
      onMouseDown={handleMouseDown}
      className={`w-screen h-screen relative select-none overflow-hidden flex flex-col justify-between p-2 font-sans rounded-2xl transition-all duration-300 ${
        isHovered
          ? 'bg-black/55 backdrop-blur-lg'
          : 'bg-transparent backdrop-blur-none'
      } ${isLocked ? 'cursor-default' : 'cursor-move'}`}
    >
      {/* Top Floating Hover Bar (NetEase Cloud Music Style Control Bar) */}
      <div
        onMouseEnter={handleTopBarMouseEnter}
        onMouseLeave={handleTopBarMouseLeave}
        className={`flex items-center justify-between w-full px-3 py-1.5 rounded-xl bg-black/80 backdrop-blur-2xl border border-white/15 transition-all duration-300 z-50 ${
          isHovered ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {/* Left: Window Drag Grip Handle & Title */}
        <div className="flex items-center space-x-2 cursor-move">
          <Move className="w-3.5 h-3.5 text-white/60" />
          <span className="text-[11px] text-white/70 font-semibold truncate max-w-[120px]">
            {currentSong ? currentSong.name : '桌面歌词'}
          </span>
        </div>

        {/* Center: Playback Controls */}
        <div className="no-drag-control flex items-center space-x-3">
          <button
            onClick={(e) => handleAction('prev-song', e)}
            className="text-white/70 hover:text-white transition-colors p-1"
            title="上一首"
          >
            <SkipBack className="w-4 h-4 fill-current" />
          </button>
          <button
            onClick={(e) => handleAction('toggle-play', e)}
            className="w-7 h-7 rounded-full bg-apple-red text-white flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-md"
            title={isPlaying ? '暂停' : '播放'}
          >
            {isPlaying ? (
              <Pause className="w-3.5 h-3.5 fill-current" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
            )}
          </button>
          <button
            onClick={(e) => handleAction('next-song', e)}
            className="text-white/70 hover:text-white transition-colors p-1"
            title="下一首"
          >
            <SkipForward className="w-4 h-4 fill-current" />
          </button>
        </div>

        {/* Right: Lock, Color Palette, Font Size & Close Buttons */}
        <div className="no-drag-control flex items-center space-x-2">
          <button
            onClick={cycleColorPreset}
            className="text-white/70 hover:text-white transition-colors p-1"
            title={`切换歌词配色方案: ${activeTheme.name}`}
          >
            <Palette className="w-4 h-4 text-white/80 hover:scale-110 transition-transform" />
          </button>
          <button
            onClick={cycleFontSize}
            className="text-white/70 hover:text-white transition-colors p-1"
            title="调整歌词字号"
          >
            <Type className="w-4 h-4" />
          </button>
          <button
            onClick={handleToggleLock}
            className={`p-1 transition-colors ${
              isLocked ? 'text-amber-400' : 'text-white/70 hover:text-white'
            }`}
            title={isLocked ? '解锁歌词 (解锁后可点击控制)' : '锁定歌词 (锁定后鼠标穿透操作背景软件)'}
          >
            {isLocked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
          </button>
          <button
            onClick={handleClose}
            className="text-white/50 hover:text-red-400 transition-colors p-1 ml-1"
            title="关闭桌面歌词"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Dual-Line Lyric Content View: STRICTLY AT MOST 2 LINES DISPLAYED */}
      <div className="flex-1 flex flex-col justify-center items-center text-center px-4 z-10 w-full overflow-hidden">
        <motion.div
          key={`desktop-lyric-${activeIndex}-${line1Text}`}
          initial={{ opacity: 0.4, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.25, 0.8, 0.25, 1.0] }}
          className="w-full flex flex-col justify-center items-center space-y-1 transform-gpu"
        >
          {/* Line 1: Active Main Line (Big, Bold, Precise Character Glyph Drop Shadow) */}
          <div
            className={`tracking-tight ${fontClasses.line1} font-black ${activeTheme.activeTextColor} ${activeTheme.activeTextShadow} truncate max-w-full px-2 transition-all duration-300`}
          >
            {line1Text}
          </div>

          {/* Line 2: Upcoming Next Line Preview (Noticeably Smaller, 50% Opacity) */}
          <div
            className={`tracking-wide ${fontClasses.line2} font-semibold ${activeTheme.subTextColor} drop-shadow-[0_1px_4px_rgba(0,0,0,0.95)] truncate max-w-full px-2 transition-all duration-300`}
          >
            {line2Text}
          </div>
        </motion.div>
      </div>

      {/* Floating Unlock Badge when Locked */}
      {isLocked && (
        <button
          onClick={handleToggleLock}
          className="no-drag-control absolute top-2 right-2 z-50 p-1.5 rounded-full bg-amber-500/90 text-white shadow-lg backdrop-blur-md opacity-0 group-hover:opacity-100 transition-opacity"
          title="点击解锁桌面歌词"
        >
          <Lock className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};
