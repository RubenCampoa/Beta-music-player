import React from 'react';
import { PlayCircle, Compass, HardDrive, ListMusic, Heart, Settings, Info, AlertTriangle, History } from 'lucide-react';
import { usePlayerStore } from '../../store/playerStore';
import { shallow } from 'zustand/shallow';
import { APP_VERSION } from '../../utils/version';
import { getPlatformName } from '../../utils/platform';

export const Sidebar: React.FC = () => {
  const { activeTab, setActiveTab, playlists, setSelectedPlaylist, selectedPlaylist, activePlatform } = usePlayerStore(
    (state) => ({
      activeTab: state.activeTab,
      setActiveTab: state.setActiveTab,
      playlists: state.playlists,
      setSelectedPlaylist: state.setSelectedPlaylist,
      selectedPlaylist: state.selectedPlaylist,
      activePlatform: state.activePlatform,
    }),
    shallow,
  );

  return (
    <aside className="app-sidebar h-[calc(100vh-3rem-5rem)] glass-sidebar flex flex-col justify-between p-3 select-none text-sm z-20">
      <div className="space-y-6">
        {/* Main Navigation */}
        <div className="space-y-1">
          <div className="nav-section-label px-3 text-xs font-semibold uppercase tracking-wider mb-2">
            推荐
          </div>
          <button
            onClick={() => setActiveTab('listen-now')}
            className={`nav-item w-full flex items-center space-x-3 px-3 py-2 rounded-lg font-medium transition-all ${
              activeTab === 'listen-now' ? 'nav-item-active' : ''
            }`}
          >
            <PlayCircle className="w-4 h-4" />
            <span>现在就听</span>
          </button>
          <button
            onClick={() => setActiveTab('browse')}
            className={`nav-item w-full flex items-center space-x-3 px-3 py-2 rounded-lg font-medium transition-all ${
              activeTab === 'browse' ? 'nav-item-active' : ''
            }`}
          >
            <Compass className="w-4 h-4" />
            <span>浏览</span>
          </button>
        </div>

        {/* Music Library */}
        <div className="space-y-1">
          <div className="nav-section-label px-3 text-xs font-semibold uppercase tracking-wider mb-2">
            资料库
          </div>
          <button
            onClick={() => setActiveTab('local')}
            className={`nav-item w-full flex items-center space-x-3 px-3 py-2 rounded-lg font-medium transition-all ${
              activeTab === 'local' ? 'nav-item-active' : ''
            }`}
          >
            <HardDrive className="w-4 h-4" />
            <span>本地音乐</span>
          </button>
        </div>

        {/* User Playlists */}
        <div className="space-y-1">
          <div className="nav-section-label px-3 text-xs font-semibold uppercase tracking-wider mb-2 flex items-center justify-between">
            <span>{getPlatformName(activePlatform)}歌单</span>
            <ListMusic className="w-3.5 h-3.5 opacity-60" />
          </div>

          <div className="playlist-list space-y-0.5 max-h-56 overflow-y-auto pr-1">
            {playlists.length === 0 ? (
              <div className="px-3 py-2 text-xs text-[#a3aab5] italic">
                登录{getPlatformName(activePlatform, true)}同步歌单
              </div>
            ) : (
              playlists.map((pl) => (
                <button
                  key={pl.id}
                  onClick={() => setSelectedPlaylist(pl)}
                  className={`w-full flex items-center space-x-2.5 px-3 py-1.5 rounded-lg text-xs transition-all text-left truncate ${
                    selectedPlaylist?.id === pl.id
                      ? 'bg-white/85 text-[#1f2937] font-medium shadow-sm'
                      : 'text-[#7b8493] hover:bg-white/60 hover:text-[#1f2937]'
                  }`}
                >
                  {pl.name.includes('我喜欢') ? (
                    <Heart className="w-3.5 h-3.5 text-apple-red shrink-0" />
                  ) : (
                    <ListMusic className="w-3.5 h-3.5 shrink-0 opacity-70" />
                  )}
                  <span className="truncate">{pl.name}</span>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Settings, Notice, Changelog & About */}
        <div className="space-y-1 pt-2 border-t border-black/10">
          <button
            onClick={() => setActiveTab('settings')}
            className={`nav-item w-full flex items-center space-x-3 px-3 py-2 rounded-lg font-medium transition-all ${
              activeTab === 'settings' ? 'nav-item-active' : ''
            }`}
          >
            <Settings className="w-4 h-4" />
            <span>设置</span>
          </button>
          <button
            onClick={() => setActiveTab('notice')}
            className={`nav-item w-full flex items-center space-x-3 px-3 py-2 rounded-lg font-medium transition-all ${
              activeTab === 'notice' ? 'nav-item-active' : ''
            }`}
          >
            <AlertTriangle className="w-4 h-4" />
            <span>注意事项</span>
          </button>
          <button
            onClick={() => setActiveTab('changelog')}
            className={`nav-item w-full flex items-center space-x-3 px-3 py-2 rounded-lg font-medium transition-all ${
              activeTab === 'changelog' ? 'nav-item-active' : ''
            }`}
          >
            <History className="w-4 h-4" />
            <span>更新日志</span>
          </button>
          <button
            onClick={() => setActiveTab('about')}
            className={`nav-item w-full flex items-center space-x-3 px-3 py-2 rounded-lg font-medium transition-all ${
              activeTab === 'about' ? 'nav-item-active' : ''
            }`}
          >
            <Info className="w-4 h-4" />
            <span>关于</span>
          </button>
        </div>
      </div>

      {/* Footer Info */}
      <div className="sidebar-footer-label px-3 py-2 border-t border-black/10 text-[11px] text-[#929aa7] flex items-center justify-between">
        <span>Beta Music Player</span>
        <span className="bg-white/75 text-[#7d8795] px-1.5 py-0.5 rounded text-[9px]">{APP_VERSION}</span>
      </div>
    </aside>
  );
};
