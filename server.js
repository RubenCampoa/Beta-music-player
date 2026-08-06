const { server } = require('@neteasecloudmusicapienhanced/api');

const PORT = process.env.PORT || 3000;

// --- NetEase Cloud Music API ---
server.serveNcmApi({
  port: Number(PORT),
  host: '0.0.0.0', // Listen on all network interfaces (IPv4 and IPv6)
}).then(() => {
  console.log(`[NeteaseCloudMusicApiEnhanced] Ready on http://127.0.0.1:${PORT}`);
}).catch((err) => {
  console.error('Failed to start NeteaseCloudMusicApiEnhanced server:', err);
  process.exit(1);
});

// --- QQ Music API (local qq-music-api HTTP service on port 3200) ---
try {
  const qqApp = require('@sansenjian/qq-music-api');
  qqApp.listen(3200, '127.0.0.1', () => {
    console.log('[QQ Music API] Ready on http://127.0.0.1:3200');
  });
} catch (err) {
  console.error('Failed to start QQ Music API server:', err);
}
