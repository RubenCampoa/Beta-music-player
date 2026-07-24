import { app, BrowserWindow, ipcMain, dialog, protocol, net, Tray, Menu, globalShortcut, nativeImage, screen } from 'electron';
import path from 'path';
import fs from 'fs';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

// Enable full GPU hardware acceleration & zero-copy GPU rasterization
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('disable-gpu-vsync');
app.commandLine.appendSwitch('max-gum-fps', '120');
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=512');
app.commandLine.appendSwitch('enable-features', 'ParallelDownloading,CanvasOopRasterization');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app-audio', privileges: { secure: true, standard: true, supportFetchAPI: true, stream: true } }
]);

function createTray() {
  if (tray) return;

  const possibleIconPaths = [
    path.join(__dirname, '../public/icon.png'),
    path.join(__dirname, '../dist/icon.png'),
    path.join(process.resourcesPath, 'public/icon.png'),
    path.join(process.resourcesPath, 'dist/icon.png'),
    path.join(app.getAppPath(), 'public/icon.png'),
    path.join(app.getAppPath(), 'dist/icon.png'),
  ];

  let trayIcon = nativeImage.createEmpty();
  for (const p of possibleIconPaths) {
    if (fs.existsSync(p)) {
      trayIcon = nativeImage.createFromPath(p);
      break;
    }
  }

  if (!trayIcon.isEmpty()) {
    trayIcon = trayIcon.resize({ width: 16, height: 16 });
  }

  try {
    tray = new Tray(trayIcon);
    tray.setToolTip('Beta Music Player');
    
    const contextMenu = Menu.buildFromTemplate([
      {
        label: '显示主界面',
        click: () => {
          mainWindow?.show();
          mainWindow?.focus();
        },
      },
      { type: 'separator' },
      {
        label: '播放 / 暂停',
        click: () => mainWindow?.webContents.send('media-control', 'toggle-play'),
      },
      {
        label: '上一首',
        click: () => mainWindow?.webContents.send('media-control', 'prev-song'),
      },
      {
        label: '下一首',
        click: () => mainWindow?.webContents.send('media-control', 'next-song'),
      },
      { type: 'separator' },
      {
        label: '退出 Beta Music Player',
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ]);

    tray.setContextMenu(contextMenu);

    tray.on('click', () => {
      if (mainWindow?.isVisible()) {
        mainWindow.focus();
      } else {
        mainWindow?.show();
        mainWindow?.focus();
      }
    });

    tray.on('double-click', () => {
      if (mainWindow?.isVisible()) {
        mainWindow.focus();
      } else {
        mainWindow?.show();
        mainWindow?.focus();
      }
    });
  } catch (err) {
    console.warn('Failed to create tray:', err);
  }
}

function registerGlobalMediaShortcuts() {
  try {
    globalShortcut.register('MediaPlayPause', () => {
      mainWindow?.webContents.send('media-control', 'toggle-play');
    });
    globalShortcut.register('MediaNextTrack', () => {
      mainWindow?.webContents.send('media-control', 'next-song');
    });
    globalShortcut.register('MediaPreviousTrack', () => {
      mainWindow?.webContents.send('media-control', 'prev-song');
    });
  } catch (err) {
    console.warn('Global media shortcuts registration failed:', err);
  }
}

function getAppIconPath() {
  const possibleIconPaths = [
    path.join(__dirname, '../public/icon.png'),
    path.join(__dirname, '../dist/icon.png'),
    path.join(process.resourcesPath, 'public/icon.png'),
    path.join(process.resourcesPath, 'dist/icon.png'),
    path.join(app.getAppPath(), 'public/icon.png'),
    path.join(app.getAppPath(), 'dist/icon.png'),
  ];
  for (const p of possibleIconPaths) {
    if (fs.existsSync(p)) return p;
  }
  return path.join(__dirname, '../public/icon.png');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0f0f12',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
    },
    icon: getAppIconPath(),
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });

  mainWindow.on('enter-full-screen', () => {
    mainWindow?.webContents.send('fullscreen-change', true);
  });

  mainWindow.on('leave-full-screen', () => {
    mainWindow?.webContents.send('fullscreen-change', false);
  });

  // Windows Close to Tray Behavior
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  const distIndexPath = path.join(__dirname, '../dist/index.html');

  const loadWithRetry = (url: string, retries = 10) => {
    mainWindow?.loadURL(url).catch((err) => {
      console.log(`Failed to load ${url}, retrying... (${retries} left)`);
      if (retries > 0) {
        setTimeout(() => loadWithRetry(url, retries - 1), 1000);
      } else {
        if (fs.existsSync(distIndexPath)) {
          mainWindow?.loadFile(distIndexPath);
        }
      }
    });
  };

  if (devUrl) {
    loadWithRetry(devUrl);
  } else {
    mainWindow.loadFile(distIndexPath);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function startNeteaseServer() {
  try {
    const { server } = require('@neteasecloudmusicapienhanced/api');
    server
      .serveNcmApi({
        port: 3000,
        host: '0.0.0.0',
      })
      .then(() => {
        console.log('[NetEase Cloud Music API Server] Running on http://127.0.0.1:3000');
      })
      .catch((err: any) => {
        console.warn('[NetEase API Server Warning]', err);
      });
  } catch (err) {
    console.warn('[NetEase API Server Launch Error]', err);
  }
}

app.whenReady().then(() => {
  startNeteaseServer();

  protocol.handle('app-audio', (request) => {
    const filePath = decodeURIComponent(request.url.slice('app-audio://'.length));
    return net.fetch('file:///' + filePath);
  });

  createWindow();
  createTray();
  registerGlobalMediaShortcuts();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Desktop Lyric Window Management & IPC Routing
let desktopLyricWindow: BrowserWindow | null = null;
let lastDesktopLyricData: any = null;
let isDesktopLyricLocked = false;
let hoverCheckInterval: NodeJS.Timeout | null = null;
let lastHoverState = false;

function startLyricHoverCheck() {
  if (hoverCheckInterval) return;
  hoverCheckInterval = setInterval(() => {
    if (!desktopLyricWindow || desktopLyricWindow.isDestroyed()) {
      if (hoverCheckInterval) clearInterval(hoverCheckInterval);
      hoverCheckInterval = null;
      lastHoverState = false;
      return;
    }

    const mousePos = screen.getCursorScreenPoint();
    const bounds = desktopLyricWindow.getBounds();

    const isInside =
      mousePos.x >= bounds.x &&
      mousePos.x <= bounds.x + bounds.width &&
      mousePos.y >= bounds.y &&
      mousePos.y <= bounds.y + bounds.height;

    if (isInside !== lastHoverState) {
      lastHoverState = isInside;
      desktopLyricWindow.webContents.send('desktop-lyric-hover', isInside);
    }

    if (isDesktopLyricLocked) {
      // If cursor is near top bar region (top 45px), allow mouse clicks so Unlock button can be pressed!
      const isTopBarRegion =
        mousePos.x >= bounds.x &&
        mousePos.x <= bounds.x + bounds.width &&
        mousePos.y >= bounds.y &&
        mousePos.y <= bounds.y + 45;

      if (isTopBarRegion) {
        desktopLyricWindow.setIgnoreMouseEvents(false);
      } else {
        desktopLyricWindow.setIgnoreMouseEvents(true, { forward: true });
      }
    }
  }, 40);
}

function createDesktopLyricWindow() {
  if (desktopLyricWindow && !desktopLyricWindow.isDestroyed()) {
    if (desktopLyricWindow.isMinimized()) desktopLyricWindow.restore();
    desktopLyricWindow.show();
    return;
  }

  desktopLyricWindow = new BrowserWindow({
    width: 820,
    height: 160,
    minWidth: 420,
    minHeight: 120,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
    },
    icon: getAppIconPath(),
  });

  desktopLyricWindow.setAlwaysOnTop(true, 'screen-saver');

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  const distIndexPath = path.join(__dirname, '../dist/index.html');

  if (devUrl) {
    desktopLyricWindow.loadURL(`${devUrl}#/desktop-lyric`);
  } else if (fs.existsSync(distIndexPath)) {
    desktopLyricWindow.loadFile(distIndexPath, { hash: '/desktop-lyric' });
  }

  desktopLyricWindow.once('ready-to-show', () => {
    desktopLyricWindow?.show();
    if (lastDesktopLyricData) {
      desktopLyricWindow?.webContents.send('desktop-lyric-data', lastDesktopLyricData);
    }
  });

  startLyricHoverCheck();

  desktopLyricWindow.on('closed', () => {
    desktopLyricWindow = null;
    isDesktopLyricLocked = false;
    mainWindow?.webContents.send('desktop-lyric-status-changed', false);
  });
}

ipcMain.on('toggle-desktop-lyric', () => {
  if (desktopLyricWindow && !desktopLyricWindow.isDestroyed()) {
    desktopLyricWindow.close();
  } else {
    createDesktopLyricWindow();
    mainWindow?.webContents.send('desktop-lyric-status-changed', true);
  }
});

ipcMain.on('close-desktop-lyric', () => {
  if (desktopLyricWindow && !desktopLyricWindow.isDestroyed()) {
    desktopLyricWindow.close();
  }
});

ipcMain.on('set-desktop-lyric-ignore-mouse', (_event, ignore) => {
  isDesktopLyricLocked = ignore;
  if (desktopLyricWindow && !desktopLyricWindow.isDestroyed()) {
    if (ignore) {
      desktopLyricWindow.setIgnoreMouseEvents(true, { forward: true });
    } else {
      desktopLyricWindow.setIgnoreMouseEvents(false);
    }
  }
});

ipcMain.on('sync-desktop-lyric-data', (_event, data) => {
  lastDesktopLyricData = data;
  if (desktopLyricWindow && !desktopLyricWindow.isDestroyed()) {
    desktopLyricWindow.webContents.send('desktop-lyric-data', data);
  }
});

ipcMain.on('desktop-lyric-action', (_event, action) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('media-control', action);
  }
});

ipcMain.on('move-desktop-lyric-window', (_event, { deltaX, deltaY }) => {
  if (desktopLyricWindow && !desktopLyricWindow.isDestroyed()) {
    const [x, y] = desktopLyricWindow.getPosition();
    desktopLyricWindow.setPosition(x + Math.round(deltaX), y + Math.round(deltaY));
  }
});

// Basic Window Controls
ipcMain.on('window-minimize', () => mainWindow?.minimize());
ipcMain.on('window-maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on('window-fullscreen', () => {
  if (mainWindow) {
    const isFS = mainWindow.isFullScreen();
    mainWindow.setFullScreen(!isFS);
  }
});
ipcMain.handle('is-window-fullscreen', () => {
  return mainWindow?.isFullScreen() ?? false;
});
ipcMain.on('window-close', () => {
  if (!isQuitting) {
    mainWindow?.hide();
  } else {
    mainWindow?.close();
  }
});

// Local File Selection
ipcMain.handle('select-audio-files', async () => {
  if (!mainWindow) return [];
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Audio Files', extensions: ['mp3', 'flac', 'wav', 'm4a', 'aac', 'ogg'] }]
  });
  return result.canceled ? [] : result.filePaths;
});

ipcMain.handle('select-audio-folder', async () => {
  if (!mainWindow) return [];
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
  return result.canceled ? [] : result.filePaths[0];
});

// NetEase Cloud Music Cookie Login via Browser Window
ipcMain.handle('login-via-window', async () => {
  return new Promise((resolve) => {
    const loginWin = new BrowserWindow({
      width: 1024,
      height: 768,
      title: '登录网易云音乐',
      backgroundColor: '#ffffff',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });
    
    // Clear existing cookies for a fresh login
    loginWin.webContents.session.clearStorageData({ storages: ['cookies'] }).then(() => {
      loginWin.loadURL('https://music.163.com/#/login');
    });

    const checkCookies = async () => {
      try {
        const cookies = await loginWin.webContents.session.cookies.get({ url: 'https://music.163.com' });
        const musicU = cookies.find(c => c.name === 'MUSIC_U');
        
        // MUSIC_U indicates a successful login
        if (musicU) {
          const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');
          loginWin.close();
          resolve(cookieStr);
        }
      } catch (e) {
        console.error('Error reading cookies:', e);
      }
    };

    const interval = setInterval(checkCookies, 1500);

    loginWin.on('closed', () => {
      clearInterval(interval);
      resolve(null); // Return null if user closes window without logging in
    });
  });
});

