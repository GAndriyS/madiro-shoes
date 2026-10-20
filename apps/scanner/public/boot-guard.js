// Boot guard. A stale @madiro/shared build makes the entry module fail to
// evaluate: the page stays blank and the console stays EMPTY, because a
// module-evaluation error only surfaces as an unhandled rejection. That silence
// cost ~20 minutes in the 30.07.2026 test run.
//
// A classic script that imports nothing, loaded before the entry module: it has
// to run before the module that breaks. It is a file rather than inline so the
// Content-Security-Policy (see the app's Caddyfile) can forbid inline scripts.
// Plain ES5 on purpose — it must not depend on anything the build produces.
// The same file lives in both apps' public/ directories; keep them identical.
(function () {
  function report(reason) {
    var root = document.getElementById('root');
    if (!root || root.childElementCount > 0) return; // React mounted — not our business
    var box = document.createElement('div');
    box.setAttribute('role', 'alert');
    box.setAttribute('data-testid', 'boot-error');
    box.style.cssText =
      'margin:0 auto;max-width:40rem;padding:2rem 1.5rem;font:14px/1.6 system-ui,sans-serif';
    box.innerHTML =
      '<h1 style="margin:0 0 .5rem;font-size:1.25rem">Застосунок не запустився</h1>' +
      '<p style="margin:0 0 1rem;color:#6b6156">Найчастіша причина — застаріла збірка. Виконайте: <code>pnpm build</code></p>';
    var pre = document.createElement('pre');
    pre.style.cssText =
      'margin:0;padding:.75rem;border-radius:.5rem;background:#f3efe9;white-space:pre-wrap;word-break:break-word;font-size:12px';
    pre.textContent = reason && reason.message ? reason.message : String(reason);
    box.appendChild(pre);
    root.appendChild(box);
  }
  addEventListener('error', function (e) {
    report(e.error || e.message);
  });
  addEventListener('unhandledrejection', function (e) {
    report(e.reason);
  });
})();
