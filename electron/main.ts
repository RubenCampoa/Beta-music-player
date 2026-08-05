import { app, BrowserWindow, ipcMain, dialog, protocol, net, Tray, Menu, globalShortcut, nativeImage, screen } from 'electron';
import path from 'path';
import fs from 'fs';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let preFullscreenBounds: Electron.Rectangle | null = null;
let preFullscreenWasMaximized = false;
let lastWindowedBounds: Electron.Rectangle | null = null;
let lastWindowedWasMaximized = false;
let normalBoundsBeforeMaximize: Electron.Rectangle | null = null;
let windowOpacityAnimation: NodeJS.Timeout | null = null;
let windowBoundsAnimation: NodeJS.Timeout | null = null;
let isAnimatingWindowBounds = false;
let isProgrammaticMinimize = false;

// Enable full GPU hardware acceleration & zero-copy GPU rasterization
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('disable-gpu-vsync');
app.commandLine.appendSwitch('max-gum-fps', '120');
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=512');
app.commandLine.appendSwitch('enable-features', 'ParallelDownloading,CanvasOopRasterization');

// Keep the native application identity aligned with the product branding.
// This also prevents Windows from grouping the packaged app under "Electron".
app.setName('Beta Music Player');
if (process.platform === 'win32') {
  app.setAppUserModelId('com.beta.musicplayer');
}

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
          showMainWindowAnimated();
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
        showMainWindowAnimated();
      }
    });

    tray.on('double-click', () => {
      if (mainWindow?.isVisible()) {
        mainWindow.focus();
      } else {
        showMainWindowAnimated();
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
    // Use the same source as the installer icon in every packaged window.
    path.join(app.getAppPath(), 'public/icon.png'),
    path.join(__dirname, '../public/icon.png'),
    path.join(__dirname, '../dist/icon.png'),
    path.join(process.resourcesPath, 'public/icon.png'),
    path.join(process.resourcesPath, 'dist/icon.png'),
    path.join(app.getAppPath(), 'dist/icon.png'),
  ];
  for (const p of possibleIconPaths) {
    if (fs.existsSync(p)) return p;
  }
  return path.join(__dirname, '../public/icon.png');
}

type WindowTransition =
  | 'opening'
  | 'restoring'
  | 'minimizing'
  | 'maximizing'
  | 'unmaximizing'
  | 'idle';

function sendWindowTransition(transition: WindowTransition) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('window-transition', transition);
  }
}

function animateNativeOpacity(target: number, duration: number, onComplete?: () => void) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (windowOpacityAnimation) clearTimeout(windowOpacityAnimation);

  const start = mainWindow.getOpacity();
  const startedAt = Date.now();
  const tick = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const progress = Math.min(1, (Date.now() - startedAt) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    mainWindow.setOpacity(start + (target - start) * eased);

    if (progress < 1) {
      windowOpacityAnimation = setTimeout(tick, 16);
    } else {
      windowOpacityAnimation = null;
      onComplete?.();
    }
  };

  tick();
}

function showMainWindowAnimated() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
    return;
  }

  mainWindow.setOpacity(0);
  mainWindow.show();
  mainWindow.focus();
  sendWindowTransition('restoring');
  animateNativeOpacity(1, 260);
}

function animateWindowBounds(target: Electron.Rectangle, duration: number, onComplete?: () => void) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (windowBoundsAnimation) clearTimeout(windowBoundsAnimation);

  const start = mainWindow.getBounds();
  const startedAt = Date.now();
  isAnimatingWindowBounds = true;

  const tick = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const progress = Math.min(1, (Date.now() - startedAt) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    mainWindow.setBounds({
      x: Math.round(start.x + (target.x - start.x) * eased),
      y: Math.round(start.y + (target.y - start.y) * eased),
      width: Math.round(start.width + (target.width - start.width) * eased),
      height: Math.round(start.height + (target.height - start.height) * eased),
    }, false);

    if (progress < 1) {
      windowBoundsAnimation = setTimeout(tick, 16);
    } else {
      windowBoundsAnimation = null;
      isAnimatingWindowBounds = false;
      onComplete?.();
    }
  };

  tick();
}

function animateToggleMaximize() {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isFullScreen() || mainWindow.isMinimized()) return;
  if (windowBoundsAnimation) return;

  if (!mainWindow.isMaximized()) {
    const start = mainWindow.getBounds();
    normalBoundsBeforeMaximize = lastWindowedBounds ?? start;
    const target = screen.getDisplayMatching(start).workArea;
    sendWindowTransition('maximizing');
    animateWindowBounds(target, 360, () => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      // Commit the native maximized state after the visual bounds animation.
      isAnimatingWindowBounds = true;
      mainWindow.maximize();
      isAnimatingWindowBounds = false;
      lastWindowedBounds = normalBoundsBeforeMaximize;
      lastWindowedWasMaximized = false;
    });
    return;
  }

  const start = mainWindow.getBounds();
  const target = normalBoundsBeforeMaximize ?? mainWindow.getNormalBounds();
  sendWindowTransition('unmaximizing');

  // Release the native maximized flag, immediately put the window back at the
  // maximized bounds, then animate to the saved normal bounds.
  isAnimatingWindowBounds = true;
  mainWindow.unmaximize();
  mainWindow.setBounds(start, false);
  isAnimatingWindowBounds = false;
  animateWindowBounds(target, 360, () => {
    lastWindowedBounds = target;
    lastWindowedWasMaximized = false;
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    title: 'Beta Music Player',
    frame: false,
    titleBarStyle: 'hidden',
    // Keep the native surface transparent so fullscreen lyrics can expose
    // the desktop when its fluid background is disabled.
    transparent: true,
    backgroundColor: '#00000000',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
    },
    icon: getAppIconPath(),
  });
  lastWindowedBounds = mainWindow.getBounds();
  lastWindowedWasMaximized = mainWindow.isMaximized();
  normalBoundsBeforeMaximize = lastWindowedBounds;

  const rememberWindowedBounds = () => {
    if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isFullScreen() || preFullscreenBounds || isAnimatingWindowBounds) return;
    lastWindowedBounds = mainWindow.getBounds();
    lastWindowedWasMaximized = mainWindow.isMaximized();
    if (!lastWindowedWasMaximized) normalBoundsBeforeMaximize = lastWindowedBounds;
  };
  mainWindow.on('resize', rememberWindowedBounds);
  mainWindow.on('move', rememberWindowedBounds);

  mainWindow.on('minimize', (event: Electron.Event) => {
    if (isProgrammaticMinimize) {
      isProgrammaticMinimize = false;
      return;
    }

    // On Windows this event can be cancelled, which lets a taskbar click use
    // the same fade/shrink animation as the custom title-bar button. If the
    // platform ignores preventDefault, the delayed minimize is harmless and
    // the restore animation still remains active.
    event.preventDefault();
    sendWindowTransition('minimizing');
    animateNativeOpacity(0, 220, () => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      isProgrammaticMinimize = true;
      mainWindow.minimize();
      mainWindow.setOpacity(1);
    });
  });

  mainWindow.on('restore', () => {
    mainWindow?.setOpacity(0);
    mainWindow?.show();
    mainWindow?.focus();
    sendWindowTransition('restoring');
    animateNativeOpacity(1, 260);
  });

  mainWindow.on('maximize', () => {
    sendWindowTransition('maximizing');
  });

  mainWindow.on('unmaximize', () => {
    sendWindowTransition('unmaximizing');
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });

  mainWindow.on('enter-full-screen', () => {
    // Some Windows builds can enter fullscreen through the native window
    // manager. Capture the bounds here as a fallback if the IPC path did not
    // get a chance to record them first.
    if (!preFullscreenBounds) {
      preFullscreenBounds = lastWindowedBounds ?? mainWindow?.getBounds() ?? null;
      preFullscreenWasMaximized = lastWindowedWasMaximized;
    }
    mainWindow?.webContents.send('fullscreen-change', true);
  });

  mainWindow.on('leave-full-screen', () => {
    mainWindow?.webContents.send('fullscreen-change', false);
    // setFullScreen(false) is asynchronous on Windows. Restore after the
    // native leave event so the old window size is not overwritten by the OS.
    setTimeout(restorePreFullscreenBounds, 50);
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
    if (!desktopLyricWindow || desktopLyricWindow.isDestroyed() || !desktopLyricWindow.isVisible()) {
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

function restorePreFullscreenBounds() {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isFullScreen() || !preFullscreenBounds) {
    return;
  }

  const bounds = preFullscreenBounds;
  const wasMaximized = preFullscreenWasMaximized;
  preFullscreenBounds = null;
  preFullscreenWasMaximized = false;
  lastWindowedBounds = bounds;
  lastWindowedWasMaximized = wasMaximized;

  if (wasMaximized) {
    mainWindow.setBounds(bounds, true);
    mainWindow.maximize();
  } else {
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    mainWindow.setBounds(bounds, true);
  }
}

function setMainWindowFullScreen(enabled: boolean) {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  if (enabled) {
    if (!mainWindow.isFullScreen()) {
      preFullscreenBounds = mainWindow.getBounds();
      preFullscreenWasMaximized = mainWindow.isMaximized();
      mainWindow.setFullScreen(true);
    }
    return;
  }

  if (mainWindow.isFullScreen()) {
    mainWindow.setFullScreen(false);
  } else {
    restorePreFullscreenBounds();
  }
}

// Basic Window Controls
ipcMain.on('window-minimize', () => {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isMinimized()) return;
  sendWindowTransition('minimizing');
  animateNativeOpacity(0, 220, () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    isProgrammaticMinimize = true;
    mainWindow.minimize();
    // Keep the window fully opaque for the next taskbar restore.
    mainWindow.setOpacity(1);
  });
});
ipcMain.on('window-maximize', () => animateToggleMaximize());
ipcMain.on('window-fullscreen', () => {
  setMainWindowFullScreen(!(mainWindow?.isFullScreen() ?? false));
});
ipcMain.on('window-set-fullscreen', (_event, enabled: boolean) => {
  setMainWindowFullScreen(Boolean(enabled));
});
ipcMain.handle('is-window-fullscreen', () => {
  return mainWindow?.isFullScreen() ?? false;
});
ipcMain.on('window-close', () => {
  if (!isQuitting) {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    sendWindowTransition('minimizing');
    animateNativeOpacity(0, 220, () => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      mainWindow.hide();
      mainWindow.setOpacity(1);
    });
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

