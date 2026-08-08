import React, { useState } from 'react';
import {
  User,
  Volume2,
  Sparkles,
  Database,
  Trash2,
  CheckCircle2,
  ShieldCheck,
  Crown,
  LogOut,
  LogIn,
  Info,
  Eye,
  Activity,
  Sun,
  Layers,
  Settings,
} from 'lucide-react';
import { usePlayerStore } from '../store/playerStore';
import { APP_VERSION, checkForUpdate } from '../utils/version';
import { neteaseApi } from '../services/neteaseApi';
import { qqMusicApi } from '../services/qqMusicApi';
import { localMusicService } from '../services/localMusicService';

export const SettingsView: React.FC = () => {
  const {
    activePlatform,
    accounts,
    switchAccountPlatform,
    setAccount,
    setLoginModalPlatform,
    setIsLoginModalOpen,
    setToastMessage,
    isFluidBgEnabled,
    setIsFluidBgEnabled,
    enableLyricAnimation,
    setEnableLyricAnimation,
    enableLyricGlow,
    setEnableLyricGlow,
    enableLyricBlur,
    setEnableLyricBlur,
    enableArtworkAnimation,
    setEnableArtworkAnimation,
    lyricFontSize,
    setLyricFontSize,
    autoCheckUpdate,
    setAutoCheckUpdate,
  } = usePlayerStore();

  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [audioQuality, setAudioQuality] = useState<'standard' | 'high' | 'lossless'>('high');

  const handleClearCache = async () => {
    try {
      const allLocal = await localMusicService.getAllLocalSongs();
      for (const song of allLocal) {
        await localMusicService.removeLocalSong(song.id);
      }
      setToastMessage('本地歌曲与音频缓存已全部清除');
    } catch {
      setToastMessage('清除缓存失败');
    }
  };

  const handleCheckUpdate = async () => {
    setToastMessage('正在从 GitHub 检查最新版本...');
    setIsCheckingUpdate(true);
    try {
      const result = await checkForUpdate();
      switch (result.status) {
        case 'ok':
          if (result.isNewer) {
            setToastMessage(`发现新版本 ${result.latestTag}！可在设置中点击检查更新进行查看与升级`);
            window.open(result.htmlUrl, '_blank');
          } else {
            setToastMessage(`当前已经是最新版本 (${APP_VERSION})`);
          }
          break;
        case 'rate-limited':
          setToastMessage('GitHub API 暂时限流（每小时 60 次限额），请稍后再试');
          break;
        case 'not-found':
          setToastMessage('未在 GitHub 找到发布信息，请稍后重试');
          break;
        default:
          setToastMessage('检查更新失败，请检查网络连接');
      }
    } catch {
      setToastMessage('检查更新失败，请检查网络连接');
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-8 space-y-8 max-w-4xl mx-auto select-none pb-32 animate-fadeIn">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-4">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight flex items-center space-x-3">
            <Settings className="w-8 h-8 text-apple-red" />
            <span>系统设置</span>
          </h1>
          <p className="text-sm text-white/50 mt-1">偏好设置、多平台账号管理与音质效能控制</p>
        </div>
        <div className="flex items-center space-x-3">
          <div className="px-3 py-1 bg-white/5 rounded-full border border-white/10 text-xs text-white/60 font-medium">
            Beta Music Player {APP_VERSION}
          </div>
          <button
            onClick={handleCheckUpdate}
            disabled={isCheckingUpdate}
            className="px-3 py-1 bg-apple-red/80 hover:bg-apple-red text-white rounded-full text-xs font-semibold shadow-sm transition-all flex items-center space-x-1 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>检查更新</span>
          </button>
        </div>
      </div>

      {/* 1. Multi-Platform Account Management */}
      <section className="glass-panel p-6 rounded-2xl space-y-4 border border-white/10 shadow-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 text-apple-red font-bold text-lg">
            <User className="w-5 h-5" />
            <span className="text-white">多平台账号管理与即时切换</span>
          </div>
          <span className="text-xs text-white/50">
            当前主平台：
            <strong className="text-white font-bold ms-1">
              {activePlatform === 'qq' ? '🟢 QQ 音乐' : '🔴 网易云音乐'}
            </strong>
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* NetEase Account Card */}
          <div
            className={`p-5 rounded-2xl border transition-all ${
              activePlatform === 'netease' ? 'bg-rose-500/10 border-rose-500/30' : 'bg-white/5 border-white/10'
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-2">
                <div className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                <span className="font-bold text-white text-sm">网易云音乐</span>
              </div>
              {activePlatform === 'netease' ? (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-rose-500 text-white">
                  当前主平台
                </span>
              ) : (
                <button
                  onClick={() => switchAccountPlatform('netease')}
                  className="text-xs font-semibold px-2.5 py-1 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all cursor-pointer"
                >
                  设为当前平台
                </button>
              )}
            </div>

            {accounts.netease && accounts.netease.isLoggedIn ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <img
                    src={accounts.netease.avatarUrl}
                    alt={accounts.netease.nickname}
                    className="w-10 h-10 rounded-full object-cover border border-white/20"
                  />
                  <div>
                    <h4 className="text-sm font-bold text-white">{accounts.netease.nickname}</h4>
                    <span className="text-[11px] text-white/60">黑胶 VIP 会员在期</span>
                  </div>
                </div>
                <button
                  onClick={() => {
                    neteaseApi.clearCookie();
                    setAccount('netease', null);
                    setToastMessage('已退出网易云账号');
                  }}
                  className="text-xs text-white/60 hover:text-rose-400 transition-colors p-2"
                  title="退出网易云账号"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-white/50">未绑定网易云账号</span>
                <button
                  onClick={() => {
                    setLoginModalPlatform('netease');
                    setIsLoginModalOpen(true);
                  }}
                  className="px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-all shadow-md cursor-pointer"
                >
                  登录网易云
                </button>
              </div>
            )}
          </div>

          {/* QQ Music Account Card */}
          <div
            className={`p-5 rounded-2xl border transition-all ${
              activePlatform === 'qq' ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-white/5 border-white/10'
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-2">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <span className="font-bold text-white text-sm">QQ 音乐</span>
              </div>
              {activePlatform === 'qq' ? (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500 text-white">
                  当前主平台
                </span>
              ) : (
                <button
                  onClick={() => switchAccountPlatform('qq')}
                  className="text-xs font-semibold px-2.5 py-1 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all cursor-pointer"
                >
                  设为当前平台
                </button>
              )}
            </div>

            {accounts.qq && accounts.qq.isLoggedIn ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  {accounts.qq.avatarUrl ? (
                    <img
                      src={accounts.qq.avatarUrl}
                      alt={accounts.qq.nickname}
                      className="w-10 h-10 rounded-full object-cover border border-white/20"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-xs">
                      QQ
                    </div>
                  )}
                  <div>
                    <h4 className="text-sm font-bold text-white">{accounts.qq.nickname}</h4>
                    <span className="text-[11px] text-white/60">
                      {accounts.qq.vipType && accounts.qq.vipType > 0 ? '绿钻豪华会员' : '普通用户'}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => {
                    qqMusicApi.clearCookie();
                    setAccount('qq', null);
                    setToastMessage('已退出 QQ 音乐账号');
                  }}
                  className="text-xs text-white/60 hover:text-emerald-400 transition-colors p-2"
                  title="退出 QQ 音乐账号"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-white/50">未绑定 QQ 音乐账号</span>
                <button
                  onClick={() => {
                    setLoginModalPlatform('qq');
                    setIsLoginModalOpen(true);
                  }}
                  className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-md cursor-pointer"
                >
                  登录 QQ 音乐
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 2. Motion & Visual Controls Section */}
      <section className="glass-panel p-6 rounded-2xl space-y-4 border border-white/10 shadow-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 text-apple-red font-bold text-lg">
            <Sparkles className="w-5 h-5" />
            <span className="text-white">视觉与全套动效控制</span>
          </div>
          <span className="text-xs text-white/40">可独立开关特效以匹配设备性能</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/10">
            <div>
              <h4 className="text-sm font-semibold text-white">全景流体模糊背景</h4>
              <p className="text-xs text-white/50">根据专辑封面色调平滑生成流体扩散背景</p>
            </div>
            <input
              type="checkbox"
              checked={isFluidBgEnabled}
              onChange={(e) => setIsFluidBgEnabled(e.target.checked)}
              className="accent-apple-red w-5 h-5 cursor-pointer"
            />
          </div>

          <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/10">
            <div>
              <h4 className="text-sm font-semibold text-white">Apple 歌词弹性随动</h4>
              <p className="text-xs text-white/50">歌词切换时触发果冻弹跳缩放</p>
            </div>
            <input
              type="checkbox"
              checked={enableLyricAnimation}
              onChange={(e) => setEnableLyricAnimation(e.target.checked)}
              className="accent-apple-red w-5 h-5 cursor-pointer"
            />
          </div>

          <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/10">
            <div>
              <h4 className="text-sm font-semibold text-white">歌词高光漫反射发光</h4>
              <p className="text-xs text-white/50">当前高亮歌词背景带有弥散白光发光效果</p>
            </div>
            <input
              type="checkbox"
              checked={enableLyricGlow}
              onChange={(e) => setEnableLyricGlow(e.target.checked)}
              className="accent-apple-red w-5 h-5 cursor-pointer"
            />
          </div>

          <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/10">
            <div>
              <h4 className="text-sm font-semibold text-white">上下文虚化渐变</h4>
              <p className="text-xs text-white/50">非焦点歌词渐进式虚化与淡出</p>
            </div>
            <input
              type="checkbox"
              checked={enableLyricBlur}
              onChange={(e) => setEnableLyricBlur(e.target.checked)}
              className="accent-apple-red w-5 h-5 cursor-pointer"
            />
          </div>
        </div>
      </section>

      {/* 3. Audio & System Maintenance */}
      <section className="glass-panel p-6 rounded-2xl space-y-4 border border-white/10 shadow-xl">
        <div className="flex items-center space-x-2 text-apple-red font-bold text-lg">
          <Database className="w-5 h-5" />
          <span className="text-white">缓存与存储管理</span>
        </div>

        <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/10">
          <div>
            <h4 className="text-sm font-semibold text-white">清除本地缓存与索引</h4>
            <p className="text-xs text-white/50">清理 IndexedDB 中的音频元数据与临时歌词缓存</p>
          </div>
          <button
            onClick={handleClearCache}
            className="px-4 py-2 rounded-xl bg-white/10 hover:bg-red-500/20 text-white hover:text-red-400 text-xs font-semibold border border-white/10 transition-all flex items-center space-x-1.5 cursor-pointer"
          >
            <Trash2 className="w-4 h-4" />
            <span>清除缓存</span>
          </button>
        </div>
      </section>
    </div>
  );
};
