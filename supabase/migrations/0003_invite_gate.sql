create table allowed_emails (
  email text primary key,
  invited_at timestamptz not null default now()
);

-- Invite list is private: enable RLS with no policies so it is opaque to anon/authenticated
-- roles. The handle_new_user() trigger is SECURITY DEFINER, so it still reads this table;
-- the owner manages rows via the Supabase dashboard / service role.
alter table allowed_emails enable row level security;

-- Block sign-up/sign-in for any email not on the allowlist, and
-- auto-create a profile row for invited users on first login.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if not exists (select 1 from allowed_emails a where a.email = new.email) then
    raise exception 'not_invited';
  end if;
  insert into public.profile (id, display_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Seed the first invited user (replace with the real owner email)
insert into allowed_emails (email) values ('d3epak91@gmail.com')
  on conflict (email) do nothing;
