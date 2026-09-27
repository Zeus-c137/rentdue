import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'prompt',
        injectRegister: 'auto', // We let vite-plugin-pwa handle registration and manifest injection
        manifest: false,
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,woff,woff2}'],
          globIgnores: ['**/3dicons-*', '**/*.map'],
          cleanupOutdatedCaches: true,
          // prompt mode: new SW must stay waiting so onNeedRefresh fires.
          // skipWaiting:true would activate silently and the banner would never show.
          skipWaiting: false,
          clientsClaim: false,
          navigateFallbackDenylist: [/^\/api\/.*/],
          dontCacheBustURLsMatching: /\.\w{8}\./,
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.(?:googleapis|gstatic)\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts',
                expiration: {
                  maxEntries: 20,
                  maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
                }
              }
            },
            {
              urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/i,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'images-lazy',
                expiration: {
                  maxEntries: 40,
                  maxAgeSeconds: 60 * 60 * 24 * 7 // 7 days
                }
              }
            },
          ]
        },
        devOptions: {
          // A service worker in Vite dev can cache stale API/HMR responses and
          // makes installability appear intermittent. Test installation from a
          // production build instead.
          enabled: false,
          type: 'classic'
        }
      })
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    build: {
      chunkSizeWarningLimit: 650,
      cssCodeSplit: true,
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom'],
            motion: ['motion'],
            charts: ['recharts'],
            shaders: ['@paper-design/shaders', '@paper-design/shaders-react', 'three'],
            confetti: ['canvas-confetti'],
            admin: ['xlsx'],
          },
        },
      },
    },
  };
});
