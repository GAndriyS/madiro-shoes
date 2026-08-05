import { readFileSync } from 'node:fs';
import { dirname, join, parse } from 'node:path';

/**
 * The release version, read from the workspace root `package.json` — the single
 * place a release bumps (see scripts/release.sh).
 *
 * Why walk up instead of importing: the api runs from two very different
 * working directories. In the Railway image it is `node apps/api/dist/main.js`
 * from `/app`; locally it is `nest start --watch` from `apps/api`. Walking up
 * to the package named `madiro` finds the same file either way, and finding
 * nothing is not worth crashing a boot over — an unknown version is a cosmetic
 * loss, not an outage.
 */
function readRootVersion(): string {
  let dir = __dirname;
  const { root } = parse(dir);

  while (true) {
    try {
      const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
        name?: string;
        version?: string;
      };
      if (pkg.name === 'madiro' && pkg.version) {
        return pkg.version;
      }
    } catch {
      // No package.json here (or unreadable) — keep climbing.
    }
    if (dir === root) return 'unknown';
    dir = dirname(dir);
  }
}

/** Resolved once at import: the file cannot change under a running process. */
export const APP_VERSION = readRootVersion();

/**
 * The commit Railway built, when it says so. Absent locally, which is why the
 * health payload omits the field rather than reporting a fiction.
 */
export const APP_COMMIT = process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7);
