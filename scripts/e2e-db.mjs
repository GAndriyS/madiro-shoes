#!/usr/bin/env node
/**
 * Run a command against the dedicated local `madiro_e2e` database — never the dev one.
 *
 *   node scripts/e2e-db.mjs pnpm --filter @madiro/api test:e2e
 *
 * The api e2e suite empties the tables it touches, and apps/api/.env points at the dev
 * database, so a bare local run wipes the demo data. CI hands the suite a disposable
 * Postgres service through DATABASE_URL; this does the same for scripts/verify.mjs
 * (harness/config.json → slices.api-e2e), on the database Playwright already uses
 * (e2e/playwright.config.ts). DATABASE_URL is always replaced, even when the shell
 * exports one, because the shell's is the dev database more often than not.
 *
 * POSTGRES_PORT comes from the monorepo-root .env, read the way the Playwright config
 * reads it: a machine whose 5432 belongs to another project moves it there.
 */

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');

function rootEnv(name, fallback) {
  if (process.env[name]) return process.env[name];
  try {
    const file = readFileSync(join(ROOT, '.env'), 'utf8');
    const hit = file.match(new RegExp(`^\\s*${name}\\s*=\\s*(.+?)\\s*$`, 'm'))?.[1];
    return hit ? hit.replace(/^["']|["']$/g, '') : fallback;
  } catch {
    return fallback;
  }
}

const [command, ...args] = process.argv.slice(2);

if (!command) {
  console.error('usage: node scripts/e2e-db.mjs <command> [args…]');
  process.exit(2);
}

const DATABASE_URL = `postgresql://madiro:madiro@localhost:${rootEnv('POSTGRES_PORT', '5432')}/madiro_e2e?schema=public`;
const result = spawnSync(command, args, {
  cwd: ROOT,
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL },
});

process.exit(result.status ?? 1);
