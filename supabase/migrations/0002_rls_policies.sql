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
