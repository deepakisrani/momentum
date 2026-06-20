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
