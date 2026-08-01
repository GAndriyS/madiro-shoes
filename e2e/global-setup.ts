import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

import { apiEnv } from './playwright.config';

/**
 * Everything that has to happen once, before any server starts: build the
 * workspace, then bring the e2e database to a known state.
 *
 * This used to be chained into `webServer.command` with `&&`, which forced an
 * `exec` prefix so Playwright's shutdown would kill node rather than the shell
 * that owned it — and `exec` is a POSIX builtin, so the whole suite could not
 * start on Windows. Doing the one-off work here leaves each webServer as a
 * single process, which Playwright can start and stop on any platform.
 */
const repoRoot = resolve(__dirname, '..');

function run(command: string): void {
  console.log(`▸ ${command}`);
  execSync(command, { cwd: repoRoot, stdio: 'inherit', env: { ...process.env, ...apiEnv } });
}

export default function globalSetup(): void {
  // shared first — a stale packages/shared/dist renders a blank app with an
  // empty console (docs/test-run-2026-07-30.md, ENV-1).
  run('pnpm --filter @madiro/shared build');
  run('pnpm --filter @madiro/api build');
  run('pnpm --filter @madiro/scanner build');
  run('pnpm --filter @madiro/dashboard build');

  // Explicit DATABASE_URL in `env` above keeps this on madiro_e2e even though
  // the prisma CLI also reads apps/api/.env (dotenv never overrides a real
  // environment variable).
  run('pnpm --filter @madiro/api db:deploy');
  run('pnpm --filter @madiro/api db:seed');
}
