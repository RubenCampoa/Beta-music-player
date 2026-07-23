export interface IElectronAPI {
  minimize: () => void;
  maximize: () => void;
  close: () => void;
  selectAudioFiles: () => Promise<string[]>;
  selectAudioFolder: () => Promise<string | null>;
  loginViaWindow: () => Promise<string | null>;
  toggleDesktopLyric?: () => void;
  sendDesktopLyricData?: (data: any) => void;
  onDesktopLyricData?: (callback: (data: any) => void) => () => void;
  onDesktopLyricState?: (callback: (isOpen: boolean) => void) => () => void;
  setIgnoreMouseEvents?: (ignore: boolean) => void;
  sendDesktopLyricAction?: (action: string) => void;
  onMediaControl?: (callback: (action: string) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI?: IElectronAPI;
  }
}



