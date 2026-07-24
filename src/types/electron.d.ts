export interface IElectronAPI {
  minimize: () => void;
  maximize: () => void;
  close: () => void;
  toggleFullScreen?: () => void;
  isFullScreen?: () => Promise<boolean>;
  onFullScreenChange?: (callback: (isFS: boolean) => void) => () => void;
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
  loginViaWindow: () => Promise<string | null>;
  onMediaControl?: (callback: (action: string) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI?: IElectronAPI;
  }
}



