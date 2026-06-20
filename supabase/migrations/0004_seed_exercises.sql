-- Seeds global exercises (owner_user_id = null). The `exercise` table has RLS enabled
-- (migration 0002) and no INSERT policy permits null-owner rows, so this seed relies on
-- being applied with the Supabase service role (as `supabase db push` / `db reset` do),
-- which bypasses RLS. Do NOT add a permissive null-owner INSERT policy — that would let
-- any authenticated user create global exercises.
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
