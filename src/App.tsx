import React, { useEffect, useRef, useState } from 'react';
import { TitleBar } from './components/TitleBar/TitleBar';
import { Sidebar } from './components/Sidebar/Sidebar';
import { PlayerBar } from './components/Player/PlayerBar';
import { QueueDrawer } from './components/Player/QueueDrawer';
import { AudioController } from './components/Player/AudioController';
import { AppleLyricView } from './components/Lyrics/AppleLyricView';
import { DesktopLyricView } from './components/Lyrics/DesktopLyricView';
import { LoginModal } from './components/Login/LoginModal';

import { ListenNowView } from './views/ListenNowView';
import { BrowseView } from './views/BrowseView';
import { LocalMusicView } from './views/LocalMusicView';
import { PlaylistView } from './views/PlaylistView';
import { SearchView } from './views/SearchView';
import { ChangelogView } from './views/ChangelogView';
import { SettingsView } from './views/SettingsView';
import { AboutView } from './views/AboutView';
import { NoticeView } from './views/NoticeView';

import { usePlayerStore } from './store/playerStore';
import { neteaseApi } from './services/neteaseApi';
import { AlertCircle, Crown, Heart, CheckCircle2 } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

type WindowTransition = 'idle' | 'opening' | 'restoring' | 'minimizing' | 'maximizing' | 'unmaximizing';

const DesktopLyricSync: React.FC = () => {
  useEffect(() => {
    const sendDesktopLyricData = window.electronAPI?.sendDesktopLyricData;
    if (!sendDesktopLyricData) return;

    let lastSyncTime = 0;
    let lastSongId: string | number | null = null;
    let lastIsPlaying = false;

    const sync = (state: ReturnType<typeof usePlayerStore.getState>, force = false) => {
      const now = Date.now();
      const songId = state.currentSong?.id ?? null;
      const stateChanged = lastSongId !== songId || lastIsPlaying !== state.isPlaying;

      if (!force && now - lastSyncTime < 120 && !stateChanged) return;

      lastSyncTime = now;
      lastSongId = songId;
      lastIsPlaying = state.isPlaying;
      sendDesktopLyricData({
        currentSong: state.currentSong,
        lyrics: state.lyrics,
        currentTime: state.currentTime,
        isPlaying: state.isPlaying,
      });
    };

    // Subscribe without rendering this component on every audio timeupdate.
    sync(usePlayerStore.getState(), true);
    return usePlayerStore.subscribe((state) => sync(state));
  }, []);

  return null;
};

export const App: React.FC = () => {
  const isDesktopLyricWindow = window.location.hash.includes('desktop-lyric');

  const isFullLyricsMode = usePlayerStore((state) => state.isFullLyricsMode);
  const isLoginModalOpen = usePlayerStore((state) => state.isLoginModalOpen);
  const activeTab = usePlayerStore((state) => state.activeTab);
  const setUser = usePlayerStore((state) => state.setUser);
  const setPlaylists = usePlayerStore((state) => state.setPlaylists);
  const setNeteaseLikeIds = usePlayerStore((state) => state.setNeteaseLikeIds);
  const toastMessage = usePlayerStore((state) => state.toastMessage);
  const setToastMessage = usePlayerStore((state) => state.setToastMessage);
  const togglePlayPause = usePlayerStore((state) => state.togglePlayPause);
  const nextSong = usePlayerStore((state) => state.nextSong);
  const prevSong = usePlayerStore((state) => state.prevSong);
  const autoCheckUpdate = usePlayerStore((state) => state.autoCheckUpdate);
  const [isLyricsSurfaceActive, setIsLyricsSurfaceActive] = useState(isFullLyricsMode);
  const [windowTransition, setWindowTransition] = useState<WindowTransition>('idle');
  const windowTransitionTimerRef = useRef<number | null>(null);
  const isLyricsSurfaceVisible = isFullLyricsMode || isLyricsSurfaceActive;

  // Keep the transparent host mounted until the lyric exit animation has
  // finished. Otherwise the opaque main paper flashes in on the first exit
  // frame and makes the transition look like a hard cut.
  useEffect(() => {
    if (isFullLyricsMode) {
      setIsLyricsSurfaceActive(true);
      return;
    }

    const timer = window.setTimeout(() => setIsLyricsSurfaceActive(false), 560);
    return () => window.clearTimeout(timer);
  }, [isFullLyricsMode]);

  useEffect(() => {
    if (!window.electronAPI?.onWindowTransition) return;

    const cleanup = window.electronAPI.onWindowTransition((transition) => {
      const nextTransition: WindowTransition =
        transition === 'opening' ||
        transition === 'restoring' ||
        transition === 'minimizing' ||
        transition === 'maximizing' ||
        transition === 'unmaximizing'
          ? transition
          : 'idle';

      setWindowTransition(nextTransition);
      if (windowTransitionTimerRef.current !== null) {
        window.clearTimeout(windowTransitionTimerRef.current);
        windowTransitionTimerRef.current = null;
      }
      if (nextTransition !== 'idle') {
        const duration = nextTransition === 'minimizing' ? 240 : nextTransition === 'restoring' ? 300 : 390;
        windowTransitionTimerRef.current = window.setTimeout(() => {
          windowTransitionTimerRef.current = null;
          setWindowTransition('idle');
        }, duration);
      }
    });

    return () => {
      cleanup?.();
      if (windowTransitionTimerRef.current !== null) {
        window.clearTimeout(windowTransitionTimerRef.current);
      }
    };
  }, []);

  const shellAnimation =
    windowTransition === 'minimizing'
      ? { opacity: [1, 0.84, 0], scale: [1, 0.985, 0.94], y: [0, 7, 15] }
      : windowTransition === 'restoring' || windowTransition === 'opening'
      ? { opacity: [0, 0.72, 1], scale: [0.94, 1.012, 1], y: [15, -2, 0] }
      : windowTransition === 'maximizing'
      ? { opacity: [1, 0.97, 1], scale: [1, 0.997, 1] }
      : windowTransition === 'unmaximizing'
      ? { opacity: [1, 0.97, 1], scale: [1, 1.003, 1] }
      : { opacity: 1, scale: 1, y: 0 };

  const shellTransition =
    windowTransition === 'minimizing'
      ? { duration: 0.24, ease: [0.4, 0, 1, 1] as const }
      : windowTransition === 'restoring' || windowTransition === 'opening'
      ? { duration: 0.3, ease: [0.22, 1, 0.36, 1] as const }
      : { duration: 0.39, ease: [0.22, 1, 0.36, 1] as const };

  const renderActiveView = () => {
    switch (activeTab) {
      case 'listen-now':
        return <ListenNowView />;
      case 'browse':
        return <BrowseView />;
      case 'local':
        return <LocalMusicView />;
      case 'playlist':
        return <PlaylistView />;
      case 'search':
        return <SearchView />;
      case 'changelog':
        return <ChangelogView />;
      case 'settings':
        return <SettingsView />;
      case 'notice':
        return <NoticeView />;
      case 'about':
        return <AboutView />;
      default:
        return <ListenNowView />;
    }
  };

  if (isDesktopLyricWindow) {
    return <DesktopLyricView />;
  }

  // Restore NetEase user session on startup if cookie exists
  useEffect(() => {
    const initSession = async () => {
      const account = await neteaseApi.getUserAccount();
      if (account) {
        setUser(account);
        const userPlaylists = await neteaseApi.getUserPlaylists(account.userId);
        setPlaylists(userPlaylists);

        const likeIds = await neteaseApi.getLikelist(account.userId);
        setNeteaseLikeIds(likeIds);
      }
    };
    initSession();
  }, []);

  // Auto check for update from GitHub Releases on application startup
  useEffect(() => {
    const checkAutoUpdate = async () => {
      if (!autoCheckUpdate) return;
      try {
        const res = await fetch(`https://api.github.com/repos/RubenCampoa/Beta-music-player/releases/latest?t=${Date.now()}`, {
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
          },
        });
        if (res.ok) {
          const data = await res.json();
          const latestTag = (data.tag_name || '').trim();
          const currentVersion = 'v1.0.6';
          const normalize = (v: string) => v.replace(/^v/i, '').trim();
          if (latestTag && normalize(latestTag) !== normalize(currentVersion)) {
            setToastMessage(`发现新版本 ${latestTag}！可在设置中点击检查更新进行查看与升级`);
          }
        }
      } catch {
        // Silently ignore network error during startup check
      }
    };

    const timer = setTimeout(checkAutoUpdate, 1800);
    return () => clearTimeout(timer);
  }, [autoCheckUpdate, setToastMessage]);

  // Listen to Global Electron Media Controls (Hardware Media Keys & Tray Menu)
  useEffect(() => {
    if (window.electronAPI?.onMediaControl) {
      const cleanup = window.electronAPI.onMediaControl((action) => {
        if (action === 'toggle-play') togglePlayPause();
        else if (action === 'next-song') nextSong();
        else if (action === 'prev-song') prevSong();
      });
      return cleanup;
    }
  }, [togglePlayPause, nextSong, prevSong]);

  // Global Keyboard Shortcut: Spacebar for Play / Pause Toggle
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Do not trigger play/pause if user is typing in a search bar or text input
      const target = e.target as HTMLElement;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        togglePlayPause();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlayPause]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.985 }}
      animate={shellAnimation}
      transition={shellTransition}
      className={`app-shell relative w-screen h-screen overflow-hidden font-sans flex flex-col select-none ${
      isLyricsSurfaceVisible ? 'full-lyrics-host' : ''
      }`}
    >
      {/* Hidden Audio Controller Engine */}
      <AudioController />
      <DesktopLyricSync />

      {/* Keep the native title bar out of the translucent lyrics surface. */}
      <AnimatePresence initial={false}>
        {!isLyricsSurfaceVisible && (
          <motion.div
            key="titlebar"
            initial={{ opacity: 0, y: -14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -18 }}
            transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
            className="shrink-0"
          >
            <TitleBar />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content Area (Hidden in Full Lyrics Mode to prevent background DOM text bleeding through) */}
      <motion.div
        animate={
          isLyricsSurfaceVisible
            ? { opacity: 0, y: 10, scale: 0.985 }
            : { opacity: 1, y: 0, scale: 1 }
        }
        transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
        style={{
          // Do not leave one composited frame of the paper UI visible while
          // the fullscreen lyric surface is mounting. The opacity animation
          // is still used on exit, but hidden content must stop painting
          // immediately on entry to avoid the old page flashing through.
          visibility: isLyricsSurfaceVisible ? 'hidden' : 'visible',
          pointerEvents: isLyricsSurfaceVisible ? 'none' : 'auto',
        }}
        className="flex-1 flex overflow-hidden relative z-10 min-h-0 transform-gpu"
      >
        {/* Glassmorphic Sidebar */}
        <Sidebar />

        {/* Dynamic Views Container */}
        <main className="app-main flex-1 h-[calc(100vh-3rem-5rem)] overflow-y-auto px-8 py-6">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 12, scale: 0.988 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.992 }}
              transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
              className="view-transition min-h-full"
            >
              {renderActiveView()}
            </motion.div>
          </AnimatePresence>
        </main>
      </motion.div>

      {/* Fullscreen Apple Music Lyric Mode */}
      <AnimatePresence initial={false}>
        {isFullLyricsMode && <AppleLyricView key="full-lyrics" isVisible />}
      </AnimatePresence>

      {/* Play Queue Right Drawer */}
      <QueueDrawer />

      {/* Bottom Floating Control Bar */}
      <AnimatePresence initial={false}>
        {!isLyricsSurfaceVisible && !isLoginModalOpen && (
          <motion.div
            key="player-dock"
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 22 }}
            transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1] }}
            className="fixed bottom-0 left-0 right-0 z-[60]"
          >
            <PlayerBar />
          </motion.div>
        )}
      </AnimatePresence>

      {/* NetEase QR Code Login Modal */}
      <LoginModal />

      {/* Global Toast Notification */}
      {toastMessage && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-[100] animate-fadeIn">
          <div className="px-6 py-3 rounded-2xl bg-white/95 backdrop-blur-2xl border border-black/10 text-[#1b2433] shadow-2xl flex items-center space-x-3 text-sm font-bold">
            {toastMessage.includes('VIP') ? (
              <Crown className="w-5 h-5 text-amber-400 shrink-0 animate-bounce" />
            ) : toastMessage.includes('收藏') ? (
              <Heart className="w-5 h-5 text-apple-red fill-current shrink-0 animate-pulse" />
            ) : toastMessage.includes('频繁') || toastMessage.includes('失败') || toastMessage.includes('错误') || toastMessage.includes('限') ? (
              <AlertCircle className="w-5 h-5 text-amber-400 shrink-0" />
            ) : (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            )}
            <span className="tracking-wide">{toastMessage}</span>
            <button
              onClick={() => setToastMessage(null)}
              className="ml-3 text-black/35 hover:text-black text-xs font-black p-1 transition-colors"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </motion.div>
  );
};

