export interface IElectronAPI {
  minimize: () => void;
  maximize: () => void;
  close: () => void;
  selectAudioFiles: () => Promise<string[]>;
  selectAudioFolder: () => Promise<string | null>;
  loginViaWindow: () => Promise<string | null>;
}

declare global {
  interface Window {
    electronAPI?: IElectronAPI;
  }
}
