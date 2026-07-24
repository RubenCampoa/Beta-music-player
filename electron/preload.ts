import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  toggleFullScreen: () => ipcRenderer.send('window-fullscreen'),
  isFullScreen: () => ipcRenderer.invoke('is-window-fullscreen'),
  selectAudioFiles: () => ipcRenderer.invoke('select-audio-files'),
  selectAudioFolder: () => ipcRenderer.invoke('select-audio-folder'),
  loginViaWindow: () => ipcRenderer.invoke('login-via-window'),
  onMediaControl: (callback: (action: string) => void) => {
    const handler = (_event: any, action: string) => callback(action);
    ipcRenderer.on('media-control', handler);
    return () => ipcRenderer.removeListener('media-control', handler);
  },
  onFullScreenChange: (callback: (isFS: boolean) => void) => {
    const handler = (_event: any, isFS: boolean) => callback(isFS);
    ipcRenderer.on('fullscreen-change', handler);
    return () => ipcRenderer.removeListener('fullscreen-change', handler);
  },
  toggleDesktopLyric: () => ipcRenderer.send('toggle-desktop-lyric'),
  closeDesktopLyric: () => ipcRenderer.send('close-desktop-lyric'),
  setDesktopLyricIgnoreMouse: (ignore: boolean) => ipcRenderer.send('set-desktop-lyric-ignore-mouse', ignore),
  sendDesktopLyricData: (data: any) => ipcRenderer.send('sync-desktop-lyric-data', data),
  onDesktopLyricData: (callback: (data: any) => void) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on('desktop-lyric-data', handler);
    return () => ipcRenderer.removeListener('desktop-lyric-data', handler);
  },
  sendDesktopLyricAction: (action: string) => ipcRenderer.send('desktop-lyric-action', action),
  onDesktopLyricStatusChange: (callback: (enabled: boolean) => void) => {
    const handler = (_event: any, enabled: boolean) => callback(enabled);
    ipcRenderer.on('desktop-lyric-status-changed', handler);
    return () => ipcRenderer.removeListener('desktop-lyric-status-changed', handler);
  },
  onDesktopLyricHover: (callback: (isHovered: boolean) => void) => {
    const handler = (_event: any, isHovered: boolean) => callback(isHovered);
    ipcRenderer.on('desktop-lyric-hover', handler);
    return () => ipcRenderer.removeListener('desktop-lyric-hover', handler);
  },
  moveDesktopLyricWindow: (delta: { deltaX: number; deltaY: number }) =>
    ipcRenderer.send('move-desktop-lyric-window', delta),
});

