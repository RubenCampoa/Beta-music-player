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
          <span>当前版本 v1.0.8</span>
        </div>
      </div>

      {/* Release v1.0.8 — latest */}
      {/* Release v1.0.8 — latest */}
      <section className="glass-panel p-6 rounded-2xl space-y-5 border border-apple-red/40 shadow-2xl relative overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center space-x-3">
            <span className="text-2xl font-extrabold text-white tracking-tight">v1.0.8</span>
            <span className="px-2.5 py-0.5 rounded-full bg-apple-red text-white text-[10px] font-bold uppercase tracking-wider shadow-sm">
              最新版本
            </span>
          </div>
          <span className="text-xs font-mono text-white/40">2026-08-09</span>
        </div>
        <div className="space-y-2 text-xs text-white/70 leading-relaxed">
          <p>• 【酷狗概念版平台】新增酷狗概念版搜索、热门歌单、歌单详情、扫码/微信登录、会员音源与 KRC 逐字歌词；支持三平台即时切换与独立账号/歌单同步。</p>
          <p>• 【逐字歌词性能】逐字波浪组件 memo 化，慢歌长句每帧仅更新正在唱的一个字，逐字点亮流畅不卡顿。</p>
          <p>• 【歌词时间轴】直连音频实时媒体时钟并做指数平滑，消除慢歌逐字抖动与时间外推漂移。</p>
          <p>• 【高亮增强】激活歌词光晕更亮一档（逐字与非逐字），随点亮进度平滑淡入。</p>
          <p>• 【前奏倒计时】三个圆点覆盖网易云、QQ 与酷狗模式，消失时机锚定真实开唱时间；QQ 歌词元数据过滤升级（标题/词曲行，兼容全角连字符、括号副标题与 [ti:] 前置 meta）。</p>
          <p>• 【歌词切换时间微调】全屏歌词音量条下方新增滑块，按每首歌独立调整歌词行切换偏移（-2000ms ~ +2000ms），播放下一首自动恢复默认 0ms。</p>
          <p>• 【窗口行为】移除自定义最小化/恢复动画，回归 Windows 系统默认窗口动画。</p>
          <p>• 【检查更新】修复版本比较逻辑（旧标签不再误报新版本）、版本号统一读取、区分 API 限流与网络失败、启动检查 6 小时节流。</p>
          <p>• 【设置】「性能与卡顿优化建议」更新并新增「一键设置」，一键仅开启流体背景并关闭全部歌词动效。</p>
          <p>• 【逐字歌词】新增网易云逐字歌词（YRC）支持：支持逐字歌词的歌曲全屏歌词自动逐字点亮，采用行级联动的海浪式非线性果冻动画，唱到哪亮到哪、快歌不闪现，字渐亮缓出收敛、发光平滑渐入。</p>
          <p>• 【前奏倒计时】全屏歌词前奏阶段新增三个圆点依次点亮倒计时（主流音乐 App 风格），第三个圆点亮起即开唱，不遮挡第一句歌词。</p>
          <p>• 【安全加固】恢复 webSecurity 与窗口沙箱、注入内容安全策略（CSP）、app-audio 本地音频协议白名单校验、本地 API 仅绑定 127.0.0.1、修复端口占用崩溃与本地音乐加载链路。</p>
          <p>• 【QQ 音乐识别修复】VIP 判定改为以“播放受限”为准（安和桥等高品质付费歌曲不再误标 VIP），榜单歌曲接入权威付费信息校验，严格匹配防止同名翻唱/DJ 版错配。</p>
          <p>• 【播放修复】修复内容安全策略误拦截 http 音源导致的“音源播放失败”，QQ 封面跨域注入修复流体背景取色。</p>
          <p>• 【进度条交互】播放进度条支持拖拽滑动（拖动实时预览、松手定位），修复拖动不跟手与卡顿。</p>
        </div>
      </section>

      {/* Release v1.0.7 */}
      <section className="glass-panel p-6 rounded-2xl space-y-5 border border-white/15 relative overflow-hidden shadow-xl">
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center space-x-3">
            <span className="text-2xl font-extrabold text-white tracking-tight">v1.0.7</span>
            <span className="px-2.5 py-0.5 rounded-full bg-apple-red/20 text-apple-red border border-apple-red/30 text-[10px] font-bold uppercase tracking-wider shadow-sm">
              正式版本
            </span>
          </div>
          <span className="text-xs font-mono text-white/40">2026-08-06</span>
        </div>
        <div className="space-y-2 text-xs text-white/70 leading-relaxed">
          <p>• 【QQ音乐深度集成】彻底修复 QQ 音乐模式下登录界面与提示错乱，支持双平台独立 Web 窗口登录与凭证绑定。</p>
          <p>• 【QQ音乐封面修复】修复 QQ 音乐 API 封面错乱与加载破损问题，支持全零 albummid 自动降级与全局图片加载容错。</p>
          <p>• 【榜单与歌单优化】修复 QQ 音乐推荐歌单曲目重复缺陷，实现巅峰热歌榜、飙升榜、新歌榜权威榜单独立映射。</p>
          <p>• 【播放性能重构】重构切歌与音源派发机制，取消空音源打断，实现单次原子化状态更新，彻底解决需手动暂停再播放问题。</p>
          <p>• 【音源歌词解耦】歌词拉取改为后台静默非阻塞加载，加入 &lt;audio&gt; 播放器 onStalled / onWaiting 智能恢复机制。</p>
          <p>• 【底栏收藏实时同步】修复底栏爱心收藏状态延迟缺陷，补充状态监听与多平台曲目 ID 规范匹配，实现秒级红心切换。</p>
        </div>
      </section>

      {/* Release v1.0.6 */}
      <section className="glass-panel p-6 rounded-2xl space-y-5 border border-white/15 relative overflow-hidden shadow-xl">
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center space-x-3">
            <span className="text-2xl font-extrabold text-white tracking-tight">v1.0.6</span>
            <span className="px-2.5 py-0.5 rounded-full bg-apple-red/20 text-apple-red border border-apple-red/30 text-[10px] font-bold uppercase tracking-wider shadow-sm">
              正式版本
            </span>
          </div>
          <span className="text-xs font-mono text-white/40">2026-08-06</span>
        </div>
        <div className="space-y-2 text-xs text-white/70 leading-relaxed">
          <p>• 修复浅色主题下播放器进度条与拖动圆点对比度不足、几乎不可见的问题。</p>
          <p>• 重做全屏歌词液态背景，加入实时流动的液体光团与高光带，不再只是封面放大模糊。</p>
          <p>• 升级歌词切换为非线性果冻缓动，并优化歌词滚动弹簧效果，减少切换顿挫。</p>
          <p>• 增加主窗口、最大化/还原、最小化及全屏进出过渡动画，恢复全屏前的窗口尺寸。</p>
          <p>• 优化窗口圆角、半透明毛玻璃和全屏歌词交互状态，提升整体视觉一致性。</p>
          <p>• 修复首页推荐偶尔播放预制歌曲的问题，“查看全部”现在会正确进入每日推荐歌单。</p>
          <p>• 首页推荐封面新增悬停交互和点击播放，搜索历史下拉层恢复不透明并支持完整点击操作。</p>
          <p>• 登录弹窗隐藏底部播放栏，统一 Beta Music Player 应用名称、图标和 Windows 打包身份。</p>
        </div>
      </section>

      {/* Release v1.0.5 */}
      <section className="glass-panel p-6 rounded-2xl space-y-5 border border-white/15 relative overflow-hidden shadow-xl">
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center space-x-3">
            <span className="text-2xl font-extrabold text-white tracking-tight">v1.0.5</span>
            <span className="px-2.5 py-0.5 rounded-full bg-apple-red/20 text-apple-red border border-apple-red/30 text-[10px] font-bold uppercase tracking-wider shadow-sm">
              正式版本
            </span>
          </div>
          <span className="text-xs font-mono text-white/40">2026-08-02</span>
        </div>
        <div className="space-y-2 text-xs text-white/70 leading-relaxed">
          <p>• 新增纯歌词全屏模式与经典双栏歌词模式切换。</p>
          <p>• 桌面歌词支持长歌词自动横向滚动显示。</p>
          <p>• 优化网易云 VIP 音源鉴权、解析、缓存与播放启动速度。</p>
          <p>• 修复 VIP 音源解析失败停留在 0:00、Cookie 外发和音频切换卡顿问题。</p>
        </div>
      </section>

      {/* Release v1.0.4 */}
      <section className="glass-panel p-6 rounded-2xl space-y-5 border border-white/15 relative overflow-hidden shadow-xl">
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center space-x-3">
            <span className="text-2xl font-extrabold text-white tracking-tight">v1.0.4</span>
            <span className="px-2.5 py-0.5 rounded-full bg-apple-red/20 text-apple-red border border-apple-red/30 text-[10px] font-bold uppercase tracking-wider shadow-sm">
              正式版本
            </span>
          </div>
          <span className="text-xs font-mono text-white/40">2026-07-24</span>
        </div>

        <div className="space-y-4">
          <div className="flex items-start space-x-3">
            <CheckCircle2 className="w-5 h-5 text-apple-red shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-white">网易云同款独立桌面歌词 (Desktop Lyrics)</h4>
              <p className="text-xs text-white/60 leading-relaxed">
                新增独立透明置顶桌面歌词窗口，支持随屏幕自由拖拽移动、快捷锁定 (鼠标穿透操作背景软件) 与一键解封播控。内置 6 组经典炫彩/霓虹渐变配色方案，支持通过调色板一键切换并自动持久化保存。
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-3">
            <CheckCircle2 className="w-5 h-5 text-apple-red shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-white">全屏歌词软件窗口全屏覆盖 (Fullscreen Coverage)</h4>
              <p className="text-xs text-white/60 leading-relaxed">
                在全屏歌词模式顶部操控区新增【全屏覆盖 / 取消全屏覆盖】系统窗口掌控按钮，结合 Beta Music Player 桌面主进程事件监听，实现界面按钮与 OS 实际窗口状态的 100% 实时双向同步。
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-3">
            <CheckCircle2 className="w-5 h-5 text-apple-red shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-white">音频播控声音平滑淡入淡出 (Audio Fade In & Fade Out)</h4>
              <p className="text-xs text-white/60 leading-relaxed">
                为播放、暂停及上下首切歌引入了发烧级余弦曲线音量平滑渐变算法（Ramp Volume Curve），旧歌声音柔和渐隐、新歌声音平滑渐现，彻底告别生硬爆音。
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Release v1.0.3 */}
      <section className="glass-panel p-6 rounded-2xl space-y-5 border border-white/15 relative overflow-hidden shadow-xl">
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center space-x-3">
            <span className="text-xl font-bold text-white tracking-tight">v1.0.3</span>
            <span className="px-2.5 py-0.5 rounded-full bg-apple-red/20 text-apple-red border border-apple-red/30 text-[10px] font-bold uppercase tracking-wider shadow-sm">
              正式版本
            </span>
          </div>
          <span className="text-xs font-mono text-white/40">2026-07-24</span>
        </div>

        <div className="space-y-4">
          <div className="flex items-start space-x-3">
            <CheckCircle2 className="w-5 h-5 text-apple-red shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-white">歌单歌曲无上限全量加载</h4>
              <p className="text-xs text-white/60 leading-relaxed">
                突破原网易云歌单单页 50 首歌曲的载入限制，全新实现多页自动循环拉取机制，支持无上限全量载入并完整展示歌单中的所有曲目。
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-3">
            <CheckCircle2 className="w-5 h-5 text-apple-red shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-white">音频标题与元数据空字符（Null Byte）异常清洗</h4>
              <p className="text-xs text-white/60 leading-relaxed">
                全面修复部分歌曲名称、歌手或专辑名末尾异常多出数字“0”的问题，精准剔除音频标签及 API 数据中的 Null Character (`\0` / `\u0000`) 与转义异常字符。
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Release v1.0.1 */}
      <section className="glass-panel p-6 rounded-2xl space-y-5 border border-white/15 relative overflow-hidden shadow-xl">
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center space-x-3">
            <span className="text-xl font-bold text-white tracking-tight">v1.0.1</span>
            <span className="px-2.5 py-0.5 rounded-full bg-apple-red/20 text-apple-red border border-apple-red/30 text-[10px] font-bold uppercase tracking-wider shadow-sm">
              正式版本
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
              <h4 className="text-sm font-bold text-white">「浏览」探索视图与权威榜单</h4>
              <p className="text-xs text-white/60 leading-relaxed">
                解耦“现在就听”与“浏览”视图，全新打造包含网易云热歌榜、飙升榜、新歌榜、原创榜、ACG榜、欧美榜及热门曲风标签的探索专区。
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Release v1.0.0 */}
      <section className="glass-panel p-6 rounded-2xl space-y-4 border border-white/15 relative overflow-hidden shadow-xl">
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center space-x-3">
            <span className="text-xl font-bold text-white tracking-tight">v1.0.0</span>
            <span className="px-2.5 py-0.5 rounded-full bg-apple-red/20 text-apple-red border border-apple-red/30 text-[10px] font-bold uppercase tracking-wider shadow-sm">
              初始正式版
            </span>
          </div>
          <span className="text-xs font-mono text-white/40">2026-07-23</span>
        </div>

        <div className="space-y-3">
          <div className="flex items-start space-x-2 text-xs text-white/70">
            <Sparkles className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <span>响应式流体光斑背景与毛玻璃高斯模糊面板。</span>
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
