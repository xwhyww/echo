#!/bin/sh
# Nightly Postgres backup for the Echo stack.
#
#   ./backup.sh                 # write a dump into ./backups
#   BACKUP_DIR=/mnt/x ./backup.sh
#
# Install as a cron job on the server:
#   0 3 * * * cd /root/echo/echo-server/deploy && ./backup.sh >> /var/log/echo-backup.log 2>&1
#
# What it does NOT do, deliberately: copy the dump off the server. A backup that
# lives on the machine it is backing up is not a backup — it survives a dropped
# table and nothing else. Pick a destination (another host over rsync, an object
# store with `aws s3 cp`, a provider snapshot) and add that step below; the
# script leaves a plain gzip file to make that a one-liner.
#
# It also does not back up MESSAGE_ENCRYPTION_KEY. That is not in the database
# on purpose, and without it every dump here is unreadable ciphertext. Keep it
# in two places that are neither this server nor this repository.
set -eu

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
# How many daily dumps to keep. Old ones are removed after a new one succeeds,
# never before — a failed run must not leave you with fewer backups than you
# started with.
KEEP_DAYS="${KEEP_DAYS:-14}"
POSTGRES_USER="${POSTGRES_USER:-echo}"

mkdir -p "$BACKUP_DIR"

stamp=$(date +%F_%H%M)
target="$BACKUP_DIR/echo-$stamp.sql.gz"
tmp="$target.partial"

echo "[backup] dumping to $target"

# pg_dumpall rather than pg_dump: the stack has eight databases and roles, and a
# per-database loop would silently miss any service added later.
#
# Written to a .partial and renamed only on success, so an interrupted run
# cannot leave a truncated file that looks like a valid backup.
if ! docker compose -f "$COMPOSE_FILE" exec -T postgres \
	pg_dumpall -U "$POSTGRES_USER" | gzip > "$tmp"; then
	echo "[backup] FAILED — leaving previous backups untouched" >&2
	rm -f "$tmp"
	exit 1
fi

# An empty or near-empty dump means pg_dumpall wrote nothing useful; treat it as
# a failure rather than rotating good backups out in favour of it.
size=$(wc -c < "$tmp")
if [ "$size" -lt 1024 ]; then
	echo "[backup] FAILED — dump is only ${size} bytes" >&2
	rm -f "$tmp"
	exit 1
fi

mv "$tmp" "$target"
echo "[backup] wrote $target ($size bytes)"

# Rotation happens last, and only after a good dump landed.
find "$BACKUP_DIR" -name 'echo-*.sql.gz' -type f -mtime "+$KEEP_DAYS" -print -delete

echo "[backup] done"
