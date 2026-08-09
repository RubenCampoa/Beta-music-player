export interface IElectronAPI {
  minimize: () => void;
  maximize: () => void;
  close: () => void;
  toggleFullScreen?: () => void;
  setFullScreen?: (enabled: boolean) => void;
  isFullScreen?: () => Promise<boolean>;
  onFullScreenChange?: (callback: (isFS: boolean) => void) => () => void;
  onWindowTransition?: (callback: (transition: string) => void) => () => void;
  toggleDesktopLyric?: () => void;
  closeDesktopLyric?: () => void;
  setDesktopLyricIgnoreMouse?: (ignore: boolean) => void;
  sendDesktopLyricData?: (data: any) => void;
  onDesktopLyricData?: (callback: (data: any) => void) => () => void;
  sendDesktopLyricAction?: (action: string) => void;
  onDesktopLyricStatusChange?: (callback: (enabled: boolean) => void) => () => void;
  onDesktopLyricHover?: (callback: (isHovered: boolean) => void) => () => void;
  moveDesktopLyricWindow?: (delta: { deltaX: number; deltaY: number }) => void;
  selectAudioFiles: () => Promise<string[]>;
  selectAudioFolder: () => Promise<string | null>;
  readAudioFile?: (filePath: string) => Promise<ArrayBuffer>;
  fetchCoverAsDataUrl?: (url: string) => Promise<string | null>;
  loginViaWindow: (platform?: 'netease' | 'qq' | 'kugou') => Promise<string | null>;
  setQqCookie?: (cookie: string) => void;
  onMediaControl?: (callback: (action: string) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI?: IElectronAPI;
  }
}



