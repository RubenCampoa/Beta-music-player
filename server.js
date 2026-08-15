const { server } = require('@neteasecloudmusicapienhanced/api');

const PORT = process.env.PORT || 3000;

// --- NetEase Cloud Music API ---
server.serveNcmApi({
  port: Number(PORT),
  host: '127.0.0.1', // Local-only; never expose the API to the LAN.
}).then(() => {
  console.log(`[NeteaseCloudMusicApiEnhanced] Ready on http://127.0.0.1:${PORT}`);
}).catch((err) => {
  console.error('Failed to start NeteaseCloudMusicApiEnhanced server:', err);
  process.exit(1);
});

// --- QQ Music API (local qq-music-api HTTP service on port 3200) ---
try {
  const qqApp = require('@sansenjian/qq-music-api');
  const qqServer = qqApp.listen(3200, '127.0.0.1', () => {
    console.log('[QQ Music API] Ready on http://127.0.0.1:3200');
  });
  // EADDRINUSE is emitted asynchronously; without a listener it would crash
  // the process as an unhandled 'error' event.
  qqServer.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE') {
      console.warn('[QQ Music API] Port 3200 already in use — QQ features may be unavailable.');
    } else {
      console.error('[QQ Music API] Server error:', err);
    }
  });
} catch (err) {
  console.error('Failed to start QQ Music API server:', err);
}

// --- KuGou Music API (local HTTP service on port 3400) ---
(async () => {
  const previousPort = process.env.PORT;
  const previousHost = process.env.HOST;
  process.env.PORT = '3400';
  process.env.HOST = '127.0.0.1';
  // This app is branded as KuGou Concept Edition. The upstream API uses the
  // `lite` platform to select the concept-edition WeChat app credentials and
  // the matching VIP/audio endpoints.
  process.env.platform = 'lite';
  try {
    const { startService } = require('kugoumusicapi/server.js');
    const kugouApp = await startService();
    kugouApp?.service?.on?.('error', (err) => {
      console.error('[KuGou Music API] Server error:', err);
    });
    console.log('[KuGou Music API] Ready on http://127.0.0.1:3400');
  } catch (err) {
    console.error('Failed to start KuGou Music API server:', err);
  } finally {
    if (previousPort === undefined) delete process.env.PORT;
    else process.env.PORT = previousPort;
    if (previousHost === undefined) delete process.env.HOST;
    else process.env.HOST = previousHost;
  }
})();
