-- Backfill activated_at on mesos that already exist.
--
-- 0011 added the column nullable with no backfill, so every meso predating it reads NULL --
-- which the app treats as "no window", i.e. exactly its old behaviour. That is correct but it
-- leaves an implicit convention in the data ("NULL means the beginning of time"), and the two
-- `if (since)` guards in sessionRepo are the only thing standing between that convention and a
-- silent failure: PostgREST serialises `.gte(col, null)` as `started_at=gte.null`, Postgres
-- fails the cast, and PreviousWorkoutPanel swallows the 400 into an empty sheet. New mesos are
-- stamped at creation (see createMeso), so filling in the old rows makes the column populated
-- everywhere and demotes those guards to defence rather than load-bearing.
--
-- Value: the meso's FIRST completed session, falling back to the meso's own created_at when it
-- has never been trained.
--
-- Using min(started_at) rather than created_at is deliberate and not interchangeable. The
-- one-off June import (scripts/import-june26-meso.sql) inserts sessions with a backdated
-- started_at while the meso row takes a default created_at of the import moment -- so for that
-- meso, sessions PREDATE the row. A created_at backfill would have put real workouts before the
-- window and filed them under "Earlier runs". created_at is only used where there are no
-- sessions to be wrong about.
--
-- Behaviourally this is a no-op: splitByRun counts a session exactly on the boundary as current,
-- and the boundary is the first session, so every session stays in the current run and the
-- day-scoped queries keep matching everything. It changes the data's shape, not its meaning.
update meso m
set activated_at = coalesce(
      (select min(ws.started_at)
       from workout_session ws
       where ws.meso_id = m.id
         and ws.status = 'completed'),
      m.created_at
    )
where m.activated_at is null;
