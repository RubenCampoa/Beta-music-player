export interface IElectronAPI {
  minimize: () => void;
  maximize: () => void;
  close: () => void;
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



