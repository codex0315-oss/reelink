# Reelink

List. Create. Reel. Connect.

An AI-powered property marketing platform for Philippine real estate agents. An agent
lists a property once; Reelink writes the description, renders a vertical video reel from
the photos, and gives buyers a way to reach them.

## What's in here

```
client/    React 19 + Vite + Tailwind v4    the agent and buyer app
server/    NestJS 11 + Prisma 7 + Postgres  the API, and the reel renderer
```

Two packages, one repository. They are deployed separately — see *Deploying* below.

## Running it locally

You need **Node 20+** and a **PostgreSQL** database.

```bash
# 1. Server
cd server
npm install
cp .env.example .env          # then fill in DATABASE_URL, JWT_SECRET, GROQ_API_KEY
npx prisma migrate dev        # creates the schema
npm run start:dev             # http://localhost:3000

# 2. Client, in a second terminal
cd client
npm install
npm run dev                   # http://localhost:5173
```

The client defaults to `http://localhost:3000` for the API. To point it elsewhere, set
`VITE_API_URL` — see `client/.env.example`. Vite inlines it at **build** time, not run
time, so it must be present when the bundle is built.

### Making yourself an admin

There is no signup path to the admin area and no API that can grant it — the only way in
is the shell:

```bash
cd server
node scripts/make-admin.cjs you@example.com
```

Sign out and back in, then open `/admin`.

## What works today

Accounts with refresh-token sessions · property listings with photos, 360 panoramas and a
map · AI descriptions and reel scripts · local video rendering with four templates,
captions and optional music · a public reels feed · buyer-to-agent messaging with
presence, typing and read receipts · the Amicus AI assistant · listing view analytics ·
an admin area for verification, users and platform metrics.

Not built yet: Facebook publishing, the Leads module, email verification.

## Things worth knowing before you change something

**Reel rendering is CPU-bound and local.** Remotion drives a headless Chrome and takes
around 55 seconds per reel. Renders are queued and run one at a time because two would
collide on the same port and exhaust memory.

**Editing a reel template needs no restart, but it used to.** The Remotion bundle is
cached for the life of the process and `remotion/` is excluded from tsconfig, so
`nest start --watch` ignores it. A dev-only watcher now drops the cache when a template
changes.

**Uploads go to the local disk.** `server/uploads/` holds listing photos, panoramas,
avatars, rendered reels and narration. This is the main thing standing between the app
and a real deployment — see below.

**AI clips cost money.** Higgsfield bills roughly $0.41 per generated opening shot, so it
is opt-in and capped at 2 per account per day. Every other AI feature runs on Groq's free
tier.

## Deploying

**The client deploys to Vercel** as a static Vite build. Set `VITE_API_URL` to the
deployed API and it works unchanged.

**The server does not.** It needs a long-lived process, and Vercel runs serverless
functions:

| The server needs | Serverless can't |
|---|---|
| ~55s renders with headless Chrome + ffmpeg | 60s function ceiling, no Chrome binary |
| Two Socket.IO gateways for messaging and presence | No persistent connections |
| A writable disk for uploads | Ephemeral filesystem |
| An in-process render queue and warm browser | No state between invocations |

Use a platform that runs a container — **Render**, **Railway** or **Fly.io**. Alongside it
you will need **hosted Postgres** (Neon or Supabase) and, before this is a real
deployment, **object storage** for uploads (Cloudflare R2 or Supabase Storage). Even on a
container host the disk is wiped on redeploy, so uploads must move off local disk.

## Environment

Both packages ship a `.env.example` listing every variable with a comment explaining what
it does and what breaks without it. `.env` itself is gitignored — it carries the JWT
signing secret and the Groq, Brevo and Higgsfield keys, and a key committed once stays in
the history forever.
