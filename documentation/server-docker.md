# Server: Docker Setup & Service Management

## Prerequisites

- Docker & Docker Compose
- pnpm (for local dev mode)

## Architecture Overview

```
Client -> Gateway (:3000) -> Auth (:3001)
                           -> User (:3002)
                           -> Pers-Chats (:3003)
                           -> Friends (:3005)
                           -> Blobs (:3006)
       -> WS-Gateway (:3004) [WebSocket]

Infrastructure: PostgreSQL (:5432), NATS (:4222), Redis (:6379)
```

All commands run from `echo-server/`.

---

## Starting the Server

### Option 1: Full Docker (all services in containers)

```bash
cd echo-server
docker compose up -d
```

This builds and starts everything: PostgreSQL, NATS, Redis, and all 7 application services. Database migrations run automatically on each service startup (handled by the Dockerfile CMD).

Check status:

```bash
docker compose ps
docker compose logs -f          # all logs
docker compose logs -f gateway  # specific service
```

### Option 2: Dev Mode (infra in Docker, services locally)

```bash
cd echo-server
pnpm dev:full
```

This runs:
1. `pnpm infra:up` - starts PostgreSQL, NATS, Redis in Docker
2. `pnpm db:migrate:all` - applies all pending migrations
3. `pnpm dev` - starts all services locally with hot reload

To run steps manually:

```bash
pnpm infra:up          # start infra only
pnpm db:migrate:all    # run migrations
pnpm dev               # start all services
```

To run a single service:

```bash
pnpm dev:gateway       # gateway (:3000)
pnpm dev:auth          # auth-service (:3001)
pnpm dev:user          # user-service (:3002)
pnpm dev:pers-chats    # pers-chats-service (:3003)
pnpm dev:ws            # ws-gateway (:3004)
pnpm dev:blobs         # blob-service (:3006)
```

---

## Stopping the Server

```bash
docker compose down       # stop containers, keep data
docker compose down -v    # stop containers AND delete volumes (full reset)
```

For dev mode, stop the `pnpm dev` process (Ctrl+C), then:

```bash
pnpm infra:down    # stop infra containers
```

---

## Updating Services

### After code changes (dev mode)

Services auto-reload via tsx watch. No action needed.

### After code changes (Docker mode)

Rebuild and restart the changed service:

```bash
docker compose up -d --build gateway       # rebuild one service
docker compose up -d --build               # rebuild all services
```

Only changed layers are rebuilt (Docker cache).

### After schema changes (new migration)

1. Generate the migration from the updated schema:

```bash
pnpm --filter @echo/pers-chats-service db:generate    # specific service
pnpm db:generate:all                                   # all services
```

2. Apply migrations:

**Dev mode:**
```bash
pnpm db:migrate:all
```

**Docker mode** - migrations run automatically on container startup, so just restart:
```bash
docker compose restart pers-chats
```

Or rebuild if code also changed:
```bash
docker compose up -d --build pers-chats
```

### After dependency changes (package.json)

**Dev mode:**
```bash
pnpm install
```

**Docker mode** - must rebuild (dependency layer will re-install):
```bash
docker compose up -d --build
```

---

## Services Reference

| Service | Container | Port | Database | Depends on |
|---------|-----------|------|----------|------------|
| Gateway | gateway | 3000 | - | all services |
| Auth | auth | 3001 | echo_auth | postgres, nats, blobs |
| User | user | 3002 | echo_users | postgres, nats |
| Pers-Chats | pers-chats | 3003 | echo_chats | postgres, redis, nats, blobs |
| WS-Gateway | ws-gateway | 3004 | - | redis, nats, user, friends |
| Friends | friends | 3005 | echo_friends | postgres, nats |
| Blobs | blobs | 3006 | echo_blobs | postgres, nats |

Infrastructure: PostgreSQL 17, NATS 2 (JetStream), Redis 7.

### Persistent Volumes

| Volume | Purpose |
|--------|---------|
| pgdata | PostgreSQL data |
| natsdata | NATS JetStream data |
| auth-uploads | Auth service file uploads |
| pers-chats-uploads | Chat attachments |
| blob-uploads | Blob storage |

---

## Troubleshooting

**Service won't start / DB connection error:**
```bash
docker compose ps                          # check postgres is healthy
docker compose logs postgres               # check init-dbs.sql ran
docker compose restart pers-chats          # restart the failing service
```

**Migration failed:**
```bash
docker compose logs pers-chats | grep -i migrate
```

**Full reset (nuclear option):**
```bash
docker compose down -v    # deletes all data
docker compose up -d      # fresh start
```

**Check NATS monitoring:**
```
http://localhost:8222
```
