import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  selectAudioFiles: () => ipcRenderer.invoke('select-audio-files'),
  selectAudioFolder: () => ipcRenderer.invoke('select-audio-folder'),
  loginViaWindow: () => ipcRenderer.invoke('login-via-window'),
  toggleDesktopLyric: () => ipcRenderer.send('toggle-desktop-lyric'),
  sendDesktopLyricData: (data: any) => ipcRenderer.send('update-desktop-lyric-data', data),
  onDesktopLyricData: (callback: (data: any) => void) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on('desktop-lyric-data', handler);
    return () => ipcRenderer.removeListener('desktop-lyric-data', handler);
  },
  onDesktopLyricState: (callback: (isOpen: boolean) => void) => {
    const handler = (_event: any, isOpen: boolean) => callback(isOpen);
    ipcRenderer.on('desktop-lyric-state', handler);
    return () => ipcRenderer.removeListener('desktop-lyric-state', handler);
  },
  setIgnoreMouseEvents: (ignore: boolean) => ipcRenderer.send('set-desktop-lyric-ignore-mouse', ignore),
  sendDesktopLyricAction: (action: string) => ipcRenderer.send('desktop-lyric-action', action),
  onMediaControl: (callback: (action: string) => void) => {
    const handler = (_event: any, action: string) => callback(action);
    ipcRenderer.on('media-control', handler);
    return () => ipcRenderer.removeListener('media-control', handler);
  },
});

