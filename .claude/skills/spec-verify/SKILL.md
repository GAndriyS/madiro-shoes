---
name: spec-verify
description: >-
  /spec-verify spec-path [--checklist ...] [--routes ...] [--breakpoints ...]
  [--base-url url] — plays a human QA tester: opens the running app through
  the browser MCP named in AGENTS.md → Harness profile → browser-qa, walks
  every acceptance criterion and edge case of a
  harness/specs/SPEC-<ISSUE>-*.md spec on the live UI, and returns one
  PASS/FAIL/BLOCKED/UNVERIFIABLE verdict per check with screenshots and the
  harvested console and network errors. Starts the slice's dev server itself
  when its URL is down and signs in and out on the real dev backend through
  the project's session broker (scripts/dev-session.mjs); missing backend
  data grades checks BLOCKED, never fails the run. It is the executor of the
  spec's "manual" verify lane, and /implement runs it as stage 3c on
  UI-touching plans. Use when the user says "перевір як тестувальник",
  "пройди сценарії в браузері", "verify the spec in the browser", "QA the
  feature", or invokes /spec-verify. Not for visual fidelity against the
  design — that is /ui-verify; not for static plan conformance — that is the
  plan-verifier agent.
metadata:
  version: 1.0.0
  tags: qa, browser, spec, verification, browser-mcp, manual-lane, command
---

# Spec verify — a QA pass in a real browser

Play a human QA tester who has just been handed the feature: open the running
app, walk every scenario the spec promises, and answer for each one whether
the product actually does it. The deterministic gates prove the code compiles
and the units pass; `plan-verifier` proves the diff matches the plan. Neither
ever sees a rendered screen — this is the only stage that does, and it is the
executor of the spec's `manual` verify lane
(`harness/specs/README.md`).

The boundary with its sibling: **does it WORK** is answered here; **does it
LOOK right** — spacing, colors, typography against the design frame — is
`/ui-verify`. The tester reads the screens in the UI's own language
(`AGENTS.md → Harness profile → i18n`); the report is written in the language
of the request.

Everything project-specific about the browser comes from `AGENTS.md →
Harness profile → browser-qa`, per slice: the dev-server command and URL, the
browser MCP, and the session broker (or `none`). **When `browser-qa` is
`none`** there is no app to open: refuse with that reason; `/implement`
records the skip of stage 3c instead of a verdict table.

The browser is driven through the browser MCP the profile names, attached to
the QA browser the session broker launches and signs in. The method below is
written in the `chrome-devtools` MCP's verbs (`navigate_page`,
`take_snapshot`, …); another browser MCP substitutes its equivalents. That
pairing — MCP plus broker — is what lets the walk sign in and out on the real
dev backend without a human (§ Sessions on the dev stand); an equivalent
browser surface may substitute for the steps, but not for the sessions.

**Browser pane as the fallback surface** (the desktop app's
`mcp__Claude_Browser` tools — only when the QA browser cannot run: no browser
binary, a cloud session). The session broker cannot reach the pane, so
signed-in checks there fall back to the human hand-off and the stub below.
The walk is the same, these substitutions are not optional, and the report
names the surface in its header:

- `read_network_requests` does not see cross-origin XHR to the dev API, so
  network-lane ACs are proven by a hook installed with `javascript_tool`
  before the interaction — patch `XMLHttpRequest.prototype.open`/`send` to
  record method, URL, `FormData` entries (a `File` as its name) and, on
  `loadend`, status and the first bytes of the response into `window.__reqs`.
  A full-page `navigate` drops the hook; in-app router links keep it.
- The OS file dialog cannot be opened; a file input is filled with
  `new DataTransfer()` + `input.files = dt.files` +
  `dispatchEvent(new Event('change', { bubbles: true }))` and a synthetic
  file (a 1×1 PNG for `image/*`, a `text/plain` blob for the rejection
  case). That is what turns thumbnail / MIME / upload ACs from `BLOCKED`
  into verdicts.
- Screenshots cannot be saved to disk; the **Screenshots** section says so
  in one line and every verdict quotes its DOM or JS evidence instead — no
  row goes without evidence.
- Chained timers inside one `javascript_tool` script (`await sleep()`,
  nested `setTimeout`) are throttled to about one per minute while the pane
  is **hidden**, so a multi-step script hits the 45 s tool timeout after its
  actions have already run and only the return value is lost. Split the walk
  into synchronous JS steps (click, dispatch, read) with `computer.wait`
  between them; poll state in a later step, never inside the script.
- After `resize_window`, ref-based `computer` clicks land off-target (the
  coordinate frame no longer matches the scaled pane) — a click on a
  dropdown option closes the panel instead of selecting it. Interact through
  `element.click()` / dispatched `input`/`blur`/`keydown` events and read
  the result back with `javascript_tool`; keep `computer` for screenshots
  and `wait` — left unchecked, these two traps eat a large share of the
  walk in retries.

- **Handing the pane to the human** (a sign-in, a step only they may take):
  in the same turn, re-run `preview_start` and confirm with `tabs_context`
  that the pane is open — the desktop app stops `preview_start` servers and
  closes the pane when a turn ends. Do not rely on an XHR hook across the
  human's steps: a reload drops it. Read the outcome afterwards from
  `performance.getEntriesByType('resource')` (URL + `responseStatus`), the
  DOM and storage, and list the exact steps for the human — the negative
  one (a wrong password) first. A closed pane costs a whole sign-in round,
  and a negative step nobody listed is never walked, so its ACs stay
  BLOCKED.
- `el.blur()` fires no `blur` while the document has no focus
  (`document.hasFocus() === false`, the usual state of the pane) — dispatch
  `new FocusEvent('blur')` to mark a field touched.
- Scope every button lookup to its container (the dialog container, the
  page header, the snackbar). A toast's "Close" can share its label with
  dialog buttons, and a document-wide lookup clicks the toast instead of the
  dialog — a silent wrong-target click that forces a re-walk.
- **No session on the pane → stub the responses.** The same XHR hook
  can answer: patch `open` / `setRequestHeader` / `send`, serve the auth and
  account endpoints (and any endpoint the stand cannot answer for the
  stubbed data) from a `{ 'METHOD path-regex': {status, body, delay} }`
  table by defining `readyState`, `status`, `response`, `responseText` on
  the XHR instance and dispatching `readystatechange` / `load` / `loadend`,
  and drop the fake `Authorization` header on pass-through requests —
  otherwise the real API answers 401 and an app that clears its session on
  401 ends it. Grade those rows `PASS (stub BE)` and name the stubbed
  endpoints in the `Data:` line. Rows that need a reload (the hook dies with
  the page) use real requests with a fake token and are read from
  `performance.getEntriesByType('resource')`. This turns signed-in flows
  that would otherwise grade BLOCKED into verdicts. Pane only: on the
  QA browser a whole-backend stub is never the mode — § The real backend
  first.

## Arguments

```
/spec-verify spec-path [--checklist ...] [--routes ...] [--breakpoints ...] [--base-url url]
```

| Argument | Meaning |
|---|---|
| `spec-path` | A `harness/specs/SPEC-<ISSUE>-*.md` file. Required unless `--checklist` is given — with neither, refuse and show both invocation forms |
| `--checklist` | A fenced list of checks supplied by the invoker when no spec exists; each line becomes a `CHK-N` row with the same verdict vocabulary. This fallback exists for work that has no spec yet |
| `--routes` | Entry routes, when the spec's `verify:` hints don't name them. If still ambiguous, ask the user — one question, before the walk starts, not during |
| `--breakpoints` | Default `1440x900`. `375x812` is added automatically when any AC or edge case mentions mobile, width, or a WHILE-width (ПОКИ) condition |
| `--base-url` | Default: the URL `AGENTS.md → Harness profile → browser-qa` gives the slice the spec touches |

## Input contract

What the invoker must supply — everything else this skill finds itself:

- the spec path **or** a checklist;
- routes, when the spec is silent about where the feature lives;
- known pre-existing failures (from the `/implement` brief or the user), so
  they are reported as pre-existing, not filed as new FAILs;
- a run slug for screenshot naming, when invoked from `/implement`;
- the report language (defaults to the language of the request).

A future `spec-verifier` agent wraps exactly this contract. Where this skill
asks the user directly (ambiguous route, ambiguous AC), the agent version
returns an `## Interview required` block instead — the two-pass handshake per
`.claude/agents/README.md`.

## Stage 0 — preflight

1. With a session broker in `browser-qa`: `node scripts/dev-session.mjs
   start` — the QA browser the MCP attaches to. It fails only without a
   browser binary; then switch to the Browser-pane fallback and name it in
   the report header. Session broker `none` → the browser MCP drives its own
   browser, and every check that needs a signed-in session grades
   `BLOCKED (no session broker)`.
2. Probe the app: `curl -sf <base-url>`.
3. Down → start the slice's dev-server command from `browser-qa` in the
   background and poll until the dev server answers and the first compile
   finishes. A compile failure is an **ABORT**: report the build error
   verbatim and emit zero verdicts — a tester cannot test an app that does
   not build, and a verdict table over a dead app would be fiction.
4. Port answers but the screens belong to another slice's app (two slices
   can share a default port) → stop and ask which server wins; do not kill
   anything yourself.
5. One probe navigation to the base URL, then `list_network_requests`: record
   the data situation — where the API requests actually go (the app may call
   an environment directly and bypass the dev-server proxy entirely) and any
   failures — into the report's `Data:` header line. This line is what
   separates "the feature is broken" from "the stand is dead" for every
   verdict that follows.

## Sessions on the dev stand

Every check runs under one session: anonymous, a role signed in, or a sign-in
the check itself performs. The session broker named in `browser-qa` —
`scripts/dev-session.mjs`, an adapter each project writes for its own
backend — owns them all. It reads the QA accounts from the gitignored root
`.env` (keys `QA_<APP>_<ROLE>_EMAIL|PASSWORD`, listed in `.env.example`),
which an agent never opens, and prints only `ok …` lines:

| Need | Command |
|---|---|
| The QA browser | `start` |
| Signed in as a role | `login --app <slice> --as <role>` (reuses a held session; `--force` re-signs) |
| Anonymous | `logout --app <slice>` (server logout, local session cleared) |
| The AC is the login form | `fill-login --app <slice> --as <role>`, `… --wrong-password`, or `fill-login --app <slice> --unknown` (random unregistered email); then click the button yourself |
| What is held now | `status` |

- **Seed or walk.** `login` writes the session straight into storage and
  cookies, so it skips the app's own sign-in code — return page, data sync
  on sign-in, guest state carried into the account. Any AC about what
  happens *on* sign-in or sign-out is walked through the form (`fill-login`)
  and the app's own sign-out control; `login` is for checks that merely need
  to be signed in.
- **The role** comes from the AC's `verify:` hint (`as <role>`) or its
  trigger, and is a column of the matrix. A role without
  `QA_<APP>_<ROLE>_*` keys (the script names the missing keys) grades its
  rows `BLOCKED (no QA account: <role>)`.
- **Order the walk by session** and keep sign-ins few: a login endpoint is
  usually rate-limited with `Retry-After`, failed attempts included. On a
  refusal with `Retry-After`, wait it out and retry once.
- **Shared accounts are not disposable.** A password change, reset, or
  deactivation on a QA account breaks `.env` for every run and revokes its
  sessions — those ACs grade `BLOCKED (needs a disposable account)` unless
  the invoker supplies one.
- `login`, `logout` reload the app tab: re-take the snapshot before the next
  step, and reinstall any page hook.

A rejected sign-in needs no human: `fill-login --unknown` walks it on the
live backend (401, error text, `aria-invalid`, values kept, error cleared on
edit), so those ACs never wait behind a hand-off.

## The real backend first

On the QA browser every check runs against the live dev API unless the stand
cannot produce what the AC needs. A stub is a per-row exception with a
named reason, never the run's mode — the Browser-pane stub table (above) is
the fallback for a surface without sessions, not a shortcut here. A report
graded on stubs leaves open the reader's first question — "what of this ran
on the real backend?" — which is the question the run exists to answer.

- **Stub only what the stand cannot give on demand:** an error status
  (500, 422, a timeout), a link that arrives by email, an OAuth round trip.
  Everything downstream of that one response stays live.
- **Stub the entry, not the flow.** When only the entry point is out of
  reach — a token exchange behind an emailed code or an OAuth provider —
  stub that one response with the token of the session `dev-session.mjs
  login` already holds: move the token from where the app keeps it (e.g.
  `localStorage`) into `sessionStorage` inside the page (the tab looks
  anonymous), and let the hook answer the exchange with it. The transfer,
  the account reads and the writes that follow then hit the real API with a
  real token. Its limit is stated, not hidden: the account is an existing QA
  account, so behaviour specific to a **newly created** account stays
  unproven (→ human hand-off below).
- **A write is proven by a read-back.** After any write an AC promises
  (a POST, a PATCH, a save), re-read the server — the AC's own GET, through
  `fetch` with the page's token inside `evaluate_script` — and quote the
  stored value. "The request went out with status 2xx" is half an AC.
- **The hook survives reloads.** Keep the XHR hook's source in
  `sessionStorage['__hook']`, the stub table in `sessionStorage['__stubs']`
  and the request log in `sessionStorage['__reqs']`, and pass every
  `navigate_page` (url *and* reload) the one-line `initScript`
  `eval(sessionStorage.getItem('__hook') || '')`. Reload-dependent ACs (an
  auto-retry on load, a marker read at boot) then keep the hook and the
  stubs. A reload the app or `dev-session.mjs` triggers itself still drops
  it — reinstall with `evaluate_script` before the next step.
- **Shared QA data is restored.** Writes to a shared QA account's ordinary
  data (cart contents, preferences, a draft) are allowed — that is normal
  use — but the walk snapshots the server state first (the AC's GETs) and
  restores it at the end through the app's own UI, then re-reads to
  confirm. Name what could not be restored (a merge that never deletes a
  key) under `### Noticed in passing`. Leave the role signed in as found.
- **What stays for a human** — a flow whose entry the stand cannot give
  even with the stub above (creating a genuinely new account through a
  mailbox, a real OAuth consent) — is listed in the report's `### Live
  coverage` as numbered steps a human can walk, negative step first. The
  rows the stub covered keep their stub verdict; the hand-off is the missing
  end-to-end proof, not a downgrade.

## Stage 1 — the check matrix

Read the spec and enumerate every check before touching the browser:

- every `AC-N` — its trigger (WHEN/WHILE/IF, or КОЛИ/ПОКИ/ЯКЩО when
  `AGENTS.md → Harness profile → languages` selects the Ukrainian EARS set),
  its shall-clause, and its `verify:` surface · lane;
- every edge case, carried with its `→ AC-N` link;
- a11y lines from the NFR section that are observable on screen (focus order,
  labels, contrast at the "obviously wrong" level — a full audit is not this
  skill's job).

One row per check: id × route × session × backend (`live`, or the one
stubbed response and why — § The real backend first) × steps × expected
observable. `manual`-lane ACs are mandatory. `unit`- or slice-lane ACs are
included only when their outcome is observable on a screen; otherwise they
are graded `UNVERIFIABLE` with the reason ("proven by the unit lane, not a
screen") — grading them PASS from the code would be plan-verifier's job done
worse.

An AC the spec's `Deferred:` header line names is a row too — graded
`BLOCKED (deferred: <dependency from the line>)` before the walk, never
walked, never a FAIL. The spec already says the product cannot do it yet; a
tester re-discovering that on every run buries the real verdicts under
noise. Un-deferring is a spec edit, not a verdict.

Print the matrix before walking it, so the human can see what is about to be
tested and catch a misread AC before it costs a browser run.

## Stage 2 — walk the checks

One check at a time, the way a human would:

- `navigate_page` to the route, `take_snapshot` for structure and text —
  snapshots are the primary evidence for "the element is there and says X";
  screenshots are for humans, snapshots are for verdicts;
- interact per the AC's trigger: `click`, `fill`, `press_key`, `wait_for`;
- observe the expected outcome; `take_screenshot` on every FAIL and on key
  passing states (the states a reviewer would want attached to the MR/PR);
- `resize_page` per breakpoint for responsive checks;
- after each route: harvest `list_console_messages` and
  `list_network_requests`. Console errors are always reported, even on a
  PASS — a passing screen with a red console is a finding a human tester
  would never swallow.

**Free-text inputs get three probes, not one.** For every text input an AC
names, type at least: a value with an **inner space** ("Test User"), a value
with **leading and trailing spaces**, and a **mixed-case** value — and
compare the field, the URL and the outgoing request after each. Shared
components reused unchanged sit outside every diff-grounded review, so this
walk is the only stage that can see them: a search field that turns "Test
User" into "TestUser" passes every review angle, a single-word walk and
`plan-verifier`, and reaches the human.

Verdicts, strictly:

| Verdict | Means |
|---|---|
| `PASS` | The expected observable happened, seen in a snapshot or screenshot |
| `FAIL` | The product did something else. A half-met AC is a FAIL with detail — testers do not half-pass |
| `BLOCKED` | Could not observe for environmental reasons only: no data, dead route, auth wall, no QA account, no session broker. Never "hard to test" |
| `UNVERIFIABLE` | Not observable in a browser at all (an SMS, a cron, a unit-lane fact) — with the reason |

A bare `PASS` means **live**: every response on the path came from the real
API. A row that leaned on a stub says which, in the verdict itself —
`PASS (stub: token exchange)`, `PASS (stub: items 500)` — so the table
answers "what ran on the real backend" without a second read.
`PASS (stub BE)` stays the Browser-pane form, where the whole backend is
stubbed.

`UNVERIFIABLE` is deliberately the same word plan-verifier uses for
runtime-dependent requirements: a `PASS` here is the evidence that closes
that agent's runtime rows, and the shared token makes the handoff greppable.
The rest of the vocabulary is deliberately disjoint from its
MET/PARTIAL/NOT MET, so a runtime grade can never be mistaken for a static
one.

Screenshots go to `.git/spec-verify-shots/<slug>/NN-<check>.png` — inside the
checkout but outside the tree, the same place `/mr-self-review` keeps its
stamp — because a browser MCP like `chrome-devtools` can only write within
the workspace root, and the working tree gets no per-branch artifacts. The
report names absolute paths so the human can attach them to the MR/PR.

## Stage 3 — report

Print the report in chat; inside an `/implement` run it is also appended
verbatim to `harness/sdd/<slug>.md` under `## Reports`. The verdict counts
line is the machine-readable summary — `/implement` reads it the way it reads
`Steps: N/N`.

```markdown
## Spec verification — SPEC-<ISSUE> <feature>
App: <base-url> · Branch: <name> · Breakpoints: 1440x900, 375x812
Surface: QA browser (<browser MCP>) | Browser pane (fallback: <reason>)
Data: <live | degraded — API proxied to <target>, N requests failed> · stubbed: <endpoint → status, why — or "none">
Sessions: <web user (seeded), web via form ×2, web manager — or "anonymous only" | "no session broker">

| Check | Route | Verdict | Evidence |
|---|---|---|---|
| AC-1 | /items | PASS | list renders, 12 items after the filter |
| AC-2 | /items | FAIL | expected the error state with retry, got an empty page — shot 03 |
| AC-3 | /items | PASS (stub: items 500) | error state with "Try again" |
| EC-empty (→ AC-4) | /items | BLOCKED | items API → 502; no data |
| AC-5 | — | UNVERIFIABLE | needs SMS delivery — outside the browser |

Verdict: 8 PASS · 1 FAIL · 2 BLOCKED · 1 UNVERIFIABLE

### Live coverage
- Live (real API, writes read back): <AC ids>
- Stubbed: <AC ids — the stubbed response and why the stand cannot give it>
- Left for a human: <end-to-end flow the stand cannot start, as numbered
  steps, negative step first — or "none">

### FAIL details
- AC-2 — steps taken · expected vs actual · screenshot path · surface
  (the route/screen where it broke — not a code diagnosis)

### Console & network
<per-route digest, first lines verbatim; "clean" when empty — never omitted>

### Noticed in passing
<off-spec observations a human tester would mention; not graded>

### Screenshots
<absolute .git/spec-verify-shots/ paths, one per line>
```

Keep every section even when empty and say so in one line. Do not pad the
matrix to look thorough — a check that was not walked is not in the table.

## Failure modes

| Situation | Behaviour |
|---|---|
| `browser-qa` is `none` | Refuse with that reason; no verdict table |
| App fails to compile | ABORT — build error verbatim, no verdict table |
| The base URL serves another slice's app | Stop, ask which server wins |
| Route 404 / renders blank | Every check on that route `BLOCKED`, route named once in FAIL-details style |
| The API down or empty | Affected checks `BLOCKED`; `Data:` header line; the run continues |
| No spec and no `--checklist` | Refuse, show both invocation forms |
| `dev-session.mjs start` fails | Browser-pane fallback, reason in the `Surface:` line |
| Session broker is `none` | Signed-in rows `BLOCKED (no session broker)`; anonymous rows walked; the run continues |
| A role has no QA account | Its rows `BLOCKED (no QA account: <role>)`; the run continues |
| Login refused with `Retry-After` | Wait it out, retry once; still refused → affected rows `BLOCKED (login limit)` |
| Console errors on passing pages | Reported in the digest regardless of verdicts |
| Flow starts behind a mailbox or OAuth | Stub only the entry response with the held session's token (§ The real backend first), walk the rest live, list the end-to-end flow under `Left for a human` |

## What this skill must not do

- **Edit any file** — code, spec, proxy config, anything. A verifier that
  changes the state it is grading is no longer verifying it.
- **Touch credentials.** Never open `.env`, never type a real password into
  a field or a request — the session broker does both, so no secret reaches
  the transcript or a screenshot caption. A session token a stub or a
  read-back needs stays inside the page (app storage → `sessionStorage`
  → the hook / `fetch`): `evaluate_script` returns booleans and data, never
  the token, and the walk clears its `sessionStorage` keys when it ends.
- **Diagnose root causes in code.** A FAIL names the surface — route, screen,
  what was expected and what happened. The fix loop owns the diagnosis;
  a tester who starts reading source stops being evidence.
- **Grade pixel fidelity.** Off-by-8px spacing and wrong font weights go to
  `/ui-verify`, which has the design open. Filing them here duplicates the
  finding under a vocabulary that cannot express it.
- **Convert environment problems into product FAILs.** That is what BLOCKED
  is for — a QA tester whose test stand is down files one stand ticket, not
  twelve bug reports.
- **Invent scenarios beyond the spec.** The matrix is the contract. What a
  human tester would incidentally notice goes under `### Noticed in
  passing` — never into the verdict table, where it would dilute the spec's
  own pass rate.
