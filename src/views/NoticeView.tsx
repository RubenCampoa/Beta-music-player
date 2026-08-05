import React from 'react';
import { AlertTriangle, Github, Cpu, ExternalLink, ShieldAlert, Sparkles, Sun } from 'lucide-react';
import { usePlayerStore } from '../store/playerStore';

export const NoticeView: React.FC = () => {
  const { setActiveTab } = usePlayerStore();

  const openExternal = (url: string) => {
    window.open(url, '_blank');
  };

  return (
    <div className="flex-1 overflow-y-auto p-8 space-y-8 max-w-4xl mx-auto select-none pb-32 animate-fadeIn">
      {/* Header Banner */}
      <div className="flex items-center justify-between border-b border-white/10 pb-4">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">注意事项</h1>
          <p className="text-sm text-white/50 mt-1">请阅读以下使用须知、性能提示与反馈通道</p>
        </div>
        <div className="px-3 py-1 bg-amber-500/10 text-amber-400 rounded-full border border-amber-500/20 text-xs font-semibold flex items-center space-x-1.5">
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>使用须知</span>
        </div>
      </div>

      {/* 1. Issue Feedback Card */}
      <section className="glass-panel p-6 rounded-2xl space-y-4 border border-white/10 shadow-xl">
        <div className="flex items-center space-x-2 text-apple-red font-bold text-lg">
          <Github className="w-5 h-5" />
          <span className="text-white">问题反馈与 Bug 提交</span>
        </div>

        <div className="flex items-center justify-between p-5 bg-white/5 rounded-xl border border-white/10">
          <div className="space-y-1 max-w-xl">
            <h4 className="text-base font-bold text-white">优先前往 GitHub 提交 Issue</h4>
            <p className="text-xs text-white/60 leading-relaxed">
              若在播放、歌词显示或扫码登录过程中遇到任何问题或异常，请优先到 GitHub 仓库提交 Issue，作者看到后会第一时间跟进与修复。
            </p>
          </div>

          <button
            onClick={() => openExternal('https://github.com/RubenCampoa/Beta-music-player/issues')}
            className="px-4 py-2.5 rounded-xl bg-apple-red hover:bg-apple-pink text-white font-semibold text-xs transition-all flex items-center space-x-2 shadow-[0_0_20px_rgba(255,45,85,0.3)] shrink-0"
          >
            <Github className="w-4 h-4" />
            <span>提交 GitHub Issue</span>
            <ExternalLink className="w-3 h-3" />
          </button>
        </div>
      </section>

      {/* 2. AI Assistance Statement */}
      <section className="glass-panel p-6 rounded-2xl space-y-4 border border-white/10 shadow-xl">
        <div className="flex items-center space-x-2 text-purple-400 font-bold text-lg">
          <Sparkles className="w-5 h-5" />
          <span className="text-white">AI 辅助编写声明</span>
        </div>

        <div className="p-5 bg-white/5 rounded-xl border border-white/10 space-y-2">
          <div className="flex items-center space-x-2">
            <Cpu className="w-4 h-4 text-purple-400" />
            <h4 className="text-sm font-bold text-white">AI 辅助开发</h4>
          </div>
          <p className="text-xs text-white/60 leading-relaxed">
            本项目在开发过程中使用了 <strong>AI 辅助开发</strong>，协助完成前端架构、流体色彩算法、歌词渲染与性能优化等功能。
          </p>
        </div>
      </section>

      {/* 3. Performance Optimization Tip */}
      <section className="glass-panel p-6 rounded-2xl space-y-4 border border-white/10 shadow-xl">
        <div className="flex items-center space-x-2 text-amber-400 font-bold text-lg">
          <Sun className="w-5 h-5" />
          <span className="text-white">性能与卡顿优化建议</span>
        </div>

        <div className="flex items-center justify-between p-5 bg-white/5 rounded-xl border border-amber-500/20">
          <div className="space-y-1 max-w-xl">
            <h4 className="text-base font-bold text-white flex items-center space-x-2">
              <ShieldAlert className="w-4 h-4 text-amber-400" />
              <span>中低配设备优先关闭“动态流体光斑背景”</span>
            </h4>
            <p className="text-xs text-white/60 leading-relaxed">
              如果感觉软件运行或歌词滑动时存在卡顿，请在「设置」中优先关闭 <strong>“Apple Music 动态流体光斑背景”</strong>，即可大幅降低显卡 GPU 渲染开销并恢复极速流畅体验。
            </p>
          </div>

          <button
            onClick={() => setActiveTab('settings')}
            className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-medium text-xs transition-all border border-white/10 shrink-0"
          >
            前往「设置」调整
          </button>
        </div>
      </section>
    </div>
  );
};
