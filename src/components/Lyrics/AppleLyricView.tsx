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
  X,
  Minimize2,
  Maximize,
  Columns,
  AlignLeft,
  Clock,
  Sparkles,
} from 'lucide-react';
import { motion, useMotionValue, useSpring } from 'framer-motion';
import { usePlayerStore } from '../../store/playerStore';
import { neteaseApi } from '../../services/neteaseApi';
import { getOptimizedCoverUrl, cleanTitle } from '../../utils/format';
import { formatTime } from '../../utils/format';
import { emitAudioSeek } from '../../utils/events';
import { LyricProgressBar } from './LyricProgressBar';
import { FluidBackground } from '../Background/FluidBackground';
import { shallow } from 'zustand/shallow';
import { LyricLine } from '../../types/music';

interface AppleLyricViewProps {
  // AnimatePresence keeps the last rendered instance alive during exit.
  // This prop deliberately does not come from Zustand so the exit frame is not
  // synchronously replaced by `null` when the store flag changes.
  isVisible: boolean;
}

const getActiveLyricIndex = (currentTime: number, lyrics: LyricLine[], offsetMs = 0) => {
  // User-adjustable per-song switch offset (ms): positive activates lines
  // earlier, negative later. Default 0 — no built-in lookahead.
  const syncTime = currentTime + offsetMs / 1000;
  let activeIndex = -1;
  for (let i = 0; i < lyrics.length; i += 1) {
    if (syncTime >= lyrics[i].time) {
      activeIndex = i;
    } else {
      break;
    }
  }
  return activeIndex;
};

// --- Karaoke word-by-word lyric renderer ---
// Renders the active line's words individually, highlighting each word as
// playback progresses through its time window. Non-active lines render as
// plain text. When a line has no word-level timing data (words array), it
// falls back to plain text for all states.
interface KaraokeLineProps {
  line: LyricLine;
  isActive: boolean;
  currentTime: number;
  fontSize: 'normal' | 'large';
  layout: 'split' | 'full';
  enableGlow: boolean;
  enableAnimation: boolean;
  enableKaraoke: boolean;
}

// --- Active lyric line: "ocean wave" cover reveal ---
// A single rAF loop drives a line-relative cursor from the real
// <audio>.currentTime. Words fully covered by the wave are lit (white +
// glow), words ahead of the wave stay dim, and the word currently being
// crossed by the wave edge is revealed left-to-right with a hard light/dark
// split (covered left half lit, uncovered right half dark) plus a linked
// upward jelly (overshoot) pop. The cursor is continuous, so the edge flows
// through fast songs without flashing.

// One word of the wave line. Memoized: a word only re-renders while the wave
// edge is crossing it (p in (0,1)) — covered (p=1) and untouched (p=0) words
// keep stable props and are skipped by React, so a slow song with a long line
// does not rewrite every word's style on every animation frame.
const WaveWord = React.memo(({ text, p, glowEnabled }: { text: string; p: number; glowEnabled: boolean }) => {
  const clamped = Math.min(1, Math.max(0, p));
  // Non-linear cover progress (fast start, soft settle): the highlight is a
  // wave edge that paints over the glyph — only the covered part of the
  // word lights up at any instant, never the whole word at once. The font
  // itself never moves (no scale/translate).
  const eased = clamped >= 1 ? 1 : Math.sin((clamped * Math.PI) / 2);
  // Covered words are pinned to a full 100% cover (never 99.9% from float
  // rounding) and keep a permanent glow — the whole sung portion of the
  // line stays highlighted, not just the word under the wave edge.
  const coverPct = clamped >= 1 ? 100 : eased * 100;
  const lit = p >= 1 || (p > 0 && p < 1);

  return (
    <span className="relative inline-block" style={{ verticalAlign: 'baseline' }}>
      {/* Base layer: idle dark glyph (matches line-level text-white/60). */}
      <span className="inline-block" style={{ color: 'rgba(255,255,255,0.6)' }}>
        {text}
      </span>
      {/* Cover layer: a white gradient clipped to the glyph shape. The wave
          edge lights exactly the covered fraction of the word; the rest
          stays dark (the base layer shows through the transparent part). */}
      <span
        className="absolute inset-0"
        style={{
          backgroundImage: `linear-gradient(to right, #ffffff ${coverPct}%, rgba(255,255,255,0) ${coverPct}%)`,
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          color: 'transparent',
          filter:
            lit && glowEnabled
              ? 'drop-shadow(0 0 10px rgba(255,255,255,0.95)) drop-shadow(0 0 20px rgba(255,45,85,0.55))'
              : 'none',
        }}
      >
        {text}
      </span>
    </span>
  );
});

const WaveLine: React.FC<{ line: LyricLine; glow: string }> = ({ line, glow }) => {
  const words = line.words || [];
  const [cursor, setCursor] = useState(0); // seconds relative to line start

  // Drive the line cursor from the live media clock with exponential
  // smoothing. <audio>.currentTime on the main thread is quantized (~50ms
  // steps), which reads as slight jitter on slow songs. Exponential
  // convergence (per-frame alpha) glides over those steps without the hard
  // corners of a clamp; a large delta (seek / track switch) snaps instantly.
  useEffect(() => {
    let raf = 0;
    let prev: number | null = null;
    const tick = () => {
      const state = usePlayerStore.getState();
      const audioEl = state.audioElement;
      const raw = audioEl && !Number.isNaN(audioEl.currentTime) ? audioEl.currentTime : state.currentTime;
      const target = raw - line.time;
      if (prev === null) {
        prev = target;
        setCursor(target);
      } else {
        const delta = target - prev;
        const alpha = Math.abs(delta) > 0.5 ? 1 : 0.5;
        prev = prev + delta * alpha;
        setCursor(prev);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [line]);

  return (
    <>
      {words.map((word, idx) => {
        const wordStart = word.time - line.time; // seconds into the line
        // Guard against zero/NaN word durations in malformed YRC data: a
        // 0-length word would divide by zero and render NaN styles.
        const wordDuration = Math.max(word.duration ?? 0.35, 0.05);
        const wordEnd = wordStart + wordDuration;
        const covered = cursor >= wordEnd;
        const uncovered = cursor < wordStart;
        // Word being crossed by the wave edge: 0..1 linear progress. Linear
        // keeps the wave rolling at a constant pace (a natural ocean wave);
        // per-word easing made it start/stop at every word boundary.
        const p = covered ? 1 : uncovered ? 0 : (cursor - wordStart) / (wordEnd - wordStart);

        return <WaveWord key={idx} text={word.text} p={p} glowEnabled={glow !== 'none'} />;
      })}
    </>
  );
};

const KaraokeLine: React.FC<KaraokeLineProps> = ({
  line,
  isActive,
  currentTime,
  fontSize,
  layout,
  enableGlow,
  enableAnimation,
  enableKaraoke,
}) => {
  const cleanText = cleanTitle(line.text);

  // Word-by-word karaoke data (NetEase YRC). Gated by the user toggle
  // (off by default — per-word lines render cramped for English lyrics);
  // only the active line renders per-word, lines without word timing fall
  // back to plain text.
  const words =
    isActive && enableKaraoke && line.words && line.words.length > 0 ? line.words : null;

  // Font size classes based on layout and size setting
  const mainFontClass =
    layout === 'full'
      ? 'text-3xl md:text-5xl leading-tight font-black'
      : fontSize === 'large'
      ? 'text-2xl md:text-4xl font-extrabold'
      : 'text-xl md:text-3xl font-extrabold';

  const transFontClass =
    layout === 'full'
      ? 'text-lg md:text-2xl font-semibold'
      : fontSize === 'large'
      ? 'text-base md:text-xl font-semibold'
      : 'text-xs md:text-base font-semibold';

  const sungWordGlow =
    isActive && enableGlow
      ? layout === 'full'
        ? '0 0 18px rgba(255, 255, 255, 0.85), 0 0 32px rgba(255, 45, 85, 0.45)'
        : '0 0 14px rgba(255, 255, 255, 0.75), 0 0 26px rgba(255, 45, 85, 0.4)'
      : 'none';

  return (
    <div className="space-y-1">
      <div
        className={`block break-words tracking-tight ${mainFontClass} ${
          isActive ? 'text-white' : 'text-white/60 hover:text-white/90'
        }`}
        style={{
          textShadow:
            isActive && enableGlow && !words
              ? layout === 'full'
                ? '0 0 26px rgba(255, 255, 255, 0.95), 0 0 46px rgba(255, 45, 85, 0.55)'
                : '0 0 22px rgba(255, 255, 255, 0.9), 0 0 38px rgba(255, 45, 85, 0.5)'
              : 'none',
        }}
      >
        {words ? (
          <WaveLine line={line} glow={sungWordGlow} />
        ) : (
          cleanText
        )}
      </div>
      {line.translation && cleanTitle(line.translation) !== cleanText && (
        <div
          className={`block break-words tracking-wide ${transFontClass} ${
            isActive ? 'text-white/90 font-medium' : 'text-white/40'
          }`}
        >
          {cleanTitle(line.translation)}
        </div>
      )}
    </div>
  );
};

// --- Pre-chorus "about to start" countdown (Apple Music style) ---
// While the intro is still playing (no lyric line active yet), the first
// lyric line shows three dots that light up one by one with a jelly
// (overshoot) pop. The countdown finishes slightly BEFORE the vocals begin
// so the last dot is clearly visible, then the first lyric line appears.
const LEAD_TIME = 0.9; // seconds before the first line that dot 3 lights up

const PreChorusDots: React.FC<{ elapsed: number; firstTime: number }> = ({ elapsed, firstTime }) => {
  // Cap the lead so a very short intro still gets a sensible 3-step timing.
  const lead = Math.min(LEAD_TIME, firstTime * 0.4);
  const end = Math.max(0, firstTime - lead);
  const thresholds = [end / 3, (end * 2) / 3, end];

  return (
    <div className="flex items-center space-x-2.5">
      {[0, 1, 2].map((i) => {
        const lit = elapsed >= thresholds[i];
        return (
          <motion.span
            key={i}
            className="w-2.5 h-2.5 rounded-full"
            style={{
              background: lit ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.22)',
              boxShadow: lit
                ? '0 0 14px rgba(255,255,255,0.85), 0 0 28px rgba(255,45,85,0.45)'
                : 'none',
            }}
            animate={lit ? { scale: [0.55, 1.35, 0.92, 1.12, 1] } : { scale: 1 }}
            transition={
              lit
                ? { duration: 0.5, times: [0, 0.35, 0.6, 0.8, 1], ease: 'easeOut' }
                : { duration: 0.2 }
            }
          />
        );
      })}
    </div>
  );
};

export const AppleLyricView: React.FC<AppleLyricViewProps> = ({ isVisible }) => {
  const {
    currentSong,
    isPlaying,
    volume,
    isMuted,
    repeatMode,
    isShuffle,
    setFullLyricsMode,
    togglePlayPause,
    nextSong,
    prevSong,
    toggleRepeat,
    toggleShuffle,
    setVolume,
    toggleMute,
    toggleFavorite,
    isFavorite,
    enableLyricAnimation,
    enableLyricGlow,
    enableLyricBlur,
    lyricSwitchOffsetMs,
    setLyricSwitchOffsetMs,
    enableKaraoke,
    setEnableKaraoke,
    enableArtworkAnimation,
    lyricFontSize,
    isFluidBgEnabled,
  } = usePlayerStore(
    (state) => ({
      currentSong: state.currentSong,
      isPlaying: state.isPlaying,
      volume: state.volume,
      isMuted: state.isMuted,
      repeatMode: state.repeatMode,
      isShuffle: state.isShuffle,
      setFullLyricsMode: state.setFullLyricsMode,
      togglePlayPause: state.togglePlayPause,
      nextSong: state.nextSong,
      prevSong: state.prevSong,
      toggleRepeat: state.toggleRepeat,
      toggleShuffle: state.toggleShuffle,
      setVolume: state.setVolume,
      toggleMute: state.toggleMute,
      setToastMessage: state.setToastMessage,
      toggleFavorite: state.toggleFavorite,
      isFavorite: state.isFavorite,
      favoriteSongs: state.favoriteSongs,
      enableLyricAnimation: state.enableLyricAnimation,
      enableLyricGlow: state.enableLyricGlow,
      lyricSwitchOffsetMs: state.lyricSwitchOffsetMs,
      setLyricSwitchOffsetMs: state.setLyricSwitchOffsetMs,
      enableKaraoke: state.enableKaraoke,
      setEnableKaraoke: state.setEnableKaraoke,
      enableLyricBlur: state.enableLyricBlur,
      enableArtworkAnimation: state.enableArtworkAnimation,
      lyricFontSize: state.lyricFontSize,
      isFluidBgEnabled: state.isFluidBgEnabled,
    }),
    shallow,
  );
  const lyrics = usePlayerStore((state) => state.lyrics);
  const currentTime = usePlayerStore((state) => state.currentTime);
  const activeIndex = getActiveLyricIndex(currentTime, lyrics, lyricSwitchOffsetMs);

  // Pre-chorus state: lyrics exist but the first line hasn't started yet —
  // show the Apple Music style "about to start" dots.
  const isPreChorus = lyrics.length > 0 && activeIndex === -1;
  // First REAL lyric line: skip any stray time-0 metadata row that survived
  // filtering (title/personnel rows are time 0), so the countdown and the
  // dots' visibility are driven by the actual vocal start, not by a 0s row.
  const firstLyricTime = lyrics.find((l) => l.time > 0)?.time ?? lyrics[0]?.time ?? 0;
  // The dots must stay visible until the vocals actually begin. activeIndex
  // has a +0.15s lookahead (lyrics activate slightly early), so isPreChorus
  // flips false before the first lyric time — gate the dots on the raw lyric
  // time instead, keeping them up for a beat past the first line.
  const showPreChorusDots = firstLyricTime > 0 && currentTime < firstLyricTime + lyricSwitchOffsetMs / 1000 + 0.2;

  const [isWindowFullScreen, setIsWindowFullScreen] = useState(false);
  const [isUserScrolling, setIsUserScrolling] = useState(false);
  const [lyricLayoutMode, setLyricLayoutMode] = useState<'split' | 'full'>('split');

  const containerRef = useRef<HTMLDivElement | null>(null);
  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);
  const userScrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lyricScrollTarget = useMotionValue(0);
  const lyricScrollY = useSpring(lyricScrollTarget, {
    // Slower, well-damped spring so the list scroll settles at the same
    // pace as the line jelly (~0.64s) — the move and the jelly read as one
    // motion instead of "scroll first, bounce after".
    stiffness: 120,
    damping: 24,
    mass: 0.9,
  });
  const isUserScrollingRef = useRef(false);
  // While a manual (non-spring) scroll animation is running, the spring
  // output must not also write scrollTop — two writers fight and the list
  // visibly jitters. manualScrollRef gates the spring writer; scrollRafRef
  // cancels a previous run when a new line switch starts mid-scroll.
  const manualScrollRef = useRef(false);
  const scrollRafRef = useRef<number | null>(null);

  // Focal index for scrolling & blur gradient (defaults to line 0 during prelude)
  const focalIndex = activeIndex >= 0 ? activeIndex : 0;

  // Apple Music-like lyric emphasis: the scale/y keyframes deliberately
  // overshoot and settle. This is a non-linear jelly transition rather than a
  // linear class swap, while opacity and blur use a softer luminance curve.
  const jellyTransition = enableLyricAnimation
    ? {
        scale: { duration: 0.64, ease: [0.34, 1.35, 0.64, 1] as const },
        y: { duration: 0.64, ease: [0.22, 1, 0.36, 1] as const },
        opacity: { duration: 0.48, ease: [0.22, 1, 0.36, 1] as const },
        filter: { duration: 0.56, ease: [0.22, 1, 0.36, 1] as const },
      }
    : { duration: 0 };

  useEffect(() => {
    isUserScrollingRef.current = isUserScrolling;
  }, [isUserScrolling]);

  // Drive scrollTop from a spring so quick lyric changes preserve momentum
  // instead of cancelling one fixed-duration RAF animation and starting a
  // second one from a stop.
  useEffect(() => {
    return lyricScrollY.on('change', (latest) => {
      const container = containerRef.current;
      if (container && !isUserScrollingRef.current && !manualScrollRef.current) {
        // Snap the final fraction: an over-damped spring crawls the last
        // 1-3px over ~400ms after the visible motion has finished, which
        // reads (under magnification) as a late upward shift of the whole
        // list. Once inside the threshold, land exactly on target.
        const target = lyricScrollTarget.get();
        if (Math.abs(latest - target) < 0.5) {
          lyricScrollY.jump(target);
          container.scrollTop = target;
          return;
        }
        container.scrollTop = latest;
      }
    });
  }, [lyricScrollY]);

  // Cancel any in-flight manual scroll when the view unmounts.
  useEffect(() => {
    return () => {
      if (scrollRafRef.current !== null) cancelAnimationFrame(scrollRafRef.current);
    };
  }, []);

  useEffect(() => {
    if (!isVisible) return;

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
  }, [isVisible]);

  // Handle user manual scroll interaction (pause auto-scroll for 4s)
  const handleUserScroll = () => {
    setIsUserScrolling(true);
    if (userScrollTimeoutRef.current) clearTimeout(userScrollTimeoutRef.current);
    userScrollTimeoutRef.current = setTimeout(() => {
      setIsUserScrolling(false);
    }, 4000);
  };

  // Spring-based scrolling gives the lyric list the same non-linear feel as
  // the line emphasis and remains smooth when the next timestamp arrives.
  const animateContainerScroll = (container: HTMLElement, targetTop: number, smooth: boolean = true) => {
    if (!smooth) {
      // A hard scrollTop jump reads as a flash when the active line changes
      // mid-playback. Use a short non-overshooting ease-out instead. The
      // spring writer is gated while this runs (single writer), any previous
      // run is cancelled so rapid line switches cannot stack two animations,
      // and the spring is NOT fed mid-run — feeding it makes its laggy output
      // yank the list back to an old position when the gate lifts. On finish,
      // sync the spring target AND jump its output to the final value so the
      // gate can lift without any pull-back.
      if (scrollRafRef.current !== null) cancelAnimationFrame(scrollRafRef.current);
      const start = container.scrollTop;
      const delta = targetTop - start;
      if (Math.abs(delta) < 2) {
        container.scrollTop = targetTop;
        lyricScrollTarget.set(targetTop);
        lyricScrollY.jump(targetTop);
        return;
      }
      manualScrollRef.current = true;
      const duration = 180;
      const t0 = performance.now();
      const step = (now: number) => {
        const p = Math.min(1, (now - t0) / duration);
        const eased = 1 - Math.pow(1 - p, 3);
        const v = start + delta * eased;
        container.scrollTop = v;
        if (p < 1) {
          scrollRafRef.current = requestAnimationFrame(step);
        } else {
          container.scrollTop = targetTop;
          lyricScrollTarget.set(targetTop);
          lyricScrollY.jump(targetTop);
          manualScrollRef.current = false;
          scrollRafRef.current = null;
        }
      };
      scrollRafRef.current = requestAnimationFrame(step);
      return;
    }
    lyricScrollTarget.set(targetTop);
  };

  // Center active lyric line in container smoothly using static bounding offsets
  const scrollToActiveLine = (index: number, smooth: boolean = true) => {
    const container = containerRef.current;
    const activeEl = lineRefs.current[index];
    if (!container || !activeEl) return;

    const containerHeight = container.clientHeight;
    // Use layout position (offsetTop/offsetHeight), NOT getBoundingClientRect:
    // the latter includes the in-flight jelly transform (scale/y), which made
    // the scroll target drift and left the line offset by a few px after the
    // animation finished.
    const elOffsetTop = activeEl.offsetTop;
    const elHeight = activeEl.offsetHeight;

    const targetScrollTop = Math.max(0, elOffsetTop - containerHeight / 2 + elHeight / 2);

    animateContainerScroll(container, targetScrollTop, smooth);
  };

  // Auto scroll to active lyric line on index/lyrics change
  useEffect(() => {
    if (!isVisible) return;
    if (lyrics.length > 0 && !isUserScrolling) {
      const timer = setTimeout(() => {
        requestAnimationFrame(() => {
          scrollToActiveLine(focalIndex, enableLyricAnimation);
        });
      }, 40);
      return () => clearTimeout(timer);
    }
  }, [focalIndex, lyrics, lyricFontSize, lyricLayoutMode, isUserScrolling, isVisible, enableLyricAnimation]);

  // Reset user scroll lock when changing song or opening full lyrics
  useEffect(() => {
    setIsUserScrolling(false);
    if (lyrics.length > 0) {
      const timer = setTimeout(() => {
        scrollToActiveLine(focalIndex, false);
      }, 40);
      return () => clearTimeout(timer);
    }
  }, [currentSong?.id, isVisible, lyricLayoutMode]);

  const closeLyrics = () => {
    if (isWindowFullScreen) {
      setIsWindowFullScreen(false);
      if (window.electronAPI?.setFullScreen) {
        window.electronAPI.setFullScreen(false);
      } else if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    }
    setFullLyricsMode(false);
  };

  // ESC Key listener to exit full lyrics mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isVisible) {
        closeLyrics();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isVisible, isWindowFullScreen, setFullLyricsMode]);

  if (!isVisible) return null;

  const handleLyricClick = (time: number) => {
    setIsUserScrolling(false);
    emitAudioSeek(time);
  };

  const handleToggleWindowFullScreen = () => {
    const nextFullScreen = !isWindowFullScreen;
    setIsWindowFullScreen(nextFullScreen);
    if (window.electronAPI?.setFullScreen) {
      window.electronAPI.setFullScreen(nextFullScreen);
    } else if (window.electronAPI?.toggleFullScreen) {
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
      // The fullscreen layer must own the first painted frame. Starting this
      // root at opacity 0 briefly reveals the normal page underneath before
      // the lyric layer becomes visible, which reads as a flash on Windows.
      // The artwork and lyric lines still animate independently below.
      initial={false}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.975, y: 8 }}
      transition={{ duration: 0.48, ease: [0.22, 1, 0.36, 1] }}
      className={`full-lyrics-shell drag-region fixed z-50 flex flex-col justify-between p-6 pt-5 pb-6 select-none overflow-hidden transform-gpu ${
        !isFluidBgEnabled ? 'full-lyrics-transparent' : ''
      } ${isWindowFullScreen ? 'window-fullscreen-active' : 'window-fullscreen-windowed'}`}
    >
      <FluidBackground coverUrl={currentSong?.coverUrl} isFullLyricsMode />

      {/* Top Bar: Controls & Layout Switcher */}
      <div className="lyrics-toolbar relative z-50 flex items-center justify-between w-full px-2 pointer-events-auto shrink-0">
        <div className="flex items-center space-x-3 no-drag">
          <button
            onClick={closeLyrics}
            className="w-11 h-11 rounded-full bg-white/10 hover:bg-white/25 text-white/80 hover:text-white flex items-center justify-center transition-all duration-200 backdrop-blur-md border border-white/15 hover:scale-105 active:scale-95 cursor-pointer shadow-md shrink-0 no-drag"
            title="退出歌词模式 (或按 ESC 键)"
          >
            <ChevronDown className="w-6 h-6" />
          </button>
        </div>

        <div
          onClick={closeLyrics}
          className="w-20 h-2 bg-white/30 hover:bg-white/60 rounded-full cursor-pointer absolute left-1/2 -translate-x-1/2 top-5 transition-all hover:scale-105 no-drag shadow-sm"
          title="点击缩小歌词模式"
        />

        <div className="flex items-center space-x-3 no-drag relative z-[100]">
          {/* Layout Mode Switcher: Split (双栏) vs Pure Fullscreen Lyrics (纯歌词全屏) */}
          <button
            onClick={() => setLyricLayoutMode((prev) => (prev === 'split' ? 'full' : 'split'))}
            className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-full border text-xs font-bold backdrop-blur-md bg-white/10 hover:bg-white/25 text-white/90 border-white/15 transition-all hover:scale-105 active:scale-95 cursor-pointer shadow-md no-drag"
            title={lyricLayoutMode === 'split' ? '切换为纯歌词全屏巨幕模式' : '切换为左右双栏模式'}
          >
            {lyricLayoutMode === 'split' ? (
              <>
                <AlignLeft className="w-4 h-4 text-cyan-400" />
                <span>纯歌词全屏</span>
              </>
            ) : (
              <>
                <Columns className="w-4 h-4 text-pink-400" />
                <span>双栏模式</span>
              </>
            )}
          </button>

          {/* Software Window Fullscreen Toggle Button */}
          <button
            onClick={(event) => {
              event.stopPropagation();
              handleToggleWindowFullScreen();
            }}
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
            onClick={closeLyrics}
            className="flex items-center space-x-1.5 text-white/80 hover:text-white bg-black/30 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-white/10 shadow-sm transition-colors no-drag"
            title="关闭全屏歌词界面"
          >
            <X className="w-4 h-4 text-white/60 hover:text-red-400 transition-colors" />
            <span>关闭</span>
          </button>
        </div>
      </div>

      {/* Main Content Layout Container: Stretches to full available window height */}
      <div className="no-drag flex-1 w-full max-w-7xl mx-auto z-10 flex flex-col min-h-0 pt-3 pb-2">
        {lyricLayoutMode === 'split' ? (
          /* Split View: Left Player Column + Right Full Height Lyrics */
          <div className="flex-1 w-full grid grid-cols-1 md:grid-cols-2 gap-10 items-center min-h-0">
            {/* Left Column: Artwork + Metadata + Integrated Progress & Controls */}
            <div className="flex flex-col items-center md:items-start justify-center space-y-4 max-w-md w-full mx-auto my-auto">
              {/* Floating Album Artwork */}
              <motion.div
                initial={{ scale: 0.92, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{
                  duration: enableArtworkAnimation ? 0.8 : 0.05,
                  ease: [0.16, 1, 0.3, 1],
                }}
                className="relative group w-64 h-64 md:w-80 md:h-80 rounded-2xl overflow-hidden border border-white/20 shadow-[0_30px_70px_-15px_rgba(0,0,0,0.85)] transform-gpu mx-auto md:mx-0 shrink-0"
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
              <LyricProgressBar />

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

              {/* Lyric Switch Offset (per-song, ms) — right under the volume bar */}
              <div className="w-full flex items-center space-x-3 pt-3">
                <Clock className="w-4 h-4 text-white/60 shrink-0" />
                <input
                  type="range"
                  min="-2000"
                  max="2000"
                  step="50"
                  value={lyricSwitchOffsetMs}
                  onChange={(e) => setLyricSwitchOffsetMs(parseInt(e.target.value, 10))}
                  title="歌词切换时间微调：正值提前、负值延后（换歌后恢复默认 0ms）"
                  className="flex-1 accent-white h-1.5 bg-white/20 rounded-lg cursor-pointer"
                />
                <span className="text-[11px] font-mono text-white/60 w-14 text-right shrink-0">
                  {lyricSwitchOffsetMs > 0 ? `+${lyricSwitchOffsetMs}` : lyricSwitchOffsetMs}ms
                </span>
              </div>

              {/* Karaoke (word-by-word) toggle — off by default */}
              <div className="w-full pt-3">
                <div className="flex items-center justify-between">
                  <span className="flex items-center space-x-2 text-white/80 text-xs font-medium">
                    <Sparkles className="w-4 h-4 text-white/60" />
                    <span>逐字歌词</span>
                  </span>
                  <button
                    onClick={() => setEnableKaraoke(!enableKaraoke)}
                    title="逐字歌词（逐词高亮）。默认关闭：英文歌词在逐字模式下较拥挤，中文歌词可开启体验波浪效果"
                    className={`relative w-10 h-5 rounded-full transition-colors duration-200 ${
                      enableKaraoke ? 'bg-white/90' : 'bg-white/20'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform duration-200 ${
                        enableKaraoke ? 'translate-x-5 bg-black/80' : 'bg-white/80'
                      }`}
                    />
                  </button>
                </div>
                <p className="text-[10px] text-white/35 leading-tight pt-1">
                  仅网易云支持逐字歌词的音乐开启后生效，QQ音乐暂未进行适配
                </p>
              </div>
            </div>

            {/* Right Column: Full Screen Height Lyric Engine */}
            <div className="relative h-full w-full min-h-0">
              <div
                ref={containerRef}
                onWheel={handleUserScroll}
                onTouchStart={handleUserScroll}
                onMouseDown={handleUserScroll}
                className="h-full w-full overflow-y-auto no-scrollbar relative px-4 md:px-8 flex flex-col items-start justify-start mask-v-fade"
              >
                {lyrics.length === 0 ? (
                  <div className="text-white/40 text-lg font-medium italic my-auto self-center">
                    暂无歌词
                  </div>
                ) : (
                  <div className="w-full flex flex-col space-y-7 items-start pt-64 pb-80 pr-14 md:pr-20">
                    {/* Pre-chorus countdown dots — shown above the first lyric
                        line so the first line itself is never replaced. Works
                        on both platforms: QQ lyrics have their title/personnel
                        rows filtered so the first line is the real first
                        lyric (its timestamp drives the countdown). */}
                    {showPreChorusDots && currentSong?.source === 'netease' && (
                      <div className="pl-2 pb-1">
                        <PreChorusDots elapsed={currentTime} firstTime={firstLyricTime} />
                      </div>
                    )}
                    {lyrics.map((line, idx) => {
                      const isActive = idx === activeIndex;
                      const distance = Math.abs(idx - focalIndex);

                      // Proportional opacity gradient based on line distance
                      let targetOpacity = 0.25;
                      if (isActive) targetOpacity = 1;
                      else if (activeIndex === -1 && idx === 0) targetOpacity = 0.85;
                      else if (distance === 1) targetOpacity = 0.65;
                      else if (distance === 2) targetOpacity = 0.45;
                      else if (distance === 3) targetOpacity = 0.32;

                      // Gradient Depth-of-Field Blur (DOF): Crisp near focus, soft further away
                      let targetBlur = 0;
                      if (enableLyricBlur) {
                        if (isActive || (activeIndex === -1 && idx === 0)) targetBlur = 0;
                        else if (distance === 1) targetBlur = 0.5;
                        else if (distance === 2) targetBlur = 1.8;
                        else if (distance === 3) targetBlur = 3.2;
                        else targetBlur = Math.min(6, 3.2 + (distance - 3) * 0.8);
                      }

                      return (
                        <motion.div
                          key={idx}
                          ref={(el) => (lineRefs.current[idx] = el)}
                          onClick={() => handleLyricClick(line.time)}
                          animate={{
                            scale: isActive
                              ? enableLyricAnimation
                                ? [0.985, 1.042, 1.012, 1.018]
                                : 1.018
                              : distance === 1
                              ? enableLyricAnimation
                                ? [1.015, 0.992, 0.99]
                                : 0.99
                              : 0.982,
                            y: isActive
                              ? enableLyricAnimation
                                ? [8, -4, 1, 0]
                                : 0
                              : distance === 1
                              ? enableLyricAnimation
                                ? [-2, 1, 0]
                                : 0
                              : 0,
                            opacity: targetOpacity,
                            filter: `blur(${targetBlur}px)`,
                          }}
                          transition={jellyTransition}
                          className="full-lyrics-line cursor-pointer text-left origin-left space-y-1 py-1 px-2 -mx-2 hover:opacity-100 max-w-full break-words"
                        >
                          {/* Main Lyric Line — always rendered; the pre-chorus
                              countdown dots sit ABOVE the list, never
                              replacing the first lyric line. */}
                          <KaraokeLine
                            line={line}
                            isActive={isActive}
                            currentTime={currentTime}
                            fontSize={lyricFontSize}
                            layout="split"
                            enableGlow={enableLyricGlow}
                            enableAnimation={enableLyricAnimation}
                            enableKaraoke={enableKaraoke}
                          />
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Floating return to current lyric pill button when user manually scrolls */}
              {isUserScrolling && lyrics.length > 0 && (
                <button
                  onClick={() => {
                    setIsUserScrolling(false);
                    scrollToActiveLine(focalIndex, true);
                  }}
                  className="absolute bottom-4 right-8 z-30 flex items-center space-x-1.5 px-3.5 py-1.5 rounded-full bg-white/20 hover:bg-white/35 backdrop-blur-xl text-white text-xs font-semibold border border-white/25 shadow-xl transition-all hover:scale-105 active:scale-95 cursor-pointer"
                >
                  <Disc className="w-3.5 h-3.5 text-apple-red animate-spin" />
                  <span>回到当前歌词</span>
                </button>
              )}
            </div>
          </div>
        ) : (
          /* Pure Full-Screen Immersive Lyrics Mode (Centered Giant Lyrics) */
          <div className="flex-1 w-full max-w-4xl mx-auto flex flex-col min-h-0 relative">
            <div
              ref={containerRef}
              onWheel={handleUserScroll}
              onTouchStart={handleUserScroll}
              onMouseDown={handleUserScroll}
              className="h-full w-full overflow-y-auto no-scrollbar relative px-4 md:px-12 flex flex-col items-center justify-start text-center mask-v-fade"
            >
              {lyrics.length === 0 ? (
                <div className="text-white/40 text-xl font-medium italic my-auto">
                  暂无歌词
                </div>
              ) : (
                <div className="w-full flex flex-col space-y-8 items-center pt-64 pb-80">
                  {/* Pre-chorus countdown dots — same lead-in as split view,
                      both platforms (QQ title/personnel rows are filtered so
                      the first lyric timestamp is real). */}
                  {showPreChorusDots && currentSong?.source === 'netease' && (
                    <div className="pb-2">
                      <PreChorusDots elapsed={currentTime} firstTime={firstLyricTime} />
                    </div>
                  )}
                  {lyrics.map((line, idx) => {
                    const isActive = idx === activeIndex;
                    const distance = Math.abs(idx - focalIndex);

                    let targetOpacity = 0.25;
                    if (isActive) targetOpacity = 1;
                    else if (activeIndex === -1 && idx === 0) targetOpacity = 0.85;
                    else if (distance === 1) targetOpacity = 0.65;
                    else if (distance === 2) targetOpacity = 0.45;
                    else if (distance === 3) targetOpacity = 0.32;

                    let targetBlur = 0;
                    if (enableLyricBlur) {
                      if (isActive || (activeIndex === -1 && idx === 0)) targetBlur = 0;
                      else if (distance === 1) targetBlur = 0.5;
                      else if (distance === 2) targetBlur = 1.8;
                      else if (distance === 3) targetBlur = 3.2;
                      else targetBlur = Math.min(6, 3.2 + (distance - 3) * 0.8);
                    }

                    return (
                      <motion.div
                        key={idx}
                        ref={(el) => (lineRefs.current[idx] = el)}
                        onClick={() => handleLyricClick(line.time)}
                        animate={{
                          scale: isActive
                            ? enableLyricAnimation
                              ? [0.985, 1.048, 1.015, 1.025]
                              : 1.025
                            : distance === 1
                            ? enableLyricAnimation
                              ? [1.022, 0.993, 0.992]
                              : 0.992
                            : 0.978,
                          y: isActive
                            ? enableLyricAnimation
                              ? [10, -5, 1.5, 0]
                              : 0
                            : distance === 1
                            ? enableLyricAnimation
                              ? [-2, 1, 0]
                              : 0
                            : 0,
                          opacity: targetOpacity,
                          filter: `blur(${targetBlur}px)`,
                        }}
                        transition={jellyTransition}
                        className="full-lyrics-line cursor-pointer text-center origin-center space-y-2 py-1 px-2 -mx-2 hover:opacity-100 max-w-3xl break-words"
                      >
                        {/* Giant Centered Main Line */}
                        <KaraokeLine
                          line={line}
                          isActive={isActive}
                          currentTime={currentTime}
                          fontSize={lyricFontSize}
                          layout="full"
                          enableGlow={enableLyricGlow}
                          enableAnimation={enableLyricAnimation}
                          enableKaraoke={enableKaraoke}
                        />
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Floating Mini Player Controller at Bottom of Pure Lyrics View */}
            {currentSong && (
              <div className="shrink-0 flex items-center justify-between px-6 py-3 bg-black/40 backdrop-blur-2xl rounded-2xl border border-white/15 shadow-2xl mt-2 mx-auto max-w-xl w-full z-20">
                <div className="flex items-center space-x-3 truncate">
                  <img
                    src={getOptimizedCoverUrl(currentSong.coverUrl, 100)}
                    alt={currentSong.name}
                    className="w-10 h-10 rounded-lg object-cover border border-white/20 shrink-0"
                  />
                  <div className="flex flex-col truncate">
                    <span className="text-xs font-bold text-white truncate">
                      {neteaseApi.cleanTitle(currentSong.name)}
                    </span>
                    <span className="text-[11px] text-white/60 truncate">
                      {neteaseApi.cleanTitle(currentSong.artist)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <button onClick={prevSong} className="text-white/80 hover:text-white p-1">
                    <SkipBack className="w-5 h-5 fill-current" />
                  </button>
                  <button
                    onClick={togglePlayPause}
                    className="w-9 h-9 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-all"
                  >
                    {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
                  </button>
                  <button onClick={nextSong} className="text-white/80 hover:text-white p-1">
                    <SkipForward className="w-5 h-5 fill-current" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
};
