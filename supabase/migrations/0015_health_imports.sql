create table public.body_measurement (
  user_id uuid not null references auth.users(id) on delete cascade,
  metric text not null check (metric in ('weight_kg', 'body_fat_pct', 'lean_mass_kg')),
  record_id text not null,
  installation_id uuid not null,
  source_package text not null,
  measured_at timestamptz not null,
  zone_offset_seconds integer,
  value numeric not null check (value >= 0 and value < 'Infinity'::numeric),
  check (metric <> 'body_fat_pct' or value <= 100),
  primary key (user_id, metric, record_id)
);

create table public.sleep_session (
  user_id uuid not null references auth.users(id) on delete cascade,
  record_id text not null,
  installation_id uuid not null,
  source_package text not null,
  started_at timestamptz not null,
  ended_at timestamptz not null check (ended_at > started_at),
  start_offset_seconds integer,
  end_offset_seconds integer,
  stages jsonb not null default '[]' check (jsonb_typeof(stages) = 'array'),
  primary key (user_id, record_id)
);

create table public.health_import_state (
  user_id uuid not null references auth.users(id) on delete cascade,
  installation_id uuid not null,
  record_type text not null check (record_type in ('weight_kg', 'body_fat_pct', 'lean_mass_kg', 'sleep')),
  synced_at timestamptz not null default now(),
  primary key (user_id, installation_id, record_type)
);

create index body_measurement_date_idx on public.body_measurement (user_id, measured_at);
create index sleep_session_end_idx on public.sleep_session (user_id, ended_at);

alter table public.body_measurement enable row level security;
alter table public.sleep_session enable row level security;
alter table public.health_import_state enable row level security;

revoke all on public.body_measurement, public.sleep_session, public.health_import_state from public, anon;
grant select, insert, update, delete on public.body_measurement, public.sleep_session, public.health_import_state to authenticated;

create policy body_measurement_owner on public.body_measurement to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy sleep_session_owner on public.sleep_session to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy health_import_state_owner on public.health_import_state to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create function public.apply_health_changes(
  account uuid, installation uuid, kind text, records jsonb, deleted_ids text[], complete boolean,
  snapshot_start timestamptz default null, snapshot_end timestamptz default null, snapshot_ids text[] default null
) returns void language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is distinct from account or account is null then
    raise exception 'Health import account mismatch' using errcode = '42501';
  end if;

  if kind = 'sleep' then
    delete from public.sleep_session where user_id = account and record_id = any(deleted_ids);
    if snapshot_ids is not null then
      delete from public.sleep_session where user_id = account and installation_id = installation
        and started_at >= snapshot_start and ended_at < snapshot_end
        and not (record_id = any(snapshot_ids));
    end if;
    insert into public.sleep_session
      (user_id, record_id, installation_id, source_package, started_at, ended_at, start_offset_seconds, end_offset_seconds, stages)
    select account, r.record_id, installation, r.source_package, r.started_at, r.ended_at,
      r.start_offset_seconds, r.end_offset_seconds, r.stages
    from jsonb_populate_recordset(null::public.sleep_session, records) r
    on conflict (user_id, record_id) do update set
      installation_id = excluded.installation_id, source_package = excluded.source_package, started_at = excluded.started_at,
      ended_at = excluded.ended_at, start_offset_seconds = excluded.start_offset_seconds,
      end_offset_seconds = excluded.end_offset_seconds, stages = excluded.stages;
  elsif kind in ('weight_kg', 'body_fat_pct', 'lean_mass_kg') then
    delete from public.body_measurement where user_id = account and metric = kind and record_id = any(deleted_ids);
    if snapshot_ids is not null then
      delete from public.body_measurement where user_id = account and metric = kind and installation_id = installation
        and measured_at >= snapshot_start and measured_at < snapshot_end
        and not (record_id = any(snapshot_ids));
    end if;
    insert into public.body_measurement (user_id, metric, record_id, installation_id, source_package, measured_at, zone_offset_seconds, value)
    select account, kind, r.record_id, installation, r.source_package, r.measured_at, r.zone_offset_seconds, r.value
    from jsonb_populate_recordset(null::public.body_measurement, records) r
    on conflict (user_id, metric, record_id) do update set
      installation_id = excluded.installation_id, source_package = excluded.source_package, measured_at = excluded.measured_at,
      zone_offset_seconds = excluded.zone_offset_seconds, value = excluded.value;
  else
    raise exception 'Unknown Health Connect record type' using errcode = '22023';
  end if;

  if complete then
    insert into public.health_import_state (user_id, installation_id, record_type)
    values (account, installation, kind)
    on conflict (user_id, installation_id, record_type) do update set synced_at = now();
  end if;
end;
$$;

revoke execute on function public.apply_health_changes(uuid, uuid, text, jsonb, text[], boolean, timestamptz, timestamptz, text[]) from public, anon;
grant execute on function public.apply_health_changes(uuid, uuid, text, jsonb, text[], boolean, timestamptz, timestamptz, text[]) to authenticated;

create view public.daily_weight with (security_invoker = true) as
select distinct on (user_id, logged_on) id, user_id, logged_on, weight_kg
from (
  select id::text, user_id, logged_on, weight_kg, true as manual, null::timestamptz as measured_at
  from public.weight_log
  union all
  select record_id, user_id,
    ((measured_at at time zone 'UTC') + make_interval(secs => coalesce(zone_offset_seconds, 0)))::date,
    value, false, measured_at
  from public.body_measurement
  where metric = 'weight_kg'
) as readings
order by user_id, logged_on, manual desc, measured_at desc, id;

revoke all on public.daily_weight from public, anon;
grant select on public.daily_weight to authenticated;
