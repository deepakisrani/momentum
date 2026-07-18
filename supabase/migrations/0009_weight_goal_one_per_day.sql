-- One weigh-in per day and one goal per effective date.
-- Removes the same-date ambiguity behind "latest weight" picking the wrong row.
-- Dedupe defensively first (keep one arbitrary row per group), then enforce
-- uniqueness so the app's upsert can overwrite instead of duplicating.

delete from weight_log a using weight_log b
  where a.user_id = b.user_id and a.logged_on = b.logged_on and a.ctid < b.ctid;
create unique index if not exists weight_log_user_day_uniq on weight_log (user_id, logged_on);

delete from goal_log a using goal_log b
  where a.user_id = b.user_id and a.effective_from = b.effective_from and a.ctid < b.ctid;
create unique index if not exists goal_log_user_date_uniq on goal_log (user_id, effective_from);
