import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import renderer from 'vite-plugin-electron-renderer';
import path from 'path';

// Content-Security-Policy injected as a <meta> tag. A meta tag is required
// (not just a header) because the packaged app loads via loadFile() and
// Electron's webRequest does not intercept file:// responses.
// Dev needs 'unsafe-inline' scripts (React Fast Refresh injects an inline
// module) and the Vite HMR websocket; the production build has neither.
// media-src/img-src must allow http: — NetEase/QQ CDN audio URLs are
// returned as plain http (neteaseApi.ts keeps them unforced to avoid SSL
// handshake timeouts), and cover images can also be http.
const CSP_DEV = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'", // framer-motion injects keyframes into <style>
  "img-src 'self' data: blob: https: http:",
  "media-src 'self' blob: https: http: app-audio:",
  "connect-src 'self' ws://localhost:5173 http://127.0.0.1:3000 http://127.0.0.1:3200 http://127.0.0.1:3400 http://mobilecdn.kugou.com http://m.kugou.com https:",
  "font-src 'self' data:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
  "frame-src 'none'",
  "worker-src 'self' blob:",
].join('; ');

const CSP_PROD = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https: http:",
  "media-src 'self' blob: https: http: app-audio:",
  "connect-src 'self' http://127.0.0.1:3000 http://127.0.0.1:3200 http://127.0.0.1:3400 http://mobilecdn.kugou.com http://m.kugou.com https:",
  "font-src 'self' data:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
  "frame-src 'none'",
  "worker-src 'self' blob:",
].join('; ');

function injectCsp(): Plugin {
  return {
    name: 'inject-csp',
    transformIndexHtml(html, ctx) {
      const isDev = !!ctx.server;
      return {
        html,
        tags: [
          {
            tag: 'meta',
            attrs: { 'http-equiv': 'Content-Security-Policy', content: isDev ? CSP_DEV : CSP_PROD },
            injectTo: 'head-prepend',
          },
        ],
      };
    },
  };
}

export default defineConfig({
  base: './', // Critical for Electron relative asset loading
  plugins: [
    injectCsp(),
    react(),
    electron([
      {
        entry: 'electron/main.ts',
      },
      {
        entry: 'electron/preload.ts',
        onstart(options) {
          options.reload();
        },
      },
    ]),
    renderer(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom') || id.includes('zustand')) {
              return 'vendor-react';
            }
            if (id.includes('framer-motion') || id.includes('lucide-react')) {
              return 'vendor-ui';
            }
            if (id.includes('dexie') || id.includes('jsmediatags')) {
              return 'vendor-utils';
            }
          }
        },
      },
    },
  },
});
