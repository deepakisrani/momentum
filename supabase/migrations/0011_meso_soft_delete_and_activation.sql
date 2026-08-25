-- Soft delete, so deleting a meso stops orphaning its training log.
--
-- Before this, `meso` rows were hard-deleted. workout_session.meso_id is `on delete set
-- null`, so sessions survived but became invisible (History requires a meso) -- and
-- meso_day.meso_id is `on delete cascade`, so the day plan was destroyed outright, taking
-- the day labels with it. A soft delete keeps the meso row, its days and its labels alive,
-- so history stays readable while the meso disappears from the Mesos page.
alter table meso add column if not exists deleted_at timestamptz;

-- When the current *run* of this meso began.
--
-- Re-activating a meso months later should behave like a new training block: no stale
-- "previous workout", and above all no deload cadence resumed from months-old sessions
-- (sessionsSinceLastDeload counts back until it finds a deload, so an abandoned meso can
-- report "Deload scheduled" on ancient data). The day-scoped queries filter to sessions on
-- or after this; History and the CSV export deliberately do not, so nothing is hidden.
alter table meso add column if not exists activated_at timestamptz;
