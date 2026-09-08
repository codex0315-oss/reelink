# Two stages. Node builds the bundle; nginx serves it. Nothing from the Node stage
# ships — the running image is nginx plus a folder of static files.

# ---------------------------------------------------------------- stage 1: build
FROM node:22-bookworm-slim AS builder

WORKDIR /app

# Before the source, so npm ci re-runs only when the lockfile changes.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Vite reads VITE_* at BUILD time and writes the value straight into the bundle. It is
# never read at runtime, so this cannot be an ordinary environment variable in Coolify
# — it has to be a build argument, which makes staging and production two separate
# builds of the same source. Getting it wrong is silent: the app builds, loads, looks
# fine, and every API call goes to localhost:3000.
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

# `tsc -b && vite build` — a type error fails the deploy rather than shipping.
RUN npm run build

# ---------------------------------------------------------------- stage 2: serve
FROM nginx:1.27-alpine AS runner

# Replaces nginx's default site. The load-bearing part is the SPA fallback: React
# Router owns /listings/123, and nginx would otherwise look for a file at that path
# and return its own 404 on a hard refresh.
COPY nginx.conf /etc/nginx/conf.d/default.conf

COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

# The nginx image already sets this; stating it keeps the intent visible.
CMD ["nginx", "-g", "daemon off;"]
