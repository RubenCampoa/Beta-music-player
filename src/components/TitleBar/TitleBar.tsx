import React, { useState, useRef, useEffect } from 'react';
import { Search, User, LogOut, Music2, Minimize2, Maximize2, X, History, Clock, Trash2 } from 'lucide-react';
import { usePlayerStore } from '../../store/playerStore';
import { shallow } from 'zustand/shallow';
import { neteaseApi } from '../../services/neteaseApi';
import { qqMusicApi } from '../../services/qqMusicApi';

export const TitleBar: React.FC = () => {
  const {
    user,
    setUser,
    activePlatform,
    setActivePlatform,
    setLoginModalPlatform,
    isLoginModalOpen,
    setIsLoginModalOpen,
    setPlaylists,
    setAccount,
    performSearch,
    searchHistory,
    removeSearchHistoryItem,
    clearSearchHistory,
  } = usePlayerStore(
    (state) => ({
      user: state.user,
      setUser: state.setUser,
      activePlatform: state.activePlatform,
      setActivePlatform: state.setActivePlatform,
      setLoginModalPlatform: state.setLoginModalPlatform,
      isLoginModalOpen: state.isLoginModalOpen,
      setIsLoginModalOpen: state.setIsLoginModalOpen,
      setPlaylists: state.setPlaylists,
      setAccount: state.setAccount,
      performSearch: state.performSearch,
      searchHistory: state.searchHistory,
      removeSearchHistoryItem: state.removeSearchHistoryItem,
      clearSearchHistory: state.clearSearchHistory,
    }),
    shallow,
  );

  const [searchQuery, setSearchQuery] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const handleMinimize = () => window.electronAPI?.minimize();
  const handleMaximize = () => window.electronAPI?.maximize();
  const handleClose = () => window.electronAPI?.close();

  const handleLogout = () => {
    if (activePlatform === 'qq') {
      qqMusicApi.clearCookie();
    } else {
      neteaseApi.clearCookie();
    }
    setAccount(activePlatform, null);
    setUser(null);
    setPlaylists([]);
  };

  const triggerSearch = (query: string) => {
    const trimmed = query.trim();
    if (trimmed) {
      setSearchQuery(trimmed);
      performSearch(trimmed);
      setShowHistory(false);
    }
  };

  const editHistoryItem = (item: string) => {
    setSearchQuery(item);
    setShowHistory(true);
    requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      triggerSearch(searchQuery);
    } else if (e.key === 'Escape') {
      setShowHistory(false);
    }
  };

  // Click outside to hide history dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowHistory(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header
      className={`app-titlebar relative z-[100] h-14 w-full drag-region flex items-center justify-between px-5 select-none overflow-visible transition-all duration-300 ${
        isLoginModalOpen ? 'bg-transparent border-b-0 shadow-none' : 'glass-panel border-b border-black/10'
      }`}
    >
      {/* Apple Traffic Lights Window Controls (Always Visible) */}
      <div className="flex items-center space-x-2 no-drag shrink-0">
        <button
          onClick={handleClose}
          className="titlebar-control titlebar-close w-3.5 h-3.5 rounded-full flex items-center justify-center group transition-colors"
          title="关闭"
        >
          <X className="w-2.5 h-2.5 text-black opacity-0 group-hover:opacity-100 transition-opacity" />
        </button>
        <button
          onClick={handleMinimize}
          className="titlebar-control titlebar-minimize w-3.5 h-3.5 rounded-full flex items-center justify-center group transition-colors"
          title="最小化"
        >
          <Minimize2 className="w-2.5 h-2.5 text-black opacity-0 group-hover:opacity-100 transition-opacity" />
        </button>
        <button
          onClick={handleMaximize}
          className="titlebar-control titlebar-maximize w-3.5 h-3.5 rounded-full flex items-center justify-center group transition-colors"
          title="最大化"
        >
          <Maximize2 className="w-2.5 h-2.5 text-black opacity-0 group-hover:opacity-100 transition-opacity" />
        </button>
      </div>

      {/* Brand & Search Center (Hidden during immersive Login Modal) */}
      {!isLoginModalOpen && (
        <div className="relative z-[110] flex items-center space-x-5 no-drag max-w-2xl w-full mx-8">
          <div className="flex items-center space-x-2 text-[#253044] font-semibold tracking-wide font-sans text-sm whitespace-nowrap shrink-0">
            <span className="brand-mark">
              <Music2 className="w-3.5 h-3.5" />
            </span>
            <span className="whitespace-nowrap">Beta Music Player</span>
          </div>

          {/* Search Container & History Dropdown */}
          <div ref={containerRef} className="search-box relative z-[120] w-full no-drag">
            <Search
              onClick={() => triggerSearch(searchQuery)}
              className="no-drag w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#9aa3b1] hover:text-[#253044] cursor-pointer transition-colors z-10"
            />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="搜索歌曲、歌手或专辑 (按回车搜索)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setShowHistory(true)}
              onKeyDown={handleKeyDown}
              className="no-drag w-full bg-white/72 border border-black/8 rounded-full py-2 pl-8 pr-4 text-xs text-[#253044] placeholder-[#a1a8b4] focus:outline-none focus:border-[#9caac0] focus:bg-white transition-all shadow-sm"
            />

            {/* Search History Dropdown */}
            {showHistory && searchHistory.length > 0 && (
              <div
                className="search-history-popover no-drag pointer-events-auto absolute left-0 right-0 top-full mt-2 bg-white border border-black/10 rounded-2xl shadow-2xl overflow-hidden z-[200] p-3 space-y-2 animate-fadeIn"
                onPointerDown={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between px-1 text-xs text-[#7c8797] font-semibold">
                  <div className="flex items-center space-x-1.5">
                    <History className="w-3.5 h-3.5 text-apple-red" />
                    <span>搜索历史</span>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      clearSearchHistory();
                    }}
                    className="flex items-center space-x-1 hover:text-red-400 text-[11px] font-medium transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>清空</span>
                  </button>
                </div>

                <div className="no-drag pointer-events-auto flex flex-wrap gap-1.5 max-h-40 overflow-y-auto pt-1">
                  {searchHistory.map((item, idx) => (
                    <div
                      key={`${item}-${idx}`}
                      onClick={() => editHistoryItem(item)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          editHistoryItem(item);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      className="search-history-item no-drag pointer-events-auto flex items-center space-x-1.5 px-3 py-1 bg-[#f4f5f7] hover:bg-[#e9edf3] focus:bg-[#e9edf3] rounded-full text-xs text-[#536074] hover:text-[#202b3c] cursor-pointer transition-all border border-black/5 group outline-none"
                      title="点击回填到搜索框后继续编辑"
                    >
                      <Clock className="w-3 h-3 text-[#a1a8b4] group-hover:text-apple-red shrink-0" />
                      <span className="truncate max-w-[120px]">{item}</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeSearchHistoryItem(item);
                        }}
                        className="text-black/25 hover:text-red-400 p-0.5 rounded-full transition-colors ml-0.5"
                        title="删除该条记录"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* User Login & Account Badge (Hidden during immersive Login Modal) */}
      {!isLoginModalOpen && (
        <div className="no-drag flex items-center space-x-2 shrink-0">
          {/* Quick Platform Switcher Pill */}
          <button
            onClick={() => setActivePlatform(activePlatform === 'netease' ? 'qq' : 'netease')}
            className={`flex items-center space-x-1 px-2.5 py-1 rounded-full text-[11px] font-bold border transition-all cursor-pointer shadow-sm ${
              activePlatform === 'qq'
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
            }`}
            title="点击一键切换音乐源平台 (网易云音乐 / QQ 音乐)"
          >
            <div className={`w-2 h-2 rounded-full ${activePlatform === 'qq' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
            <span>{activePlatform === 'qq' ? 'QQ 音乐' : '网易云'}</span>
          </button>

          {user && user.isLoggedIn ? (
            <div className="flex items-center space-x-2 bg-white/72 border border-black/8 px-2.5 py-1.5 rounded-full shadow-sm">
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.nickname}
                  className="w-5 h-5 rounded-full object-cover border border-black/10"
                />
              ) : (
                <User className="w-4 h-4 text-[#39465a]" />
              )}
              <span className="text-xs text-[#39465a] font-medium max-w-[100px] truncate">
                {user.nickname}
              </span>
              <button
                onClick={handleLogout}
                className="text-[#a1a8b4] hover:text-apple-red transition-colors ml-1"
                title="退出当前平台登录"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                setLoginModalPlatform(activePlatform);
                setIsLoginModalOpen(true);
              }}
              className="flex items-center space-x-1.5 bg-[#202837] hover:bg-[#111827] text-white text-xs px-3 py-1.5 rounded-full font-medium transition-all shadow-sm cursor-pointer"
            >
              <User className="w-3.5 h-3.5" />
              <span>登录{activePlatform === 'qq' ? 'QQ音乐' : '网易云'}</span>
            </button>
          )}
        </div>
      )}
    </header>
  );
};
