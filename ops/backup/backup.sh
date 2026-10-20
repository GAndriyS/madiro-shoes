#!/bin/sh
# Dump → verify → upload → prune. Any failure is a non-zero exit, which Railway
# shows as a failed cron run; silence here would be the worst outcome, so
# every step is loud.
#
# Required variables (set on the Railway service):
#   DATABASE_URL          ${{Postgres.DATABASE_URL}} — private network
#   R2_ACCOUNT_ID         Cloudflare account id (the endpoint is derived)
#   R2_BUCKET             bucket name
#   R2_ACCESS_KEY_ID      R2 API token with Object Read & Write on that bucket
#   R2_SECRET_ACCESS_KEY
# Optional:
#   HEALTHCHECK_PING_URL  dead man's switch (healthchecks.io-style check URL).
#                         Pinged on success and at <url>/fail on any failure, so
#                         a run that breaks — or never starts — alerts someone
#                         instead of waiting to be noticed in the Railway UI.
#   BACKUP_NAME           file prefix, default madiro-prod
#   BACKUP_RETENTION_DAYS dumps older than this are deleted, default 35.
#                         Dumps taken on the 1st of a month are never pruned.
#   R2_ENDPOINT / R2_PROVIDER
#                         override the derived Cloudflare endpoint — only so the
#                         script can be rehearsed against a local S3 server,
#                         e.g. `rclone serve s3 /data --auth-key key,secret`
#                         with R2_PROVIDER=Other.
set -eu

# Never fails the backup itself: a monitoring hiccup must not turn a good dump
# into a failed run. The URL is a credential of sorts (anyone holding it can
# report success), so it is never echoed.
ping() {
  [ -n "${HEALTHCHECK_PING_URL:-}" ] || return 0
  curl -fsS --max-time 10 --retry 3 --output /dev/null "${HEALTHCHECK_PING_URL%/}$1" ||
    echo "⚠ could not reach the healthcheck ping URL" >&2
}

# Installed before anything can fail, so a missing variable alerts as loudly
# as a failed dump. The explicit exit keeps the failure a failure: Railway, and
# `pnpm release` waiting on this run, read the exit code, not the ping.
on_exit() {
  status=$?
  if [ "$status" -ne 0 ]; then
    echo "✗ backup failed (exit $status)" >&2
    ping /fail
  fi
  exit "$status"
}
trap on_exit EXIT
# A stop or redeploy sends SIGTERM; route it through on_exit as a failure.
trap 'exit 143' TERM

: "${DATABASE_URL:?DATABASE_URL is not set}"
: "${R2_ACCOUNT_ID:?R2_ACCOUNT_ID is not set}"
: "${R2_BUCKET:?R2_BUCKET is not set}"
: "${R2_ACCESS_KEY_ID:?R2_ACCESS_KEY_ID is not set}"
: "${R2_SECRET_ACCESS_KEY:?R2_SECRET_ACCESS_KEY is not set}"

# One object per run, never overwritten. The nightly run is not the only one:
# `pnpm release` runs this service before a migration, and someone may run it
# by hand after an incident — neither may replace a dump that could be the last
# good copy. UTC, sortable: madiro-prod-2026-10-16T030012Z.dump.
name="${BACKUP_NAME:-madiro-prod}-$(date -u +%Y-%m-%dT%H%M%SZ).dump"
file="/tmp/${name}"

echo "▸ dumping ($(psql "$DATABASE_URL" -Atc 'select version()' | cut -d' ' -f1-2))"
pg_dump "$DATABASE_URL" --format=custom --no-owner --no-privileges --file="$file"

# A dump that pg_restore cannot even list is not a backup.
echo "▸ verifying"
pg_restore --list "$file" > /dev/null
size=$(stat -c %s "$file")
[ "$size" -gt 0 ] || { echo "empty dump"; exit 1; }

# rclone is configured entirely from the environment — no config file to leak
# (and none to look for, which is what the /dev/null config silences).
export RCLONE_CONFIG=/dev/null
export RCLONE_CONFIG_R2_TYPE=s3
export RCLONE_CONFIG_R2_PROVIDER="${R2_PROVIDER:-Cloudflare}"
export RCLONE_CONFIG_R2_ENDPOINT="${R2_ENDPOINT:-https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com}"
export RCLONE_CONFIG_R2_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
export RCLONE_CONFIG_R2_ACL=private
export RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true

echo "▸ uploading ${name} (${size} bytes)"
rclone copyto "$file" "r2:${R2_BUCKET}/${name}"
# Read it back from the bucket: an upload that cannot be listed did not happen.
rclone lsl "r2:${R2_BUCKET}/${name}" | grep -q "${name}"

# The monthly keep matches both name formats: the date-only one written before
# names carried a time (…-2026-11-01.dump) and the current one.
echo "▸ pruning dumps older than ${BACKUP_RETENTION_DAYS:-35} days (monthly ones kept)"
rclone delete "r2:${R2_BUCKET}" --min-age "${BACKUP_RETENTION_DAYS:-35}d" \
  --exclude '*-01.dump' --exclude '*-01T*.dump'

echo "✓ backup ok: ${name}"
ping ''
