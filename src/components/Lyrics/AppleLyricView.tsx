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
import { motion } from 'framer-motion';
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
  offsetMs: number;
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
    <span className="relative inline-block whitespace-pre-wrap" style={{ verticalAlign: 'baseline' }}>
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
              ? 'drop-shadow(0 0 10px rgba(255,255,255,0.95))'
              : 'none',
        }}
      >
        {text}
      </span>
    </span>
  );
});

const WaveLine: React.FC<{ line: LyricLine; glow: string; offsetMs: number }> = ({ line, glow, offsetMs }) => {
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
      // offsetMs allows global adjustments (like KuGou's latency or user preference) 
      // to apply directly to the high-refresh word-by-word animation loop.
      const target = raw + offsetMs / 1000 - line.time;
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
  offsetMs,
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
        ? '0 0 18px rgba(255, 255, 255, 0.85)'
        : '0 0 14px rgba(255, 255, 255, 0.75)'
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
                ? '0 0 26px rgba(255, 255, 255, 0.95)'
                : '0 0 22px rgba(255, 255, 255, 0.9)'
              : 'none',
        }}
      >
        {words ? (
          <WaveLine line={line} glow={sungWordGlow} offsetMs={offsetMs} />
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

// --- Pre-chorus "about to start" countdown (streaming-app style) ---
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
              boxShadow: lit ? '0 0 14px rgba(255,255,255,0.85)' : 'none',
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
  const isLyricsLoading = usePlayerStore((state) => state.isLyricsLoading);
  const currentTime = usePlayerStore((state) => state.currentTime);
  
  // KuGou KRC lyrics often inherently lag (are "slow") compared to the audio stream.
  // To make them faster (appear earlier), we ADD a positive offset to the clock.
  const platformOffsetMs = currentSong?.source === 'kugou' ? 400 : 0;
  const effectiveLyricOffsetMs = lyricSwitchOffsetMs + platformOffsetMs;
  const activeIndex = getActiveLyricIndex(currentTime, lyrics, effectiveLyricOffsetMs);

  // Pre-chorus state: lyrics exist but the first line hasn't started yet —
  // show the streaming-app style "about to start" dots.
  const isPreChorus = lyrics.length > 0 && activeIndex === -1;
  // First REAL lyric line: skip any stray time-0 metadata row that survived
  // filtering (title/personnel rows are time 0), so the countdown and the
  // dots' visibility are driven by the actual vocal start, not by a 0s row.
  const firstLyricTime = lyrics.find((l) => l.time > 0)?.time ?? lyrics[0]?.time ?? 0;
  // The dots must stay visible until the vocals actually begin. activeIndex
  // has a +0.15s lookahead (lyrics activate slightly early), so isPreChorus
  // flips false before the first lyric time — gate the dots on the raw lyric
  // time instead, keeping them up for a beat past the first line.
  const showPreChorusDots = firstLyricTime > 0 && currentTime < firstLyricTime + effectiveLyricOffsetMs / 1000 + 0.2;

  const [isWindowFullScreen, setIsWindowFullScreen] = useState(false);
  const [isUserScrolling, setIsUserScrolling] = useState(false);
  const [lyricLayoutMode, setLyricLayoutMode] = useState<'split' | 'full'>('split');

  const containerRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);
  const userScrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Deterministic RAF scroll — no spring tail crawl.
  const scrollRafRef = useRef<number | null>(null);
  const scrollVelocityRef = useRef(0);
  // Current scroll offset in pixels. Scrolling is driven by a transform on
  // the inner content wrapper (GPU-composited) instead of scrollTop: writing
  // scrollTop every frame relayouts and repaints the whole large lyric list,
  // which made line-switch animations run at a low frame rate.
  const scrollYRef = useRef(0);
  const maxScrollRef = useRef(0);
  const dragStateRef = useRef<{ startY: number; startScroll: number } | null>(null);
  // Set when a mouse drag moved far enough that the follow-up click should be
  // suppressed (dragging the list must not also jump the playback position).
  const suppressClickRef = useRef(false);

  // Focal index for scrolling & blur gradient (defaults to line 0 during prelude)
  const focalIndex = activeIndex >= 0 ? activeIndex : 0;

  // Apple Music-style lyric emphasis: active lines gently scale up with a
  // soft overshoot ease, adjacent lines shrink back.
  // We use single continuous target values (not array keyframes) with a true 
  // physics spring, perfectly satisfying the requirement for "非线性" (non-linear)
  // motion, providing an organic feel that seamlessly reacts to interruption.
  const jellyTransition = enableLyricAnimation
    ? {
        type: 'spring',
        stiffness: 120,
        damping: 15,
        mass: 1,
      }
    : { duration: 0 };

  // Cancel any in-flight scroll animation when the view unmounts.
  useEffect(() => {
    return () => {
      if (scrollRafRef.current !== null) cancelAnimationFrame(scrollRafRef.current);
    };
  }, []);

  // Native wheel listener with passive:false so we can preventDefault and
  // drive the transform-based scroll manually (React attaches wheel as a
  // passive listener, where preventDefault is ignored).
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      beginUserScroll();
      applyScroll(scrollYRef.current + e.deltaY);
    };
    container.addEventListener('wheel', onWheel, { passive: false });
    return () => container.removeEventListener('wheel', onWheel);
    // Re-bind when the split/full layout swaps the container node (the two
    // branches share one ref but mount different elements).
  }, [lyricLayoutMode]);

  // Keep the scrollable range in sync with content/container size changes
  // (lyrics, font size and layout mode all change the content height).
  useEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;
    updateMaxScroll();
    const ro = new ResizeObserver(() => updateMaxScroll());
    ro.observe(container);
    ro.observe(content);
    return () => ro.disconnect();
  }, [lyrics, isVisible, lyricLayoutMode, lyricFontSize]);

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

  // Apply a scroll offset as a GPU-composited translateY on the content
  // wrapper (clamped to the scrollable range).
  const applyScroll = (y: number) => {
    const clamped = Math.min(maxScrollRef.current, Math.max(0, y));
    scrollYRef.current = clamped;
    if (contentRef.current) {
      contentRef.current.style.transform = `translate3d(0, ${-clamped}px, 0)`;
    }
  };

  const updateMaxScroll = () => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (container && content) {
      maxScrollRef.current = Math.max(0, content.offsetHeight - container.clientHeight);
    }
  };

  // User takes over scrolling: cancel any in-flight RAF animation (single
  // writer) and pause auto-follow for 4s.
  const beginUserScroll = () => {
    if (scrollRafRef.current !== null) {
      cancelAnimationFrame(scrollRafRef.current);
      scrollRafRef.current = null;
    }
    setIsUserScrolling(true);
    if (userScrollTimeoutRef.current) clearTimeout(userScrollTimeoutRef.current);
    userScrollTimeoutRef.current = setTimeout(() => {
      setIsUserScrolling(false);
    }, 4000);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    dragStateRef.current = { startY: e.touches[0].clientY, startScroll: scrollYRef.current };
    beginUserScroll();
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    const s = dragStateRef.current;
    if (!s) return;
    applyScroll(s.startScroll - (e.touches[0].clientY - s.startY));
  };
  const handleTouchEnd = () => {
    dragStateRef.current = null;
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    dragStateRef.current = { startY: e.clientY, startScroll: scrollYRef.current };
    beginUserScroll();
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    const s = dragStateRef.current;
    if (!s) return;
    applyScroll(s.startScroll - (e.clientY - s.startY));
    // A drag of more than 5px is a scroll gesture: suppress the click that
    // browsers synthesize after mouseup so it cannot seek the song.
    if (Math.abs(e.clientY - s.startY) > 5) suppressClickRef.current = true;
  };
  const handleMouseUp = () => {
    dragStateRef.current = null;
    // The synthesized click fires right after mouseup; clear the suppress
    // flag afterwards so a later genuine lyric click is not swallowed.
    setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);
  };

  // True Spring physics for scroll — highly non-linear, completely fluid,
  // naturally reacts to interruptions by preserving velocity.
  // Final application is rounded to prevent sub-pixel blur tail-crawl.
  const animateContainerScroll = (container: HTMLElement, targetTop: number, smooth: boolean = true) => {
    // Cancel any in-flight scroll first.
    if (scrollRafRef.current !== null) {
      cancelAnimationFrame(scrollRafRef.current);
      scrollRafRef.current = null;
    }

    const finalTarget = Math.round(targetTop);
    let position = scrollYRef.current;
    let velocity = scrollVelocityRef.current;

    if (!smooth || Math.abs(finalTarget - position) < 2) {
      scrollVelocityRef.current = 0;
      applyScroll(finalTarget);
      return;
    }

    // Spring configuration (similar to Apple Music's soft scroll)
    const stiffness = 0.06;
    const damping = 0.82;

    const step = () => {
      const delta = finalTarget - position;
      velocity += delta * stiffness;
      velocity *= damping;
      position += velocity;
      scrollVelocityRef.current = velocity;

      // Stop condition: very close to target and moving very slowly
      if (Math.abs(delta) < 0.8 && Math.abs(velocity) < 0.8) {
        scrollVelocityRef.current = 0;
        // Only round on the final resting frame to prevent static text blur
        applyScroll(finalTarget);
        scrollRafRef.current = null;
      } else {
        // Do NOT round during animation! Sub-pixel transforms are essential
        // for maintaining a smooth 60/120fps motion. Rounding here causes jitter.
        applyScroll(position);
        scrollRafRef.current = requestAnimationFrame(step);
      }
    };
    scrollRafRef.current = requestAnimationFrame(step);
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
    // A real drag (scroll gesture) suppresses the synthesized click so it
    // cannot seek the song; consume the flag regardless.
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
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
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                className="h-full w-full overflow-hidden no-scrollbar relative px-4 md:px-8 flex flex-col items-start justify-start mask-v-fade select-none"
                style={{ touchAction: 'none' }}
              >
                {lyrics.length === 0 ? (
                  <div className="text-white/40 text-lg font-medium italic my-auto self-center">
                    {isLyricsLoading ? '歌词加载中...' : '暂无歌词'}
                  </div>
                ) : (
                  <div
                    ref={contentRef}
                    className="w-full flex flex-col space-y-7 items-start pt-64 pb-80 pr-14 md:pr-20"
                  >
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
                              ? enableLyricAnimation ? 1.035 : 1
                              : distance === 1
                              ? enableLyricAnimation ? 0.98 : 1
                              : enableLyricAnimation ? 0.96 : 1,
                            y: 0,
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
                            offsetMs={effectiveLyricOffsetMs}
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
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              className="h-full w-full overflow-hidden no-scrollbar relative px-4 md:px-12 flex flex-col items-center justify-start text-center mask-v-fade select-none"
              style={{ touchAction: 'none' }}
            >
              {lyrics.length === 0 ? (
                <div className="text-white/40 text-xl font-medium italic my-auto">
                  {isLyricsLoading ? '歌词加载中...' : '暂无歌词'}
                </div>
              ) : (
                <div
                  ref={contentRef}
                  className="w-full flex flex-col space-y-8 items-center pt-64 pb-80"
                >
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
                            ? enableLyricAnimation ? 1.045 : 1
                            : distance === 1
                            ? enableLyricAnimation ? 0.99 : 1
                            : enableLyricAnimation ? 0.978 : 1,
                          y: 0,
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
                          offsetMs={effectiveLyricOffsetMs}
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
