-- ============================================================================
-- One-off import: "June 26 Meso" + June 2026 history for d3epak91@gmail.com
-- Run ONCE in the Supabase SQL editor (runs as service role → bypasses RLS).
-- This is DATA, not schema — it is NOT a migration and does not touch history.
-- Safe to re-run: it aborts if "June 26 Meso" already exists (atomic DO block).
-- ============================================================================
do $$
declare
  v_user uuid;
  v_meso uuid;
begin
  -- 1) Resolve user + guard against double-import ----------------------------
  select id into v_user from auth.users where email = 'd3epak91@gmail.com';
  if v_user is null then
    raise exception 'No auth user for d3epak91@gmail.com — log in once first.';
  end if;
  if exists (select 1 from meso where user_id = v_user and name = 'June 26 Meso') then
    raise exception '"June 26 Meso" already exists for this user — aborting (run once).';
  end if;

  -- 2) Custom exercise (machine overhead triceps, straight bar) --------------
  insert into exercise (owner_user_id, name, muscle_group, equipment, mechanic, is_public)
  values (v_user, 'Overhead Triceps Extension (Machine)', 'triceps', 'machine', 'isolation', false);

  -- 3) Meso (active) ---------------------------------------------------------
  update meso set is_active = false where user_id = v_user and is_active;  -- one-active-meso guard
  insert into meso (user_id, name, deload_every_n_microcycles, is_active, notes)
  values (v_user, 'June 26 Meso', null, true, 'Imported from sheet')
  returning id into v_meso;

  -- 4) Days ------------------------------------------------------------------
  create temp table _day (label text, order_index int, day_id uuid) on commit drop;
  insert into _day values
    ('Pull', 0, gen_random_uuid()),
    ('Push', 1, gen_random_uuid()),
    ('Legs', 2, gen_random_uuid()),
    ('Delts & Arms', 3, gen_random_uuid());
  insert into meso_day (id, meso_id, label, order_index)
    select day_id, v_meso, label, order_index from _day;

  -- 5) Resolve exercise names -> ids (prefers this user's custom on a tie) ----
  create temp table _ex (db_name text, ex_id uuid) on commit drop;
  insert into _ex
  select n, (select id from exercise
              where name = n and (is_public or owner_user_id = v_user)
              order by (owner_user_id = v_user) desc
              limit 1)
  from (values
    ('Chin-Up'),('Wide-Grip Lat Pulldown'),('Seated Cable Rows'),('Face Pull'),('Machine Bicep Curl'),
    ('Barbell Bench Press - Medium Grip'),('Incline Dumbbell Press'),('Butterfly'),('Side Lateral Raise'),('Triceps Pushdown'),
    ('Barbell Squat'),('Split Squats'),('Leg Extensions'),('Seated Leg Curl'),('Standing Calf Raises'),
    ('Dumbbell Shoulder Press'),('Reverse Machine Flyes'),('Standing One-Arm Cable Curl'),
    ('Overhead Triceps Extension (Machine)')
  ) as t(n);
  if exists (select 1 from _ex where ex_id is null) then
    raise exception 'Unresolved exercise name(s): %',
      (select string_agg(db_name, ', ') from _ex where ex_id is null);
  end if;

  -- 6) Raw log: one row per logged cell (weight kg, reps[] = one entry/set) ---
  create temp table _raw (day_label text, log_date date, db_name text, ord int, weight numeric, reps int[]) on commit drop;
  insert into _raw values
    -- Pull
    ('Pull','2026-06-01','Chin-Up',1,10,'{5,5}'),
    ('Pull','2026-06-01','Wide-Grip Lat Pulldown',2,45,'{13,12,12}'),
    ('Pull','2026-06-01','Seated Cable Rows',3,50,'{12,12,12}'),
    ('Pull','2026-06-01','Face Pull',4,15,'{12,12,12}'),
    ('Pull','2026-06-01','Machine Bicep Curl',5,30,'{12,12,12}'),
    ('Pull','2026-06-08','Chin-Up',1,10,'{5,5}'),
    ('Pull','2026-06-08','Wide-Grip Lat Pulldown',2,45,'{13,13,13}'),
    ('Pull','2026-06-08','Seated Cable Rows',3,50,'{12,12,12}'),
    ('Pull','2026-06-08','Face Pull',4,15,'{12,12,12}'),
    ('Pull','2026-06-08','Machine Bicep Curl',5,30,'{12,12,12}'),
    ('Pull','2026-06-15','Chin-Up',1,10,'{5,5}'),
    ('Pull','2026-06-15','Wide-Grip Lat Pulldown',2,45,'{13,13,13}'),
    ('Pull','2026-06-15','Seated Cable Rows',3,50,'{12,12,12}'),
    ('Pull','2026-06-15','Face Pull',4,15,'{12,12,12}'),
    ('Pull','2026-06-15','Machine Bicep Curl',5,30,'{12,12,12}'),
    ('Pull','2026-06-22','Chin-Up',1,10,'{5,5}'),
    ('Pull','2026-06-22','Wide-Grip Lat Pulldown',2,45,'{14,14,14}'),
    ('Pull','2026-06-22','Seated Cable Rows',3,45,'{12,12,12}'),
    ('Pull','2026-06-22','Face Pull',4,15,'{12,12,12}'),
    ('Pull','2026-06-22','Machine Bicep Curl',5,30,'{12,12,12}'),
    ('Pull','2026-06-29','Chin-Up',1,0,'{6,6,6}'),           -- deload (bodyweight)
    ('Pull','2026-06-29','Wide-Grip Lat Pulldown',2,25,'{14,14,14}'),
    ('Pull','2026-06-29','Seated Cable Rows',3,25,'{12,12,12}'),
    ('Pull','2026-06-29','Face Pull',4,10,'{12,12,12}'),
    ('Pull','2026-06-29','Machine Bicep Curl',5,15,'{12,12,12}'),
    -- Push
    ('Push','2026-06-02','Barbell Bench Press - Medium Grip',1,60,'{10,10,9}'),
    ('Push','2026-06-02','Incline Dumbbell Press',2,25,'{8,8,8}'),
    ('Push','2026-06-02','Butterfly',3,35,'{12,12,12}'),
    ('Push','2026-06-02','Side Lateral Raise',4,2.5,'{13,12,12}'),
    ('Push','2026-06-02','Triceps Pushdown',5,40,'{12,12,12}'),
    ('Push','2026-06-09','Barbell Bench Press - Medium Grip',1,60,'{8,8,8}'),
    ('Push','2026-06-09','Incline Dumbbell Press',2,25,'{8,8,8}'),
    ('Push','2026-06-09','Butterfly',3,35,'{12,12,12}'),
    ('Push','2026-06-09','Side Lateral Raise',4,2.5,'{13,12,12}'),
    ('Push','2026-06-09','Triceps Pushdown',5,35,'{12,12,12}'),
    ('Push','2026-06-16','Barbell Bench Press - Medium Grip',1,60,'{8,8,8}'),
    ('Push','2026-06-16','Incline Dumbbell Press',2,25,'{8,8,8}'),
    ('Push','2026-06-16','Butterfly',3,35,'{12,12,12}'),
    ('Push','2026-06-16','Side Lateral Raise',4,2.5,'{13,13,12}'),
    ('Push','2026-06-16','Triceps Pushdown',5,35,'{12,12,12}'),
    ('Push','2026-06-23','Barbell Bench Press - Medium Grip',1,60,'{8,8,9}'),
    ('Push','2026-06-23','Incline Dumbbell Press',2,25,'{8,8,8}'),
    ('Push','2026-06-23','Butterfly',3,35,'{13,13,13}'),
    ('Push','2026-06-23','Side Lateral Raise',4,2.5,'{14,13,13}'),
    ('Push','2026-06-23','Triceps Pushdown',5,35,'{12,12,12}'),
    -- Legs
    ('Legs','2026-06-03','Barbell Squat',1,70,'{8,8}'),
    ('Legs','2026-06-03','Split Squats',2,20,'{8,8}'),
    ('Legs','2026-06-03','Leg Extensions',3,45,'{12,12,12}'),
    ('Legs','2026-06-03','Seated Leg Curl',4,30,'{12,12,12}'),
    ('Legs','2026-06-03','Standing Calf Raises',5,50,'{12,12}'),
    ('Legs','2026-06-11','Barbell Squat',1,70,'{8,8}'),
    ('Legs','2026-06-11','Split Squats',2,20,'{8,8}'),
    ('Legs','2026-06-11','Leg Extensions',3,45,'{12,12}'),
    ('Legs','2026-06-11','Seated Leg Curl',4,30,'{12,12}'),
    ('Legs','2026-06-11','Standing Calf Raises',5,50,'{12,12}'),
    ('Legs','2026-06-18','Barbell Squat',1,70,'{8,8}'),
    ('Legs','2026-06-18','Split Squats',2,20,'{8,8}'),
    ('Legs','2026-06-18','Leg Extensions',3,45,'{12,12}'),
    ('Legs','2026-06-18','Seated Leg Curl',4,30,'{12,12}'),
    ('Legs','2026-06-18','Standing Calf Raises',5,50,'{13,13}'),
    ('Legs','2026-06-25','Barbell Squat',1,70,'{6,6}'),
    ('Legs','2026-06-25','Split Squats',2,15,'{8,8}'),
    ('Legs','2026-06-25','Leg Extensions',3,35,'{12,12}'),
    ('Legs','2026-06-25','Seated Leg Curl',4,30,'{12,12}'),
    ('Legs','2026-06-25','Standing Calf Raises',5,50,'{13,13}'),  -- PDF truncated; assumed 13,13
    -- Delts & Arms
    ('Delts & Arms','2026-06-05','Dumbbell Shoulder Press',1,20,'{12,11,10}'),
    ('Delts & Arms','2026-06-05','Side Lateral Raise',2,5,'{12,12,12}'),
    ('Delts & Arms','2026-06-05','Reverse Machine Flyes',3,15,'{12,12,12}'),
    ('Delts & Arms','2026-06-05','Standing One-Arm Cable Curl',4,10,'{12,12,12}'),
    ('Delts & Arms','2026-06-05','Overhead Triceps Extension (Machine)',5,25,'{12,12,12}'),
    ('Delts & Arms','2026-06-12','Dumbbell Shoulder Press',1,20,'{10,10,10}'),
    ('Delts & Arms','2026-06-12','Side Lateral Raise',2,5,'{12,12,12}'),
    ('Delts & Arms','2026-06-12','Reverse Machine Flyes',3,15,'{12,12,12}'),
    ('Delts & Arms','2026-06-12','Standing One-Arm Cable Curl',4,10,'{12,12,12}'),
    ('Delts & Arms','2026-06-12','Overhead Triceps Extension (Machine)',5,25,'{12,12,12}'),
    ('Delts & Arms','2026-06-19','Dumbbell Shoulder Press',1,20,'{10,10,10}'),
    ('Delts & Arms','2026-06-19','Side Lateral Raise',2,5,'{13,13,13}'),
    ('Delts & Arms','2026-06-19','Reverse Machine Flyes',3,15,'{12,12,12}'),
    ('Delts & Arms','2026-06-19','Standing One-Arm Cable Curl',4,10,'{12,12,12}'),
    ('Delts & Arms','2026-06-19','Overhead Triceps Extension (Machine)',5,25,'{12,12,12}'),
    ('Delts & Arms','2026-06-26','Dumbbell Shoulder Press',1,20,'{10,10,10}'),
    ('Delts & Arms','2026-06-26','Side Lateral Raise',2,5,'{13,13,13}'),
    ('Delts & Arms','2026-06-26','Reverse Machine Flyes',3,15,'{12,12,12}'),
    ('Delts & Arms','2026-06-26','Standing One-Arm Cable Curl',4,10,'{12,12,12}'),
    ('Delts & Arms','2026-06-26','Overhead Triceps Extension (Machine)',5,25,'{12,12,12}');

  -- 7) Meso plan (target sets + rep range), inferred from logged data --------
  --    (deload session excluded so it doesn't skew the template)
  insert into meso_day_exercise (meso_day_id, exercise_id, order_index, target_sets, rep_min, rep_max)
  select d.day_id, x.ex_id, r.ord,
         max(coalesce(array_length(r.reps, 1), 0)),
         min(rp), max(rp)
  from _raw r
  join _day d on d.label = r.day_label
  join _ex  x on x.db_name = r.db_name
  cross join lateral unnest(r.reps) as rp
  where not (r.day_label = 'Pull' and r.log_date = date '2026-06-29')
  group by d.day_id, x.ex_id, r.ord;

  -- 8) Sessions: one per (day, date); flag the 29 Jun Pull deload -------------
  create temp table _sess (session_id uuid, day_label text, log_date date, is_deload boolean) on commit drop;
  insert into _sess
  select gen_random_uuid(), day_label, log_date,
         (day_label = 'Pull' and log_date = date '2026-06-29')
  from (select distinct day_label, log_date from _raw) s;

  insert into workout_session (id, user_id, meso_id, microcycle_id, meso_day_id, started_at, ended_at, is_deload, status)
  select s.session_id, v_user, v_meso, null, d.day_id,
         (s.log_date + time '12:00')::timestamptz,
         (s.log_date + time '13:00')::timestamptz,
         s.is_deload, 'completed'
  from _sess s join _day d on d.label = s.day_label;

  -- 9) Session exercises: one per (session, exercise) ------------------------
  create temp table _se (se_id uuid, day_label text, log_date date, db_name text, ord int) on commit drop;
  insert into _se
  select gen_random_uuid(), day_label, log_date, db_name, ord
  from (select distinct day_label, log_date, db_name, ord from _raw) r;

  insert into session_exercise (id, session_id, exercise_id, source, order_index)
  select e.se_id, s.session_id, x.ex_id, 'planned', e.ord
  from _se e
  join _sess s on s.day_label = e.day_label and s.log_date = e.log_date
  join _ex   x on x.db_name = e.db_name;

  -- 10) Sets: expand reps[] into one logged_set + one set_segment per rep -----
  create temp table _set (ls_id uuid, day_label text, log_date date, db_name text, set_index int, weight numeric, reps int) on commit drop;
  insert into _set
  select gen_random_uuid(), r.day_label, r.log_date, r.db_name,
         (u.ord - 1)::int, r.weight, u.rep
  from _raw r
  cross join lateral unnest(r.reps) with ordinality as u(rep, ord);

  insert into logged_set (id, session_exercise_id, set_index, is_drop_set)
  select t.ls_id, e.se_id, t.set_index, false
  from _set t
  join _se e on e.day_label = t.day_label and e.log_date = t.log_date and e.db_name = t.db_name;

  insert into set_segment (logged_set_id, segment_index, weight, reps, rir)
  select t.ls_id, 0, t.weight, t.reps, null
  from _set t;

  raise notice 'Imported "June 26 Meso": % sessions, % sets logged.',
    (select count(*) from _sess), (select count(*) from _set);
end $$;

-- Optional sanity check (run separately after the block above):
-- select ws.started_at::date, md.label, count(distinct se.id) exercises, count(ls.id) sets
-- from workout_session ws
-- join meso m on m.id = ws.meso_id and m.name = 'June 26 Meso'
-- join meso_day md on md.id = ws.meso_day_id
-- join session_exercise se on se.session_id = ws.id
-- join logged_set ls on ls.session_exercise_id = se.id
-- group by 1,2 order by 1;
