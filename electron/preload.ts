import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  selectAudioFiles: () => ipcRenderer.invoke('select-audio-files'),
  selectAudioFolder: () => ipcRenderer.invoke('select-audio-folder'),
  loginViaWindow: () => ipcRenderer.invoke('login-via-window'),
  onMediaControl: (callback: (action: string) => void) => {
    const handler = (_event: any, action: string) => callback(action);
    ipcRenderer.on('media-control', handler);
    return () => ipcRenderer.removeListener('media-control', handler);
  },
});

