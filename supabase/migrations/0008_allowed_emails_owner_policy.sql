-- Let the owner (by JWT email) manage the invite allowlist from the client.
-- Non-owners have no policy on allowed_emails, so it stays opaque to them.
create policy allowed_emails_owner_all on allowed_emails
  for all
  using ((auth.jwt() ->> 'email') = 'd3epak91@gmail.com')
  with check ((auth.jwt() ->> 'email') = 'd3epak91@gmail.com');
