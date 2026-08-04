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
