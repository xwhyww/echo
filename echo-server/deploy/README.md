# Deploying Echo

Single-VPS deployment: Docker Compose behind Caddy, which terminates TLS for
three subdomains. No Kubernetes, no registry, no CI required — the server builds
the images itself.

## What you need

- A VPS with Docker and the compose plugin. **4 vCPU / 8 GB** is the realistic
  floor: LiveKit and blob-service's ffmpeg transcoding both want CPU, and nine
  Node processes plus Postgres want the RAM. Selectel and Timeweb Cloud both fit
  for a Russian-jurisdiction deployment.
- A domain with four A records pointing at the server:
  `app.`, `api.`, `ws.`, `live.`
- A Yandex Object Storage bucket and a service account with `storage.editor`.

Firewall (or Selectel/Timeweb security group) must allow:

| Port | Protocol | What for |
|---|---|---|
| 80, 443 | TCP | HTTP + HTTPS (Caddy, ACME challenges) |
| 443 | UDP | HTTP/3 — optional |
| 7881 | TCP | LiveKit media, fallback for UDP-blocked clients |
| 50000-50200 | UDP | LiveKit media |

Nothing else should be open. Postgres, Redis, NATS and the nine services have no
published ports — they are reachable only on the internal compose network.

## Docker daemon settings

Two things belong in `/etc/docker/daemon.json` on the server. Neither can live
in this repo — they configure the daemon, not the stack:

```json
{
  "registry-mirrors": ["https://dockerhub.timeweb.cloud"],
  "ipv6": true,
  "ip6tables": true,
  "fixed-cidr-v6": "fd00:d0c:0::/64"
}
```

**The mirror** — Docker Hub returns `429 Too Many Requests` for anonymous pulls
from most Russian datacenter IP ranges. Substitute your provider's mirror.

Restart the daemon after editing: `systemctl restart docker`.

## Reaching Telegram Gateway

Its IPv4 address is unreachable from Russian hosting; its IPv6 answers in
milliseconds. Containers are IPv4-only, so `sendVerificationMessage` times out
and every sign-in code fails with a bare `fetch failed`.

**Do not fix this by enabling IPv6 on the compose network.** That was tried:
Docker's embedded DNS then returns SERVFAIL for internal service names, and
every service that talks to Postgres crash-loops. The stack goes down entirely.

Instead the host — which has working IPv6 — relays the connection:

```ini
# /etc/systemd/system/telegram-gateway-relay.service
[Unit]
Description=IPv6 relay to gatewayapi.telegram.org for the Echo auth service
After=network-online.target
Wants=network-online.target

[Service]
ExecStart=/usr/bin/socat TCP4-LISTEN:8443,fork,reuseaddr TCP6:gatewayapi.telegram.org:443
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
apt-get install -y socat
systemctl enable --now telegram-gateway-relay
# ufw denies container-to-host traffic by default
ufw allow from 172.16.0.0/12 to any port 8443 proto tcp
```

Then in `.env`:

```
TELEGRAM_GATEWAY_BASE_URL=https://gatewayapi.telegram.org:8443
```

`extra_hosts` in the compose file points that name at the host gateway. The
hostname stays real on purpose — socat only moves bytes, so TLS is still
end-to-end against Telegram's own certificate. Leave
`TELEGRAM_GATEWAY_BASE_URL` unset on a network where Telegram's IPv4 works and
none of this applies.

## First deploy

```bash
git clone <repo> && cd echo/echo-server/deploy
cp .env.prod.example .env
$EDITOR .env          # domains + every secret; the file says how to generate each

docker compose -f docker-compose.prod.yml up -d --build
```

The first build takes a while (nine images off one shared Dockerfile, so the
dependency layers are built once). On boot each service runs its own
`drizzle-kit migrate` before starting — no separate migration step.

Check it came up:

```bash
docker compose -f docker-compose.prod.yml ps
curl https://api.example.com/health          # {"status":"ok"}
docker compose -f docker-compose.prod.yml logs -f caddy   # certificate issuance
```

Certificates land in the `caddy-data` volume. Keep that volume across redeploys
— re-issuing on every boot will hit Let's Encrypt's rate limit.

## The client

A static SvelteKit build, served by the same Caddy from `deploy/client-dist`.
It is uploaded rather than built into an image, so a frontend change ships
without rebuilding anything.

**A push to `main` already does all of this** — see "Deploying from GitHub"
below. What follows is the same thing by hand, for a machine with no GitHub
access or when the workflow is what is broken.

Build it with the endpoints baked in — Vite inlines them, so this is build-time,
not run-time:

```bash
cd echo-client
VITE_API_URL=https://api.example.com \
VITE_WS_URL=wss://ws.example.com/ws \
npm run build

rsync -av --delete build/ root@<server>:/root/echo/echo-server/deploy/client-dist/
```

No restart needed — Caddy reads the directory per request. `--delete` matters:
without it, files from an older build linger and get served for paths the new
build no longer has.

`APP_DOMAIN` must be in `ALLOWED_ORIGINS`, exactly, scheme included. Serving the
client from somewhere else instead (Cloudflare Pages, an S3 bucket) works just
as well — put that origin in `ALLOWED_ORIGINS` and leave `client-dist` empty.

For the Tauri desktop build the same two variables have to be set before
`tauri build`; its origin is `tauri://localhost`, which the gateway allows
unconditionally.

## Deploying from GitHub

A push to `main` deploys. `.github/workflows/deploy.yml` runs the same checks
as every other push, builds the client once with the real endpoints inlined,
rsyncs it into `client-dist`, then SSHes in and does what the section below
describes by hand. A push to `dev` runs the checks and stops — there is no
staging stack.

The manual route still works and is still the fallback: everything the workflow
does, it does with the same commands.

### What the server needs, once

```bash
# A clone at the path the workflow will use, on main, with a GitHub origin.
git clone https://github.com/xwhyww/echo.git /root/echo

# A key for the workflow to log in with. No passphrase — nothing can type one.
ssh-keygen -t ed25519 -C 'github-actions deploy' -f ~/.ssh/echo-deploy -N ''
cat ~/.ssh/echo-deploy.pub >> ~/.ssh/authorized_keys
cat ~/.ssh/echo-deploy            # the private half — goes into DEPLOY_SSH_KEY
ssh-keyscan -H <server-ip>        # goes into DEPLOY_KNOWN_HOSTS
```

Deploying as `root` is what this stack already assumes; a less privileged user
works as well, provided it is in the `docker` group and owns the clone.

### Secrets

```bash
gh secret set DEPLOY_HOST        # 203.0.113.10
gh secret set DEPLOY_USER        # root
gh secret set DEPLOY_SSH_KEY     < ~/.ssh/echo-deploy
gh secret set DEPLOY_KNOWN_HOSTS # output of ssh-keyscan -H <server-ip>
```

`DEPLOY_KNOWN_HOSTS` is optional and worth setting. Without it each run accepts
whatever host key answers on the address, because every run starts on a machine
that has never seen the server before — trust on first use, thirty times a
month. With it, the key is checked against a value you put there.

### Variables

Not secrets, and deliberately: the two `VITE_` values are inlined into the
JavaScript every visitor downloads, and the domains are in DNS. Hiding them
would only make the workflow harder to read.

```bash
gh variable set VITE_API_URL  # https://api.example.com
gh variable set VITE_WS_URL   # wss://ws.example.com/ws
gh variable set APP_DOMAIN    # app.example.com — the deploy's link in the UI
gh variable set API_DOMAIN    # api.example.com — where the health check looks
```

Three more have working defaults and only need setting if yours differ:
`DEPLOY_PATH` (`/root/echo`), `DEPLOY_PORT` (`22`), and
`DEPLOY_COMPOSE_FILES` (`-f docker-compose.prod.yml` — add
`-f docker-compose.logging.yml` here if you run the Loki overlay, or it will be
torn down on the next deploy).

### What a deploy does, in order

1. Server tests and client tests, typecheck, `svelte-check`, and a build. A
   failure here stops everything; the server is not touched.
2. Builds the client with the real endpoints and checks the output is not empty
   — otherwise `rsync --delete` would wipe the live client and serve 404s from
   a directory that looks fine.
3. Uploads it. Caddy reads the directory per request, so the new client is live
   from this moment; the API it talks to is still the old one for a minute.
4. `git fetch` and `git reset --hard <sha>` — not `git pull`, because the
   answer to "someone edited a file on the server" is that this commit is the
   truth, not a merge conflict at 3am. Untracked files are left alone, so
   `.env`, the APNs key and the FCM credentials stay where they are.
5. `docker compose up -d --build`, then `docker image prune -f`. Migrations run
   on container boot as always, so there is no separate step and no window where
   the code is new and the schema is not.
6. Polls `https://$API_DOMAIN/health` for up to five minutes. `docker compose up`
   returns long before a Node service has migrated and started listening, so
   without this a broken deploy would finish green. If it never answers, the run
   fails and prints `docker compose ps` and the last fifty log lines.

There is no automatic rollback. Reverting the commit and letting the workflow
run again is the rollback, and it takes the same few minutes as the deploy did.

### Deploying without a push

`gh workflow run Deploy --ref main`, or the **Run workflow** button on the
Actions tab. Useful after fixing a secret, or to put the current `main` back
after something was changed on the server by hand.

Two deploys never overlap: the workflow holds a concurrency group and the second
one waits. Cancelling one half way is the single state nothing here knows how to
recover from — some containers on the new image, some on the old — so a run in
flight is never cancelled either.

## Updating

```bash
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

Compose recreates only the containers whose image or config changed. Migrations
run again on start and are no-ops when there is nothing new.

### When an update adds a service with its own database

`scripts/init-dbs.sql` runs **only when the Postgres volume is empty**, i.e. on
the very first deploy. A service added later therefore finds no database and
crash-loops on `drizzle-kit migrate` with `database "echo_x" does not exist`.
Create it by hand *before* bringing the stack up:

```bash
docker compose -f docker-compose.prod.yml exec postgres \
  psql -U echo -d postgres -c 'CREATE DATABASE echo_push'
```

This applies to **push-service** (`echo_push`), added after the first
deployment. It is safe to run against a database that already exists — the
command simply errors and changes nothing.

## Logs

Everything is JSON on stdout, one object per line, with `name` (service),
`requestId`, `userId`, and `durationMs` on request lines. A request keeps one
`requestId` from the gateway through every service it touches, so:

```bash
# One service
docker compose -f docker-compose.prod.yml logs -f auth | jq .

# One request across all of them
docker compose -f docker-compose.prod.yml logs --no-log-prefix \
  | jq -c 'select(.requestId == "0b7f...")'

# Everything that failed in the last hour
docker compose -f docker-compose.prod.yml logs --since 1h --no-log-prefix \
  | jq -c 'select(.level >= 50)'
```

`LOG_LEVEL=debug` in `.env` plus a restart of the one service turns on the
per-query and per-event lines.

### Keeping more than 3×50 MB

That is what the json-file driver holds per container, and it is also the
retention: once a service has written 150 MB, its oldest lines are gone. A
busy day of `LOG_LEVEL=debug` on the gateway can cover less than a day.

`docker-compose.logging.yml` adds Loki and Promtail for history that outlives
that:

```bash
docker compose -f docker-compose.prod.yml -f docker-compose.logging.yml up -d
```

Nothing else changes. Promtail reads the same json-file logs through the Docker
API, so every recipe above keeps working and a Loki outage cannot lose a line
that json-file still holds — which is why this is not the Loki *logging driver*,
which replaces json-file and drops or blocks when it cannot reach Loki.

Loki is published on **loopback only** (`auth_enabled: false` means anyone who
can reach port 3100 can read every log line in the system). Query it over an SSH
tunnel:

```bash
ssh -L 3100:127.0.0.1:3100 root@<server>

# with logcli (https://grafana.com/docs/loki/latest/query/logcli/)
logcli --addr=http://127.0.0.1:3100 query '{service="auth"}'
logcli --addr=http://127.0.0.1:3100 query '{stack="echo"} |= "0b7f..."'

# or plain curl — level="50" is pino's error, 40 warn, 30 info
curl -sG http://127.0.0.1:3100/loki/api/v1/query_range \
  --data-urlencode 'query={stack="echo",level="50"}' \
  --data-urlencode 'since=1h' | jq .
```

Lines are labelled `service` (the compose service name, the same word the
recipes above use), `container`, `stack` and `level`. `requestId` is
deliberately *not* a label — one label value per request is how a Loki index is
destroyed — so trace a request by grepping the line body (`|= "0b7f..."`), the
same as with `docker compose logs`.

Retention is `LOKI_RETENTION_PERIOD` in `.env`, 30 days by default, enforced by
Loki's compactor. The `lokidata` volume is the only thing this overlay adds to
the disk footprint, and `backup.sh` deliberately does not touch it: logs are
not irreplaceable.

Promtail gets the Docker socket read-only. That is a real grant — a process
that can read it can enumerate and inspect every container on the host — and
it is the price of labelling lines by service name: the log files themselves
are named by container id and carry nothing else.

There is no Grafana here. If you want dashboards, put one behind Caddy with its
own auth; it is a second thing to keep patched, which is not obviously worth it
for a stack this size.

## A second SFU node

**Not deployed, and probably not yet worth deploying.** The files are here so
the decision is a decision and not a week of work: `docker-compose.multiregion.yml`
turns the current LiveKit into the first member of a cluster, and
`docker-compose.sfu-node.yml` plus `Caddyfile.sfu-node` are the whole stack for
the second machine.

Read PLAN.md A.3 first. A second node cures **distance** and nothing else. If
the voice quality indicator says TCP rather than UDP, the problem is a firewall
rule and a second VPS would change nothing while costing every month.

### What was actually checked

Two `livekit/livekit-server:1.11.0` containers were run against one Redis with
these configs. Both registered — `redis-cli hlen nodes` returned 2 — and each
reported its own region on startup. The merged production config
(`docker compose -f docker-compose.prod.yml -f docker-compose.multiregion.yml`)
was then fed to a container verbatim and started cleanly, with
`"region":"moscow"` and the right ICE range in its log.

What has *not* been tried: a second machine, the network between the two, and a
real call crossing regions.

### How the routing works

Nodes find each other through Redis alone: set `redis:` and LiveKit swaps
"single-node routing" for the distributed router and publishes itself into the
`nodes` hash. But joining a cluster lowers nobody's latency by itself — rooms
are pinned to a node when they are created, so a Novosibirsk caller in a
Moscow-hosted room still sends every packet to Moscow.

`node_selector.kind: regionaware` is the part that matters: the node handling
the create request picks one in the region nearest the client instead of the
least loaded anywhere. Which is why each node needs its own `region:`, and why
the `regions` list has to be **identical on every node** — a region only one
node knows about is one the others cannot route to.

### The awkward part

Redis is currently reachable only on the internal docker network, and the second
node needs the same Redis. Do not just publish the port; an open Redis is a
remote shell waiting to happen. In order of preference:

1. A private network between the two VPSs (Timeweb offers one), Redis bound to
   that interface only.
2. WireGuard between the hosts — same idea, without depending on the provider.
3. `requirepass` + TLS + a firewall allowlist. Workable, and the one with the
   most ways to be quietly wrong.

The second node also needs its own DNS record and its own certificate: a client
connects to a node directly, so it cannot share `LIVE_DOMAIN`. And its media
ports (50000-50200/udp, 7881/tcp) need opening in that host's firewall *and* in
the provider's security group, which is a separate list.

## Backups

Two things are irreplaceable:

- **Postgres** — `./backup.sh` writes a gzipped `pg_dumpall` into `./backups`
  and rotates anything older than `KEEP_DAYS` (14 by default). Install it as a
  cron job:

  ```
  0 3 * * * cd /root/echo/echo-server/deploy && ./backup.sh >> /var/log/echo-backup.log 2>&1
  ```

  It deliberately stops at writing the file. **A backup that lives on the
  machine it is backing up is not a backup** — it survives a dropped table and
  nothing else. Add a copy step to somewhere else: another host over rsync, an
  object store, a provider snapshot.

- **`MESSAGE_ENCRYPTION_KEY`** — without it every stored message is
  unreadable, dump or no dump. It is not in the database on purpose, and the
  backup script does not touch it. Since it now covers personal chats, groups
  *and* voice-channel chats, losing it loses every conversation in the system.
  Keep it in two places that are neither this server nor this repository.

Blobs live in Yandex Object Storage; enable versioning on the bucket there
rather than backing them up by hand.

## Is it up?

Every app service has a Docker healthcheck that polls its own `/health`.
`restart: unless-stopped` alone only notices a process that *exited*; a Node
service that is alive but no longer answering would otherwise sit there as "up"
forever, taking its share of the traffic with it.

```bash
./health.sh            # one line per container
./health.sh --quiet    # only failures — what cron wants
docker compose -f docker-compose.prod.yml ps   # the same state, Docker's own view
```

Note what a healthcheck does and does not do: Docker marks the container
unhealthy, it does not restart it. Something has to watch — cron plus the line
below is the cheapest version, and its silence is the signal:

```
*/5 * * * * cd /root/echo/echo-server/deploy && ./health.sh --quiet
```

Logs are capped at 3×50MB per container so they cannot fill the disk and take
Postgres down. That cap is also the retention: anything older is gone. Shipping
them somewhere (Loki + Promtail, or the provider's own log service) is the next
step if you want to be able to look back further than a few days.

## Things that will bite you

- **Voice needs the UDP range open.** Everything else works over 443, so a
  half-configured firewall looks fine until someone joins a call and hears
  silence. `use_external_ip: true` handles the public-IP discovery, but no
  amount of config substitutes for the open ports.
- **`SMS_DRIVER=log` writes sign-in codes to the log.** It is the default so a
  fresh deploy works before you have a provider account; it is not something to
  leave on once anyone but you can reach the server.
- **`ALLOWED_ORIGINS` is exact-match.** `https://app.example.com` does not cover
  `https://www.app.example.com`. A missing entry shows up as CORS errors in the
  browser console, not as anything in the server log.
- **`docker compose down -v` deletes the volumes**, database and certificates
  included. Use `down` alone.
