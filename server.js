const { server } = require('@neteasecloudmusicapienhanced/api');

const PORT = process.env.PORT || 3000;

server.serveNcmApi({
  port: Number(PORT),
  host: '0.0.0.0', // Listen on all network interfaces (IPv4 and IPv6)
}).then(() => {
  console.log(`[NeteaseCloudMusicApiEnhanced] Ready on http://127.0.0.1:${PORT}`);
}).catch((err) => {
  console.error('Failed to start NeteaseCloudMusicApiEnhanced server:', err);
  process.exit(1);
});
