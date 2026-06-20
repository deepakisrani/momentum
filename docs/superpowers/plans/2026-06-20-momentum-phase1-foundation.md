# Momentum Phase 1 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Momentum PWA project with i18n infrastructure, the full Postgres schema (RLS + invite gate), and invite-only Google authentication — a deployable app an invited user can log into.

**Architecture:** Vite + React + TS + Tailwind single-page PWA. Supabase provides Postgres, Google OAuth, and Row-Level Security. UI copy comes from a JSON dictionary via a typed `t()` helper. All schema lives in versioned SQL migrations. This plan deliberately contains **no business logic** (that's Plan 2) — only the shell, data layer, and auth.

**Tech Stack:** Vite, React 18, TypeScript, Tailwind CSS, React Router, `vite-plugin-pwa`, `@supabase/supabase-js`, Vitest + Testing Library, Supabase CLI.

---

## File Structure

```
momentum/
  .env.local                      # Supabase URL + anon key (gitignored)
  .env.example                    # template
  index.html
  vite.config.ts                  # Vite + PWA plugin config
  tailwind.config.js
  postcss.config.js
  package.json
  src/
    main.tsx                      # app entry, router
    App.tsx                       # route tree + auth guard
    index.css                     # tailwind directives
    lib/
      supabase.ts                 # Supabase client singleton (ONLY place it's constructed)
    i18n/
      strings/en.json             # the string dictionary
      I18nProvider.tsx            # provider + useT() hook
    auth/
      AuthProvider.tsx            # session context
      useAuth.ts                  # hook to read session
      LoginPage.tsx               # Google sign-in screen
      AuthCallback.tsx            # OAuth redirect handler
      RequireAuth.tsx             # route guard
    pages/
      HomePage.tsx                # placeholder authed landing
  supabase/
    migrations/
      0001_initial_schema.sql     # all tables
      0002_rls_policies.sql       # RLS
      0003_invite_gate.sql        # allowed_emails + auth trigger
      0004_seed_exercises.sql     # predefined exercise library
  src/i18n/I18nProvider.test.tsx
  src/auth/RequireAuth.test.tsx
```

---

## Task 1: Scaffold the Vite + React + TS project

**Files:**
- Create: `momentum/package.json`, `momentum/index.html`, `momentum/vite.config.ts`, `momentum/tsconfig.json`, `momentum/src/main.tsx`, `momentum/src/App.tsx`

- [ ] **Step 1: Scaffold with Vite**

Run from repo root:
```bash
npm create vite@latest momentum -- --template react-ts
cd momentum && npm install
```
Expected: `momentum/` created with React + TS template; `npm install` completes.

- [ ] **Step 2: Install runtime + dev dependencies**

Run in `momentum/`:
```bash
npm install react-router-dom @supabase/supabase-js
npm install -D tailwindcss postcss autoprefixer vite-plugin-pwa vitest @testing-library/react @testing-library/jest-dom jsdom
```
Expected: all packages install without peer-dependency errors.

- [ ] **Step 3: Verify the dev server boots**

Run: `npm run dev`
Expected: Vite prints a local URL and serves the default template. Stop it with Ctrl-C.

- [ ] **Step 4: Commit**

```bash
git add momentum/
git commit -m "feat(momentum): scaffold vite react-ts project"
```

---

## Task 2: Configure Tailwind

**Files:**
- Create: `momentum/tailwind.config.js`, `momentum/postcss.config.js`
- Modify: `momentum/src/index.css`

- [ ] **Step 1: Create `tailwind.config.js`**

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: [],
}
```

- [ ] **Step 2: Create `postcss.config.js`**

```js
export default {
  plugins: { tailwindcss: {}, autoprefixer: {} },
}
```

- [ ] **Step 3: Replace `src/index.css` with Tailwind directives**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 4: Verify Tailwind compiles**

Edit `src/App.tsx` to render `<div className="text-3xl font-bold underline">Momentum</div>`, run `npm run dev`, confirm the styling applies, then stop the server.

- [ ] **Step 5: Commit**

```bash
git add momentum/tailwind.config.js momentum/postcss.config.js momentum/src/index.css momentum/src/App.tsx
git commit -m "feat(momentum): add tailwind"
```

---

## Task 3: Configure Vitest

**Files:**
- Modify: `momentum/vite.config.ts`
- Create: `momentum/src/test/setup.ts`
- Modify: `momentum/package.json` (scripts)

- [ ] **Step 1: Create test setup file `src/test/setup.ts`**

```ts
import '@testing-library/jest-dom'
```

- [ ] **Step 2: Configure Vitest in `vite.config.ts`**

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
})
```

- [ ] **Step 3: Add a `test` script to `package.json`**

Add to `"scripts"`: `"test": "vitest run"`, `"test:watch": "vitest"`.

- [ ] **Step 4: Add a smoke test `src/test/smoke.test.ts`**

```ts
import { describe, it, expect } from 'vitest'

describe('smoke', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 5: Run it**

Run: `npm test`
Expected: 1 passing test.

- [ ] **Step 6: Commit**

```bash
git add momentum/vite.config.ts momentum/src/test momentum/package.json
git commit -m "test(momentum): configure vitest"
```

---

## Task 4: i18n dictionary + provider (TDD)

**Files:**
- Create: `momentum/src/i18n/strings/en.json`, `momentum/src/i18n/I18nProvider.tsx`
- Test: `momentum/src/i18n/I18nProvider.test.tsx`

- [ ] **Step 1: Create the seed dictionary `src/i18n/strings/en.json`**

```json
{
  "app.name": "Momentum",
  "auth.signInWithGoogle": "Continue with Google",
  "auth.notInvited": "This app is invite-only. Ask the owner for access.",
  "auth.signOut": "Sign out",
  "home.welcome": "Welcome to Momentum"
}
```

- [ ] **Step 2: Write the failing test `src/i18n/I18nProvider.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { I18nProvider, useT } from './I18nProvider'

function Probe() {
  const t = useT()
  return <span>{t('app.name')} / {t('missing.key')}</span>
}

describe('I18nProvider', () => {
  it('resolves keys and falls back to the key itself', () => {
    render(<I18nProvider><Probe /></I18nProvider>)
    expect(screen.getByText('Momentum / missing.key')).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npm test -- I18nProvider`
Expected: FAIL — cannot find module `./I18nProvider`.

- [ ] **Step 4: Implement `src/i18n/I18nProvider.tsx`**

```tsx
import { createContext, useContext, type ReactNode } from 'react'
import en from './strings/en.json'

type Dict = Record<string, string>
const I18nContext = createContext<Dict>(en as Dict)

export function I18nProvider({ children }: { children: ReactNode }) {
  return <I18nContext.Provider value={en as Dict}>{children}</I18nContext.Provider>
}

export function useT() {
  const dict = useContext(I18nContext)
  return (key: string): string => dict[key] ?? key
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `npm test -- I18nProvider`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add momentum/src/i18n
git commit -m "feat(momentum): add i18n json dictionary and provider"
```

---

## Task 5: PWA configuration

**Files:**
- Modify: `momentum/vite.config.ts`
- Create: `momentum/public/icon-192.png`, `momentum/public/icon-512.png` (placeholder icons)

- [ ] **Step 1: Add placeholder icons**

Create two square PNGs (192×192 and 512×512) in `momentum/public/`. Any solid-color placeholder is fine for now (real icons are a later polish item).

- [ ] **Step 2: Add the PWA plugin to `vite.config.ts`**

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Momentum',
        short_name: 'Momentum',
        theme_color: '#4f46e5',
        background_color: '#0f1115',
        display: 'standalone',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
})
```

- [ ] **Step 3: Verify the build produces a service worker**

Run: `npm run build`
Expected: build succeeds and `dist/sw.js` + `dist/manifest.webmanifest` are generated.

- [ ] **Step 4: Commit**

```bash
git add momentum/vite.config.ts momentum/public
git commit -m "feat(momentum): configure installable PWA"
```

---

## Task 6: Supabase client + environment

**Files:**
- Create: `momentum/.env.example`, `momentum/src/lib/supabase.ts`
- Modify: `momentum/.gitignore`

- [ ] **Step 1: Create `.env.example`**

```
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY
```

- [ ] **Step 2: Ensure `.env.local` is gitignored**

Confirm `momentum/.gitignore` contains `.env.local` and `.env*.local`. Add them if missing. Create your real `momentum/.env.local` from the example with actual Supabase credentials (do not commit it).

- [ ] **Step 3: Create the client singleton `src/lib/supabase.ts`**

```ts
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!url || !anonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY')
}

export const supabase = createClient(url, anonKey)
```

- [ ] **Step 4: Commit**

```bash
git add momentum/.env.example momentum/.gitignore momentum/src/lib/supabase.ts
git commit -m "feat(momentum): add supabase client"
```

---

## Task 7: Database schema migration

**Files:**
- Create: `momentum/supabase/migrations/0001_initial_schema.sql`

- [ ] **Step 1: Initialize the Supabase CLI project (if not already)**

Run in `momentum/`:
```bash
npx supabase init
```
Expected: creates `supabase/config.toml`.

- [ ] **Step 2: Write the full schema migration `supabase/migrations/0001_initial_schema.sql`**

```sql
-- Body & identity
create table profile (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  sex text check (sex in ('male','female')),
  date_of_birth date,
  height_cm numeric,
  units_pref text not null default 'metric' check (units_pref in ('metric','imperial')),
  baseline_activity_level numeric not null default 1.2,
  created_at timestamptz not null default now()
);

create table weight_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profile(id) on delete cascade,
  logged_on date not null,
  weight_kg numeric not null
);

create table goal_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profile(id) on delete cascade,
  effective_from date not null,
  goal text not null check (goal in ('cut','bulk','maintain'))
);

-- Exercise library (owner null = global/predefined)
create table exercise (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references profile(id) on delete cascade,
  name text not null,
  muscle_group text not null,
  equipment text,
  is_public boolean not null default false
);

-- Meso (plan)
create table meso (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profile(id) on delete cascade,
  name text not null,
  scheduling_style text not null check (scheduling_style in ('calendar_week','continuous')),
  deload_every_n_microcycles int,
  is_active boolean not null default false,
  notes text,
  created_at timestamptz not null default now()
);

create table meso_day (
  id uuid primary key default gen_random_uuid(),
  meso_id uuid not null references meso(id) on delete cascade,
  label text not null,
  order_index int not null
);

create table meso_day_exercise (
  id uuid primary key default gen_random_uuid(),
  meso_day_id uuid not null references meso_day(id) on delete cascade,
  exercise_id uuid not null references exercise(id),
  order_index int not null,
  target_sets int not null,
  rep_min int not null,
  rep_max int not null
);

create table microcycle (
  id uuid primary key default gen_random_uuid(),
  meso_id uuid not null references meso(id) on delete cascade,
  index int not null,
  is_deload boolean not null default false,
  started_at timestamptz not null default now(),
  week_start_date date,
  status text not null default 'active' check (status in ('active','completed'))
);

-- Logging (immutable truth)
create table workout_session (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profile(id) on delete cascade,
  meso_id uuid references meso(id) on delete set null,
  microcycle_id uuid references microcycle(id) on delete set null,
  meso_day_id uuid references meso_day(id) on delete set null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  is_deload boolean not null default false,
  status text not null default 'in_progress' check (status in ('in_progress','completed','skipped'))
);

create table session_exercise (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references workout_session(id) on delete cascade,
  exercise_id uuid not null references exercise(id),
  source text not null check (source in ('planned','swapped','added')),
  order_index int not null
);

create table logged_set (
  id uuid primary key default gen_random_uuid(),
  session_exercise_id uuid not null references session_exercise(id) on delete cascade,
  set_index int not null,
  is_drop_set boolean not null default false
);

create table set_segment (
  id uuid primary key default gen_random_uuid(),
  logged_set_id uuid not null references logged_set(id) on delete cascade,
  segment_index int not null,
  weight numeric not null,
  reps int not null,
  rir int
);

-- one active meso per user
create unique index one_active_meso_per_user on meso(user_id) where is_active;
```

- [ ] **Step 3: Apply the migration**

Link to your Supabase project and push (or run against local Supabase):
```bash
npx supabase db push
```
Expected: migration applies with no errors; tables visible in the Supabase dashboard.

- [ ] **Step 4: Commit**

```bash
git add momentum/supabase
git commit -m "feat(momentum): initial database schema"
```

---

## Task 8: Row-Level Security policies

**Files:**
- Create: `momentum/supabase/migrations/0002_rls_policies.sql`

- [ ] **Step 1: Write `0002_rls_policies.sql`**

```sql
-- Enable RLS on every user-owned table
alter table profile enable row level security;
alter table weight_log enable row level security;
alter table goal_log enable row level security;
alter table exercise enable row level security;
alter table meso enable row level security;
alter table meso_day enable row level security;
alter table meso_day_exercise enable row level security;
alter table microcycle enable row level security;
alter table workout_session enable row level security;
alter table session_exercise enable row level security;
alter table logged_set enable row level security;
alter table set_segment enable row level security;

-- profile: a user sees/edits only their own row
create policy profile_self on profile
  for all using (id = auth.uid()) with check (id = auth.uid());

-- direct user-owned tables
create policy weight_self on weight_log
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy goal_self on goal_log
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy meso_self on meso
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy session_self on workout_session
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- exercise: global rows readable by all; custom rows owned by their creator
create policy exercise_read on exercise
  for select using (owner_user_id is null or owner_user_id = auth.uid() or is_public);
create policy exercise_write on exercise
  for all using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());

-- child tables: access derived from the owning parent
create policy meso_day_self on meso_day
  for all using (exists (select 1 from meso m where m.id = meso_day.meso_id and m.user_id = auth.uid()))
  with check (exists (select 1 from meso m where m.id = meso_day.meso_id and m.user_id = auth.uid()));

create policy meso_day_exercise_self on meso_day_exercise
  for all using (exists (
    select 1 from meso_day d join meso m on m.id = d.meso_id
    where d.id = meso_day_exercise.meso_day_id and m.user_id = auth.uid()))
  with check (exists (
    select 1 from meso_day d join meso m on m.id = d.meso_id
    where d.id = meso_day_exercise.meso_day_id and m.user_id = auth.uid()));

create policy microcycle_self on microcycle
  for all using (exists (select 1 from meso m where m.id = microcycle.meso_id and m.user_id = auth.uid()))
  with check (exists (select 1 from meso m where m.id = microcycle.meso_id and m.user_id = auth.uid()));

create policy session_exercise_self on session_exercise
  for all using (exists (select 1 from workout_session s where s.id = session_exercise.session_id and s.user_id = auth.uid()))
  with check (exists (select 1 from workout_session s where s.id = session_exercise.session_id and s.user_id = auth.uid()));

create policy logged_set_self on logged_set
  for all using (exists (
    select 1 from session_exercise se join workout_session s on s.id = se.session_id
    where se.id = logged_set.session_exercise_id and s.user_id = auth.uid()))
  with check (exists (
    select 1 from session_exercise se join workout_session s on s.id = se.session_id
    where se.id = logged_set.session_exercise_id and s.user_id = auth.uid()));

create policy set_segment_self on set_segment
  for all using (exists (
    select 1 from logged_set l join session_exercise se on se.id = l.session_exercise_id
    join workout_session s on s.id = se.session_id
    where l.id = set_segment.logged_set_id and s.user_id = auth.uid()))
  with check (exists (
    select 1 from logged_set l join session_exercise se on se.id = l.session_exercise_id
    join workout_session s on s.id = se.session_id
    where l.id = set_segment.logged_set_id and s.user_id = auth.uid()));
```

- [ ] **Step 2: Apply and verify**

Run: `npx supabase db push`
Expected: applies cleanly. In the dashboard, confirm RLS is "Enabled" on all listed tables.

- [ ] **Step 3: Commit**

```bash
git add momentum/supabase/migrations/0002_rls_policies.sql
git commit -m "feat(momentum): row-level security policies"
```

---

## Task 9: Invite gate (allowed_emails + auth trigger)

**Files:**
- Create: `momentum/supabase/migrations/0003_invite_gate.sql`

- [ ] **Step 1: Write `0003_invite_gate.sql`**

```sql
create table allowed_emails (
  email text primary key,
  invited_at timestamptz not null default now()
);

-- Block sign-up/sign-in for any email not on the allowlist, and
-- auto-create a profile row for invited users on first login.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if not exists (select 1 from allowed_emails a where a.email = new.email) then
    raise exception 'not_invited';
  end if;
  insert into public.profile (id, display_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Seed the first invited user (replace with the real owner email)
insert into allowed_emails (email) values ('deepak@greatlearning.in')
  on conflict (email) do nothing;
```

- [ ] **Step 2: Apply**

Run: `npx supabase db push`
Expected: applies cleanly; `allowed_emails` exists with one seeded row.

- [ ] **Step 3: Configure Google OAuth in Supabase**

In the Supabase dashboard → Authentication → Providers → Google: enable it and paste a Google OAuth client ID/secret (from Google Cloud Console, with the Supabase callback URL added as an authorized redirect URI). This is a manual console step, not code.

- [ ] **Step 4: Commit**

```bash
git add momentum/supabase/migrations/0003_invite_gate.sql
git commit -m "feat(momentum): invite-only auth gate"
```

---

## Task 10: Seed the predefined exercise library

**Files:**
- Create: `momentum/supabase/migrations/0004_seed_exercises.sql`

- [ ] **Step 1: Write `0004_seed_exercises.sql`** (the exercises from the source sheet, tagged)

```sql
insert into exercise (owner_user_id, name, muscle_group, equipment, is_public) values
  (null, 'Chin Ups', 'back', 'bodyweight', true),
  (null, 'Lat Pulldown', 'back', 'cable', true),
  (null, 'Seated Rows', 'back', 'cable', true),
  (null, 'Face Pulls', 'rear delts', 'cable', true),
  (null, 'Bicep Curls', 'biceps', 'dumbbell', true),
  (null, 'Bench Press', 'chest', 'barbell', true),
  (null, 'Incline DB Press', 'chest', 'dumbbell', true),
  (null, 'Pec Deck', 'chest', 'machine', true),
  (null, 'Lateral Raise', 'side delts', 'dumbbell', true),
  (null, 'Tricep Pushdown', 'triceps', 'cable', true),
  (null, 'Squats', 'quads', 'barbell', true),
  (null, 'Split Squats', 'quads', 'dumbbell', true),
  (null, 'Leg Extensions', 'quads', 'machine', true),
  (null, 'Leg Curl', 'hamstrings', 'machine', true),
  (null, 'Calf Raise', 'calves', 'machine', true),
  (null, 'DB Shoulder Press', 'front delts', 'dumbbell', true),
  (null, 'Rear Delt Flys', 'rear delts', 'dumbbell', true),
  (null, 'Bayesian Curls', 'biceps', 'cable', true),
  (null, 'OH Tricep Extensions', 'triceps', 'cable', true);
```

- [ ] **Step 2: Apply and verify**

Run: `npx supabase db push`
Expected: 19 global exercises present (`select count(*) from exercise where owner_user_id is null;` → 19).

- [ ] **Step 3: Commit**

```bash
git add momentum/supabase/migrations/0004_seed_exercises.sql
git commit -m "feat(momentum): seed predefined exercise library"
```

---

## Task 11: Auth provider + session context

**Files:**
- Create: `momentum/src/auth/AuthProvider.tsx`, `momentum/src/auth/useAuth.ts`

- [ ] **Step 1: Implement `src/auth/AuthProvider.tsx`**

```tsx
import { createContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

type AuthState = { session: Session | null; loading: boolean }
export const AuthContext = createContext<AuthState>({ session: null, loading: true })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  return <AuthContext.Provider value={{ session, loading }}>{children}</AuthContext.Provider>
}
```

- [ ] **Step 2: Implement `src/auth/useAuth.ts`**

```ts
import { useContext } from 'react'
import { AuthContext } from './AuthProvider'

export function useAuth() {
  return useContext(AuthContext)
}
```

- [ ] **Step 3: Commit**

```bash
git add momentum/src/auth/AuthProvider.tsx momentum/src/auth/useAuth.ts
git commit -m "feat(momentum): auth session provider"
```

---

## Task 12: Route guard (TDD)

**Files:**
- Create: `momentum/src/auth/RequireAuth.tsx`
- Test: `momentum/src/auth/RequireAuth.test.tsx`

- [ ] **Step 1: Write the failing test `src/auth/RequireAuth.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { AuthContext } from './AuthProvider'
import { RequireAuth } from './RequireAuth'

function renderAt(session: any, loading = false) {
  return render(
    <AuthContext.Provider value={{ session, loading }}>
      <MemoryRouter initialEntries={['/secret']}>
        <Routes>
          <Route path="/login" element={<div>login page</div>} />
          <Route path="/secret" element={<RequireAuth><div>secret content</div></RequireAuth>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  )
}

describe('RequireAuth', () => {
  it('redirects to /login when there is no session', () => {
    renderAt(null)
    expect(screen.getByText('login page')).toBeInTheDocument()
  })
  it('renders children when a session exists', () => {
    renderAt({ user: { id: 'u1' } })
    expect(screen.getByText('secret content')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- RequireAuth`
Expected: FAIL — cannot find module `./RequireAuth`.

- [ ] **Step 3: Implement `src/auth/RequireAuth.tsx`**

```tsx
import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from './useAuth'

export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()
  if (loading) return null
  if (!session) return <Navigate to="/login" replace />
  return <>{children}</>
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- RequireAuth`
Expected: PASS (both cases).

- [ ] **Step 5: Commit**

```bash
git add momentum/src/auth/RequireAuth.tsx momentum/src/auth/RequireAuth.test.tsx
git commit -m "feat(momentum): protected route guard"
```

---

## Task 13: Login page, OAuth callback, home placeholder

**Files:**
- Create: `momentum/src/auth/LoginPage.tsx`, `momentum/src/auth/AuthCallback.tsx`, `momentum/src/pages/HomePage.tsx`

- [ ] **Step 1: Implement `src/auth/LoginPage.tsx`**

```tsx
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useT } from '../i18n/I18nProvider'

export function LoginPage() {
  const t = useT()
  const [error, setError] = useState<string | null>(null)

  async function signIn() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) setError(error.message)
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-[#0f1115] text-white">
      <h1 className="text-3xl font-bold">{t('app.name')}</h1>
      <button onClick={signIn} className="rounded-lg bg-indigo-600 px-5 py-3 font-semibold">
        {t('auth.signInWithGoogle')}
      </button>
      {error && <p className="text-red-400 text-sm max-w-xs text-center">{t('auth.notInvited')}</p>}
    </div>
  )
}
```

- [ ] **Step 2: Implement `src/auth/AuthCallback.tsx`**

```tsx
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from './useAuth'

export function AuthCallback() {
  const { session, loading } = useAuth()
  const navigate = useNavigate()
  useEffect(() => {
    if (!loading) navigate(session ? '/' : '/login', { replace: true })
  }, [session, loading, navigate])
  return null
}
```

- [ ] **Step 3: Implement `src/pages/HomePage.tsx`**

```tsx
import { supabase } from '../lib/supabase'
import { useT } from '../i18n/I18nProvider'

export function HomePage() {
  const t = useT()
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-[#0f1115] text-white">
      <p className="text-xl">{t('home.welcome')}</p>
      <button onClick={() => supabase.auth.signOut()} className="text-sm text-slate-400 underline">
        {t('auth.signOut')}
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add momentum/src/auth/LoginPage.tsx momentum/src/auth/AuthCallback.tsx momentum/src/pages/HomePage.tsx
git commit -m "feat(momentum): login, oauth callback, home placeholder"
```

---

## Task 14: Wire the app together

**Files:**
- Modify: `momentum/src/main.tsx`, `momentum/src/App.tsx`

- [ ] **Step 1: Implement `src/main.tsx`**

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { I18nProvider } from './i18n/I18nProvider'
import { AuthProvider } from './auth/AuthProvider'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <I18nProvider>
      <AuthProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AuthProvider>
    </I18nProvider>
  </React.StrictMode>,
)
```

- [ ] **Step 2: Implement `src/App.tsx`**

```tsx
import { Routes, Route } from 'react-router-dom'
import { LoginPage } from './auth/LoginPage'
import { AuthCallback } from './auth/AuthCallback'
import { RequireAuth } from './auth/RequireAuth'
import { HomePage } from './pages/HomePage'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/" element={<RequireAuth><HomePage /></RequireAuth>} />
    </Routes>
  )
}
```

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: all tests pass (smoke, I18nProvider, RequireAuth).

- [ ] **Step 4: Manual end-to-end check**

Run `npm run dev`. With your real `.env.local` and Google configured: visiting `/` redirects to `/login`; signing in with an **invited** email lands on Home; signing in with a **non-invited** email fails (the trigger raises `not_invited`). Stop the server.

- [ ] **Step 5: Commit**

```bash
git add momentum/src/main.tsx momentum/src/App.tsx
git commit -m "feat(momentum): wire router, auth, and i18n providers"
```

---

## Self-Review Notes (verified against spec §3, §4, §5, §8)

- **Stack (spec §3):** Vite+React+TS+Tailwind PWA + Supabase ✓ (Tasks 1–6); offline-sync is explicitly Plan 6, not here.
- **Layering (spec §4):** Supabase imported only in `lib/supabase.ts` and the data-touching auth files ✓; no business logic in this plan (deferred to Plan 2) ✓.
- **Data model (spec §5):** all 12 domain tables + `allowed_emails`, with the normalized FK chain and `one_active_meso_per_user` partial unique index ✓ (Task 7).
- **Security (spec §8):** RLS on all owned tables, global-exercise read policy, invite allowlist via auth trigger ✓ (Tasks 8–9).
- **i18n (spec §8):** JSON dictionary + `useT()`, every rendered string keyed ✓ (Task 4, used in Tasks 13–14).
- **Naming consistency:** `supabase` client, `useT`, `useAuth`, `RequireAuth`, `AuthContext` used consistently across tasks ✓.
```
