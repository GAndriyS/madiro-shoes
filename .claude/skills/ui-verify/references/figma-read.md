# Reading design values from Figma

One procedure, used twice: by the **main session before `spec-creator`** runs
(the values become the spec's `### Design values` table, so the code is built
to them), and by **`/ui-verify` Stage 1** when that table is missing or a row
needs a spot-check. Agents never read Figma themselves — `spec-creator` and
`implementation-planner` receive the table, they do not fetch it. When
`AGENTS.md → Harness profile → design-source` is `none`, this procedure does
not run and specs carry no `### Design values` table.

Why it exists: static Figma values — sizes, type styles, colours, radii —
that nobody reads before the code is written come back as stage-3c fixes,
and reading them that late costs extra fix passes, delta reviews and a
second Figma session.

## Surface

Both surfaces run the same Figma plugin API, **read-only**: no node edits, no
`setPluginData`, no `loadAllPagesAsync`, no `createImageAsync`.

| Surface | When | How |
|---|---|---|
| Figma MCP `use_figma` | the connector answers and has quota | pass the script below as `code`, without the outer `(async () => { … })()` wrapper (keep the `return`) |
| Figma web app in the desktop Browser pane | the MCP refuses (plan limit, auth) | the human signs in at `https://www.figma.com/login` in the pane — a third-party "Continue with …" pop-up does not reach the pane's cookies; then `javascript_tool` on the file tab, script as is. Check `typeof window.figma === 'object'` first — anonymous viewers get `undefined` |

On a metered plan the first call may be the only one: spend it on this script
over **all** frames at once, not on `get_metadata` / `get_screenshot` probes.
The MCP cuts a `use_figma` result at **20 KB** — keep `SKIP` on the chrome
(header, footer) so the compact lines fit; a cut result is a partial read.

**The read is complete or it is not done.** Every state × breakpoint under the
ticket's frame link is read before `spec-creator` (or Stage 1) runs. When the
MCP stops part-way — plan limit, auth, a cut result — switch to the Browser
pane surface in the same session and ask the human to sign in; do not pass a
table with "not read" rows as if it were finished. A row stays "not read" only
when the human declines the sign-in, and the table's header line says so.
A state handed on as "not read" without that question leaves a hole the
code is then built around.

## Which nodes

The ticket's frame link, never the canvas. For a section that holds states ×
breakpoints (a common layout: default, all fields filled, error states ×
Desktop 1440 / Tablet 768 / Mobile 375), pass the section ids; the script
walks every visible frame under them.

## Script

```js
(async () => {
  const ROOTS = ['123:456', '123:789']; // section or frame ids
  const SKIP = /^(Header|Footer)$/; // chrome the feature does not own — adjust per file
  const hex = c => '#' + [c.r, c.g, c.b].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
  const arr = x => (Array.isArray(x) ? x : []);
  const paint = p => (p && p.type === 'SOLID' && p.visible !== false ? hex(p.color) + (p.opacity < 1 ? '@' + p.opacity.toFixed(2) : '') : null);
  const num = x => (typeof x === 'symbol' ? 'mixed' : x);
  const out = [];
  const walk = async (n, path) => {
    if (n.visible === false || SKIP.test(n.name)) return;
    const here = path ? path + ' / ' + n.name : n.name;
    if (n.type === 'TEXT') {
      for (const s of n.getStyledTextSegments(['fontSize', 'fontName', 'lineHeight', 'letterSpacing', 'fills', 'textStyleId', 'textDecoration'])) {
        const style = s.textStyleId ? (await figma.getStyleByIdAsync(s.textStyleId))?.name : null;
        out.push({ at: here, text: s.characters.slice(0, 40), font: s.fontName.family + ' ' + s.fontName.style, size: s.fontSize,
          lh: s.lineHeight.unit === 'AUTO' ? 'auto' : s.lineHeight.value + (s.lineHeight.unit === 'PERCENT' ? '%' : 'px'),
          ls: s.letterSpacing.value + (s.letterSpacing.unit === 'PERCENT' ? '%' : 'px'), color: arr(s.fills).map(paint).filter(Boolean).join(','),
          deco: s.textDecoration, style });
      }
    } else {
      const r = { at: here, type: n.type, w: Math.round(n.width), h: Math.round(n.height) };
      const fill = arr(n.fills).map(paint).filter(Boolean), stroke = arr(n.strokes).map(paint).filter(Boolean);
      if (fill.length) r.fill = fill.join(',');
      if (stroke.length) { r.stroke = stroke.join(','); r.sw = num(n.strokeWeight); }
      if ('cornerRadius' in n && n.cornerRadius) r.radius = num(n.cornerRadius);
      if (n.layoutMode && n.layoutMode !== 'NONE') { r.gap = n.itemSpacing; r.pad = [n.paddingTop, n.paddingRight, n.paddingBottom, n.paddingLeft].join('/'); }
      if (r.fill || r.stroke || r.radius || r.gap !== undefined || n.type === 'INSTANCE' || n.type === 'FRAME') out.push(r);
    }
    if ('children' in n) for (const c of n.children) await walk(c, here);
  };
  for (const id of ROOTS) await walk(await figma.getNodeByIdAsync(id), '');
  return out.map(r => Object.entries(r).map(([k, v]) => k + '=' + v).join(' | ')).join('\n'); // compact: fits the 20 KB cut
})()
```

The raw output is large; reduce it before it reaches a spec. Drop the header,
footer and other chrome the feature does not own (name them in the table's
note), keep one row per element × property, and collapse values that are equal
at every width into one cell.

## The table — `### Design values` under the spec's `## Design review`

```markdown
### Design values
Read <YYYY-MM-DD> from <file key> · frames <ids> · surface <MCP | Figma web app> · chrome not owned by the feature: <header, footer, …>

| Element | Property | 1440 | 768 | 375 | Node |
|---|---|---|---|---|---|
| Title | type | 40/48 Inter 600, −1% (`Desktop/H2`) | = 1440 | 28/34 (`Mobile/H2`) | 123:460 |
| Form column | width · side gutter | 640 centred | 672 · 48 | 327 · 24 | 123:461 |
| Text field | height · radius · fill · padding-left | 48 · 8 · #ffffff · 16 | = | = | 123:463 |
| Field error | text · outline | 12px #d32f2f · #d32f2f 1px | 12px · 2px | 12px · 2px | 123:688 |
```

Rules:

- **Values only from the read** — never from the app, from memory or by
  rounding. A property the design does not define is `—`; a width with no frame
  is `no frame`.
- **Inconsistencies inside the design** (one state 1px, another 2px; a label
  spelled two ways) are not resolved in the table — each goes to the spec's
  Design review as a gap or an open question.
- **Owner check.** For each row, note when the value contradicts a shared
  component or the global theme the feature does not own (`rg` the element in
  `harness/sdd/*.md` — an earlier run may already have measured and accepted
  it). That row is a decision for the planner and the human — fix here,
  separate ticket, or accept — not a surprise for stage 3c.
- **No secrets, no screenshots** in the spec — values and node ids only.
