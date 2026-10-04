-- Let a reader turn off "did it work?" reminders.
--
-- The follow-up cron is the one thing in this product that emails somebody
-- without them asking in that moment, so it needs an off switch that is
-- readable without a request and writable without a support ticket. It is one
-- nullable boolean on the reader's own profile.
--
-- `true` rather than nullable-and-null-means-off: a default of "on" has to be
-- stated, because the alternative — treating a missing row as "off" — silently
-- unsubscribes everyone whose profile predates this column. Defaulting to on and
-- writing `false` on purpose is the only version where forgetting a preference
-- leaves someone receiving what they asked for.
--
-- The column is granted separately below. `profiles` already revokes the
-- table-level UPDATE and re-grants a column list; this adds to that list rather
-- than widening it, so `role` stays out of reach — a reader who can write `role`
-- can make themselves an admin.

alter table public.profiles
  add column if not exists reminders_enabled boolean not null default true;

-- `profiles` gets a table-level UPDATE from Supabase's default privileges, so
-- the revoke below has to name `anon` too. Left in place, an anonymous caller
-- holds UPDATE on every column and is stopped only by the `id = auth.uid()`
-- policy — which passes for no rows only because an anon JWT carries no `sub`.
-- That is protection by coincidence rather than by design, and the reminder
-- preference is the last column to be added, so it is here that the coincidence
-- is turned off.
revoke update on public.profiles from anon, authenticated;
grant update (handle, display_name, avatar_url, reminders_enabled) on public.profiles to authenticated;

comment on column public.profiles.reminders_enabled is
  'False once the reader has opted out of "did it work?" follow-up emails. Defaults to true so an existing profile keeps receiving what it signed up for.';