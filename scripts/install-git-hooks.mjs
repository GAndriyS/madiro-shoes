// Point git at the tracked hooks in .githooks/ (run from `prepare`, so a plain
// `pnpm install` is all a clone needs to pick them up).
//
// This is a node script rather than a bare `git config ...` in the prepare
// script for one reason: it must never fail an install. The API image builds
// with `COPY . .` and `.dockerignore` excludes `.git`, so inside that build
// there is no repository to configure — and a hook that a developer never sees
// is not worth breaking a PROD deploy over.
import { execFileSync } from 'node:child_process';

try {
  execFileSync('git', ['config', 'core.hooksPath', '.githooks'], {
    stdio: 'ignore',
  });
} catch {
  // No .git, or no git binary. Either way: nothing to install, nothing to say.
}
