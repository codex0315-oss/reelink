# Two stages. The build needs @nestjs/cli, typescript and prisma — all devDependencies,
# roughly 400MB — and the running container needs none of them. Splitting keeps the
# shipped image to the compiled dist/, the production dependencies, and Chrome.
#
# The base is pinned to bookworm (Debian 12) on purpose. Debian 13 renamed libasound2
# to libasound2t64, and the apt list below is Remotion's, written against bookworm.

# ---------------------------------------------------------------- stage 1: build
FROM node:22-bookworm-slim AS builder

WORKDIR /app

# Copied before the source so Docker can cache this layer: npm ci re-runs only when the
# lockfile actually changes, not on every code edit.
COPY package.json package-lock.json ./
# --include=dev is required, not optional. Coolify injects every environment
# variable into the build, NODE_ENV=production among them, and npm reads that as
# permission to skip devDependencies -- where @nestjs/cli, typescript and ts-loader
# all live. Without this flag the build gets 452 packages fewer than a local install
# and dies on `nest: not found`, exit 127. render.yaml carries the same note for the
# same reason.
RUN npm ci --include=dev

# The Nest build imports the generated Prisma client, so generate has to come first.
# DATABASE_URL is set to a throwaway value for this one command: prisma.config.ts reads
# it, generate never connects to anything, and leaving it undefined risks the CLI
# rejecting the config before it gets that far.
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" npx prisma generate

COPY . .
RUN npm run build

# ---------------------------------------------------------------- stage 2: run
FROM node:22-bookworm-slim AS runner

# Chrome Headless Shell is a real binary with real shared-library needs. Remotion
# downloads the browser itself, but not these — without them it exits immediately and
# every reel render fails while the rest of the API looks perfectly healthy.
#
# The library list is Remotion's own, from their Docker guide. The rest are not: this
# base image ships with no fonts at all, so without them every caption burned into a
# rendered reel comes out as empty boxes -- and Prisma's schema engine, which runs
# `migrate deploy` on every boot, warns that it cannot detect a libssl version and
# falls back to guessing openssl-1.1.x. Installing openssl removes the guess.
#
# curl is here for the platform, not the app. Coolify runs its healthcheck from
# inside the container -- `curl http://localhost:3000/listings` -- and this image
# carries neither curl nor wget, so the check exits 1 and a container that booted
# perfectly is declared unhealthy and rolled back.
RUN apt-get update && apt-get install -y --no-install-recommends \
      libnss3 \
      libdbus-1-3 \
      libatk1.0-0 \
      libgbm-dev \
      libasound2 \
      libxrandr2 \
      libxkbcommon-dev \
      libxfixes3 \
      libxcomposite1 \
      libxdamage1 \
      libatk-bridge2.0-0 \
      libpango-1.0-0 \
      libcairo2 \
      libcups2 \
      fonts-liberation \
      fonts-noto-color-emoji \
      fontconfig \
      openssl \
      ca-certificates \
      curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production

# Production dependencies only. dist/ needs nothing else, and the Prisma CLI that runs
# the migration on boot is itself a production dependency here rather than a dev one.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# node_modules was just rebuilt from scratch, so the client generated in the builder
# stage is not in this one — it has to be generated again.
COPY prisma ./prisma

# Prisma 7 keeps the database URL in this file, not in schema.prisma. Without it the
# container boots, runs migrate deploy, and dies with "The datasource.url property is
# required in your Prisma config file" on every single deploy.
COPY prisma.config.ts ./

RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" npx prisma generate

# Pulls Chrome Headless Shell down at build time. Doing it here rather than on the
# first render means a cold start does not spend two minutes fetching a browser, and a
# network problem surfaces as a failed build instead of a failed reel.
RUN npx remotion browser ensure

# The compiled server.
COPY --from=builder /app/dist ./dist

# bundle() webpacks these at runtime (reels.service.ts:158), so the templates are
# source the running container needs, not build output. tsconfig.json comes along
# because the bundler looks for one at the project root.
COPY remotion ./remotion
COPY tsconfig.json ./

# Chrome fetches the logo over HTTP while rendering the closing card (main.ts:45).
COPY brand ./brand

# Written to whenever S3 is not configured, and the mount point for the persistent
# volume. The subdirectories have to exist up front: the storage service writes into
# them by name, and express.static 404s on a directory that is not there.
COPY uploads ./uploads
RUN mkdir -p uploads/avatars uploads/chat uploads/clips uploads/listings \
             uploads/music uploads/narration uploads/panoramas uploads/reels

EXPOSE 3000

# migrate deploy applies only the migrations that are missing, so running it on every
# boot is safe with a single instance. Several would race; there is one.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/main"]
