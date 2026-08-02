import React from 'react';
import { Github, Heart, Sparkles, ExternalLink, Code2, Disc, Music, User } from 'lucide-react';

export const AboutView: React.FC = () => {
  const openExternal = (url: string) => {
    window.open(url, '_blank');
  };

  return (
    <div className="flex-1 overflow-y-auto p-8 space-y-8 max-w-4xl mx-auto select-none pb-32 animate-fadeIn">
      {/* Header Banner */}
      <div className="flex items-center justify-between border-b border-white/10 pb-4">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">关于</h1>
          <p className="text-sm text-white/50 mt-1">了解 Beta Music Player 的设计理念与开发者信息</p>
        </div>
        <div className="px-3 py-1 bg-white/5 rounded-full border border-white/10 text-xs text-white/60 font-medium flex items-center space-x-1.5">
          <Disc className="w-3.5 h-3.5 text-apple-red animate-spin" />
          <span>v1.0.5 正式版</span>
        </div>
      </div>

      {/* 1. Developer Info Card */}
      <section className="glass-panel p-6 rounded-2xl space-y-4 border border-white/10 shadow-xl">
        <div className="flex items-center space-x-2 text-apple-red font-bold text-lg">
          <User className="w-5 h-5" />
          <span className="text-white">开发者信息</span>
        </div>

        <div className="flex items-center justify-between p-5 bg-white/5 rounded-xl border border-white/10">
          <div className="flex items-center space-x-4">
            <div className="w-14 h-14 rounded-full bg-gradient-to-tr from-apple-red via-purple-600 to-pink-500 flex items-center justify-center text-white font-black text-xl shadow-lg border-2 border-white/20">
              R
            </div>
            <div className="space-y-1">
              <div className="flex items-center space-x-2">
                <h3 className="text-xl font-bold text-white tracking-tight">RubenCampoa</h3>
                <span className="px-2 py-0.5 rounded-full bg-apple-red/20 text-apple-red border border-apple-red/30 text-xs font-semibold">
                  项目作者
                </span>
              </div>
              <p className="text-xs text-white/60">
                喜欢 vibe coding，有创意的高中生 AI 开发者。
              </p>
            </div>
          </div>

          <button
            onClick={() => openExternal('https://github.com/RubenCampoa')}
            className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-medium text-xs transition-all flex items-center space-x-2 border border-white/10 shadow-sm"
          >
            <Github className="w-4 h-4" />
            <span>访问 GitHub 主页</span>
            <ExternalLink className="w-3 h-3 opacity-60" />
          </button>
        </div>
      </section>

      {/* 2. GitHub Repository Card */}
      <section className="glass-panel p-6 rounded-2xl space-y-4 border border-white/10 shadow-xl">
        <div className="flex items-center space-x-2 text-apple-red font-bold text-lg">
          <Github className="w-5 h-5" />
          <span className="text-white">开源仓库</span>
        </div>

        <div className="flex items-center justify-between p-5 bg-white/5 rounded-xl border border-white/10">
          <div className="space-y-1">
            <h4 className="text-base font-bold text-white flex items-center space-x-2">
              <span>RubenCampoa / Beta-music-player</span>
            </h4>
            <p className="text-xs text-white/60">
              项目代码完全开源，欢迎 Star、提交 Issue 或 Contributing 代码！
            </p>
          </div>

          <button
            onClick={() => openExternal('https://github.com/RubenCampoa/Beta-music-player')}
            className="px-4 py-2 rounded-xl bg-apple-red hover:bg-apple-pink text-white font-semibold text-xs transition-all flex items-center space-x-2 shadow-[0_0_20px_rgba(255,45,85,0.3)] shrink-0"
          >
            <Github className="w-4 h-4" />
            <span>项目 GitHub 仓库</span>
            <ExternalLink className="w-3 h-3" />
          </button>
        </div>
      </section>

      {/* 3. Project Introduction & Highlights */}
      <section className="glass-panel p-6 rounded-2xl space-y-4 border border-white/10 shadow-xl">
        <div className="flex items-center space-x-2 text-apple-red font-bold text-lg">
          <Sparkles className="w-5 h-5" />
          <span className="text-white">项目设计与特性</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-white/70">
          <div className="p-4 bg-white/5 rounded-xl border border-white/10 space-y-1.5">
            <div className="font-bold text-white text-sm flex items-center space-x-1.5">
              <Music className="w-4 h-4 text-apple-red" />
              <span>Apple Music 视觉风格</span>
            </div>
            <p className="leading-relaxed text-white/60">
              基于 Canvas 实时提取专辑封面主色调，渲染高帧率流体渐变光斑背景，搭配暗黑毛玻璃界面。
            </p>
          </div>

          <div className="p-4 bg-white/5 rounded-xl border border-white/10 space-y-1.5">
            <div className="font-bold text-white text-sm flex items-center space-x-1.5">
              <Code2 className="w-4 h-4 text-cyan-400" />
              <span>全景 60FPS 动效歌词</span>
            </div>
            <p className="leading-relaxed text-white/60">
              无 Layout Reflow 重排卡顿，基于 GPU 变形与点对点 Zustand 订阅，支持双行中译与阶梯景深模糊。
            </p>
          </div>
        </div>
      </section>

      {/* 4. Footer Thanks */}
      <div className="text-center pt-4 text-xs text-white/40 flex items-center justify-center space-x-1.5">
        <span>Made with</span>
        <Heart className="w-3.5 h-3.5 text-apple-red fill-current inline" />
        <span>by RubenCampoa & Open Source Community</span>
      </div>
    </div>
  );
};
