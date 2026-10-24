-- Local-development-only identity. The invite trigger (0003) remains enabled locally, so this
-- account lets a developer use email/password sign-up without weakening the production policy.
-- Passwords and auth users are deliberately not seeded: create the account from the local login
-- screen once, then `supabase db reset` whenever you want a clean database.
insert into allowed_emails (email)
values ('dev@momentum.local')
on conflict (email) do nothing;
