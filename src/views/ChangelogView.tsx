import React from 'react';
import { History, Sparkles, CheckCircle2, Disc } from 'lucide-react';

export const ChangelogView: React.FC = () => {
  return (
    <div className="flex-1 overflow-y-auto p-8 space-y-8 max-w-4xl mx-auto select-none pb-32 animate-fadeIn">
      {/* Header Banner */}
      <div className="flex items-center justify-between border-b border-white/10 pb-4">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight flex items-center space-x-3">
            <History className="w-8 h-8 text-apple-red" />
            <span>更新日志</span>
          </h1>
          <p className="text-sm text-white/50 mt-1">
            查看 Beta Music Player 版本演进与新功能记录
          </p>
        </div>
        <div className="px-3 py-1 bg-apple-red/20 rounded-full border border-apple-red/30 text-xs text-apple-red font-semibold flex items-center space-x-1.5">
          <Disc className="w-3.5 h-3.5 animate-spin" />
          <span>当前版本 v1.0.1</span>
        </div>
      </div>

      {/* Release v1.0.1 */}
      <section className="glass-panel p-6 rounded-2xl space-y-5 border border-white/15 shadow-2xl relative overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center space-x-3">
            <span className="text-2xl font-extrabold text-white tracking-tight">v1.0.1</span>
            <span className="px-2.5 py-0.5 rounded-full bg-apple-red text-white text-[10px] font-bold uppercase tracking-wider shadow-sm">
              最新版本
            </span>
          </div>
          <span className="text-xs font-mono text-white/40">2026-07-23</span>
        </div>

        <div className="space-y-4">
          <div className="flex items-start space-x-3">
            <CheckCircle2 className="w-5 h-5 text-apple-red shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-white">本地音乐 ID3 标签与专辑封面自动解析</h4>
              <p className="text-xs text-white/60 leading-relaxed">
                导入本地 MP3 / FLAC 音频文件时，自动识别并解析文件嵌入的真实歌曲名、歌手、专辑名及专辑封面图，告别“未知歌手”与占位封面。
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-3">
            <CheckCircle2 className="w-5 h-5 text-apple-red shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-white">Windows 系统托盘与后台常驻播放</h4>
              <p className="text-xs text-white/60 leading-relaxed">
                关闭主窗口时自动最小化至 Windows 任务栏右下角系统托盘，保证音乐无间断续播；右键托盘图标可一键显示主界面、播放/暂停、切歌或退出。
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-3">
            <CheckCircle2 className="w-5 h-5 text-apple-red shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-white">全局键盘硬件媒体按键控制</h4>
              <p className="text-xs text-white/60 leading-relaxed">
                支持通过键盘物理媒体按键（播放/暂停、上一首、下一首）在应用工作于后台时进行全局播放控制。
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-3">
            <CheckCircle2 className="w-5 h-5 text-apple-red shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-white">网易云在线音乐全局搜索</h4>
              <p className="text-xs text-white/60 leading-relaxed">
                顶部搜索框关联网易云音乐 Api，输入关键词并按回车即可全网搜索单曲，展示专属搜索视图与 VIP 标识，支持一键试听与全选播放。
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-3">
            <CheckCircle2 className="w-5 h-5 text-apple-red shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-white">右侧播放队列抽屉</h4>
              <p className="text-xs text-white/60 leading-relaxed">
                底栏新增播放队列入口，支持右侧滑出抽屉实时查看待播放歌曲、移除特定曲目或一键清空队列。
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-3">
            <CheckCircle2 className="w-5 h-5 text-apple-red shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-white">歌词动效平滑度优化</h4>
              <p className="text-xs text-white/60 leading-relaxed">
                优化全景歌词的渲染与行间平移动画算法，使歌词滚动与切换体验更为流畅自然。
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-3">
            <CheckCircle2 className="w-5 h-5 text-apple-red shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-white">搜索栏历史搜索记录支持</h4>
              <p className="text-xs text-white/60 leading-relaxed">
                顶栏搜索框支持自动保存历史搜索记录，提供下拉历史快捷标签、单条删除与一键清空功能。
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-3">
            <CheckCircle2 className="w-5 h-5 text-apple-red shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-white">网易云云端“我喜欢的音乐”双向红心同步</h4>
              <p className="text-xs text-white/60 leading-relaxed">
                登录网易云账号后，自动点亮在网易云官方已收藏歌曲的红心标识，在软件内点赞或取消收藏可实时双向同步至云端网易云账号。
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-3">
            <CheckCircle2 className="w-5 h-5 text-apple-red shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-white">Apple Music 风格“浏览”探索视图与权威榜单</h4>
              <p className="text-xs text-white/60 leading-relaxed">
                解耦“现在就听”与“浏览”视图，全新打造包含网易云热歌榜、飙升榜、新歌榜、原创榜、ACG榜、欧美榜及热门曲风标签的探索专区。
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-3">
            <CheckCircle2 className="w-5 h-5 text-apple-red shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-white">打包程序零配置内置 API 引擎</h4>
              <p className="text-xs text-white/60 leading-relaxed">
                打包可执行程序内置后台自动静默拉起 API 服务引擎，他人无需配置 Node.js 环境或环境依赖，双击 exe 即可开箱即用。
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-3">
            <CheckCircle2 className="w-5 h-5 text-apple-red shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-white">背景流体动画性能智能调度</h4>
              <p className="text-xs text-white/60 leading-relaxed">
                智能优化 Canvas 渐变光斑渲染机制，窗口最小化或后台运行时自动挂起动画循环，大幅降低硬件开销与能耗。
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Release v1.0.0 */}
      <section className="glass-panel p-6 rounded-2xl space-y-4 border border-white/10 opacity-75 hover:opacity-100 transition-opacity">
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center space-x-3">
            <span className="text-xl font-bold text-white tracking-tight">v1.0.0</span>
            <span className="px-2 py-0.5 rounded bg-white/10 text-white/70 text-[10px] font-semibold">
              初始正式版
            </span>
          </div>
          <span className="text-xs font-mono text-white/40">2026-07-23</span>
        </div>

        <div className="space-y-3">
          <div className="flex items-start space-x-2 text-xs text-white/70">
            <Sparkles className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <span>Apple Music 风格响应式流体光斑背景与毛玻璃高斯模糊面板。</span>
          </div>
          <div className="flex items-start space-x-2 text-xs text-white/70">
            <Sparkles className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <span>全景双行歌词平滑滚动、歌词发光与阶梯景深模糊效果。</span>
          </div>
          <div className="flex items-start space-x-2 text-xs text-white/70">
            <Sparkles className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <span>网易云音乐扫码登录、同步个人歌单与喜欢列表。</span>
          </div>
          <div className="flex items-start space-x-2 text-xs text-white/70">
            <Sparkles className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <span>本地音频文件拖拽播放与 IndexedDB 本地资料库管理。</span>
          </div>
        </div>
      </section>
    </div>
  );
};
