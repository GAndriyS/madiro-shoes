#!/usr/bin/env node
/**
 * verify.mjs — run this repo's quality gates locally and print only what matters.
 *
 * Why this exists: agents (and humans) otherwise re-run lint / tests / build ad
 * hoc and read the FULL output after every edit — thousands of tokens of
 * "✓ passed" per run. This script runs the gates listed in harness/config.json
 * (the same commands the CI file in AGENTS.md → Harness profile → ci-config
 * runs — copied by hand, keep them in step) and prints ONE line per gate, plus
 * the verbatim tail of a gate's output only when it FAILED.
 *
 * Usage:
 *   node scripts/verify.mjs                       # all slices
 *   node scripts/verify.mjs --slice web
 *   node scripts/verify.mjs --slice web --slice api
 *   node scripts/verify.mjs --tests-only          # skip gates not marked "test"
 *   node scripts/verify.mjs --tail 120            # more failure context
 *   node scripts/verify.mjs --list                # print slices and their gates
 *
 * Slices (the vocabulary specs use in `· verify:` hints) come from
 * harness/config.json → "slices"; the built-in `specs` slice runs the spec lint
 * (scripts/check-specs.mjs).
 *
 * Exit: 0 when every gate passed · 1 when any gate failed · 2 on bad arguments
 * or a broken config.
 * Output is ANSI-free (FORCE_COLOR=0) so it can be pasted into a report as-is.
 */

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');
const CONFIG = join(ROOT, 'harness', 'config.json');

// ---------------------------------------------------------------- config

let config;
try {
  config = JSON.parse(readFileSync(CONFIG, 'utf8'));
} catch (e) {
  console.error(`verify: cannot read harness/config.json — ${e.message}`);
  process.exit(2);
}

/** Each gate: {name, cmd, test?: boolean}. `test` gates are the only ones kept under --tests-only. */
const LANES = {};
for (const [slice, def] of Object.entries(config.slices ?? {})) {
  if (!Array.isArray(def.gates)) {
    console.error(`verify: harness/config.json → slices.${slice}.gates must be an array`);
    process.exit(2);
  }
  LANES[slice] = def.gates.map((g) => ({ ...g, name: `${slice} ${g.name}` }));
}
LANES.specs = [{ name: 'specs lint', cmd: 'node scripts/check-specs.mjs' }];

// ---------------------------------------------------------------- arguments

const args = process.argv.slice(2);
const slices = [];
let testsOnly = false;
let tail = 60;

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--slice') slices.push(args[++i]);
  else if (a === '--tests-only') testsOnly = true;
  else if (a === '--tail') tail = Number(args[++i]);
  else if (a === '--list') { list(); process.exit(0); }
  else if (a === '-h' || a === '--help') { usage(); process.exit(0); }
  else { console.error(`unknown argument: ${a}`); usage(); process.exit(2); }
}

const KNOWN = Object.keys(LANES);
if (slices.length === 0) slices.push(...KNOWN);
if (slices.some((s) => !KNOWN.includes(s)) || !Number.isFinite(tail)) {
  usage();
  process.exit(2);
}

function usage() {
  console.error('usage: node scripts/verify.mjs [--slice <' + KNOWN.join('|') + '>] [--slice ...] [--tests-only] [--tail N] [--list]');
}

function list() {
  for (const [slice, gates] of Object.entries(LANES)) {
    const path = config.slices?.[slice]?.path;
    console.log(`${slice}${path ? `  (${path})` : ''}`);
    for (const g of gates) console.log(`  ${g.test ? 'test ' : 'gate '} ${g.name}: ${g.cmd}`);
  }
}

// ---------------------------------------------------------------- helpers

const env = { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1', CI: process.env.CI ?? '1' };

/** Run a command from the repo root; return {code, output, secs}. Never throws. */
function run(cmd) {
  const t0 = Date.now();
  const r = spawnSync(cmd, { cwd: ROOT, env, shell: true, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  const output = ((r.stdout ?? '') + (r.stderr ?? '')).replace(/\x1b\[[0-9;]*m/g, '');
  const code = r.status ?? (r.error ? 127 : 1);
  return { code, output, secs, error: r.error };
}

// ---------------------------------------------------------------- main

let failed = 0;
const summary = [];

for (const slice of slices) {
  console.log(`## slice: ${slice}`);
  for (const gate of LANES[slice]) {
    if (testsOnly && !gate.test) { console.log(`[SKIP] ${gate.name} (--tests-only)`); continue; }
    const { code, output, secs, error } = run(gate.cmd);
    if (code === 0) {
      const counts = output.match(/Tests?:?\s+\d+ (passed|failed|skipped)[^\n]*/)?.[0] ?? '';
      console.log(`[PASS] ${gate.name} (${secs}s) ${counts}`.trimEnd());
      summary.push(`PASS ${gate.name}`);
    } else {
      failed++;
      console.log(`[FAIL] ${gate.name} (exit ${code}, ${secs}s) — ${gate.cmd}`);
      if (error) console.log(`       spawn error: ${error.message}`);
      const lines = output.trimEnd().split('\n');
      const shown = lines.slice(-tail);
      if (lines.length > shown.length) console.log(`       … ${lines.length - shown.length} earlier line(s) omitted (--tail ${tail})`);
      for (const l of shown) console.log('       ' + l);
      summary.push(`FAIL ${gate.name} (exit ${code})`);
    }
  }
}

console.log('');
console.log(failed === 0 ? `verify: all ${summary.length} gate(s) passed` : `verify: ${failed} gate(s) FAILED — ${summary.filter((s) => s.startsWith('FAIL')).join('; ')}`);
process.exit(failed === 0 ? 0 : 1);
