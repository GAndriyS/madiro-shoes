# Off-platform backup of the production database. Runs as a Railway cron
# service inside the `production` environment: it reaches Postgres over the
# private network (nothing is exposed publicly), writes a custom-format
# pg_dump, verifies it, and ships it to a Cloudflare R2 bucket outside Railway.
#
# Based on the official postgres image so pg_dump matches the server major —
# a client older than the server refuses to dump it. Railway runs
# postgres-ssl:18; bump this tag together with that one.
#
# On Railway: RAILWAY_DOCKERFILE_PATH=ops/backup/Dockerfile, a cron schedule
# in Settings → Deploy, and the variables listed in backup.sh. The container
# exits when the dump is uploaded — that is what a cron service expects.
FROM postgres:18-alpine
RUN apk add --no-cache rclone ca-certificates tzdata
COPY ops/backup/backup.sh /usr/local/bin/backup
RUN chmod +x /usr/local/bin/backup
# The postgres image's entrypoint would start a server; this image only dumps.
ENTRYPOINT []
CMD ["backup"]
