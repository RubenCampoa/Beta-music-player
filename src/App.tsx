import React, { useEffect, useRef } from 'react';
import { TitleBar } from './components/TitleBar/TitleBar';
import { Sidebar } from './components/Sidebar/Sidebar';
import { PlayerBar } from './components/Player/PlayerBar';
import { QueueDrawer } from './components/Player/QueueDrawer';
import { AudioController } from './components/Player/AudioController';
import { FluidBackground } from './components/Background/FluidBackground';
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

export const App: React.FC = () => {
  const isDesktopLyricWindow = window.location.hash.includes('desktop-lyric');

  const {
    currentSong,
    currentTime,
    lyrics,
    isPlaying,
    isFullLyricsMode,
    activeTab,
    setUser,
    setPlaylists,
    setNeteaseLikeIds,
    toastMessage,
    setToastMessage,
    togglePlayPause,
    nextSong,
    prevSong,
  } = usePlayerStore();

  const { autoCheckUpdate } = usePlayerStore();

  // Continuously sync lyric data to Electron main process for Desktop Lyric Window (Throttled for ultra-low IPC overhead)
  const lastSyncRef = React.useRef<{ time: number; songId: string | number | null; isPlaying: boolean }>({
    time: 0,
    songId: null,
    isPlaying: false,
  });

  useEffect(() => {
    if (!window.electronAPI?.sendDesktopLyricData) return;

    const now = Date.now();
    const songId = currentSong?.id || null;
    const timeDelta = now - lastSyncRef.current.time;
    const isStateChanged =
      lastSyncRef.current.songId !== songId ||
      lastSyncRef.current.isPlaying !== isPlaying;

    // Send IPC update every 120ms or immediately on song/play state change
    if (timeDelta >= 120 || isStateChanged) {
      lastSyncRef.current = { time: now, songId, isPlaying };
      window.electronAPI.sendDesktopLyricData({
        currentSong,
        lyrics,
        currentTime,
        isPlaying,
      });
    }
  }, [currentSong, lyrics, currentTime, isPlaying]);

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
          const currentVersion = 'v1.0.5';
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
    <div className="relative w-screen h-screen overflow-hidden bg-black text-white font-sans flex flex-col select-none">
      {/* Hidden Audio Controller Engine */}
      <AudioController />

      {/* Dynamic Fluid Mesh Background */}
      <FluidBackground coverUrl={currentSong?.coverUrl} isFullLyricsMode={isFullLyricsMode} />

      {/* Title Bar (Frameless Drag Region) */}
      <TitleBar />

      {/* Main Content Area (Hidden in Full Lyrics Mode to prevent background DOM text bleeding through) */}
      <div
        className={`flex-1 flex overflow-hidden relative z-10 transition-opacity duration-300 ${
          isFullLyricsMode ? 'opacity-0 pointer-events-none invisible' : 'opacity-100'
        }`}
      >
        {/* Glassmorphic Sidebar */}
        <Sidebar />

        {/* Dynamic Views Container */}
        <main className="flex-1 h-[calc(100vh-3rem-5rem)] overflow-y-auto p-6 backdrop-blur-xs">
          {activeTab === 'listen-now' && <ListenNowView />}
          {activeTab === 'browse' && <BrowseView />}
          {activeTab === 'local' && <LocalMusicView />}
          {activeTab === 'playlist' && <PlaylistView />}
          {activeTab === 'search' && <SearchView />}
          {activeTab === 'changelog' && <ChangelogView />}
          {activeTab === 'settings' && <SettingsView />}
          {activeTab === 'notice' && <NoticeView />}
          {activeTab === 'about' && <AboutView />}
        </main>
      </div>

      {/* Fullscreen Apple Music Lyric Mode */}
      <AppleLyricView />

      {/* Play Queue Right Drawer */}
      <QueueDrawer />

      {/* Bottom Floating Control Bar */}
      <PlayerBar />

      {/* NetEase QR Code Login Modal */}
      <LoginModal />

      {/* Global Toast Notification */}
      {toastMessage && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-[100] animate-fadeIn">
          <div className="px-6 py-3 rounded-2xl bg-[#141622]/95 backdrop-blur-2xl border border-white/20 text-white shadow-2xl flex items-center space-x-3 text-sm font-bold">
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
              className="ml-3 text-white/50 hover:text-white text-xs font-black p-1 transition-colors"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

