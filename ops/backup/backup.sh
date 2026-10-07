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
#   BACKUP_NAME           file prefix, default madiro-prod
#   BACKUP_RETENTION_DAYS daily dumps older than this are deleted, default 35.
#                         Dumps taken on the 1st of a month are never pruned.
#   R2_ENDPOINT / R2_PROVIDER
#                         override the derived Cloudflare endpoint — only so the
#                         script can be rehearsed against a local MinIO.
set -eu

: "${DATABASE_URL:?DATABASE_URL is not set}"
: "${R2_ACCOUNT_ID:?R2_ACCOUNT_ID is not set}"
: "${R2_BUCKET:?R2_BUCKET is not set}"
: "${R2_ACCESS_KEY_ID:?R2_ACCESS_KEY_ID is not set}"
: "${R2_SECRET_ACCESS_KEY:?R2_SECRET_ACCESS_KEY is not set}"

name="${BACKUP_NAME:-madiro-prod}-$(date -u +%F).dump"
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

echo "▸ pruning dumps older than ${BACKUP_RETENTION_DAYS:-35} days (monthly ones kept)"
rclone delete "r2:${R2_BUCKET}" --min-age "${BACKUP_RETENTION_DAYS:-35}d" --exclude '*-01.dump'

echo "✓ backup ok: ${name}"
