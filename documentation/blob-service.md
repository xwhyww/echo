# Blob Service

## Purpose

Centralized file storage service for the entire Echo platform. Owns binary file storage, server-side compression, content-addressable deduplication (SHA-256), and reference-counted lifecycle management. Other services (pers-chats, auth, future ones) call it over HTTP instead of managing files locally. The same file uploaded as an avatar and sent in a chat = one blob on disk.

## Tech Stack

- **Runtime:** Node.js (TypeScript via tsx)
- **Framework:** Hono 4.12.9
- **Database:** PostgreSQL (Drizzle ORM 0.45.2)
- **Auth:** JWT via shared authMiddleware
- **Image compression:** sharp (WebP, max 1920px)
- **Video compression:** ffmpeg via fluent-ffmpeg (H.264 MP4, max 720p)
- **Port:** 3006

## Database Schema

### `file_blobs`
Content-addressed storage. One row per unique file on disk.

| Column | Type | Notes |
|--------|------|-------|
| hash | TEXT | PK, SHA-256 hex of stored bytes |
| stored_name | TEXT | `<hash>.<ext>` filename on disk |
| mime_type | TEXT | |
| size | INTEGER | bytes |
| ref_count | INTEGER | default 1, incremented on reuse, decremented on delete |
| created_at | TIMESTAMP | |

### `raw_blob_map`
Maps client-computed hash (of raw bytes before server compression) to the stored blob hash. Enables the client to skip upload entirely on a cache hit.

| Column | Type | Notes |
|--------|------|-------|
| raw_hash | TEXT | PK, SHA-256 of raw client bytes |
| file_hash | TEXT | FK -> file_blobs(hash), CASCADE |
| created_at | TIMESTAMP | |

## File Storage

Files stored under `uploads/blobs/<hash>.<ext>`. The hash is the SHA-256 of the final (post-compression) bytes. Two uploads of identical content produce the same hash and share one file on disk.

## HTTP API

All routes prefixed with `/blobs`. All require Bearer token.

### Upload & Dedup

| Method | Path | Description |
|--------|------|-------------|
| POST | `/blobs/upload` | Upload files. Multipart `files[]`. Optionally pass `rawHashes` (JSON array of client-computed hashes, parallel to files). Server compresses images/videos, hashes result, deduplicates. Returns `{blobs: [{id, url, filename, mimeType, size, hash}]}`. |
| POST | `/blobs/check` | Pre-upload dedup check. Body: `{files: [{rawHash, filename}]}`. For each hit: bumps refcount atomically and returns existing blob. For each miss: returns null. Response: `{results: [Attachment | null]}`. |

### Reference Counting

| Method | Path | Description |
|--------|------|-------------|
| POST | `/blobs/ref` | Bump refcount. Body: `{hashes: string[]}`. Used when forwarding messages (copies reference the same blobs). Returns `{ok: true}`. |
| POST | `/blobs/unref` | Decrement refcount. Body: `{hashes: string[]}`. When `ref_count <= 0`, deletes the row and unlinks the file from disk. Returns `{ok: true}`. |

### File Serving

| Method | Path | Description |
|--------|------|-------------|
| GET | `/blobs/files/:storedName` | Serves the stored file. No auth — hash is unguessable. Served via `serveStatic` middleware. |

### Health

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Returns `{status: 'ok'}`. |

## Compression Pipeline

### Images
- GIFs returned as-is (preserves animation)
- Other images: resized to max 1920px (longest side), converted to WebP at quality 80
- If compressed result is larger than original, original is kept
- Extensions: `.webp`, `.gif`, `.jpg`, `.png`

### Videos
- Re-encoded to H.264 MP4 via ffmpeg
- Capped at 720p height
- CRF 28, fast preset, faststart flag for streaming
- Temp input file cleaned up after compression

### Other Files
- Stored as-is (PDF, ZIP, audio, documents, etc.)

## Dedup Flow (end-to-end)

1. **Client** compresses images client-side (Canvas -> WebP), computes SHA-256 of each file
2. **Client** calls `POST /blobs/check` with raw hashes
3. **Blob-service** looks up `raw_blob_map` -> `file_blobs`. Hits return existing attachment and bump `ref_count`
4. **Client** uploads only misses via `POST /blobs/upload`
5. **Blob-service** compresses uploads server-side, hashes result, `INSERT ... ON CONFLICT DO UPDATE SET ref_count = ref_count + 1`, writes file only on miss
6. **Blob-service** inserts `raw_blob_map` entry linking client hash -> stored hash
7. **Forwarding** (pers-chats calls `POST /blobs/ref`) bumps `ref_count` for each attachment hash
8. **Deletion** (pers-chats calls `POST /blobs/unref`) decrements `ref_count`. At zero: row deleted, file unlinked

## How Other Services Use It

### pers-chats-service
- `POST /personal-chats/upload` proxies to `POST /blobs/upload`
- `POST /personal-chats/upload/check` proxies to `POST /blobs/check`
- Forward messages -> `POST /blobs/ref` with attachment hashes
- Delete messages -> `POST /blobs/unref` with attachment hashes
- No longer stores files locally or manages `file_blobs`/`raw_blob_map` tables

### auth-service (planned)
- Avatar upload -> `POST /blobs/upload`
- Avatar delete -> `POST /blobs/unref`
- Pre-upload dedup -> `POST /blobs/check`

### Gateway
- Routes `/blobs/*` to blob-service (port 3006)
- File URLs in attachments are `/blobs/files/<hash>.<ext>`, resolved through the gateway

## Race Condition Handling

- `INSERT ... ON CONFLICT DO UPDATE SET ref_count = ref_count + 1` handles concurrent uploads of the same file
- `raw_blob_map` uses `ON CONFLICT DO NOTHING` for idempotent client hash registration
- If a stale `raw_blob_map` entry points to a deleted blob, it's cleaned up on the next `/blobs/check` call

## Allowed File Types

`image/jpeg`, `image/png`, `image/webp`, `image/gif`, `image/avif`, `application/pdf`, `video/mp4`, `video/webm`, `video/quicktime`, `audio/mpeg`, `audio/ogg`, `audio/wav`, `audio/webm`, `application/zip`, `application/x-rar-compressed`, `text/plain`, `application/msword`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `application/vnd.ms-excel`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`

**Limits:** 100MB per file, 10 files per upload.

## Docker

```yaml
blobs:
  build:
    context: .
    args:
      SERVICE: blob-service
  ports:
    - "3006:3006"
  volumes:
    - blob-uploads:/app/uploads
  environment:
    PORT: 3006
    DATABASE_URL: postgresql://echo:echo_dev@postgres:5432/echo_blobs
    JWT_SECRET: dev-secret-change-in-production
  depends_on:
    postgres:
      condition: service_healthy
```

## Events

None published, none consumed. Blob-service is a pure HTTP storage service with no NATS dependency.
