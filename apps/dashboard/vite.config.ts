import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

// API_PORT comes from the monorepo-root .env — the same file docker compose
// reads for POSTGRES_PORT — so a machine that had to move the API off 3000
// configures both in one place instead of prefixing every command.
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

// The release version lives in the workspace root package.json (scripts/release.sh
// bumps exactly that one file); inline it so the UI can name the build it is.
const { version: APP_VERSION } = createRequire(import.meta.url)('../../package.json') as {
  version: string;
};

export default defineConfig(({ mode }) => {
  const apiTarget = `http://localhost:${loadEnv(mode, repoRoot, '').API_PORT ?? 3000}`;
  const proxy = {
    '/api': apiTarget,
    // Realtime goes through the same dev proxy, so the browser sees one origin.
    '/socket.io': { target: apiTarget, ws: true },
  };

  return {
    define: { __APP_VERSION__: JSON.stringify(APP_VERSION) },
    plugins: [tanstackRouter({ target: 'react', autoCodeSplitting: true }), react(), tailwindcss()],
    server: { port: 5173, proxy },
    // vite preview serves the built app for browser e2e — same proxy story.
    preview: { port: 5173, proxy },
    test: {
      environment: 'jsdom',
      setupFiles: ['./test/setup.ts'],
      globals: true,
    },
  };
});
