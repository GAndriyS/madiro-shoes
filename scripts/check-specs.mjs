#!/usr/bin/env node
/**
 * Spec lint — the mechanical half of harness/specs/README.md.
 *
 * `spec-creator` is prompt-enforced: nothing stops it (or a human) from
 * reusing a Spec ID, skipping a template heading, or forgetting the backlog
 * row. This script turns those rules into a deterministic check so a spec
 * cited by `SPEC-<ISSUE>` / `AC-N` actually carries unique, greppable ids.
 *
 * Scope: `SPEC-<ISSUE>-*.md` directly under harness/specs/, where <ISSUE> matches
 * harness/config.json → "issueKey" (a regex, e.g. "ABC-\\d+"; default: any
 * `KEY-123` style id).
 *
 * Checks (all sourced from harness/specs/README.md — keep the two in step):
 *   - `Spec ID: SPEC-<ISSUE>` present, unique (one spec per ticket), and
 *     matching the file name prefix; file name ends in a `-DD-MM-YYYY`
 *     creation date (`SPEC-<ISSUE>-<slug>-DD-MM-YYYY.md`)
 *   - the <ISSUE> ticket is mentioned in the spec body (beyond the ID line)
 *   - `Status:` is one of draft | approved | implemented
 *   - `Source:` and `Supersedes:` lines present
 *   - `Deferred:` (optional) is "none", or names `AC-N` ids (ranges with `…`)
 *     that exist in the spec, followed by ` — <dependency>`
 *   - every template heading present, in order
 *   - `AC-N` ids unique and strictly ascending (retired numbers may be skipped),
 *     each carrying a `(← <source>)` trace tag and a `· verify: <surface>` hint
 *   - a row in harness/specs/BACKLOG.md links the file
 *
 * Run:  node scripts/check-specs.mjs
 * Exit: 0 clean · 1 findings (one line per finding on stderr) · 2 broken config
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, basename, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');
const STATUSES = new Set(['draft', 'approved', 'implemented']);
const HEADINGS = [
  '## Problem and user',
  '## Goals / Non-goals',
  '## User stories',
  '## Acceptance criteria (EARS)',
  '## Edge cases',
  '## Non-functional requirements',
  '## Inputs and provenance',
  '## Untrusted inputs',
  '## Design review',
  '## Decisions taken',
  '## Open questions',
];

let issueKey = '[A-Z][A-Z0-9]+-\\d+';
const configPath = join(ROOT, 'harness/config.json');
if (existsSync(configPath)) {
  try {
    issueKey = JSON.parse(readFileSync(configPath, 'utf8')).issueKey ?? issueKey;
  } catch (e) {
    console.error(`check-specs: cannot read harness/config.json — ${e.message}`);
    process.exit(2);
  }
}
const FILE_RE = new RegExp(`^SPEC-${issueKey}-.+\\.md$`);
const ID_RE = new RegExp(`^Spec ID: (SPEC-(${issueKey}))\\s*$`, 'm');

const dir = join(ROOT, 'harness/specs');
const files = existsSync(dir)
  ? readdirSync(dir)
      .filter((n) => FILE_RE.test(n))
      .map((n) => join(dir, n))
  : [];

const findings = [];
const seenIds = new Map();
const backlogPath = join(ROOT, 'harness/specs/BACKLOG.md');
const backlog = existsSync(backlogPath) ? readFileSync(backlogPath, 'utf8') : '';

for (const file of files) {
  const rel = relative(ROOT, file).replaceAll('\\', '/');
  const text = readFileSync(file, 'utf8');
  const say = (msg) => findings.push(`${rel}: ${msg}`);

  const idMatch = text.match(ID_RE);
  if (!idMatch) say('missing `Spec ID: SPEC-<ISSUE>` line (issue id shape: harness/config.json → issueKey)');
  else {
    const id = idMatch[1];
    const ticket = idMatch[2];
    if (!basename(file).startsWith(`${id}-`)) say(`file name does not start with ${id}-`);
    if (seenIds.has(id)) say(`Spec ID ${id} already used by ${seenIds.get(id)} (one spec per ticket)`);
    else seenIds.set(id, rel);
    const body = text.replace(/^Spec ID: .*$/m, '');
    if (!body.includes(ticket)) say(`ticket ${ticket} is not mentioned in the spec body (name it on the Source: line)`);
  }

  const dated = basename(file).match(/-(\d{2})-(\d{2})-(\d{4})\.md$/);
  if (!dated) say('file name does not end in a `-DD-MM-YYYY.md` creation date (SPEC-<ISSUE>-<slug>-DD-MM-YYYY.md)');
  else {
    const [, dd, mm] = dated;
    if (Number(dd) < 1 || Number(dd) > 31 || Number(mm) < 1 || Number(mm) > 12)
      say(`creation date ${dd}-${mm}-${dated[3]} is not day-month-year`);
  }

  const status = text.match(/^Status: (\S+)/m);
  if (!status) say('missing `Status:` line');
  else if (!STATUSES.has(status[1])) say(`Status "${status[1]}" is not draft | approved | implemented`);

  if (!/^Source: \S/m.test(text)) say('missing `Source:` line');
  if (!/^Supersedes: \S/m.test(text)) say('missing `Supersedes:` line');

  let cursor = 0;
  for (const h of HEADINGS) {
    const at = text.indexOf(`\n${h}`, cursor);
    if (at === -1) say(`missing heading "${h}" (or out of order)`);
    else cursor = at + 1;
  }

  const acLines = [...text.matchAll(/^- (AC-(\d+)) —(.*)$/gm)].map((m) => [m[1], Number(m[2]), m[3]]);
  if (acLines.length === 0) say('no `- AC-N — …` lines under Acceptance criteria');
  let last = 0;
  for (const [label, n, rest] of acLines) {
    if (n <= last) say(`${label} is not strictly ascending after AC-${last}`);
    last = Math.max(last, n);
    if (!/\(← .+?\)/.test(rest)) say(`${label} has no \`(← <source>)\` trace tag`);
    if (!/· verify: \S/.test(rest)) say(`${label} has no \`· verify: <surface>\` hint`);
  }

  const deferred = text.match(/^Deferred: (.+)$/m);
  if (deferred && deferred[1].trim() !== 'none') {
    const line = deferred[1];
    const known = new Set(acLines.map(([, n]) => n));
    const ids = new Set();
    for (const m of line.matchAll(/AC-(\d+)(?:\s*[…–-]\s*AC-(\d+))?/g)) {
      const from = Number(m[1]);
      const to = m[2] ? Number(m[2]) : from;
      for (let i = from; i <= to; i++) ids.add(i);
    }
    if (ids.size === 0) say('`Deferred:` names no AC-N (list the ids, or write "none")');
    for (const n of ids) if (!known.has(n)) say(`Deferred: cites AC-${n}, which is not an acceptance criterion in this spec`);
    if (!/—\s*\S/.test(line)) say('`Deferred:` names no dependency after the ids (`Deferred: AC-N, AC-M — <what they wait on>`)');
  }

  const linkTarget = rel.slice('harness/specs/'.length);
  if (!backlog.includes(`](${linkTarget})`)) say(`no row in harness/specs/BACKLOG.md links ${linkTarget}`);
}

if (findings.length) {
  for (const f of findings) console.error(`✗ ${f}`);
  console.error(`\n${findings.length} spec finding(s) — see harness/specs/README.md`);
  process.exit(1);
}
console.log(`✓ ${files.length} spec(s) checked`);
