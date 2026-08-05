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

Build it **on your machine** with the endpoints baked in — Vite inlines them, so
this is build-time, not run-time:

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
per-query and per-event lines. Retention is 3×50 MB per container (json-file
rotation); for anything longer, add Loki + Promtail to this compose file and
point Promtail at the Docker socket.

## Backups

Two things are irreplaceable:

- **Postgres** — `docker compose -f docker-compose.prod.yml exec postgres
  pg_dumpall -U echo | gzip > echo-$(date +%F).sql.gz`, off the server.
- **`MESSAGE_ENCRYPTION_KEY`** — without it every stored message is
  unreadable, dump or no dump. It is not in the database on purpose.

Blobs live in Yandex Object Storage; enable versioning on the bucket there
rather than backing them up by hand.

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
