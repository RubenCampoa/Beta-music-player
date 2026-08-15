// Dedicated local provider sidecar for the Qt client.  Each listener is
// started only when its port is free, so the C++ build can run alone while
// remaining friendly to a developer's already-running service.
const fs = require('fs');
const path = require('path');
const runtimeRoot = fs.existsSync(path.join(__dirname, 'node_modules'))
  ? __dirname
  : path.join(__dirname, '..');
const runtimeModule = (...parts) => path.join(runtimeRoot, 'node_modules', ...parts);
const { server } = require(runtimeModule('@neteasecloudmusicapienhanced', 'api'));
const net = require('net');
const NETEASE_PORT = Number(process.env.BETA_NETEASE_PORT || 3010);
const QQ_PORT = Number(process.env.BETA_QQ_PORT || 3210);
const KUGOU_PORT = Number(process.env.BETA_KUGOU_PORT || 3410);

let apiApp = null;
let qqServer = null;

function portInUse(port) {
  return new Promise((resolve) => {
    const probe = net.connect({ host: '127.0.0.1', port }, () => {
      probe.destroy();
      resolve(true);
    });
    probe.once('error', () => resolve(false));
    probe.setTimeout(180, () => { probe.destroy(); resolve(false); });
  });
}

async function start() {
  if (!(await portInUse(NETEASE_PORT))) {
    try {
      apiApp = await server.serveNcmApi({ port: NETEASE_PORT, host: '127.0.0.1', checkVersion: false });
      console.log(`[NetEase API] Ready on http://127.0.0.1:${NETEASE_PORT}`);
    } catch (error) { console.error('[NetEase API] Startup failed:', error); }
  }

  if (!(await portInUse(QQ_PORT))) {
    try {
      const qqApp = require(runtimeModule('@sansenjian', 'qq-music-api'));
      qqServer = qqApp.listen(QQ_PORT, '127.0.0.1', () => console.log(`[QQ Music API] Ready on http://127.0.0.1:${QQ_PORT}`));
      qqServer.on('error', (error) => console.error('[QQ Music API] Server error:', error));
    } catch (error) { console.error('[QQ Music API] Startup failed:', error); }
  }

  if (!(await portInUse(KUGOU_PORT))) {
    const oldPort = process.env.PORT;
    const oldHost = process.env.HOST;
    process.env.PORT = String(KUGOU_PORT); process.env.HOST = '127.0.0.1'; process.env.platform = 'lite';
    try {
      const { startService } = require(runtimeModule('kugoumusicapi', 'server.js'));
      await startService();
      console.log(`[KuGou API] Ready on http://127.0.0.1:${KUGOU_PORT}`);
    } catch (error) { console.error('[KuGou API] Startup failed:', error); }
    if (oldPort === undefined) delete process.env.PORT; else process.env.PORT = oldPort;
    if (oldHost === undefined) delete process.env.HOST; else process.env.HOST = oldHost;
  }
}

start();

function shutdown() {
  if (apiApp && apiApp.server) {
    apiApp.server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1500).unref();
  } else if (qqServer) {
    qqServer.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1500).unref();
  } else {
    process.exit(0);
  }
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
