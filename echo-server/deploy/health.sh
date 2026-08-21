#!/bin/sh
# What is actually up, in one line per service.
#
#   ./health.sh          # print a table, exit 1 if anything is not healthy
#   ./health.sh --quiet  # print only failures — what a cron job wants
#
# Reads Docker's own health state rather than re-implementing the checks: every
# app service has a `healthcheck` in docker-compose.prod.yml that polls its
# /health endpoint, so this only has to report what Docker already knows.
#
# For alerting, run it from cron and let the mailer do the work — cron mails you
# whatever a job prints, so --quiet prints nothing on a good night:
#   */5 * * * * cd /root/echo/echo-server/deploy && ./health.sh --quiet
set -eu

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
QUIET=0
[ "${1:-}" = "--quiet" ] && QUIET=1

failed=0

# `ps --format json` gives one JSON object per line. Parsed with sed rather than
# jq so the script works on a box where jq was never installed.
docker compose -f "$COMPOSE_FILE" ps --all --format json | while IFS= read -r line; do
	[ -n "$line" ] || continue
	name=$(printf '%s' "$line" | sed -n 's/.*"Service":"\([^"]*\)".*/\1/p')
	state=$(printf '%s' "$line" | sed -n 's/.*"State":"\([^"]*\)".*/\1/p')
	health=$(printf '%s' "$line" | sed -n 's/.*"Health":"\([^"]*\)".*/\1/p')

	# Containers with no healthcheck report an empty Health — Caddy, LiveKit,
	# NATS and Redis. For those, running is the only signal there is.
	status="${health:-$state}"

	case "$status" in
		healthy|running)
			[ "$QUIET" -eq 1 ] || printf '  ok       %-12s %s\n' "$name" "$status"
			;;
		starting)
			[ "$QUIET" -eq 1 ] || printf '  starting %-12s %s\n' "$name" "$status"
			;;
		*)
			printf '  FAILING  %-12s %s\n' "$name" "$status"
			echo "$name" >> /tmp/echo-health-failed.$$
			;;
	esac
done

# The while loop above runs in a subshell (it is on the right of a pipe), so the
# failure count cannot come back through a variable. The file is the way across.
if [ -f "/tmp/echo-health-failed.$$" ]; then
	count=$(wc -l < "/tmp/echo-health-failed.$$")
	rm -f "/tmp/echo-health-failed.$$"
	echo "$count service(s) not healthy" >&2
	failed=1
fi

exit "$failed"
