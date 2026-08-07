import { app, BrowserWindow, ipcMain, dialog, protocol, net, Tray, Menu, globalShortcut, nativeImage, screen, session } from 'electron';
import path from 'path';
import { pathToFileURL } from 'url';
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

// Let Chromium choose the platform's normal compositor and frame pacing. The
// old forced-rasterization flags disabled vsync for the transparent window,
// which made the main page redraw continuously even while it was idle.
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=512');

// Keep the native application identity aligned with the product branding.
// This also prevents Windows from grouping the packaged app under "Electron".
app.setName('Beta Music Player');
if (process.platform === 'win32') {
  app.setAppUserModelId('com.beta.musicplayer');
}

protocol.registerSchemesAsPrivileged([
  { scheme: 'app-audio', privileges: { secure: true, standard: true, supportFetchAPI: true, stream: true } }
]);

// --- Local audio protocol allowlist ---
// app-audio:// lets the renderer stream locally imported songs. The URL
// embeds an arbitrary user path, so gate it behind an extension + path
// allowlist to prevent it from being abused as a file-read primitive.
const ALLOWED_AUDIO_EXTENSIONS = new Set(['.mp3', '.flac', '.wav', '.m4a', '.aac', '.ogg', '.opus']);

function isAuthorizedAudioPath(filePath: string): boolean {
  try {
    if (!filePath || !path.isAbsolute(filePath)) return false;
    if (filePath.split(/[\\/]+/).includes('..')) return false;
    if (!ALLOWED_AUDIO_EXTENSIONS.has(path.extname(filePath).toLowerCase())) return false;
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

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

function animateWindowBounds(target: Electron.Rectangle, duration: number, onComplete?: () => void, frameInterval = 16) {
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
      windowBoundsAnimation = setTimeout(tick, frameInterval);
    } else {
      windowBoundsAnimation = null;
      isAnimatingWindowBounds = false;
      onComplete?.();
    }
  };

  tick();
}

// Windows does not play its shrink-to-taskbar animation for frameless,
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
      sandbox: true,
      webSecurity: true,
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

  // Minimize/restore intentionally have no handlers: the OS plays its native
  // window animation, and the renderer's custom shell transitions are only
  // driven by the tray show path (showMainWindowAnimated) which has no
  // native counterpart.

  // Minimize/restore use the OS default behaviour (no custom window
  // animation — custom shrink/grow animations were removed as they did not
  // feel right on frameless transparent windows).

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

// --- QQ Music API request header injection ---
// QQ Music CGI endpoints (lyrics, vkey, etc.) reject requests without an
// "https://y.qq.com" Referer (returns retcode -1310). The renderer cannot
// set this forbidden header itself, so we inject it at the network layer.
// The stored QQ cookie is also attached so VIP vkey resolution can work.
let qqMusicCookie = '';

function setupQqApiHeaderInjection() {
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ['*://*.y.qq.com/*', '*://*.qq.com/*', '*://qpic.y.qq.com/*'] },
    (details, callback) => {
      const url = details.url;
      const isQqApiCall = url.includes('/fcg-bin/') || url.includes('/cgi-bin/') || url.includes('/fcg_');
      // Playlist/diss cover images on qpic.y.qq.com are hotlink-protected and
      // return 403 without a y.qq.com Referer.
      const isQqCoverImage = url.includes('qpic.y.qq.com');
      if (isQqApiCall || isQqCoverImage) {
        details.requestHeaders['Referer'] = 'https://y.qq.com/';
        if (qqMusicCookie && isQqApiCall) {
          details.requestHeaders['Cookie'] = qqMusicCookie;
        }
      }
      callback({ requestHeaders: details.requestHeaders });
    }
  );
}

ipcMain.on('set-qq-cookie', (_event, cookie: string) => {
  qqMusicCookie = typeof cookie === 'string' ? cookie : '';
});

// QQ cover CDNs (y.gtimg.cn / qpic.y.qq.com) do not send an
// Access-Control-Allow-Origin header, so the renderer's crossOrigin='Anonymous'
// <img> sampling (fluid background palette extraction) fails and falls back to
// the default colors. These are public image CDNs, so injecting the header at
// the network layer is safe and requires no renderer changes. <img> requests
// are simple GETs (no preflight), so the response header alone is sufficient.
function setupQqCoverCors() {
  session.defaultSession.webRequest.onHeadersReceived(
    { urls: ['*://y.gtimg.cn/*', '*://*.gtimg.cn/*', '*://qpic.y.qq.com/*'] },
    (details, callback) => {
      const responseHeaders = details.responseHeaders ?? {};
      responseHeaders['Access-Control-Allow-Origin'] = ['*'];
      callback({ responseHeaders });
    }
  );
}

// The bundled NetEase API (>= 4.38) resolves VIP playback through
// /song/url/v1, which uses the "xeapi" encryption. That crypto needs a
// public key exchange plus an anonymous token stored in the OS temp dir.
// Only the package's CLI entry (app.js) runs generateConfig(); calling
// serveNcmApi() directly skips it, so /song/url/v1 responds with code 404
// and VIP tracks fail to play. Bootstrap the key material here.
async function bootstrapNeteaseApiKeys() {
  try {
    const os = require('os');
    const keyPath = path.join(os.tmpdir(), 'xeapi_public_key');
    const tokenPath = path.join(os.tmpdir(), 'anonymous_token');
    const ready = () => {
      if (!fs.existsSync(keyPath)) return false;
      try {
        return fs.readFileSync(tokenPath, 'utf-8').trim().length > 0;
      } catch {
        return false;
      }
    };
    const generateConfig = require('@neteasecloudmusicapienhanced/api/generateConfig.js');
    // First pass writes the xeapi public key; the anonymous registration
    // depends on that key, so a second pass is needed on a cold start.
    for (let pass = 0; pass < 3 && !ready(); pass++) {
      try {
        await generateConfig();
      } catch (err) {
        console.warn('[NetEase API Bootstrap] generateConfig failed:', err);
      }
    }
    if (ready()) {
      console.log('[NetEase API Bootstrap] xeapi key & anonymous token ready');
    } else {
      console.warn('[NetEase API Bootstrap] key material still missing, VIP playback may fail');
    }
  } catch (err) {
    console.warn('[NetEase API Bootstrap] unavailable:', err);
  }
}

function startNeteaseServer() {
  try {
    const { server } = require('@neteasecloudmusicapienhanced/api');
    bootstrapNeteaseApiKeys();
    // The exchanged key has a limited lifetime; refresh it periodically.
    setInterval(() => bootstrapNeteaseApiKeys(), 12 * 60 * 60 * 1000).unref?.();
    server
      .serveNcmApi({
        port: 3000,
        host: '127.0.0.1', // Local-only; never expose the API to the LAN.
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

// --- QQ Music API Server (local qq-music-api HTTP service) ---
// The @sansenjian/qq-music-api package exports a pre-configured Koa app.
// We start it on port 3200 so the renderer can call QQ Music endpoints
// through a local proxy instead of hitting QQ CGIs directly (which required
// Referer/Cookie header injection and was fragile).
function startQqMusicServer() {
  try {
    const qqApp = require('@sansenjian/qq-music-api');
    const qqServer = qqApp.listen(3200, '127.0.0.1', () => {
      console.log('[QQ Music API Server] Running on http://127.0.0.1:3200');
    });
    // EADDRINUSE (or any other listen error) is emitted asynchronously and
    // would otherwise crash the main process as an unhandled 'error' event.
    qqServer.on('error', (err: any) => {
      if (err?.code === 'EADDRINUSE') {
        console.warn('[QQ Music API Server] Port 3200 already in use — QQ features may be unavailable.');
      } else {
        console.warn('[QQ Music API Server Error]', err);
      }
    });
  } catch (err) {
    console.warn('[QQ Music API Server Launch Error]', err);
  }
}

app.whenReady().then(() => {
  startNeteaseServer();
  startQqMusicServer();
  setupQqApiHeaderInjection();
  setupQqCoverCors();

  protocol.handle('app-audio', (request) => {
    let filePath: string;
    try {
      // URL shape: app-audio://local/<encodeURIComponent(path with '/')>
      // The path lives in the pathname segment (not the host), so Windows
      // paths with CJK characters / '#' / '%' survive URL parsing intact.
      const url = new URL(request.url);
      let decoded = decodeURIComponent(url.pathname);
      // url.pathname always starts with '/'. A Windows drive path arrives as
      // /C:/... (drop the leading slash); a Unix absolute path encoded as
      // %2F... arrives as //home/... (drop one of the two slashes).
      if (/^\/\/?[A-Za-z]:/.test(decoded)) {
        decoded = decoded.slice(1);
      } else if (decoded.startsWith('//')) {
        decoded = decoded.slice(1);
      }
      filePath = decoded;
    } catch {
      return new Response('Bad Request', { status: 400 });
    }
    if (!isAuthorizedAudioPath(filePath)) {
      return new Response('Forbidden', { status: 403 });
    }
    return net.fetch(pathToFileURL(filePath).href);
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
      sandbox: true,
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
  // System default minimize behaviour.
  mainWindow.minimize();
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

ipcMain.handle('select-audio-folder', async () => {
  if (!mainWindow) return [];
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
  return result.canceled ? [] : result.filePaths[0];
});

// Multi-Platform Cookie Login via Browser Window (NetEase & QQ Music)
ipcMain.handle('login-via-window', async (_event, platform: 'netease' | 'qq' = 'netease') => {
  return new Promise((resolve) => {
    const isQq = platform === 'qq';
    const loginWin = new BrowserWindow({
      width: 1024,
      height: 768,
      title: isQq ? '登录 QQ 音乐' : '登录网易云音乐',
      backgroundColor: '#ffffff',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    });

    // Set a realistic desktop Chrome UA so QQ Music serves the full web app
    // instead of a mobile redirect.
    loginWin.webContents.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
    );

    // Clear existing cookies for a fresh login
    loginWin.webContents.session.clearStorageData({ storages: ['cookies'] }).then(() => {
      if (isQq) {
        // Load the QQ Music portal; the user clicks the login button which
        // opens a QQ ptlogin2 iframe inside the page.
        loginWin.loadURL('https://y.qq.com/');
      } else {
        loginWin.loadURL('https://music.163.com/#/login');
      }
    });

    const checkCookies = async () => {
      try {
        if (isQq) {
          // Query cookies by URL — this returns ALL cookies that would be
          // sent with a request to y.qq.com, including both .qq.com domain
          // cookies (uin, p_skey, etc.) and y.qq.com domain cookies
          // (qqmusic_key, qm_keyst). The old code only queried .qq.com
          // domain, which missed qqmusic_key set on y.qq.com.
          const cookies = await loginWin.webContents.session.cookies.get({ url: 'https://y.qq.com' });

          const hasLoginCookie = cookies.some((c) => {
            // qqmusic_key: legacy QQ Music session key
            if (c.name === 'qqmusic_key' && c.value.length > 5) return true;
            // qm_keyst: modern QQ Music session key
            if (c.name === 'qm_keyst' && c.value.length > 5) return true;
            // uin / p_uin: QQ account identifier (must be a real UIN, not o0)
            if ((c.name === 'uin' || c.name === 'p_uin') && c.value !== 'o0' && c.value !== '0' && c.value.length > 3) return true;
            // p_skey: QQ login session key
            if (c.name === 'p_skey' && c.value.length > 3) return true;
            return false;
          });

          if (hasLoginCookie) {
            // Deduplicate cookies by name (a cookie may exist on both .qq.com
            // and y.qq.com domains; keep the longest value).
            const cookieMap = new Map<string, string>();
            for (const c of cookies) {
              const existing = cookieMap.get(c.name);
              if (!existing || c.value.length > existing.length) {
                cookieMap.set(c.name, c.value);
              }
            }
            const cookieStr = Array.from(cookieMap.entries())
              .map(([name, value]) => `${name}=${value}`)
              .join('; ');
            loginWin.close();
            resolve(cookieStr);
          }
        } else {
          const cookies = await loginWin.webContents.session.cookies.get({ url: 'https://music.163.com' });
          const musicU = cookies.find((c) => c.name === 'MUSIC_U');

          if (musicU) {
            const cookieStr = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
            loginWin.close();
            resolve(cookieStr);
          }
        }
      } catch (e) {
        console.error('Error reading cookies:', e);
      }
    };

    const interval = setInterval(checkCookies, 1500);

    // Auto-close after 5 minutes to prevent indefinite polling
    const timeout = setTimeout(() => {
      clearInterval(interval);
      if (!loginWin.isDestroyed()) loginWin.close();
    }, 5 * 60 * 1000);

    loginWin.on('closed', () => {
      clearInterval(interval);
      clearTimeout(timeout);
      resolve(null);
    });
  });
});

// Local File Selection
ipcMain.handle('select-audio-files', async () => {
  if (!mainWindow) return [];
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Audio Files', extensions: ['mp3', 'flac', 'wav', 'm4a', 'aac', 'ogg', 'opus'] }]
  });
  return result.canceled ? [] : result.filePaths;
});

// Read a locally selected audio file in the main process. The renderer must
// not fetch file:// directly (Chromium blocks it when webSecurity is on), so
// the file is read here and gated by the same allowlist as app-audio://.
ipcMain.handle('read-audio-file', async (_event, filePath: unknown) => {
  if (typeof filePath !== 'string' || !isAuthorizedAudioPath(filePath)) {
    throw new Error('Unauthorized audio file path');
  }
  const data = await fs.promises.readFile(filePath);
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
});
