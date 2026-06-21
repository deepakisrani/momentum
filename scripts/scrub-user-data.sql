-- Scrub all workout/meso/body data for ONE user, so onboarding runs again.
-- Keeps: the auth account, the invite allowlist, and the global exercise library.
-- Run in the Supabase SQL Editor (service role → bypasses RLS).
-- Change the email below if your login differs.

do $$
declare
  uid uuid;
begin
  select id into uid from auth.users where email = 'd3epak91@gmail.com';
  if uid is null then
    raise notice 'No auth user for that email — nothing scrubbed.';
    return;
  end if;

  -- Logging (cascades: workout_session → session_exercise → logged_set → set_segment)
  delete from workout_session where user_id = uid;

  -- Mesocycles (cascades: meso → meso_day → meso_day_exercise, and microcycle)
  delete from meso where user_id = uid;

  -- Body logs
  delete from weight_log where user_id = uid;
  delete from goal_log where user_id = uid;

  -- Custom (user-owned) exercises — deleted AFTER the rows that referenced them.
  delete from exercise where owner_user_id = uid;

  -- Reset profile so isOnboardingComplete() is false → app routes to /onboarding.
  update profile
     set sex = null,
         date_of_birth = null,
         height_cm = null,
         units_pref = 'metric',
         baseline_activity_level = 1.2
   where id = uid;

  raise notice 'Scrubbed data for %, onboarding will run again.', uid;
end $$;
