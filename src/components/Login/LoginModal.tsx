import React, { useEffect, useState } from 'react';
import { X, QrCode, CheckCircle2, RefreshCw, AlertCircle } from 'lucide-react';
import { usePlayerStore } from '../../store/playerStore';
import { neteaseApi } from '../../services/neteaseApi';

export const LoginModal: React.FC = () => {
  const { isLoginModalOpen, setIsLoginModalOpen, setUser, setPlaylists } = usePlayerStore();
  const [qrImg, setQrImg] = useState<string>('');
  const [qrStatus, setQrStatus] = useState<string>('正在加载二维码...');
  const [isSuccess, setIsSuccess] = useState<boolean>(false);

  useEffect(() => {
    if (!isLoginModalOpen) return;

    let timer: any = null;
    let qrKey = '';

    const initQr = async () => {
      try {
        setQrStatus('正在连接网易云 API...');
        qrKey = await neteaseApi.getQrKey();
        const imgData = await neteaseApi.getQrImage(qrKey);
        setQrImg(imgData);
        setQrStatus('请使用网易云音乐 App 扫码登录');

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

              // Wait 1s to ensure API registers the cookie internally
              setTimeout(async () => {
                const account = await neteaseApi.getUserAccount();
                if (account) {
                  setUser(account);
                  const userPlaylists = await neteaseApi.getUserPlaylists(account.userId);
                  setPlaylists(userPlaylists);
                }

                setTimeout(() => {
                  setIsLoginModalOpen(false);
                }, 1000);
              }, 1000);
            }
          } catch (e) {
            // Ignore polling glitch
          }
        }, 2000);
      } catch (err) {
        setQrStatus('获取二维码失败，请确保后端 API 正常运行');
      }
    };

    initQr();

    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isLoginModalOpen]);

  if (!isLoginModalOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md animate-fadeIn select-none">
      <div className="relative w-80 glass-panel rounded-2xl p-6 flex flex-col items-center text-center space-y-4 border border-white/15 shadow-2xl">
        {/* Close Button */}
        <button
          onClick={() => setIsLoginModalOpen(false)}
          className="absolute top-4 right-4 text-white/40 hover:text-white transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center space-x-2 text-apple-red font-bold text-lg">
          <QrCode className="w-5 h-5" />
          <span className="text-white">网易云扫码登录</span>
        </div>

        {/* QR Code Container */}
        <div className="w-48 h-48 bg-white p-2.5 rounded-xl border border-white/20 flex items-center justify-center relative shadow-inner">
          {isSuccess ? (
            <div className="flex flex-col items-center space-y-2 text-emerald-600 font-semibold">
              <CheckCircle2 className="w-12 h-12 text-emerald-500 animate-bounce" />
              <span>登录成功</span>
            </div>
          ) : qrImg ? (
            <img src={qrImg} alt="NetEase Login QR" className="w-full h-full object-contain" />
          ) : (
            <div className="flex flex-col items-center space-y-2 text-black/50 text-xs">
              <RefreshCw className="w-6 h-6 animate-spin text-apple-red" />
              <span>生成中...</span>
            </div>
          )}
        </div>

        {/* Status Message */}
        <div className="text-xs text-white/70 font-medium px-3 py-1.5 bg-white/5 rounded-full border border-white/10 flex items-center space-x-1.5 max-w-full">
          <AlertCircle className="w-3.5 h-3.5 text-apple-red shrink-0" />
          <span className="truncate">{qrStatus}</span>
        </div>
      </div>
    </div>
  );
};
