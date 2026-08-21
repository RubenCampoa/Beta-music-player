// Dedicated, authenticated loopback provider sidecar for the Qt client.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const runtimeRoot = __dirname;
const runtimeModule = (...parts) => path.join(runtimeRoot, 'node_modules', ...parts);
const { server } = require(runtimeModule('@neteasecloudmusicapienhanced', 'api'));
const NETEASE_PORT = Number(process.env.BETA_NETEASE_PORT || 3010);
const QQ_PORT = Number(process.env.BETA_QQ_PORT || 3210);
const PARENT_PID = Number(process.env.BETA_PARENT_PID || 0);
const SIDECAR_TOKEN = String(process.env.BETA_SIDECAR_TOKEN || '');

if (SIDECAR_TOKEN.length < 32) {
  throw new Error('BETA_SIDECAR_TOKEN is missing or invalid');
}

let apiApp = null;
let qqServer = null;

function tokenMatches(candidate) {
  const actual = Buffer.from(String(candidate || ''));
  const expected = Buffer.from(SIDECAR_TOKEN);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function protectApp(app, service) {
  if (Array.isArray(app.middleware)) {
    const guard = async (ctx, next) => {
      if (!tokenMatches(ctx.get('X-Beta-Sidecar-Token'))) {
        ctx.status = 403;
        ctx.body = { code: 403, message: 'Forbidden' };
        return;
      }
      if (ctx.path === '/__beta_health') {
        ctx.set('X-Beta-Sidecar', service);
        ctx.status = 200;
        ctx.body = { ok: true, service };
        return;
      }
      await next();
    };
    app.use(guard);
    const middleware = app.middleware.pop();
    app.middleware.unshift(middleware);
    return;
  }

  const guard = (req, res, next) => {
    if (!tokenMatches(req.get('X-Beta-Sidecar-Token'))) {
      res.status(403).json({ code: 403, message: 'Forbidden' });
      return;
    }
    if (req.path === '/__beta_health') {
      res.setHeader('X-Beta-Sidecar', service);
      res.status(200).json({ ok: true, service });
      return;
    }
    next();
  };
  app.use(guard);
  const stack = app._router?.stack || app.router?.stack;
  if (!Array.isArray(stack) || stack.length === 0) {
    throw new Error(`Unable to install ${service} sidecar guard`);
  }
  const layer = stack.pop();
  stack.unshift(layer);
}

async function start() {
  apiApp = await server.serveNcmApi({ port: NETEASE_PORT, host: '127.0.0.1', checkVersion: false });
  protectApp(apiApp, 'netease');
  console.log(`[NetEase API] Ready on http://127.0.0.1:${NETEASE_PORT}`);

  const qqApp = require(runtimeModule('@sansenjian', 'qq-music-api'));
  protectApp(qqApp, 'qq');
  await new Promise((resolve, reject) => {
    qqServer = qqApp.listen(QQ_PORT, '127.0.0.1', resolve);
    qqServer.once('error', reject);
  });
  console.log(`[QQ Music API] Ready on http://127.0.0.1:${QQ_PORT}`);
}

start().catch((error) => {
  console.error('[Sidecar] Startup failed:', error);
  shutdown(1);
});

function shutdown(exitCode = 0) {
  const servers = [apiApp?.server, qqServer].filter(Boolean);
  if (servers.length === 0) {
    process.exit(exitCode);
    return;
  }
  let pending = servers.length;
  const done = () => {
    pending -= 1;
    if (pending === 0) process.exit(exitCode);
  };
  for (const activeServer of servers) {
    try { activeServer.close(done); }
    catch (_) { done(); }
  }
  setTimeout(() => process.exit(exitCode), 1500).unref();
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

// A QProcess child normally receives SIGTERM from MusicBridge. During an IDE
// stop, crash, or Task Manager termination the Qt destructor cannot run and a
// Node sidecar used to remain alive indefinitely. Polling the parent PID keeps
// this recovery path platform-independent and bounds orphan lifetime to two
// seconds without affecting standalone sidecar development.
if (Number.isInteger(PARENT_PID) && PARENT_PID > 0) {
  const parentWatchdog = setInterval(() => {
    try {
      process.kill(PARENT_PID, 0);
    } catch (_) {
      clearInterval(parentWatchdog);
      shutdown();
    }
  }, 2000);
  parentWatchdog.unref();
}
