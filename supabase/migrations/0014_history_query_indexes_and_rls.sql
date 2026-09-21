-- The History, workout chooser, and exercise-progress queries all filter by a user-owned
-- session subset and then read newest-first. These partial/composite indexes avoid repeatedly
-- scanning the full workout log as it grows, while keeping the write cost lower than broad
-- indexes over every session row.
create index if not exists idx_meso_user_created
  on meso (user_id, created_at desc);

create index if not exists idx_workout_session_active_user_started
  on workout_session (user_id, started_at desc)
  where status = 'in_progress';

create index if not exists idx_workout_session_completed_user_meso_started
  on workout_session (user_id, meso_id, started_at desc, id desc)
  where status = 'completed';

-- Progress and "last performance" start from the exercise id, whereas the existing FK index
-- starts from session_id. Both access paths are needed.
create index if not exists idx_session_exercise_exercise_session
  on session_exercise (exercise_id, session_id);

-- RLS is evaluated for every candidate row. `(select auth.uid())` becomes an initPlan, so
-- PostgreSQL obtains the JWT subject once per statement instead of repeatedly per row. The
-- predicates are otherwise identical to 0002; this changes execution cost, not access.
drop policy if exists profile_self on profile;
create policy profile_self on profile
  for all using (id = (select auth.uid())) with check (id = (select auth.uid()));

drop policy if exists weight_self on weight_log;
create policy weight_self on weight_log
  for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists goal_self on goal_log;
create policy goal_self on goal_log
  for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists meso_self on meso;
create policy meso_self on meso
  for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists session_self on workout_session;
create policy session_self on workout_session
  for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists exercise_read on exercise;
create policy exercise_read on exercise
  for select using (owner_user_id is null or owner_user_id = (select auth.uid()) or is_public);

drop policy if exists exercise_write on exercise;
create policy exercise_write on exercise
  for all using (owner_user_id = (select auth.uid())) with check (owner_user_id = (select auth.uid()));

drop policy if exists meso_day_self on meso_day;
create policy meso_day_self on meso_day
  for all using (exists (select 1 from meso m where m.id = meso_day.meso_id and m.user_id = (select auth.uid())))
  with check (exists (select 1 from meso m where m.id = meso_day.meso_id and m.user_id = (select auth.uid())));

drop policy if exists meso_day_exercise_self on meso_day_exercise;
create policy meso_day_exercise_self on meso_day_exercise
  for all using (exists (
    select 1 from meso_day d join meso m on m.id = d.meso_id
    where d.id = meso_day_exercise.meso_day_id and m.user_id = (select auth.uid())
  )) with check (exists (
    select 1 from meso_day d join meso m on m.id = d.meso_id
    where d.id = meso_day_exercise.meso_day_id and m.user_id = (select auth.uid())
  ));

drop policy if exists microcycle_self on microcycle;
create policy microcycle_self on microcycle
  for all using (exists (select 1 from meso m where m.id = microcycle.meso_id and m.user_id = (select auth.uid())))
  with check (exists (select 1 from meso m where m.id = microcycle.meso_id and m.user_id = (select auth.uid())));

drop policy if exists session_exercise_self on session_exercise;
create policy session_exercise_self on session_exercise
  for all using (exists (select 1 from workout_session s where s.id = session_exercise.session_id and s.user_id = (select auth.uid())))
  with check (exists (select 1 from workout_session s where s.id = session_exercise.session_id and s.user_id = (select auth.uid())));

drop policy if exists logged_set_self on logged_set;
create policy logged_set_self on logged_set
  for all using (exists (
    select 1 from session_exercise se join workout_session s on s.id = se.session_id
    where se.id = logged_set.session_exercise_id and s.user_id = (select auth.uid())
  )) with check (exists (
    select 1 from session_exercise se join workout_session s on s.id = se.session_id
    where se.id = logged_set.session_exercise_id and s.user_id = (select auth.uid())
  ));

drop policy if exists set_segment_self on set_segment;
create policy set_segment_self on set_segment
  for all using (exists (
    select 1 from logged_set l join session_exercise se on se.id = l.session_exercise_id
    join workout_session s on s.id = se.session_id
    where l.id = set_segment.logged_set_id and s.user_id = (select auth.uid())
  )) with check (exists (
    select 1 from logged_set l join session_exercise se on se.id = l.session_exercise_id
    join workout_session s on s.id = se.session_id
    where l.id = set_segment.logged_set_id and s.user_id = (select auth.uid())
  ));
