import React, { useEffect, useState } from 'react';
import { X, QrCode, CheckCircle2, RefreshCw, AlertCircle, Globe } from 'lucide-react';
import { usePlayerStore } from '../../store/playerStore';
import { neteaseApi } from '../../services/neteaseApi';

export const LoginModal: React.FC = () => {
  const { isLoginModalOpen, setIsLoginModalOpen, setUser, setPlaylists, setNeteaseLikeIds, setToastMessage } = usePlayerStore();
  const [qrImg, setQrImg] = useState<string>('');
  const [qrStatus, setQrStatus] = useState<string>('正在加载二维码...');
  const [isSuccess, setIsSuccess] = useState<boolean>(false);
  const [refreshKey, setRefreshKey] = useState<number>(0);

  const fetchUserData = async () => {
    const account = await neteaseApi.getUserAccount();
    if (account) {
      setUser(account);
      const userPlaylists = await neteaseApi.getUserPlaylists(account.userId);
      setPlaylists(userPlaylists);
      const likeIds = await neteaseApi.getLikelist(account.userId);
      setNeteaseLikeIds(likeIds);
      setToastMessage(`欢迎回来，${account.nickname}`);
    }
  };

  const handleWindowLogin = async () => {
    if (!window.electronAPI?.loginViaWindow) {
      setToastMessage('当前环境不支持窗口登录，请使用 App 扫码登录');
      return;
    }
    setQrStatus('正在打开网页官方登录窗口...');
    const cookie = await window.electronAPI.loginViaWindow();
    if (cookie) {
      neteaseApi.setCookie(cookie);
      setQrStatus('登录成功！');
      setIsSuccess(true);
      await fetchUserData();
      setTimeout(() => {
        setIsLoginModalOpen(false);
      }, 800);
    } else {
      setQrStatus('已取消窗口登录');
    }
  };

  useEffect(() => {
    if (!isLoginModalOpen) return;

    let timer: any = null;
    let qrKey = '';

    const initQr = async () => {
      try {
        setIsSuccess(false);
        setQrImg('');
        setQrStatus('正在连接网易云 API...');
        qrKey = await neteaseApi.getQrKey();
        if (!qrKey) {
          setQrStatus('扫码组件通信超时，建议使用下方【网页官方登录】');
          return;
        }
        const imgData = await neteaseApi.getQrImage(qrKey);
        if (imgData) {
          setQrImg(imgData);
          setQrStatus('请使用网易云音乐 App 扫码登录');
        } else {
          setQrStatus('生成二维码失败，请点下方【网页官方登录】');
          return;
        }

        // Poll QR code status every 2 seconds
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
                await fetchUserData();
                setTimeout(() => {
                  setIsLoginModalOpen(false);
                }, 800);
              }, 600);
            }
          } catch (e) {
            // Ignore polling glitch
          }
        }, 2000);
      } catch (err) {
        setQrStatus('扫码组件获取失败，建议点击下方【网页官方登录】');
      }
    };

    initQr();

    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isLoginModalOpen, refreshKey]);

  if (!isLoginModalOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-md animate-fadeIn select-none">
      <div className="relative w-88 glass-panel rounded-3xl p-6 flex flex-col items-center text-center space-y-4 border border-white/20 shadow-2xl">
        {/* Close Button */}
        <button
          onClick={() => setIsLoginModalOpen(false)}
          className="absolute top-4 right-4 text-white/40 hover:text-white transition-colors p-1 rounded-full hover:bg-white/10"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center space-x-2 text-apple-red font-bold text-lg">
          <QrCode className="w-5 h-5" />
          <span className="text-white">网易云账号登录</span>
        </div>

        {/* QR Code Container */}
        <div className="w-48 h-48 bg-white p-2.5 rounded-2xl border border-white/20 flex items-center justify-center relative shadow-inner group">
          {isSuccess ? (
            <div className="flex flex-col items-center space-y-2 text-emerald-600 font-semibold">
              <CheckCircle2 className="w-12 h-12 text-emerald-500 animate-bounce" />
              <span>登录成功</span>
            </div>
          ) : qrImg ? (
            <img src={qrImg} alt="NetEase Login QR" className="w-full h-full object-contain" />
          ) : (
            <div className="flex flex-col items-center space-y-2 text-black/60 text-xs">
              <RefreshCw className="w-6 h-6 animate-spin text-apple-red" />
              <span>生成二维码中...</span>
            </div>
          )}
        </div>

        {/* Status Message */}
        <div className="text-[11px] text-white/80 font-medium px-3 py-1.5 bg-white/5 rounded-full border border-white/10 flex items-center space-x-1.5 max-w-full">
          <AlertCircle className="w-3.5 h-3.5 text-apple-red shrink-0" />
          <span className="truncate">{qrStatus}</span>
        </div>

        {/* Alternative Login Actions */}
        <div className="w-full pt-1 flex items-center justify-center space-x-2">
          <button
            onClick={() => setRefreshKey((k) => k + 1)}
            className="flex items-center space-x-1 px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/15 text-white/70 hover:text-white text-xs font-medium border border-white/10 transition-all cursor-pointer"
            title="刷新二维码"
          >
            <RefreshCw className="w-3 h-3" />
            <span>刷新</span>
          </button>

          {window.electronAPI?.loginViaWindow && (
            <button
              onClick={handleWindowLogin}
              className="flex items-center space-x-1.5 px-4 py-1.5 rounded-full bg-apple-red/90 hover:bg-apple-red text-white text-xs font-semibold shadow-md hover:shadow-apple-red/40 transition-all cursor-pointer"
              title="弹窗打开网易云网页官方登录"
            >
              <Globe className="w-3.5 h-3.5" />
              <span>网页官方一键登录</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
