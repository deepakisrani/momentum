-- Notes. `session_id` is nullable so one table serves both a note written during a
-- workout (session set, exercise tagged) and a standalone note written any time.
-- Provenance is deliberately NOT session_exercise_id: those rows are hard-deleted when
-- an exercise is removed from a session (see removeSessionExercise), which would destroy
-- the anchor. `on delete set null` means deleting a workout demotes the note to
-- standalone instead of taking it down.
create table note (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profile(id) on delete cascade,
  body text not null check (length(trim(body)) > 0),
  session_id uuid references workout_session(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Exercise tags. Composite PK makes a duplicate tag impossible.
create table note_exercise (
  note_id uuid not null references note(id) on delete cascade,
  exercise_id uuid not null references exercise(id) on delete cascade,
  primary key (note_id, exercise_id)
);

alter table note enable row level security;
alter table note_exercise enable row level security;

-- Direct user-owned table (same shape as weight_self / goal_self / session_self in 0002).
create policy note_self on note
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Child table: access derived from the owning note (same shape as meso_day_self in 0002).
create policy note_exercise_self on note_exercise
  for all using (exists (select 1 from note n where n.id = note_exercise.note_id and n.user_id = auth.uid()))
  with check (exists (select 1 from note n where n.id = note_exercise.note_id and n.user_id = auth.uid()));

-- Indexes Postgres does not auto-create, per 0005's rationale.
-- note(user_id, created_at desc): the list query's filter + ORDER BY, and the
--   note_self policy's user_id predicate. Precedent for a user_id-leading composite:
--   weight_log_user_day_uniq (0009), one_active_meso_per_user (0001).
-- note(session_id): listNotes({ sessionId }), and the `on delete set null` back-reference.
-- note_exercise(exercise_id): step one of the two-step exercise filter, and the
--   `on delete cascade` back-reference from exercise.
-- note_exercise(note_id) is deliberately NOT created: it is the leading column of the
--   composite primary key, so Postgres already indexes it.
create index idx_note_user_created on note(user_id, created_at desc);
create index idx_note_session_id on note(session_id);
create index idx_note_exercise_exercise_id on note_exercise(exercise_id);
