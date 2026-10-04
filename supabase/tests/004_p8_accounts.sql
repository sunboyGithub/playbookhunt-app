begin;

-- Acceptance criteria for P8, as SQL: saves, the "did it work?" report, the
-- 24-hour edit window, and the reminder preference.
--
-- Same shape as 002 — fixtures as the table owner (which bypasses RLS), then
-- `set local role` to the role being tested. The role matters: the connection
-- user here is the table owner, who bypasses every policy, so a test that only
-- sets `request.jwt.claims` and forgets the role asserts nothing at all.
select plan(18);

/* ==========================================================================
   Fixtures
   ========================================================================== */

insert into auth.users (id, email)
values
  ('11111111-1111-1111-1111-111111111111', 'reporter@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'other@example.com')
on conflict (id) do nothing;

-- handle_new_user derives a handle from the email, so the profiles now exist.

-- Three playbooks rather than one, because `unique (user_id, version_id)` gives
-- the reporter one report per version and the edit window is a property of a
-- report's age rather than of a version.
insert into public.playbooks (slug, title, promise, category_id, status, outcome_type)
select t.slug, t.title, t.promise, c.id, 'published', 'money_monthly'
from (values
  ('p8-playbook', 'P8 playbook', 'A promise about bills'),
  ('p8-fresh',    'P8 fresh playbook', 'A promise filed today'),
  ('p8-stale',    'P8 stale playbook', 'A promise filed long ago')
) as t(slug, title, promise)
join public.categories c on c.slug = 'personal-finance';

insert into public.playbook_versions (playbook_id, version, prompt_template)
select id, 1, 'Hello' from public.playbooks
where slug in ('p8-playbook', 'p8-fresh', 'p8-stale');

update public.playbooks p
set current_version_id = v.id
from public.playbook_versions v
where v.playbook_id = p.id and p.slug in ('p8-playbook', 'p8-fresh', 'p8-stale');

-- The pair the edit-window tests compare. Fixed ids so the statements below can
-- name a row: `user_id` is deliberately not in the column-level SELECT grant,
-- so a client cannot address its own report by its owner — which is one of the
-- reasons the /me edit path runs server-side rather than straight from the
-- browser.
insert into public.outcome_reports
  (id, playbook_id, version_id, user_id, result, amount, unit, created_at)
select r.id, p.id, p.current_version_id, '11111111-1111-1111-1111-111111111111',
       'worked', 18, 'mo', r.created_at
from (values
  ('55555555-5555-5555-5555-555555555555'::uuid, 'p8-fresh', now()),
  ('66666666-6666-6666-6666-666666666666'::uuid, 'p8-stale', now() - interval '48 hours')
) as r(id, slug, created_at)
join public.playbooks p on p.slug = r.slug;

/* ==========================================================================
   The reminder preference
   ========================================================================== */

select has_column(
  'public',
  'profiles',
  'reminders_enabled',
  'profiles carries the reminder preference added in P8'
);

select col_default_is(
  'public',
  'profiles',
  'reminders_enabled',
  'true',
  'reminders default to on, so nobody is opted out by signing up'
);

select is(
  (select reminders_enabled from public.profiles
    where id = '11111111-1111-1111-1111-111111111111'),
  true,
  'a new profile has reminders on'
);

/* ==========================================================================
   Saving
   ========================================================================== */

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select lives_ok(
  $$
  insert into public.saves (user_id, playbook_id)
  values (auth.uid(), (select id from public.playbooks where slug = 'p8-playbook'))
  $$,
  'a signed-in reader may save a playbook'
);

select throws_ok(
  $$
  insert into public.saves (user_id, playbook_id)
  values ('22222222-2222-2222-2222-222222222222',
          (select id from public.playbooks where slug = 'p8-playbook'))
  $$,
  '42501',
  null,
  'a reader cannot save on somebody else''s behalf'
);

select lives_ok(
  $$
  delete from public.saves
  where user_id = auth.uid()
    and playbook_id = (select id from public.playbooks where slug = 'p8-playbook')
  $$,
  'a reader may unsave their own'
);

/* ==========================================================================
   Reporting
   ========================================================================== */

select lives_ok(
  $$
  insert into public.outcome_reports (playbook_id, version_id, user_id, result, amount, unit)
  select p.id, p.current_version_id, auth.uid(), 'worked', 18, 'mo'
  from public.playbooks p where p.slug = 'p8-playbook'
  $$,
  'a reader may file a report'
);

select throws_ok(
  $$
  insert into public.outcome_reports (playbook_id, version_id, user_id, result)
  select p.id, p.current_version_id, auth.uid(), 'worked'
  from public.playbooks p where p.slug = 'p8-playbook'
  $$,
  '23505',
  null,
  'one report per reader per version'
);

/* ==========================================================================
   The 24-hour edit window
   ==========================================================================
   The column grant on `outcome_reports` deliberately includes `amount` and the
   other answer columns — that grant is the edit window. The window itself is
   the update policy's `created_at` clause, checked against the row rather than
   against anything the request sent, so it cannot be moved by editing a payload.
*/

select lives_ok(
  $$
  update public.outcome_reports set amount = 24
  where id = '55555555-5555-5555-5555-555555555555'
  $$,
  'a reader may correct a number they filed in the last day'
);

-- A policy that excludes a row does not raise: the statement runs and matches
-- nothing. "Zero rows" is the whole enforcement mechanism here, which is why
-- the server action checks the window again and turns it into a sentence a
-- person can read rather than a silently missing save.
--
-- The `with` clause has to be the outer statement, so these are `results_eq`
-- against a values list rather than an `is()` over a subquery.

select results_eq(
  $$
  with stale as (
    update public.outcome_reports set amount = 1
    where id = '66666666-6666-6666-6666-666666666666'
    returning 1
  ) select count(*)::int from stale
  $$,
  $$ values (0::int) $$,
  'a report older than 24h updates zero rows rather than one'
);

select results_eq(
  $$
  with stale as (
    delete from public.outcome_reports
    where id = '66666666-6666-6666-6666-666666666666'
    returning 1
  ) select count(*)::int from stale
  $$,
  $$ values (0::int) $$,
  'the client path cannot delete a report older than 24h either'
);

-- Note the asymmetry, because it is a decision rather than an oversight: the
-- direct client path above is windowed, but the `/me` delete action runs with
-- the service key and has no window at all. Withdrawing your own number is the
-- reader's right whenever they want it; correcting it is a courtesy to the
-- median, and a courtesy can expire.

/* ==========================================================================
   Moderation columns stay out of reach
   ========================================================================== */

select throws_ok(
  $$
  update public.outcome_reports set status = 'approved', is_verified = true
  where id = '55555555-5555-5555-5555-555555555555'
  $$,
  '42501',
  null,
  'a reporter cannot approve their own report'
);

select throws_ok(
  $$
  update public.outcome_reports set is_outlier = false
  where id = '55555555-5555-5555-5555-555555555555'
  $$,
  '42501',
  null,
  'a reporter cannot clear the outlier flag'
);

/* ==========================================================================
   The profile column grants
   ========================================================================== */

select lives_ok(
  $$ update public.profiles set reminders_enabled = false where id = auth.uid() $$,
  'a reader may turn reminders off'
);

select lives_ok(
  $$ update public.profiles set display_name = 'Renamed' where id = auth.uid() $$,
  'a reader may still edit their display name'
);

select throws_ok(
  $$ update public.profiles set role = 'admin' where id = auth.uid() $$,
  '42501',
  null,
  'the reminder grant does not reach role'
);

/* ==========================================================================
   Anonymous
   ========================================================================== */

set local role anon;

select throws_ok(
  $$ update public.profiles set reminders_enabled = false $$,
  '42501',
  null,
  'an anonymous caller cannot turn off reminders'
);

select throws_ok(
  $$
  insert into public.saves (user_id, playbook_id)
  values (gen_random_uuid(), (select id from public.playbooks where slug = 'p8-playbook'))
  $$,
  '42501',
  null,
  'an anonymous caller cannot save'
);

select * from finish();
rollback;
