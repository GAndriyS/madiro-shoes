# Release process

Two environments, one direction of travel:

```
feature branch → PR → merge to main → DEMO deploys automatically
                                    ↓
                          pnpm release → tag vX.Y.Z → release branch → PROD deploys
```

A release is a **promotion**, not a build: PROD runs the exact commit that has
already been running in DEMO. Nothing is compiled, rewritten or configured
during a release — the script moves branch pointers and records what moved.

## Cutting a release

```bash
pnpm release            # patch: 1.0.0 → 1.0.1
pnpm release minor      # 1.0.1 → 1.1.0
pnpm release major      # 1.1.0 → 2.0.0
```

The very first release is `v1.0.0` regardless of the argument (there are no
tags to bump from).

What the script does, in order:

1. **Refuses to start** unless the tree is clean, you are on `main`, `main` is
   in sync with `origin/main`, `release` is an ancestor of `main`, and CI on
   this exact commit is green.
2. Bumps `version` in the **root `package.json`** — the single source of truth
   for the whole workspace — and commits it as `chore(release): vX.Y.Z`.
3. Creates an annotated tag `vX.Y.Z`.
4. Pushes `main`, the tag, and fast-forwards `release` to `main`. **There is no
   `--force` anywhere in the script**: if the fast-forward is rejected, the
   branches genuinely diverged and that needs a human.
5. Creates a GitHub Release with generated notes.
6. Polls PROD `/api/health` until it reports the new version, then exits.

Every step is guarded and the script is **re-runnable**. If the network dies
after the tag is pushed, run the same command again: it recognises the release
commit, skips what is done, and finishes the rest. It will not bump the version
twice.

### Choosing patch / minor / major

- **patch** — fixes and internal changes; nobody has to be told.
- **minor** — new capability a user would notice.
- **major** — the admin or sellers must do something differently, or data
  changes shape in a way worth announcing.

## Verifying a release

```bash
curl -s https://<prod-api-domain>/api/health
# {"status":"ok","database":"up","version":"1.2.0","env":"production","commit":"a1b2c3d"}
```

The same payload drives the badge under both login screens: the version always,
and a `DEMO` tag when `env` is `demo`. If a screen says DEMO, it is not the
shop's real data — that is the whole point of the badge.

## Rolling back

**Immediate** (seconds, no git): Railway → the affected service → Deployments →
the previous deployment → Redeploy. Do this first when PROD is broken; make git
agree afterwards.

**Durable** (git — this is what the next deploy will build):

```bash
git fetch origin
git checkout -B rollback vX.Y.Z          # the last good tag
git push --force-with-lease=release origin rollback:release
git branch -D rollback
```

`--force-with-lease` rather than `--force`: it refuses if `origin/release`
moved since your last fetch, which is the one thing that could silently undo
someone else's fix.

Confirm with `/api/health` — it should report the old version again.

Do **not** delete the bad tag or its GitHub Release. Add a line to the release
notes saying it was rolled back and why; the next fix ships as a new patch.

After a rollback `release` still points at an ancestor of `main`, so the next
normal release fast-forwards cleanly.

### Why migrations must be backward compatible

`prisma migrate deploy` only rolls forward. A rollback therefore runs **older
code against a newer database**. The rule that keeps this safe:

> A migration shipped in release *N* must not break the code of release *N−1*.

In practice: add columns as nullable or with a default; write the code that
fills them in the same release; drop a column only in a release *after* the one
that stopped reading it. Renames are two releases: add the new name, migrate
the reads, drop the old one later.

## Hotfixes

The normal answer is: **keep `main` releasable and just release it.** `main` is
gated by the full CI suite on every PR, and increments are small.

The escape hatch is for when `main` already carries work that must not ship yet:

```bash
# 1. Land the fix on main normally (PR + CI) — main must never miss a fix.
# 2. Build the hotfix on top of what PROD is actually running:
git checkout -b hotfix vX.Y.Z
git cherry-pick <fix-sha-from-main>

# 3. Bump the patch version in the root package.json by hand, then:
git commit -am "chore(release): vX.Y.(Z+1)"
git tag -a "vX.Y.(Z+1)" -m "vX.Y.(Z+1)"
git push origin "vX.Y.(Z+1)"
git push origin hotfix:release          # fast-forward from the tag PROD runs
gh release create "vX.Y.(Z+1)" --verify-tag --generate-notes

# 4. REQUIRED — put the release commit back on main:
git checkout main && git merge release && git push origin main
git branch -D hotfix
```

Step 4 is not optional. If you skip it, `release` stops being an ancestor of
`main` and the next `pnpm release` aborts with exactly that message — the guard
exists to force you back here.
