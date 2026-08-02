import React from 'react';
import { PlayCircle, Compass, HardDrive, ListMusic, Heart, Settings, Info, AlertTriangle, History } from 'lucide-react';
import { usePlayerStore } from '../../store/playerStore';

export const Sidebar: React.FC = () => {
  const { activeTab, setActiveTab, playlists, setSelectedPlaylist, selectedPlaylist } = usePlayerStore();

  return (
    <aside className="w-56 h-[calc(100vh-3rem-5rem)] glass-sidebar flex flex-col justify-between p-3 select-none text-sm z-20">
      <div className="space-y-6">
        {/* Apple Music Main Navigation */}
        <div className="space-y-1">
          <div className="px-3 text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">
            推荐
          </div>
          <button
            onClick={() => setActiveTab('listen-now')}
            className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg font-medium transition-all ${
              activeTab === 'listen-now'
                ? 'bg-apple-red text-white shadow-lg shadow-apple-red/20'
                : 'text-white/70 hover:bg-white/5 hover:text-white'
            }`}
          >
            <PlayCircle className="w-4 h-4" />
            <span>现在就听</span>
          </button>
          <button
            onClick={() => setActiveTab('browse')}
            className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg font-medium transition-all ${
              activeTab === 'browse'
                ? 'bg-apple-red text-white shadow-lg shadow-apple-red/20'
                : 'text-white/70 hover:bg-white/5 hover:text-white'
            }`}
          >
            <Compass className="w-4 h-4" />
            <span>浏览</span>
          </button>
        </div>

        {/* Music Library */}
        <div className="space-y-1">
          <div className="px-3 text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">
            资料库
          </div>
          <button
            onClick={() => setActiveTab('local')}
            className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg font-medium transition-all ${
              activeTab === 'local'
                ? 'bg-apple-red text-white shadow-lg shadow-apple-red/20'
                : 'text-white/70 hover:bg-white/5 hover:text-white'
            }`}
          >
            <HardDrive className="w-4 h-4" />
            <span>本地音乐</span>
          </button>
        </div>

        {/* NetEase Cloud Playlists */}
        <div className="space-y-1">
          <div className="px-3 text-xs font-semibold text-white/40 uppercase tracking-wider mb-2 flex items-center justify-between">
            <span>网易云歌单</span>
            <ListMusic className="w-3.5 h-3.5 opacity-60" />
          </div>

          <div className="space-y-0.5 max-h-56 overflow-y-auto pr-1">
            {playlists.length === 0 ? (
              <div className="px-3 py-2 text-xs text-white/30 italic">
                登录网易云同步歌单
              </div>
            ) : (
              playlists.map((pl) => (
                <button
                  key={pl.id}
                  onClick={() => setSelectedPlaylist(pl)}
                  className={`w-full flex items-center space-x-2.5 px-3 py-1.5 rounded-lg text-xs transition-all text-left truncate ${
                    selectedPlaylist?.id === pl.id
                      ? 'bg-white/15 text-white font-medium'
                      : 'text-white/60 hover:bg-white/5 hover:text-white'
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
        <div className="space-y-1 pt-2 border-t border-white/10">
          <button
            onClick={() => setActiveTab('settings')}
            className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg font-medium transition-all ${
              activeTab === 'settings'
                ? 'bg-apple-red text-white shadow-lg shadow-apple-red/20'
                : 'text-white/70 hover:bg-white/5 hover:text-white'
            }`}
          >
            <Settings className="w-4 h-4" />
            <span>设置</span>
          </button>
          <button
            onClick={() => setActiveTab('notice')}
            className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg font-medium transition-all ${
              activeTab === 'notice'
                ? 'bg-apple-red text-white shadow-lg shadow-apple-red/20'
                : 'text-white/70 hover:bg-white/5 hover:text-white'
            }`}
          >
            <AlertTriangle className="w-4 h-4" />
            <span>注意事项</span>
          </button>
          <button
            onClick={() => setActiveTab('changelog')}
            className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg font-medium transition-all ${
              activeTab === 'changelog'
                ? 'bg-apple-red text-white shadow-lg shadow-apple-red/20'
                : 'text-white/70 hover:bg-white/5 hover:text-white'
            }`}
          >
            <History className="w-4 h-4" />
            <span>更新日志</span>
          </button>
          <button
            onClick={() => setActiveTab('about')}
            className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg font-medium transition-all ${
              activeTab === 'about'
                ? 'bg-apple-red text-white shadow-lg shadow-apple-red/20'
                : 'text-white/70 hover:bg-white/5 hover:text-white'
            }`}
          >
            <Info className="w-4 h-4" />
            <span>关于</span>
          </button>
        </div>
      </div>

      {/* Footer Info */}
      <div className="px-3 py-2 border-t border-white/10 text-[11px] text-white/40 flex items-center justify-between">
        <span>Beta music player</span>
        <span className="bg-white/10 text-white/60 px-1.5 py-0.5 rounded text-[9px]">v1.0.5</span>
      </div>
    </aside>
  );
};

