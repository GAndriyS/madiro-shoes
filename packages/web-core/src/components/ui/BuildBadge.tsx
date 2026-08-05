import { useEffect, useState } from 'react';

import { cn } from '../../lib/cn';

interface BuildBadgeProps {
  /**
   * Release version, inlined at build time as `__APP_VERSION__` from the
   * workspace root package.json (see each app's vite.config.ts). Passed in
   * rather than read here: web-core is source-only, so the define belongs to
   * the app that bundles it.
   */
  version: string;
  className?: string;
}

interface HealthPayload {
  env?: string;
}

/**
 * "Which build am I looking at?" — the version, plus a loud tag when this is
 * not the real thing.
 *
 * DEMO and PROD run byte-identical bundles from the same commit, so the badge
 * cannot know its environment at build time; it asks the API, which does. A
 * failed or slow answer simply means no tag: the health endpoint 503s when the
 * database is down, and a login screen must not depend on that.
 */
export function BuildBadge({ version, className }: BuildBadgeProps) {
  const [env, setEnv] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    fetch('/api/health', { signal: controller.signal })
      .then((response) => (response.ok ? (response.json() as Promise<HealthPayload>) : null))
      .then((payload) => setEnv(payload?.env ?? null))
      .catch(() => {
        // No badge is the right answer here — never a broken screen.
      });

    return () => controller.abort();
  }, []);

  return (
    <div
      data-testid="build-badge"
      className={cn(
        'flex items-center justify-center gap-2 text-[11px] text-text-faint',
        className,
      )}
    >
      {env === 'demo' && (
        <span
          data-testid="demo-badge"
          className="rounded-md bg-[#e9dfc9] px-1.5 py-0.5 text-[10px] font-bold tracking-[0.5px] text-accent-hover"
        >
          DEMO
        </span>
      )}
      <span>v{version}</span>
    </div>
  );
}
