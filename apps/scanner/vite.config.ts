import { fileURLToPath } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

// API_PORT comes from the monorepo-root .env — the same file docker compose
// reads for POSTGRES_PORT — so a machine that had to move the API off 3000
// configures both in one place instead of prefixing every command.
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig(({ mode }) => {
  const apiTarget = `http://localhost:${loadEnv(mode, repoRoot, '').API_PORT ?? 3000}`;

  return {
    plugins: [
      tanstackRouter({ target: 'react', autoCodeSplitting: true }),
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        manifest: {
          name: 'Madiro — облік взуття',
          short_name: 'Madiro',
          lang: 'uk',
          display: 'standalone',
          start_url: '/',
          theme_color: '#2b2620',
          background_color: '#f5f1ea',
          icons: [
            { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
            {
              src: '/icons/icon-maskable-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          // Offline decision (audit #1): app shell is precached for installability,
          // API is network-only — no offline queue, the UI shows a banner instead.
          navigateFallbackDenylist: [/^\/api/],
          runtimeCaching: [
            {
              // Match by pathname, not the full URL (S-14): in production the
              // API lives on its own origin, and the old /^\/api\// regex never
              // matched a full URL — the rule was dead, right by accident.
              urlPattern: ({ url }) => url.pathname.startsWith('/api'),
              handler: 'NetworkOnly',
            },
            {
              // Fonts come from Google CDN; without caching the offline shell
              // renders in fallback fonts. Stylesheets change rarely — SWR.
              urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com',
              handler: 'StaleWhileRevalidate',
              options: { cacheName: 'google-fonts-stylesheets' },
            },
            {
              // Font binaries are immutable — cache-first for a year.
              urlPattern: ({ url }) => url.origin === 'https://fonts.gstatic.com',
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-webfonts',
                expiration: { maxEntries: 20, maxAgeSeconds: 365 * 24 * 60 * 60 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
          ],
        },
      }),
    ],
    server: {
      port: 5174,
      proxy: {
        '/api': apiTarget,
      },
    },
    preview: {
      port: 5174,
      proxy: {
        '/api': apiTarget,
      },
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./test/setup.ts'],
    },
  };
});
