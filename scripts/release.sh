#!/usr/bin/env bash
#
# Cut a release: bump the version, tag it, point PROD at it, verify it landed.
#
#   pnpm release [patch|minor|major]   # default: patch
#
# The pipeline is: every merge to `main` deploys DEMO; a release fast-forwards
# `release` to `main`, and PROD tracks `release`. So a release is a promotion of
# code that has already been running in DEMO — this script never builds or
# transforms anything, it only moves pointers and records what moved.
#
# Every step is guarded and re-runnable: if the network dies after the tag is
# pushed, run the same command again and it finishes the remaining steps instead
# of failing on "tag already exists".
#
# A release that brings database migrations first has PROD's `backup` cron
# service take a fresh dump (Railway CLI, logged in), and publishes nothing
# until that dump has succeeded. RELEASE_BACKUP=manual swaps that for a typed
# confirmation — see docs/release-process.md.
set -euo pipefail

cd "$(dirname "$0")/.."

BUMP="${1:-patch}"
# Where to confirm the deploy landed: the PROD api, which tracks `release`.
# (The similarly named madiro-shoes-production domain is DEMO — it kept its
# original name when that environment was renamed.) Overridable so a
# PROD-like environment can be verified with the same script.
HEALTH_URL="${PROD_HEALTH_URL:-https://api-production-bfcf.up.railway.app/api/health}"
POLL_TIMEOUT_SECONDS="${RELEASE_POLL_TIMEOUT:-900}"
# The pre-migration backup: PROD's off-platform dump service (DEPLOYMENT.md →
# Backups), addressed by name so no `railway link` is needed.
RAILWAY_PROJECT="${RELEASE_RAILWAY_PROJECT:-splendid-youthfulness}"
BACKUP_SERVICE="${RELEASE_BACKUP_SERVICE:-backup}"
BACKUP_TIMEOUT_SECONDS="${RELEASE_BACKUP_TIMEOUT:-900}"

step() { printf '\n\033[1m▸ %s\033[0m\n' "$1"; }
info() { printf '  %s\n' "$1"; }
fail() { printf '\n\033[31m✗ %s\033[0m\n' "$1" >&2; exit 1; }

# "<id> <status>" of one run of the backup cron — the given id, or the newest
# run when called without one. Prints nothing when there is no such run.
backup_run() {
  railway cron list --project "$RAILWAY_PROJECT" --environment production \
    --service "$BACKUP_SERVICE" --limit 20 --json |
    node -e '
      const runs = JSON.parse(require("fs").readFileSync(0, "utf8"));
      const wanted = process.argv[1];
      const run = wanted ? runs.find((r) => r.id === wanted) : runs[0];
      if (run) console.log(run.id + " " + run.status);
    ' "${1:-}"
}

# Runs PROD's backup cron now, on Railway, and waits for the verdict. The dump
# is then made exactly like every night's — over the private network, verified,
# uploaded to R2 and read back — and nothing about the database or its
# credentials touches this machine. Railway reports a run that exited non-zero
# as CRASHED; backup.sh exits non-zero on any failed step, so EXITED is a dump
# that is in the bucket.
backup_via_railway() {
  command -v railway >/dev/null ||
    fail 'Потрібен Railway CLI (https://docs.railway.com/cli) — або RELEASE_BACKUP=manual, див. docs/release-process.md.'
  railway whoami >/dev/null 2>&1 || fail 'Railway CLI не авторизований — виконайте: railway login'

  local before before_id before_status watch_id='' run id status deadline
  before=$(backup_run) ||
    fail "Не вдалося прочитати запуски «$BACKUP_SERVICE» у production (railway cron list)."
  before_id=${before%% *}
  before_status=${before#* }

  # A run already in progress started minutes ago at most, so its dump is as
  # fresh as a new one — and a second trigger would only be SKIPPED meanwhile.
  case "$before_status" in
    CREATED | INITIALIZING | RUNNING | RESTARTING)
      info "Бекап уже виконується (запуск $before_id) — чекаю на нього."
      watch_id=$before_id
      ;;
    *)
      railway cron run --project "$RAILWAY_PROJECT" --environment production \
        --service "$BACKUP_SERVICE" --yes --json >/dev/null ||
        fail "Не вдалося запустити «$BACKUP_SERVICE» (railway cron run)."
      info "Запущено «$BACKUP_SERVICE» у production; чекаю на результат (до $((BACKUP_TIMEOUT_SECONDS / 60)) хв)…"
      ;;
  esac

  deadline=$(($(date +%s) + BACKUP_TIMEOUT_SECONDS))
  while [ "$(date +%s)" -lt "$deadline" ]; do
    sleep 10
    # A failed poll is a network blip, not a verdict — ask again.
    run=$(backup_run "$watch_id") || continue
    [ -n "$run" ] || continue
    id=${run%% *}
    status=${run#* }
    # The triggered run takes a while to appear; until then the newest is
    # still the one from before.
    if [ -z "$watch_id" ]; then
      [ "$id" != "$before_id" ] || continue
      watch_id=$id
    fi
    case "$status" in
      EXITED)
        info "Свіжий дамп PROD у R2 (запуск $id)."
        return 0
        ;;
      CREATED | INITIALIZING | RUNNING | RESTARTING) ;;
      *)
        fail "Бекап завершився зі статусом $status — нічого не опубліковано. Логи: railway logs --service $BACKUP_SERVICE --environment production"
        ;;
    esac
  done
  fail "Бекап не завершився за $((BACKUP_TIMEOUT_SECONDS / 60)) хв — нічого не опубліковано. Перевірте: railway cron list --service $BACKUP_SERVICE --environment production"
}

# The fallback when the CLI route is unavailable: the maintainer takes the dump
# some other way and says so. A typed answer, not a flag, so it cannot be
# satisfied by a stale environment variable alone.
backup_confirmed_by_hand() {
  [ -t 0 ] || fail 'RELEASE_BACKUP=manual потребує інтерактивного терміналу.'
  info 'Зробіть свіжий дамп PROD (див. docs/release-process.md) і переконайтеся, що він є в R2.'
  local answer
  read -r -p '  Свіжий дамп PROD є в R2? Введіть «так», щоб продовжити: ' answer
  [ "$answer" = 'так' ] || fail 'Без свіжого бекапу реліз із міграціями не публікується.'
}

case "$BUMP" in
  patch | minor | major) ;;
  *) fail "Невідомий тип бампу «$BUMP». Очікується patch | minor | major." ;;
esac

# ─────────────────────────────────────────────────────────────── preflight ──
step 'Перевірки перед релізом'

command -v gh >/dev/null || fail 'Потрібен gh CLI (https://cli.github.com).'
gh auth status >/dev/null 2>&1 || fail 'gh не авторизований — виконайте: gh auth login'

[ -z "$(git status --porcelain)" ] || fail 'Робоче дерево брудне — закомітьте або сховайте зміни.'

branch=$(git rev-parse --abbrev-ref HEAD)
[ "$branch" = 'main' ] || fail "Реліз робиться з main, а ви на «$branch»."

git fetch --quiet origin --tags
head_sha=$(git rev-parse HEAD)

# HEAD must not be behind origin/main. Being *ahead* is legal in exactly one
# case: a previous run of this script committed the version bump and then died
# before pushing. Anything else ahead is unpushed work, and a release must not
# silently publish it.
git merge-base --is-ancestor origin/main HEAD ||
  fail 'main відстає від origin/main — зробіть pull і повторіть.'

unpushed=$(git rev-list --count origin/main..HEAD)
if [ "$unpushed" -gt 0 ]; then
  [ "$unpushed" -eq 1 ] && [[ "$(git log -1 --format=%s)" == chore\(release\):\ v* ]] ||
    fail "main має $unpushed незапушених комітів — запуште їх звичайним шляхом і повторіть."
fi

# `release` must stay an ancestor of `main`, or the fast-forward below is
# impossible. It diverges only after a hotfix that was never merged back —
# docs/release-process.md describes exactly that path.
if git rev-parse --quiet --verify origin/release >/dev/null; then
  git merge-base --is-ancestor origin/release origin/main ||
    fail 'release не є предком main (ймовірно, після hotfix) — змержіть release у main, потім повторіть. Див. docs/release-process.md'
fi

# CI on this very commit. A release is a promotion, so the gate that matters
# already ran — this only refuses to promote a commit that failed it.
ci_state=$(gh run list --commit "$head_sha" --workflow CI --limit 1 \
  --json status,conclusion --jq '.[0] | "\(.status):\(.conclusion)"' 2>/dev/null || echo '')
case "$ci_state" in
  completed:success) info "CI на $(git rev-parse --short HEAD): зелений" ;;
  '' | 'null:null') info 'CI-запуск для цього коміту не знайдено — продовжую (перевірте вручну).' ;;
  completed:*) fail "CI на цьому коміті не пройшов ($ci_state)." ;;
  *) fail "CI ще виконується ($ci_state). Дочекайтесь: gh run watch" ;;
esac

# ──────────────────────────────────────────────────────────────── version ──
current=$(node -p "require('./package.json').version")

# HEAD already being a release commit means a previous run bumped and committed;
# take its version rather than bumping again — otherwise a resume would publish
# 1.0.1 for a release that was meant to be 1.0.0.
if [[ "$(git log -1 --format=%s)" == chore\(release\):\ v* ]]; then
  resuming=true
  version="${current}"
  info "HEAD — уже реліз-коміт v$version; доробляю незавершені кроки."
elif [ -z "$(git tag -l 'v*')" ]; then
  # No tags at all: this is the first release, and it is 1.0.0 by definition.
  resuming=false
  version='1.0.0'
  info "Тегів ще немає — перший реліз: v$version (аргумент «$BUMP» проігноровано)"
else
  resuming=false
  version=$(node -e "
    const [ma, mi, pa] = '$current'.split('.').map(Number);
    const bump = '$BUMP';
    console.log(
      bump === 'major' ? [ma + 1, 0, 0].join('.')
      : bump === 'minor' ? [ma, mi + 1, 0].join('.')
      : [ma, mi, pa + 1].join('.'),
    );
  ")
  info "Версія: $current → $version"
fi
tag="v$version"

# The tag may already exist from an interrupted run — fine if it points here,
# fatal if it names a different commit (that version is already spoken for).
if existing=$(git rev-parse --quiet --verify "refs/tags/$tag^{commit}"); then
  [ "$existing" = "$(git rev-parse HEAD)" ] ||
    fail "Тег $tag уже зайнятий іншим комітом ($(git rev-parse --short "$existing"))."
  info "Тег $tag уже вказує на цей коміт."
elif [ "$resuming" = false ] && git ls-remote --exit-code --tags origin "$tag" >/dev/null 2>&1; then
  fail "Тег $tag уже існує на origin."
fi

# ─────────────────────────────────────────────────── pre-migration backup ──
# PROD migrates the moment it boots the new release, and the nightly dump can
# be almost a day old by then. Compared against origin/release — what PROD runs
# now — so a resumed run whose `release` push already happened finds nothing
# left to protect: that migration has already run.
if git rev-parse --quiet --verify origin/release >/dev/null; then
  prod_ref=origin/release
else
  prod_ref=$(git hash-object -t tree /dev/null) # no PROD yet: every migration is new
fi
migrations=$(git diff --name-only "$prod_ref" HEAD -- apps/api/prisma/migrations)

if [ -n "$migrations" ]; then
  step 'Свіжий бекап PROD перед міграціями'
  printf '%s\n' "$migrations" |
    sed -n 's#^apps/api/prisma/migrations/\([^/]*\)/.*#  · \1#p' | sort -u
  case "${RELEASE_BACKUP:-railway}" in
    railway) backup_via_railway ;;
    manual) backup_confirmed_by_hand ;;
    *) fail "Невідоме RELEASE_BACKUP=«${RELEASE_BACKUP}». Очікується railway | manual." ;;
  esac
fi

# ─────────────────────────────────────────────────────────── bump and tag ──
step "Версія $version і тег"
if [ "$resuming" = false ]; then
  node -e "
    const fs = require('node:fs');
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    pkg.version = '$version';
    fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
  "
  git add package.json
  git commit --quiet -m "chore(release): $tag"
  info "Закомічено chore(release): $tag"
fi
# Tagging is separate from committing so a resume can add a tag the previous
# run never reached.
if ! git rev-parse --quiet --verify "refs/tags/$tag" >/dev/null; then
  git tag -a "$tag" -m "$tag"
  info "Протеговано $tag"
fi

step 'Публікація'
git push --quiet origin main
git push --quiet origin "$tag"
info "main і $tag на origin"

# Fast-forward only: no --force anywhere in this script. If the server rejects
# this, release holds something main does not, and that must be looked at.
git push --quiet origin main:release ||
  fail 'Не вдалося перемотати release на main — гілка розійшлася; див. docs/release-process.md'
info 'release перемотано на main → Railway почав деплой PROD'

# GitHub Release is the human-readable record; re-runs skip an existing one.
if gh release view "$tag" >/dev/null 2>&1; then
  info "GitHub Release $tag уже існує"
else
  gh release create "$tag" --verify-tag --generate-notes --title "$tag" >/dev/null
  info "GitHub Release $tag створено"
fi

# ───────────────────────────────────────────────────────────────── verify ──
step "Перевірка PROD ($HEALTH_URL)"
deadline=$(($(date +%s) + POLL_TIMEOUT_SECONDS))
while [ "$(date +%s)" -lt "$deadline" ]; do
  payload=$(curl -fsS --max-time 10 "$HEALTH_URL" 2>/dev/null || echo '')
  live=$(printf '%s' "$payload" | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).version' 2>/dev/null || echo '')
  if [ "$live" = "$version" ]; then
    env_name=$(printf '%s' "$payload" | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).env' 2>/dev/null || echo '?')
    printf '\n\033[32m✓ %s у PROD (env=%s)\033[0m\n' "$tag" "$env_name"
    exit 0
  fi
  sleep 15
done

fail "PROD не показав версію $version за $((POLL_TIMEOUT_SECONDS / 60)) хв. Реліз опубліковано — перевірте білд у Railway (це проблема деплоя, не релізу)."
