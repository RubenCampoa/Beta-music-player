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
} from 'lucide-react';
import { usePlayerStore } from '../store/playerStore';
import { neteaseApi } from '../services/neteaseApi';
import { localMusicService } from '../services/localMusicService';

export const SettingsView: React.FC = () => {
  const {
    user,
    setUser,
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

  const [audioQuality, setAudioQuality] = useState<'standard' | 'high' | 'lossless'>('high');

  const handleLogout = () => {
    neteaseApi.clearCookie();
    setUser(null);
    setToastMessage('已退出网易云账号');
  };

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

  const isVip = user && user.isLoggedIn && (user.vipType ?? 0) > 0;

  const handleCheckUpdate = async () => {
    setToastMessage('正在从 GitHub 检查最新版本...');
    try {
      const res = await fetch('https://api.github.com/repos/RubenCampoa/Beta-music-player/releases/latest');
      if (!res.ok) {
        throw new Error('未获取到 Release 版本信息');
      }
      const data = await res.json();
      const latestTag = data.tag_name || 'v1.0.3';
      const currentVersion = 'v1.0.3';

      if (latestTag !== currentVersion && latestTag !== '1.0.3') {
        setToastMessage(`发现新版本 ${latestTag}！正在为你打开 GitHub...`);
        if (data.html_url) {
          window.open(data.html_url, '_blank');
        }
      } else {
        setToastMessage(`当前已是最新版本 (v1.0.3)`);
      }
    } catch {
      setToastMessage('当前已是最新版本 (v1.0.3)');
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-8 space-y-8 max-w-4xl mx-auto select-none pb-32 animate-fadeIn">
      {/* Page Title */}
      <div className="flex items-center justify-between border-b border-white/10 pb-4">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">设置</h1>
          <p className="text-sm text-white/50 mt-1">管理你的播放器偏好、音质输出与全套动效开关</p>
        </div>
        <div className="flex items-center space-x-3">
          <div className="px-3 py-1 bg-white/5 rounded-full border border-white/10 text-xs text-white/60 font-medium">
            Beta Music Player v1.0.3
          </div>
          <button
            onClick={handleCheckUpdate}
            className="px-3 py-1 bg-apple-red/80 hover:bg-apple-red text-white rounded-full text-xs font-semibold shadow-sm transition-all flex items-center space-x-1"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>检查更新</span>
          </button>
        </div>
      </div>

      {/* 1. Account & VIP Status Section */}
      <section className="glass-panel p-6 rounded-2xl space-y-4 border border-white/10 shadow-xl">
        <div className="flex items-center space-x-2 text-apple-red font-bold text-lg">
          <User className="w-5 h-5" />
          <span className="text-white">账号与 VIP 权益</span>
        </div>

        {user && user.isLoggedIn ? (
          <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/10">
            <div className="flex items-center space-x-4">
              <img
                src={user.avatarUrl}
                alt={user.nickname}
                className="w-14 h-14 rounded-full object-cover border-2 border-white/20 shadow-md"
              />
              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  <h3 className="text-lg font-bold text-white">{user.nickname}</h3>
                  {isVip ? (
                    <span className="px-2 py-0.5 rounded-md bg-gradient-to-r from-amber-500 to-red-500 text-white text-xs font-black flex items-center space-x-1 shadow-sm">
                      <Crown className="w-3 h-3" />
                      <span>VIP 会员</span>
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-md bg-white/10 text-white/60 text-xs font-medium">
                      标准用户
                    </span>
                  )}
                </div>
                <p className="text-xs text-white/60">
                  {isVip
                    ? '网易云黑胶 VIP 会员在期，尊享无损音质与 VIP 歌曲畅听权益'
                    : '当前未开通网易云 VIP，播放 VIP 独家歌曲时将有提示'}
                </p>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="px-4 py-2 rounded-xl bg-white/10 hover:bg-red-500/20 hover:text-red-400 text-white/80 font-medium text-sm transition-all duration-300 flex items-center space-x-1.5 border border-white/10"
            >
              <LogOut className="w-4 h-4" />
              <span>退出登录</span>
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/10">
            <div className="flex items-center space-x-3 text-white/70">
              <ShieldCheck className="w-8 h-8 text-apple-red shrink-0" />
              <div>
                <h4 className="text-sm font-semibold text-white">未登录网易云账号</h4>
                <p className="text-xs text-white/50">登录后可同步你的个人歌单、VIP 权益及播放历史</p>
              </div>
            </div>
            <button
              onClick={() => setIsLoginModalOpen(true)}
              className="px-5 py-2.5 rounded-xl bg-apple-red hover:bg-apple-pink text-white font-semibold text-sm transition-all duration-300 flex items-center space-x-2 shadow-[0_0_20px_rgba(255,45,85,0.3)]"
            >
              <LogIn className="w-4 h-4" />
              <span>扫码登录</span>
            </button>
          </div>
        )}
      </section>

      {/* 2. Motion & Visual Controls Section */}
      <section className="glass-panel p-6 rounded-2xl space-y-4 border border-white/10 shadow-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 text-apple-red font-bold text-lg">
            <Sparkles className="w-5 h-5" />
            <span className="text-white">视觉与全套动效控制</span>
          </div>
          <span className="text-xs text-white/40">可独立开关任意特效以匹配设备性能</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Option 1: Fluid Mesh Background */}
          <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/10">
            <div className="flex items-start space-x-3">
              <Sun className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
              <div>
                <div className="text-sm font-semibold text-white">Apple Music 动态流体光斑背景</div>
                <div className="text-xs text-white/50 mt-0.5">提取封面色彩渲染 Canvas 流体渐变</div>
              </div>
            </div>
            <input
              type="checkbox"
              checked={isFluidBgEnabled}
              onChange={(e) => {
                setIsFluidBgEnabled(e.target.checked);
                setToastMessage(e.target.checked ? '已开启动态流体背景' : '已关闭动态流体背景');
              }}
              className="w-5 h-5 accent-apple-red rounded cursor-pointer shrink-0"
            />
          </div>

          {/* Option 2: Smooth Gliding Lyrics Animation */}
          <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/10">
            <div className="flex items-start space-x-3">
              <Activity className="w-5 h-5 text-cyan-400 mt-0.5 shrink-0" />
              <div>
                <div className="text-sm font-semibold text-white">歌词 60FPS 平滑缓升滑动</div>
                <div className="text-xs text-white/50 mt-0.5">全屏歌词行切换时的缓升过渡动画</div>
              </div>
            </div>
            <input
              type="checkbox"
              checked={enableLyricAnimation}
              onChange={(e) => {
                setEnableLyricAnimation(e.target.checked);
                setToastMessage(e.target.checked ? '已开启歌词平滑动效' : '已关闭歌词平滑动效');
              }}
              className="w-5 h-5 accent-apple-red rounded cursor-pointer shrink-0"
            />
          </div>

          {/* Option 3: Text Glow */}
          <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/10">
            <div className="flex items-start space-x-3">
              <Sparkles className="w-5 h-5 text-pink-400 mt-0.5 shrink-0" />
              <div>
                <div className="text-sm font-semibold text-white">高亮歌词霓虹发光晕影</div>
                <div className="text-xs text-white/50 mt-0.5">当前播放句文字外围的 360° 矢量灯光</div>
              </div>
            </div>
            <input
              type="checkbox"
              checked={enableLyricGlow}
              onChange={(e) => {
                setEnableLyricGlow(e.target.checked);
                setToastMessage(e.target.checked ? '已开启歌词发光晕影' : '已关闭歌词发光晕影');
              }}
              className="w-5 h-5 accent-apple-red rounded cursor-pointer shrink-0"
            />
          </div>

          {/* Option 4: Blur Depth of Field */}
          <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/10">
            <div className="flex items-start space-x-3">
              <Eye className="w-5 h-5 text-purple-400 mt-0.5 shrink-0" />
              <div>
                <div className="text-sm font-semibold text-white">非高亮歌词景深模糊</div>
                <div className="text-xs text-white/50 mt-0.5">未播放到的歌词施加柔和高斯模糊</div>
              </div>
            </div>
            <input
              type="checkbox"
              checked={enableLyricBlur}
              onChange={(e) => {
                setEnableLyricBlur(e.target.checked);
                setToastMessage(e.target.checked ? '已开启景深模糊' : '已关闭景深模糊');
              }}
              className="w-5 h-5 accent-apple-red rounded cursor-pointer shrink-0"
            />
          </div>

          {/* Option 5: Artwork Floating Physics */}
          <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/10">
            <div className="flex items-start space-x-3">
              <Layers className="w-5 h-5 text-emerald-400 mt-0.5 shrink-0" />
              <div>
                <div className="text-sm font-semibold text-white">专辑封面悬浮与过渡动效</div>
                <div className="text-xs text-white/50 mt-0.5">歌词模式下封面的展开与浮动动画</div>
              </div>
            </div>
            <input
              type="checkbox"
              checked={enableArtworkAnimation}
              onChange={(e) => {
                setEnableArtworkAnimation(e.target.checked);
                setToastMessage(e.target.checked ? '已开启封面悬浮动效' : '已关闭封面悬浮动效');
              }}
              className="w-5 h-5 accent-apple-red rounded cursor-pointer shrink-0"
            />
          </div>

          {/* Option 6: Auto Check Update on Launch */}
          <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/10">
            <div className="flex items-start space-x-3">
              <ShieldCheck className="w-5 h-5 text-emerald-400 mt-0.5 shrink-0" />
              <div>
                <div className="text-sm font-semibold text-white">启动时自动检查更新</div>
                <div className="text-xs text-white/50 mt-0.5">每次打开软件时自动检测 GitHub Release 最新版本</div>
              </div>
            </div>
            <input
              type="checkbox"
              checked={autoCheckUpdate}
              onChange={(e) => {
                setAutoCheckUpdate(e.target.checked);
                setToastMessage(e.target.checked ? '已开启启动自动检查更新' : '已关闭启动自动检查更新');
              }}
              className="w-5 h-5 accent-apple-red rounded cursor-pointer shrink-0"
            />
          </div>

          {/* Option 6: Lyric Font Size */}
          <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/10">
            <div>
              <div className="text-sm font-semibold text-white">歌词显示字号</div>
              <div className="text-xs text-white/50 mt-0.5">调整全屏歌词模式下的文字基础大小</div>
            </div>
            <div className="flex space-x-2">
              <button
                onClick={() => {
                  setLyricFontSize('normal');
                  setToastMessage('歌词字号已设为标准');
                }}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                  lyricFontSize === 'normal'
                    ? 'bg-apple-red text-white border-apple-red shadow-sm'
                    : 'bg-white/5 text-white/60 border-white/10 hover:bg-white/10'
                }`}
              >
                标准
              </button>
              <button
                onClick={() => {
                  setLyricFontSize('large');
                  setToastMessage('歌词字号已设为放大');
                }}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                  lyricFontSize === 'large'
                    ? 'bg-apple-red text-white border-apple-red shadow-sm'
                    : 'bg-white/5 text-white/60 border-white/10 hover:bg-white/10'
                }`}
              >
                放大
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Audio Output Quality */}
      <section className="glass-panel p-6 rounded-2xl space-y-4 border border-white/10 shadow-xl">
        <div className="flex items-center space-x-2 text-apple-red font-bold text-lg">
          <Volume2 className="w-5 h-5" />
          <span className="text-white">音频与音质</span>
        </div>

        <div className="space-y-3">
          <label className="text-xs text-white/60 font-semibold uppercase tracking-wider block">
            播放音质等级 (Audio Quality)
          </label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[
              { id: 'standard', name: '标准音质 (128kbps)', desc: '省流量，基础听感' },
              { id: 'high', name: '极高音质 (320kbps)', desc: '推荐，最佳均衡听感' },
              { id: 'lossless', name: '无损 Hi-Res (FLAC)', desc: '需网易云 VIP 账号支持' },
            ].map((q) => (
              <button
                key={q.id}
                onClick={() => setAudioQuality(q.id as any)}
                className={`p-4 rounded-xl text-left border transition-all duration-300 relative ${
                  audioQuality === q.id
                    ? 'bg-apple-red/20 border-apple-red text-white shadow-[0_0_15px_rgba(255,45,85,0.2)]'
                    : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'
                }`}
              >
                <div className="font-bold text-sm flex items-center justify-between">
                  <span>{q.name}</span>
                  {audioQuality === q.id && <CheckCircle2 className="w-4 h-4 text-apple-red" />}
                </div>
                <div className="text-xs text-white/50 mt-1">{q.desc}</div>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* 4. Local Storage & Cache */}
      <section className="glass-panel p-6 rounded-2xl space-y-4 border border-white/10 shadow-xl">
        <div className="flex items-center space-x-2 text-apple-red font-bold text-lg">
          <Database className="w-5 h-5" />
          <span className="text-white">本地存储与缓存</span>
        </div>

        <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/10">
          <div>
            <div className="text-sm font-semibold text-white">IndexedDB 音频数据库</div>
            <div className="text-xs text-white/50 mt-0.5">本地上传的音频二进制文件及 ID3 封面标签存储</div>
          </div>
          <button
            onClick={handleClearCache}
            className="px-4 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 font-semibold text-xs border border-red-500/20 transition-all flex items-center space-x-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>清空本地缓存</span>
          </button>
        </div>
      </section>

      {/* 5. About */}
      <section className="glass-panel p-6 rounded-2xl space-y-3 border border-white/10 shadow-xl">
        <div className="flex items-center space-x-2 text-apple-red font-bold text-lg">
          <Info className="w-5 h-5" />
          <span className="text-white">关于播放器</span>
        </div>
        <p className="text-xs text-white/60 leading-relaxed">
          本播放器基于 Electron + Vite + React + TypeScript 打造，完美复刻 Apple Music 视觉美学。集成 NeteaseCloudMusicApiEnhanced 增强版后端与 HTML5 Web Audio 音频引擎。
        </p>
      </section>
    </div>
  );
};
