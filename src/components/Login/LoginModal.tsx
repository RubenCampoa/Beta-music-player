import React, { useEffect, useState } from 'react';
import { X, QrCode, CheckCircle2, RefreshCw, AlertCircle, Globe, ShieldCheck, Music2 } from 'lucide-react';
import { usePlayerStore } from '../../store/playerStore';
import { neteaseApi } from '../../services/neteaseApi';
import { qqMusicApi } from '../../services/qqMusicApi';
import { Platform } from '../../types/music';
import { AnimatePresence, motion } from 'framer-motion';

export const LoginModal: React.FC = () => {
  const {
    isLoginModalOpen,
    setIsLoginModalOpen,
    loginModalPlatform,
    setLoginModalPlatform,
    setAccount,
    setActivePlatform,
    setToastMessage,
  } = usePlayerStore();

  const [platformTab, setPlatformTab] = useState<Platform>(loginModalPlatform || 'netease');
  const [qrImg, setQrImg] = useState<string>('');
  const [qrStatus, setQrStatus] = useState<string>('正在加载二维码...');
  const [isSuccess, setIsSuccess] = useState<boolean>(false);
  const [refreshKey, setRefreshKey] = useState<number>(0);
  const [qqCookieInput, setQqCookieInput] = useState<string>('');
  const [showQqInput, setShowQqInput] = useState<boolean>(false);

  useEffect(() => {
    setPlatformTab(loginModalPlatform);
  }, [loginModalPlatform]);

  const fetchUserData = async (platform: Platform) => {
    if (platform === 'netease') {
      const account = await neteaseApi.getUserAccount();
      if (account) {
        setAccount('netease', account);
        setActivePlatform('netease');
        setToastMessage(`网易云账号已登录：${account.nickname}`);
      }
    } else {
      const account = await qqMusicApi.getUserAccount();
      if (account) {
        setAccount('qq', account);
        setActivePlatform('qq');
        setToastMessage(`QQ 音乐账号已登录：${account.nickname}`);
      }
    }
  };

  const handleWindowLogin = async () => {
    if (!window.electronAPI?.loginViaWindow) {
      setToastMessage('当前环境不支持窗口登录，请使用 App 扫码登录');
      return;
    }
    setQrStatus(`正在打开 ${platformTab === 'qq' ? 'QQ 音乐' : '网易云'} 网页官方登录窗口...`);
    const cookie = await window.electronAPI.loginViaWindow(platformTab);
    if (cookie) {
      if (platformTab === 'netease') {
        neteaseApi.setCookie(cookie);
      } else {
        qqMusicApi.setCookie(cookie);
      }
      setQrStatus('登录成功！');
      setIsSuccess(true);
      await fetchUserData(platformTab);
      setTimeout(() => {
        setIsLoginModalOpen(false);
      }, 800);
    } else {
      setQrStatus('已取消窗口登录');
    }
  };

  const handleQqCookieSubmit = async () => {
    if (!qqCookieInput.trim()) return;
    qqMusicApi.setCookie(qqCookieInput.trim());
    setIsSuccess(true);
    setQrStatus('QQ 音乐 Cookie 已绑定！');
    await fetchUserData('qq');
    setTimeout(() => {
      setIsLoginModalOpen(false);
      setShowQqInput(false);
    }, 800);
  };

  useEffect(() => {
    if (!isLoginModalOpen) return;

    let timer: any = null;
    let qrKey = '';

    const initQr = async () => {
      try {
        setIsSuccess(false);
        setQrImg('');

        if (platformTab === 'netease') {
          setQrStatus('正在连接网易云 API...');
          qrKey = await neteaseApi.getQrKey();
          if (!qrKey) {
            setQrStatus('扫码超时，建议点下方【网页官方登录】');
            return;
          }
          const imgData = await neteaseApi.getQrImage(qrKey);
          if (imgData) {
            setQrImg(imgData);
            setQrStatus('请使用网易云音乐 App 扫码登录');
          } else {
            setQrStatus('生成二维码失败，建议使用【网页官方登录】');
            return;
          }

          timer = setInterval(async () => {
            try {
              const res = await neteaseApi.checkQrStatus(qrKey);
              if (res.code === 800) {
                setQrStatus('二维码已过期，请刷新');
                clearInterval(timer);
              } else if (res.code === 802) {
                setQrStatus('已扫码，请在手机上确认登录');
              } else if (res.code === 803) {
                setQrStatus('登录成功！');
                setIsSuccess(true);
                clearInterval(timer);

                setTimeout(async () => {
                  await fetchUserData('netease');
                  setTimeout(() => {
                    setIsLoginModalOpen(false);
                  }, 800);
                }, 600);
              }
            } catch (e) {
              // Ignore
            }
          }, 2000);
        } else {
          // QQ Music Login
          setQrStatus('请使用 QQ 音乐 App 扫码或在下方绑定 Cookie');
          qrKey = await qqMusicApi.getQrKey();
          const imgData = await qqMusicApi.getQrImage(qrKey);
          setQrImg(imgData);
        }
      } catch (err) {
        setQrStatus('登录交互初始化异常，请重新尝试');
      }
    };

    initQr();

    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isLoginModalOpen, refreshKey, platformTab]);

  return (
    <AnimatePresence initial={false}>
      {isLoginModalOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/35 backdrop-blur-md select-none overflow-hidden"
        >
          {/* Subtle Ambient Radial Highlight */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-rose-500/15 via-emerald-500/10 to-transparent blur-2xl pointer-events-none" />

          {/* Floating Solid Glass Card */}
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 14, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 300, damping: 26, mass: 0.7 }}
            className="relative w-[400px] bg-[#121623]/92 backdrop-blur-2xl rounded-[32px] p-8 flex flex-col items-center text-center space-y-4 border border-white/20 shadow-[0_32px_80px_-12px_rgba(0,0,0,0.6)] z-10"
          >
            {/* Close Button */}
            <button
              onClick={() => setIsLoginModalOpen(false)}
              className="absolute top-5 right-5 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white/70 hover:text-white flex items-center justify-center transition-all cursor-pointer shadow-sm"
              title="关闭"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Platform Selection Tabs */}
            <div className="flex items-center p-1 bg-white/10 rounded-full border border-white/15 backdrop-blur-md mb-1">
              <button
                type="button"
                onClick={() => {
                  setPlatformTab('netease');
                  setLoginModalPlatform('netease');
                }}
                className={`flex items-center space-x-1.5 px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
                  platformTab === 'netease'
                    ? 'bg-gradient-to-r from-red-500 to-rose-600 text-white shadow-md'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                <div className="w-2 h-2 rounded-full bg-rose-300" />
                <span>网易云账号</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setPlatformTab('qq');
                  setLoginModalPlatform('qq');
                }}
                className={`flex items-center space-x-1.5 px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
                  platformTab === 'qq'
                    ? 'bg-gradient-to-r from-emerald-500 to-green-600 text-white shadow-md'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                <div className="w-2 h-2 rounded-full bg-emerald-300" />
                <span>QQ 音乐账号</span>
              </button>
            </div>

            {/* Modal Header */}
            <div className="flex flex-col items-center space-y-1">
              <div className="flex items-center space-x-2 text-white font-black text-xl tracking-tight">
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center shadow-lg ${
                    platformTab === 'qq'
                      ? 'bg-gradient-to-tr from-emerald-500 to-green-600 shadow-emerald-500/30'
                      : 'bg-gradient-to-tr from-rose-500 to-red-600 shadow-rose-500/30'
                  }`}
                >
                  <QrCode className="w-4 h-4 text-white" />
                </div>
                <span>{platformTab === 'qq' ? 'QQ 音乐账号登录' : '网易云账号登录'}</span>
              </div>
              <p className="text-xs text-white/50 font-medium">扫码同步您的个人歌单与无损音乐资产</p>
            </div>

            {/* QR Code Container */}
            {!showQqInput ? (
              <div className="w-48 h-48 bg-white p-3 rounded-2xl border border-white/20 flex items-center justify-center relative shadow-[0_16px_40px_rgba(0,0,0,0.4)] group overflow-hidden">
                {isSuccess ? (
                  <div className="flex flex-col items-center space-y-2 text-emerald-600 font-semibold">
                    <CheckCircle2 className="w-12 h-12 text-emerald-500 animate-bounce" />
                    <span>登录成功</span>
                  </div>
                ) : qrImg ? (
                  <img src={qrImg} alt="Login QR" className="w-full h-full object-contain" />
                ) : (
                  <div className="flex flex-col items-center space-y-2 text-black/60 text-xs">
                    <RefreshCw className="w-6 h-6 animate-spin text-rose-500" />
                    <span>生成二维码中...</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="w-full bg-white/5 p-4 rounded-2xl border border-white/10 flex flex-col space-y-3">
                <label className="text-xs text-white/80 font-medium text-left">输入 QQ 音乐 Cookie / Key 凭证：</label>
                <textarea
                  value={qqCookieInput}
                  onChange={(e) => setQqCookieInput(e.target.value)}
                  placeholder="粘贴包含 uin 与 qqmusic_key 的 Cookie 字符串..."
                  className="w-full h-24 bg-black/40 border border-white/15 rounded-xl p-2.5 text-xs text-white placeholder-white/30 focus:outline-none focus:border-emerald-500"
                />
                <div className="flex items-center justify-end space-x-2">
                  <button
                    type="button"
                    onClick={() => setShowQqInput(false)}
                    className="px-3 py-1.5 rounded-full text-xs text-white/60 hover:text-white"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={handleQqCookieSubmit}
                    className="px-4 py-1.5 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold shadow-md"
                  >
                    确认绑定
                  </button>
                </div>
              </div>
            )}

            {/* Status Message */}
            <div className="text-xs text-white/90 font-medium px-4 py-1.5 bg-white/10 rounded-full border border-white/15 backdrop-blur-md flex items-center space-x-2 max-w-full shadow-sm">
              <AlertCircle
                className={`w-4 h-4 shrink-0 ${platformTab === 'qq' ? 'text-emerald-400' : 'text-rose-400'}`}
              />
              <span className="truncate">{qrStatus}</span>
            </div>

            {/* Alternative Login Actions */}
            <div className="w-full pt-1 flex items-center justify-center space-x-3">
              <button
                onClick={() => setRefreshKey((k) => k + 1)}
                className="flex items-center space-x-1.5 px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 text-white/80 hover:text-white text-xs font-semibold border border-white/15 backdrop-blur-md transition-all hover:scale-105 active:scale-95 cursor-pointer shadow-sm"
                title="刷新二维码"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>刷新</span>
              </button>

              {platformTab === 'qq' && (
                <button
                  type="button"
                  onClick={() => setShowQqInput((prev) => !prev)}
                  className="flex items-center space-x-1.5 px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 text-white/80 hover:text-white text-xs font-semibold border border-white/15 backdrop-blur-md transition-all cursor-pointer"
                >
                  <Music2 className="w-3.5 h-3.5" />
                  <span>Cookie 绑定</span>
                </button>
              )}

              {window.electronAPI?.loginViaWindow && (
                <button
                  onClick={handleWindowLogin}
                  className={`flex items-center space-x-1.5 px-5 py-2 rounded-full text-white text-xs font-bold shadow-lg transition-all hover:scale-105 active:scale-95 cursor-pointer ${
                    platformTab === 'qq'
                      ? 'bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 shadow-emerald-500/30'
                      : 'bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 shadow-rose-500/30'
                  }`}
                  title="网页官方一键登录"
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span>官方网页登录</span>
                </button>
              )}
            </div>

            {/* Security Note */}
            <div className="flex items-center space-x-1 text-[11px] text-white/40 pt-1">
              <ShieldCheck className="w-3 h-3 text-emerald-400" />
              <span>
                基于{platformTab === 'qq' ? 'QQ 音乐' : '网易云'}官方 API 通信 · 安全加密
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
