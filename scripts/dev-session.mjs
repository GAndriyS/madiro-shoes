#!/usr/bin/env node
/**
 * Dev-stand session broker for browser checks (/spec-verify, /ui-verify).
 *
 * A browser check on a real backend needs a real session — and an agent must never
 * type or read a password. This script owns the credentials: it reads them from the
 * root `.env`, signs in through the API and puts the session into a debuggable Chrome
 * that the browser MCP attaches to (`.mcp.json` → `--browserUrl`). Nothing it prints
 * carries a password, token or cookie value, so the agent driving the browser sees
 * only `ok …` lines.
 *
 * PROJECT-OWNED: the generic part (QA Chrome, CDP, .env, state, commands) came with the
 * sdd-harness; the APPS adapter below is Madiro's — one entry per app a browser check
 * signs into, both on the `madiroSession` strategy (login → refresh cookie copied into
 * the browser).
 *
 * A seeded session skips the app's own sign-in code: an AC about what happens *on*
 * sign-in is walked through the form (`fill-login`).
 *
 * Credentials: `QA_<APP>_<ROLE>_LOGIN` / `QA_<APP>_<ROLE>_PASSWORD` in the root `.env`
 * (upper-cased, `-` → `_`; Madiro signs in by login name, not email). A worktree
 * without its own `.env` reads the main checkout's.
 *
 * Commands:
 *   start                                         launch the QA Chrome (idempotent)
 *   login      --app <app> --as <role> [--force]
 *   logout     --app <app>                       server logout + local session cleared
 *   status                                        what the QA Chrome holds now
 *   fill-login --app <app> --as <role> [--wrong-password]
 *   fill-login --app <app> --unknown             random unregistered login + password
 *   options: --base-url <url> (default: the app's baseUrl, else the first app's)
 *
 * `fill-login` types into the open login form and does not submit — the caller
 * clicks the button, so the walk stays the app's own flow.
 *
 * Exit: 0 ok · 1 failure (one line on stderr) · 2 usage
 */

import { spawn, execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');
// Shared by every worktree of the checkout, outside the tree. A worktree's `.git` is a
// file, so the common dir is asked from git.
const GIT_DIR = resolve(
  ROOT,
  execFileSync('git', ['rev-parse', '--git-common-dir'], { cwd: ROOT, encoding: 'utf8' }).trim(),
);
const PROFILE_DIR = join(GIT_DIR, 'qa-chrome');
const STATE_FILE = join(GIT_DIR, 'qa-session.json');
// Not 9222: a personal Chrome started with the default debugging port must never receive a session.
const DEBUG_URL = 'http://127.0.0.1:9333';

// Both login screens mark their fields with autocomplete (apps/*/src/routes/login.tsx).
const LOGIN_INPUT = 'input[autocomplete="username"]';
const PASSWORD_INPUT = 'input[type="password"], input[autocomplete="current-password"]';

const CHROME_PATHS = {
  darwin: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  linux: 'google-chrome',
  win32: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
};

// ------------------------------------------------------------------ PROJECT: adapter

/**
 * One entry per app. `baseUrl` is the app's local dev server (AGENTS.md → Harness
 * profile → browser-qa); the broker reaches the API through that server's own `/api`
 * proxy, the way the app does. Each strategy returns
 * { login(ctx, creds) → detail string, logout(ctx) → server string, held(ctx) → boolean }.
 *
 * Roles: `seller` and `admin` sign into the scanner; the dashboard admits `admin` only.
 */
const APPS = {
  scanner: { baseUrl: 'http://localhost:5174', ...madiroSession({ client: 'scanner' }) },
  dashboard: { baseUrl: 'http://localhost:5173', ...madiroSession({ client: 'dashboard' }) },
};

// ------------------------------------------------------------------ strategies

/**
 * Madiro's own auth (apps/api/src/auth/auth.controller.ts). `POST /api/auth/login` takes
 * `{ login, password }` plus the `x-madiro-client` header, answers the access token in
 * the body and sets an httpOnly `madiro_refresh_<client>` cookie on `Path=/api/auth`.
 * The app keeps the access token in memory only (packages/web-core/src/stores/auth.ts),
 * so the cookie is the whole session: the broker copies it into the QA Chrome, and the
 * reload that follows makes the app's own `restoreSession()` spend it — the same path a
 * real reload takes.
 *
 * The login goes to the app's dev server rather than the API port, so the cookie is
 * first-party to the app origin exactly as the browser would receive it. Logout on the
 * server only clears cookies (nothing is revoked), so it is called for parity.
 */
function madiroSession({ client }) {
  const cookieName = `madiro_refresh_${client}`;
  const headers = { Accept: 'application/json', 'x-madiro-client': client };
  const sessionCookies = async (browser, baseUrl) => {
    const host = new URL(baseUrl).hostname;
    const { cookies } = await browser.send('Storage.getCookies');

    return cookies.filter(
      (cookie) => cookie.name === cookieName && cookie.domain.replace(/^\./, '') === host,
    );
  };

  return {
    async login({ browser, baseUrl }, { login, password }) {
      const response = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ login, password }),
      });

      if (!response.ok) fail(refused('login refused', response));

      const { origin, hostname } = new URL(baseUrl);
      const cookies = response.headers
        .getSetCookie()
        // `url` set to the app origin keeps the cookie host-only, as the browser would.
        .map((header) => ({ ...parseSetCookie(header, hostname), url: `${origin}/` }))
        .filter((cookie) => cookie.name === cookieName);

      if (cookies.length === 0) fail(`login answered 200 without a ${cookieName} cookie`);

      await browser.send('Storage.setCookies', { cookies });

      return '';
    },

    async logout({ browser, page, baseUrl }) {
      const cookies = await sessionCookies(browser, baseUrl);
      let server = 'no session cookie';

      if (cookies.length > 0) {
        const response = await fetch(`${baseUrl}/api/auth/logout`, {
          method: 'POST',
          headers: { ...headers, Cookie: cookies.map((c) => `${c.name}=${c.value}`).join('; ') },
        }).catch(() => null);

        server = response ? `server ${response.status}` : 'server unreachable';
      }

      for (const { name, domain, path } of cookies) {
        await browser.send('Network.deleteCookies', { name, domain, path }, page.sessionId);
      }

      return server;
    },

    held: async ({ browser, baseUrl }) => (await sessionCookies(browser, baseUrl)).length > 0,
  };
}

// ------------------------------------------------------------------ generic part

class Failure extends Error {}

function fail(message) {
  throw new Failure(message);
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const flags = {};

  for (let i = 0; i < rest.length; i++) {
    const name = rest[i].replace(/^--/, '');
    const next = rest[i + 1];

    if (next !== undefined && !next.startsWith('--')) {
      flags[name] = next;
      i++;
    } else {
      flags[name] = true;
    }
  }

  return { command, flags };
}

function readEnv() {
  const local = join(ROOT, '.env');
  const path = existsSync(local) ? local : join(dirname(GIT_DIR), '.env');

  if (!existsSync(path))
    fail(
      '.env not found in this checkout or the main one — see AGENTS.md → Conventions → Browser checks',
    );

  const env = {};

  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);

    if (match) env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }

  return env;
}

function credentials(app, role) {
  const prefix = `QA_${app.toUpperCase().replace(/-/g, '_')}_${role.toUpperCase().replace(/-/g, '_')}`;
  const env = readEnv();
  const login = env[`${prefix}_LOGIN`];
  const password = env[`${prefix}_PASSWORD`];

  if (!login || !password)
    fail(`no ${prefix}_LOGIN / ${prefix}_PASSWORD in .env — this role has no QA account yet`);

  return { login: login.trim(), password };
}

function readState() {
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function writeState(state) {
  writeFileSync(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`);
}

async function debuggerUp() {
  try {
    return (await fetch(`${DEBUG_URL}/json/version`)).ok;
  } catch {
    return false;
  }
}

async function connect() {
  if (!(await debuggerUp()))
    fail(`QA Chrome is not running on ${DEBUG_URL} — run: node scripts/dev-session.mjs start`);

  const { webSocketDebuggerUrl } = await (await fetch(`${DEBUG_URL}/json/version`)).json();
  const ws = new WebSocket(webSocketDebuggerUrl);

  await new Promise((onOpen, onError) => {
    ws.onopen = onOpen;
    ws.onerror = () => onError(new Failure('cannot open the QA Chrome DevTools socket'));
  });

  const pending = new Map();
  let lastId = 0;

  ws.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    const entry = pending.get(message.id);

    if (entry) {
      pending.delete(message.id);
      if (message.error) entry.reject(new Failure(`CDP ${entry.method}: ${message.error.message}`));
      else entry.resolve(message.result);
    }
  };

  const send = (method, params = {}, sessionId) =>
    new Promise((onResult, onError) => {
      const id = ++lastId;

      pending.set(id, { method, resolve: onResult, reject: onError });
      ws.send(JSON.stringify({ id, method, params, sessionId }));
    });

  return { send, close: () => ws.close() };
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

// The tab the MCP most likely works in: one already on the app, else a blank one, else a new one.
async function openAppPage(browser, baseUrl) {
  const origin = new URL(baseUrl).origin;

  try {
    await fetch(baseUrl);
  } catch {
    fail(
      `the app does not answer on ${baseUrl} — start its dev server first (AGENTS.md → Harness profile → browser-qa)`,
    );
  }

  const { targetInfos } = await browser.send('Target.getTargets');
  const pages = targetInfos.filter((target) => target.type === 'page');
  const onApp = pages.find((target) => target.url.startsWith(origin));
  const blank = pages.find((target) => target.url === 'about:blank');
  const targetId =
    onApp?.targetId ??
    blank?.targetId ??
    (await browser.send('Target.createTarget', { url: 'about:blank' })).targetId;
  const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });

  const evaluate = async (expression) => {
    const result = await browser.send(
      'Runtime.evaluate',
      { expression, returnByValue: true, awaitPromise: true },
      sessionId,
    );

    if (result.exceptionDetails) {
      fail(
        `page script failed: ${result.exceptionDetails.exception?.description?.split('\n')[0] ?? result.exceptionDetails.text}`,
      );
    }

    return result.result.value;
  };

  const waitLoaded = async () => {
    for (let i = 0; i < 60; i++) {
      await sleep(250);

      const ready = await evaluate(
        `location.origin === ${JSON.stringify(origin)} && document.readyState === 'complete'`,
      ).catch(() => false);

      if (ready) return;
    }

    fail(`the page did not load ${baseUrl} within 15 s`);
  };

  if (!onApp) {
    await browser.send('Page.navigate', { url: baseUrl }, sessionId);
    await waitLoaded();
  }

  return {
    sessionId,
    evaluate,
    reload: async () => {
      await browser.send('Page.reload', {}, sessionId);
      await waitLoaded();
    },
  };
}

function parseSetCookie(header, host) {
  const [pair, ...attributes] = header.split(';').map((part) => part.trim());
  const separator = pair.indexOf('=');
  // `url` keeps a cookie without a Domain attribute host-only, as the browser itself would.
  const cookie = {
    name: pair.slice(0, separator),
    value: pair.slice(separator + 1),
    url: `https://${host}/`,
    path: '/',
  };

  for (const attribute of attributes) {
    const [key, ...valueParts] = attribute.split('=');
    const value = valueParts.join('=');

    switch (key.toLowerCase()) {
      case 'domain':
        cookie.domain = value;
        break;
      case 'path':
        cookie.path = value;
        break;
      case 'secure':
        cookie.secure = true;
        break;
      case 'httponly':
        cookie.httpOnly = true;
        break;
      case 'samesite':
        cookie.sameSite = value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
        break;
      case 'max-age':
        cookie.expires = Date.now() / 1000 + Number(value);
        break;
      case 'expires':
        cookie.expires ??= Date.parse(value) / 1000;
        break;
    }
  }

  return cookie;
}

// Status and Retry-After only — a response body may echo what was sent.
function refused(what, response) {
  const retryAfter = response.headers.get('retry-after');

  return `${what}: HTTP ${response.status}${retryAfter ? ` (Retry-After ${retryAfter} s — a login limit counts every attempt)` : ''}`;
}

async function typeInto(browser, page, selector, text) {
  const found = await page.evaluate(`(() => {
    const input = document.querySelector(${JSON.stringify(selector)});
    if (!input) return false;
    input.focus();
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);

  if (!found) fail(`no ${selector} on the open page — navigate to the login page first`);

  await browser.send('Input.insertText', { text }, page.sessionId);
}

const commands = {
  async start() {
    if (await debuggerUp()) return `ok: QA Chrome already running on ${DEBUG_URL}`;

    const chrome = process.env.CHROME_PATH ?? CHROME_PATHS[process.platform];

    mkdirSync(PROFILE_DIR, { recursive: true });
    spawn(
      chrome,
      [
        `--remote-debugging-port=${new URL(DEBUG_URL).port}`,
        `--user-data-dir=${PROFILE_DIR}`,
        '--no-first-run',
        '--no-default-browser-check',
        'about:blank',
      ],
      {
        detached: true,
        stdio: 'ignore',
      },
    ).unref();

    for (let i = 0; i < 60; i++) {
      await sleep(250);

      if (await debuggerUp())
        return `ok: QA Chrome started on ${DEBUG_URL} (profile ${PROFILE_DIR})`;
    }

    fail(
      `Chrome did not open ${DEBUG_URL} within 15 s (binary: ${chrome}; override with CHROME_PATH)`,
    );
  },

  async login(browser, flags) {
    const { app, as: role, force } = flags;
    const baseUrl = flags['base-url'];
    const state = readState();
    const page = await openAppPage(browser, baseUrl);
    const ctx = { browser, page, baseUrl };
    const held = await APPS[app].held(ctx);

    // Reuse: login endpoints are often rate-limited, and every walk logs in often.
    if (!force && held && state[app] === role)
      return `ok: ${app} already signed in as ${role} (--force to sign in again)`;

    const detail = await APPS[app].login(ctx, credentials(app, role));

    writeState({ ...state, [app]: role });
    await page.reload();

    return `ok: ${app} signed in as ${role}${detail ? ` (${detail})` : ''}; the app tab was reloaded`;
  },

  async logout(browser, flags) {
    const { app } = flags;
    const page = await openAppPage(browser, flags['base-url']);
    const server = await APPS[app].logout({ browser, page, baseUrl: flags['base-url'] });
    const state = readState();

    delete state[app];
    writeState(state);
    await page.reload();

    return `ok: ${app} signed out (${server}); the app tab was reloaded`;
  },

  async status(browser, flags) {
    const state = readState();
    const parts = [];

    for (const [app, adapter] of Object.entries(APPS)) {
      const baseUrl = flags['base-url'] ?? adapter.baseUrl;

      // A walk usually runs one app; the other's dev server being down is not a failure.
      if (
        !(await fetch(baseUrl).then(
          () => true,
          () => false,
        ))
      ) {
        parts.push(`${app}: dev server down`);
        continue;
      }

      const page = await openAppPage(browser, baseUrl);
      const held = await adapter.held({ browser, page, baseUrl });

      parts.push(
        `${app}: ${held ? `session held${state[app] ? ` (seeded as ${state[app]})` : ' (signed in through the UI)'}` : 'anonymous'}`,
      );
    }

    return `ok: ${parts.join(' · ')}`;
  },

  async 'fill-login'(browser, flags) {
    const { app } = flags;
    const page = await openAppPage(browser, flags['base-url']);
    let login;
    let password;
    let label;

    if (flags.unknown) {
      login = `qa-unknown-${randomBytes(4).toString('hex')}`;
      password = `Qa-${randomBytes(9).toString('base64url')}1`;
      label = `an unregistered login (${login})`;
    } else {
      ({ login, password } = credentials(app, flags.as));
      label = `the ${flags.as} account`;

      if (flags['wrong-password']) {
        password = `Qa-${randomBytes(9).toString('base64url')}1`;
        label += ' with a wrong password';
      }
    }

    await browser.send('Page.bringToFront', {}, page.sessionId);
    await typeInto(browser, page, LOGIN_INPUT, login);
    await typeInto(browser, page, PASSWORD_INPUT, password);

    return `ok: login form filled with ${label}; not submitted`;
  },
};

const USAGE = `usage: node scripts/dev-session.mjs <start|login|logout|status|fill-login> [--app ${Object.keys(APPS).join('|')}] [--as <role>] [--force] [--wrong-password|--unknown] [--base-url <url>]`;

async function main() {
  const { command, flags } = parseArgs(process.argv.slice(2));
  const needsApp = ['login', 'logout', 'fill-login'].includes(command);
  const needsRole = command === 'login' || (command === 'fill-login' && !flags.unknown);

  if (
    !(command in commands) ||
    (needsApp && !(flags.app in APPS)) ||
    (needsRole && typeof flags.as !== 'string')
  ) {
    console.error(USAGE);
    process.exit(2);
  }

  if (needsApp) flags['base-url'] ??= APPS[flags.app].baseUrl;

  if (command === 'start') {
    console.log(await commands.start());

    return;
  }

  const browser = await connect();

  try {
    console.log(await commands[command](browser, flags));
  } finally {
    browser.close();
  }
}

main().catch((error) => {
  console.error(
    error instanceof Failure ? `error: ${error.message}` : `error: ${error.message ?? error}`,
  );
  process.exit(1);
});
