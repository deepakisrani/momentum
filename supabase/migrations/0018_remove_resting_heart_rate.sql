delete from public.daily_health where metric = 'resting_heart_rate';
delete from public.health_import_state where record_type = 'resting_heart_rate';

alter table public.health_import_state drop constraint health_import_state_record_type_check;
alter table public.health_import_state add constraint health_import_state_record_type_check check
  (record_type in ('weight_kg', 'body_fat_pct', 'lean_mass_kg', 'sleep', 'steps', 'heart_rate'));

alter table public.daily_health drop constraint daily_health_metric_check;
alter table public.daily_health add constraint daily_health_metric_check
  check (metric in ('steps', 'heart_rate'));

create or replace function public.apply_daily_health(
  account uuid, installation uuid, kind text, first_day date, last_day date, readings jsonb
) returns void language plpgsql security invoker set search_path = '' as $$
begin
  if account is null or auth.uid() is distinct from account then
    raise exception 'Health import account mismatch' using errcode = '42501';
  end if;
  if kind is null or kind not in ('steps', 'heart_rate') or first_day is null
    or last_day is null or last_day - first_day not between 0 and 29 then
    raise exception 'Invalid daily health import' using errcode = '22023';
  end if;
  delete from public.daily_health as h where h.user_id = account and h.installation_id = installation
    and h.metric = kind and h.day between first_day and last_day;
  insert into public.daily_health (user_id, installation_id, day, metric, value)
    select account, installation, r.day, kind, r.value
    from jsonb_to_recordset(readings) as r(day date, value bigint)
    where r.day between first_day and last_day
    on conflict (user_id, day, metric) do update set
      value = excluded.value, installation_id = excluded.installation_id;
  insert into public.health_import_state (user_id, installation_id, record_type)
    values (account, installation, kind)
    on conflict (user_id, installation_id, record_type) do update set synced_at = now();
end;
$$;
revoke execute on function public.apply_daily_health(uuid, uuid, text, date, date, jsonb) from public, anon;
grant execute on function public.apply_daily_health(uuid, uuid, text, date, date, jsonb) to authenticated;
