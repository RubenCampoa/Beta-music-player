import React, { useEffect } from 'react';
import { TitleBar } from './components/TitleBar/TitleBar';
import { Sidebar } from './components/Sidebar/Sidebar';
import { PlayerBar } from './components/Player/PlayerBar';
import { AudioController } from './components/Player/AudioController';
import { FluidBackground } from './components/Background/FluidBackground';
import { AppleLyricView } from './components/Lyrics/AppleLyricView';
import { LoginModal } from './components/Login/LoginModal';

import { ListenNowView } from './views/ListenNowView';
import { LocalMusicView } from './views/LocalMusicView';
import { PlaylistView } from './views/PlaylistView';
import { SettingsView } from './views/SettingsView';

import { usePlayerStore } from './store/playerStore';
import { neteaseApi } from './services/neteaseApi';
import { AlertCircle, Crown } from 'lucide-react';

export const App: React.FC = () => {
  const { currentSong, isFullLyricsMode, activeTab, setUser, setPlaylists, toastMessage, setToastMessage, togglePlayPause } = usePlayerStore();

  // Restore NetEase user session on startup if cookie exists
  useEffect(() => {
    const initSession = async () => {
      const account = await neteaseApi.getUserAccount();
      if (account) {
        setUser(account);
        const userPlaylists = await neteaseApi.getUserPlaylists(account.userId);
        setPlaylists(userPlaylists);
      }
    };
    initSession();
  }, []);

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

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden relative z-10">
        {/* Glassmorphic Sidebar */}
        <Sidebar />

        {/* Dynamic Views Container */}
        <main className="flex-1 h-[calc(100vh-3rem-5rem)] overflow-y-auto p-6 backdrop-blur-xs">
          {activeTab === 'listen-now' && <ListenNowView />}
          {activeTab === 'browse' && <ListenNowView />}
          {activeTab === 'local' && <LocalMusicView />}
          {activeTab === 'playlist' && <PlaylistView />}
          {activeTab === 'settings' && <SettingsView />}
        </main>
      </div>

      {/* Fullscreen Apple Music Lyric Mode */}
      <AppleLyricView />

      {/* Bottom Floating Control Bar */}
      <PlayerBar />

      {/* NetEase QR Code Login Modal */}
      <LoginModal />

      {/* Global VIP / Alert Toast Notification */}
      {toastMessage && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-[100] animate-fadeIn">
          <div className="px-6 py-3 rounded-2xl bg-black/90 backdrop-blur-2xl border border-amber-500/40 text-white shadow-[0_10px_35px_rgba(255,191,0,0.35)] flex items-center space-x-3 text-sm font-bold">
            {toastMessage.includes('VIP') ? (
              <Crown className="w-5 h-5 text-amber-400 shrink-0 animate-bounce" />
            ) : (
              <AlertCircle className="w-5 h-5 text-apple-red shrink-0" />
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
