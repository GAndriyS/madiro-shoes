# Entry examples — good vs bad

The bar for every entry: **actionable cold**. A reader with no session context
knows exactly what to do or avoid, without asking follow-ups. And it must be
**consequential** — something downstream changes because it was written — and
**unique** — nothing already in the file says it.

Examples below are illustrative of the format, not recorded facts about any
project — the slice names (`web`, `api`) and paths are made up; the live
entries are in the project's `INSIGHTS.md` files.

## The two entries that most often should NOT be written

Bad: *Interesting but inert.* `- **2025-03-04** — Every feature folder
   carries its own README.`
   True, and genuinely interesting — but nothing a future session does changes
   because of it, and the folder listing says it plainly. Trivia, not an
   insight.

Bad: *A rephrasing of an existing entry.* If the file already says the full
   gate run is required before an MR/PR, do not add "remember to run all the
   checks before pushing". Extend the original with a dated line only if you
   learned something new about it; otherwise write nothing.

## What Works

Bad: `- **2025-03-04** — Running the slice gate saved time.`
Good: `- **2025-03-04** — For changes confined to one slice,
   node scripts/verify.mjs --slice web cuts the pre-commit gate to a
   fraction of the full run; the full run is still required before an MR/PR
   (scripts/verify.mjs).`

## What Doesn't Work

Bad: `- **2025-03-04** — Reactive state can be tricky.`
Good: `- **2025-03-04** — Syncing two pieces of state with a watcher that writes
   one from the other re-triggers itself on every change; abandoned in favour
   of a single source with a derived value — the dependent value must be
   derived, not mirrored (web/src/features/checkout/).`

The WHY is the payload. "X didn't work" without the reason forces the next
session to rediscover it.

## Codebase Patterns

Bad: `- **2025-03-04** — The web app is split into feature folders.`
   (Obvious to anyone opening the source tree — fails the obviousness test.)
Good: `- **2025-03-04** — Money amounts travel between client and API as
   integer minor units (cents); only the display helper divides by 100 —
   never send a formatted or float amount back in a request body
   (web/src/shared/money.ts).`

## Tool & Library Notes

Bad: `- **2025-03-04** — Be careful with the CSV export.`
Good: `- **2025-03-04** — The CSV export library quotes a field only when it
   contains a comma, so a value starting with an equals sign opens as a
   formula in a spreadsheet; prefix such cells with an apostrophe before
   export
   (web/src/features/reports/export.ts).`

## Recurring Errors & Fixes

Bad: `- **2025-03-04** — Fixed the flaky date test again.`
Good: `- **2025-03-04** — The invoice-total test fails when run shortly after
   midnight because its fixtures build dates in the local time zone; fix:
   construct fixture dates in UTC
   (web/src/features/invoices/invoice-total.test.ts).
   — **2025-03-05** — recurred in the reports test; one more and this is a
   promotion candidate for AGENTS.md → Conventions.`

The dated follow-up line doubles as the promotion counter (see
`SKILL.md → Maintenance`).

## Open Questions

Bad: `- **2025-03-04** — Is search fast enough?`
Good: `- **2025-03-04** — The product-list search takes 2–3 s on the staging
   API for queries under three characters — is the API missing an index, or
   should the client require a minimum query length?
   (web/src/features/products/search.ts)`

**Closing one.** Never annotate in place:

Bad: `- **2025-03-06** (resolved) — Turned out the API lacked an index.`
   The question is now noise in a queue meant to hold open items.

Good: Delete the question. Then, if the answer is an insight on its own terms,
   write it where it belongs — here, `Codebase Patterns`:
   `- **2025-03-06** — The product search endpoint scans the whole table for
   queries under three characters; the client sends a query only from the
   third character on — do not lower that minimum without an API change
   (web/src/features/products/search.ts).`
   If the answer is already captured by a code comment or a spec, delete the
   question and write nothing.
