alter table public.health_import_state drop constraint health_import_state_record_type_check;
alter table public.health_import_state add check
  (record_type in ('weight_kg', 'body_fat_pct', 'lean_mass_kg', 'sleep', 'steps', 'resting_heart_rate'));

create table public.daily_health (
  user_id uuid not null references auth.users(id) on delete cascade,
  installation_id uuid not null,
  day date not null,
  metric text not null check (metric in ('steps', 'resting_heart_rate')),
  value bigint not null check (value >= 0),
  primary key (user_id, day, metric)
);
alter table public.daily_health enable row level security;
revoke all on public.daily_health from public, anon;
grant select, insert, update, delete on public.daily_health to authenticated;
create policy daily_health_owner on public.daily_health to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create function public.apply_daily_health(
  account uuid, installation uuid, kind text, first_day date, last_day date, readings jsonb
) returns void language plpgsql security invoker set search_path = '' as $$
begin
  if account is null or auth.uid() is distinct from account then
    raise exception 'Health import account mismatch' using errcode = '42501';
  end if;
  if kind is null or kind not in ('steps', 'resting_heart_rate') or first_day is null
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
