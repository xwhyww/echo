FROM node:22-alpine AS base
RUN apk add --no-cache ffmpeg
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY services/gateway/package.json services/gateway/
COPY services/auth-service/package.json services/auth-service/
COPY services/user-service/package.json services/user-service/
COPY services/pers-chats-service/package.json services/pers-chats-service/
COPY services/friends-service/package.json services/friends-service/
COPY services/ws-gateway/package.json services/ws-gateway/
COPY services/blob-service/package.json services/blob-service/
COPY services/groups-service/package.json services/groups-service/
COPY services/voice-service/package.json services/voice-service/
COPY services/push-service/package.json services/push-service/
RUN pnpm install --frozen-lockfile

# Copy source
FROM deps AS source
COPY tsconfig.base.json ./
COPY packages/ packages/
COPY services/ services/

# Runtime — SERVICE arg selects which service to run
FROM source AS runtime
ARG SERVICE
ENV SERVICE=${SERVICE}
EXPOSE 3000
CMD ["sh", "-c", "pnpm --filter @echo/${SERVICE} run --if-present db:migrate && exec pnpm --filter @echo/${SERVICE} exec tsx src/index.ts"]
