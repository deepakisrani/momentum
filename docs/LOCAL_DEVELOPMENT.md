# Local development

Momentum runs a full local Supabase stack rather than SQLite or mocked data. That keeps Postgres
migrations, Row Level Security, Auth, and the Data API aligned with production.

## One-time setup

1. Install [Docker Desktop for Windows](https://www.docker.com/products/docker-desktop/) and
   start it. The Supabase CLI uses Docker on Windows.
2. Install [Node.js 24 or later](https://nodejs.org/) (`.nvmrc` pins the project to Node 24).
   Its standard installer includes `npm`. Close and reopen PowerShell, then confirm both
   `node --version` and `npm --version` work before continuing.
3. Install project dependencies with `npm ci`.

The Supabase CLI is pinned in `devDependencies`; do not install it globally.

## Daily workflow

Run `npm run dev:local`. It starts the local Supabase stack, writes ignored local Vite
configuration to `.env.development.local`, and starts Vite.

Open the Vite URL (normally `http://127.0.0.1:5173`). The local login screen uses email and
password instead of production Google OAuth. Create an account with `dev@momentum.local` and a
password of at least six characters. The local seed has allowlisted that address, so the same
invite trigger and profile-creation behavior are exercised as in production.

Useful commands:

- `npm run supabase:status` — local URLs, service status, and keys.
- `npm run supabase:reset` — recreate the database from every migration, then apply
  `supabase/seed.sql`. This removes local users and data.
- `npm run supabase:stop` — stop the local stack when you are done.

Local data never reaches the hosted Supabase project. Do not use `supabase db push` as part of
normal local iteration; migrations are applied by `supabase db reset`.
