import React, { useState } from 'react';
import { Search, User, LogOut, Music2, Minimize2, Maximize2, X } from 'lucide-react';
import { usePlayerStore } from '../../store/playerStore';
import { neteaseApi } from '../../services/neteaseApi';

export const TitleBar: React.FC = () => {
  const { user, setUser, setIsLoginModalOpen, setPlaylists } = usePlayerStore();
  const [searchQuery, setSearchQuery] = useState('');

  const handleMinimize = () => window.electronAPI?.minimize();
  const handleMaximize = () => window.electronAPI?.maximize();
  const handleClose = () => window.electronAPI?.close();

  const handleLogout = () => {
    neteaseApi.clearCookie();
    setUser(null);
    setPlaylists([]);
  };

  return (
    <header className="h-12 w-full drag-region glass-panel flex items-center justify-between px-4 z-40 border-b border-white/10 select-none">
      {/* Apple Traffic Lights Window Controls */}
      <div className="flex items-center space-x-2 no-drag">
        <button
          onClick={handleClose}
          className="w-3.5 h-3.5 rounded-full bg-[#ff5f56] hover:bg-[#ff5f56]/80 flex items-center justify-center group transition-colors"
          title="关闭"
        >
          <X className="w-2.5 h-2.5 text-black opacity-0 group-hover:opacity-100 transition-opacity" />
        </button>
        <button
          onClick={handleMinimize}
          className="w-3.5 h-3.5 rounded-full bg-[#ffbd2e] hover:bg-[#ffbd2e]/80 flex items-center justify-center group transition-colors"
          title="最小化"
        >
          <Minimize2 className="w-2.5 h-2.5 text-black opacity-0 group-hover:opacity-100 transition-opacity" />
        </button>
        <button
          onClick={handleMaximize}
          className="w-3.5 h-3.5 rounded-full bg-[#27c93f] hover:bg-[#27c93f]/80 flex items-center justify-center group transition-colors"
          title="最大化"
        >
          <Maximize2 className="w-2.5 h-2.5 text-black opacity-0 group-hover:opacity-100 transition-opacity" />
        </button>
      </div>

      {/* Brand & Search Center */}
      <div className="flex items-center space-x-4 no-drag max-w-md w-full">
        <div className="flex items-center space-x-2 text-white/90 font-semibold tracking-wide font-sans text-sm whitespace-nowrap shrink-0">
          <Music2 className="w-4 h-4 text-apple-red shrink-0" />
          <span className="whitespace-nowrap">Beta Music Player</span>
        </div>

        <div className="relative w-full">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
          <input
            type="text"
            placeholder="搜索歌曲、歌手或专辑..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-full py-1 pl-8 pr-4 text-xs text-white placeholder-white/40 focus:outline-none focus:border-apple-red/60 focus:bg-white/10 transition-all"
          />
        </div>
      </div>

      {/* User Login & Account Badge */}
      <div className="no-drag flex items-center space-x-3">
        {user && user.isLoggedIn ? (
          <div className="flex items-center space-x-2 bg-white/5 border border-white/10 px-2.5 py-1 rounded-full">
            <img
              src={user.avatarUrl}
              alt={user.nickname}
              className="w-5 h-5 rounded-full object-cover border border-white/20"
            />
            <span className="text-xs text-white/90 font-medium max-w-[100px] truncate">
              {user.nickname}
            </span>
            <button
              onClick={handleLogout}
              className="text-white/40 hover:text-apple-red transition-colors ml-1"
              title="退出登录"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setIsLoginModalOpen(true)}
            className="flex items-center space-x-1.5 bg-apple-red/90 hover:bg-apple-red text-white text-xs px-3 py-1 rounded-full font-medium transition-all shadow-sm hover:shadow-apple-red/30"
          >
            <User className="w-3.5 h-3.5" />
            <span>网易云登录</span>
          </button>
        )}
      </div>
    </header>
  );
};
