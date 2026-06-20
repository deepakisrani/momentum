-- Indexes on FK columns used by the RLS EXISTS subqueries (Postgres does not auto-create
-- these). Keeps per-user policy checks cheap as data grows.
create index idx_meso_day_meso_id on meso_day(meso_id);
create index idx_meso_day_exercise_meso_day_id on meso_day_exercise(meso_day_id);
create index idx_microcycle_meso_id on microcycle(meso_id);
create index idx_session_exercise_session_id on session_exercise(session_id);
create index idx_logged_set_session_exercise_id on logged_set(session_exercise_id);
create index idx_set_segment_logged_set_id on set_segment(logged_set_id);
