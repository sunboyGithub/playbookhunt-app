begin;

-- Acceptance criteria for P9's schema: the eligibility flags and badges the
-- aggregation job writes, and the denormalised email verification it reads.
--
-- Same shape as 004 — fixtures as the table owner (which bypasses RLS), then
-- `set local role` to the role being tested. The role matters: the connection
-- user here is the table owner, so a test that only sets `request.jwt.claims`
-- asserts nothing at all.
select plan(23);

/* ==========================================================================
   Fixtures
   ========================================================================== */

-- The third arrives already confirmed, which is the OAuth-provider path:
-- signup and confirmation in the same request, so the INSERT trigger is the
-- only event there will ever be for that account.
insert into auth.users (id, email, email_confirmed_at)
values
  ('90000000-0000-0000-0000-000000000001', 'confirmed@example.com', null),
  ('90000000-0000-0000-0000-000000000002', 'unconfirmed@example.com', null),
  ('90000000-0000-0000-0000-000000000003', 'later@example.com', now())
on conflict (id) do nothing;

-- handle_new_user has created the three profiles.

/* ==========================================================================
   1. email_verified mirrors auth, including on the confirming update
   ========================================================================== */

-- The signup trigger runs on INSERT, when `email_confirmed_at` is still null,
-- so a profile created by a normal sign-up starts unverified.
select is(
  (select email_verified from public.profiles where id = '90000000-0000-0000-0000-000000000002'),
  false,
  'a profile created before confirmation is not verified'
);

-- This is the whole point of the trigger: the one moment verification changes
-- has to reach the profile, and the profile is only ever written by the trigger.
update auth.users
set email_confirmed_at = now()
where id = '90000000-0000-0000-0000-000000000002';

select is(
  (select email_verified from public.profiles where id = '90000000-0000-0000-0000-000000000002'),
  true,
  'confirming the address sets the profile flag'
);

-- And it does not stick at true forever: an address that is cleared goes back.
update auth.users
set email_confirmed_at = null
where id = '90000000-0000-0000-0000-000000000002';

select is(
  (select email_verified from public.profiles where id = '90000000-0000-0000-0000-000000000002'),
  false,
  'clearing the confirmation clears the profile flag'
);

-- The trigger fires for every user, not just the one the test touched.
update auth.users
set email_confirmed_at = now()
where id = '90000000-0000-0000-0000-000000000001';

select is(
  (select email_verified from public.profiles where id = '90000000-0000-0000-0000-000000000001'),
  true,
  'the trigger fires per row, not once'
);

-- An insert that arrives already confirmed must not need a second update to
-- propagate — asserted against the fixture inserted above, which was created
-- with `email_confirmed_at` already set and has never been updated.
select is(
  (select email_verified from public.profiles where id = '90000000-0000-0000-0000-000000000003'),
  true,
  'a signup that arrives already confirmed is verified immediately'
);

/* ==========================================================================
   2. The new playbook_stats columns exist with the right defaults
   ========================================================================== */

select has_column(
  'public',
  'playbook_stats',
  'weighted_success',
  'playbook_stats carries the weighted success behind the score'
);

select has_column(
  'public',
  'playbook_stats',
  'evidence_approved',
  'playbook_stats carries the approved-evidence count'
);

select has_column(
  'public',
  'playbook_stats',
  'show_rate',
  'playbook_stats carries the rate eligibility flag'
);

select has_column(
  'public',
  'playbook_stats',
  'show_median',
  'playbook_stats carries the median eligibility flag'
);

select has_column(
  'public',
  'playbook_stats',
  'strongest_eligible',
  'playbook_stats carries the "proven to work" flag'
);

select has_column(
  'public',
  'playbook_stats',
  'badges',
  'playbook_stats carries the badge set'
);

-- A playbook with no reports must be able to have a stats row at all, which
-- means every flag defaults to the withholding answer rather than to null.
insert into public.playbooks (slug, title, promise, category_id, status, outcome_type)
select 'p9-bare', 'P9 bare', 'A promise with no reports', c.id, 'published', 'money_monthly'
from public.categories c where c.slug = 'personal-finance';

insert into public.playbook_stats (playbook_id)
select id from public.playbooks where slug = 'p9-bare';

select is(
  (select show_rate from public.playbook_stats where playbook_id =
    (select id from public.playbooks where slug = 'p9-bare')),
  false,
  'a playbook with no reports may not show a rate'
);

select is(
  (select show_median from public.playbook_stats where playbook_id =
    (select id from public.playbooks where slug = 'p9-bare')),
  false,
  'a playbook with no reports may not show a median'
);

select is(
  (select badges from public.playbook_stats where playbook_id =
    (select id from public.playbooks where slug = 'p9-bare')),
  '{}'::text[],
  'a playbook with no reports has earned no badges'
);

select is(
  (select weighted_success from public.playbook_stats where playbook_id =
    (select id from public.playbooks where slug = 'p9-bare')),
  null,
  'weighted success is null with no reports, not zero'
);

/* ==========================================================================
   3. The database refuses a flag and a count that disagree
   ========================================================================== */

-- The point of storing `show_rate` rather than deriving it at render time: the
-- two cannot drift apart, so a card cannot be handed permission to print a
-- percentage on nineteen reports.
select throws_ok(
  $$
  update public.playbook_stats
  set show_rate = true
  where playbook_id = (select id from public.playbooks where slug = 'p9-bare')
  $$,
  '23514',
  null,
  'a rate may not be permitted below 20 reports'
);

select throws_ok(
  $$
  update public.playbook_stats
  set show_median = true
  where playbook_id = (select id from public.playbooks where slug = 'p9-bare')
  $$,
  '23514',
  null,
  'a median may not be permitted below 10 amounts'
);

-- A badge the renderer has no case for would have to fall through a branch
-- nobody wrote, so the constraint rejects it at the database.
select throws_ok(
  $$
  update public.playbook_stats
  set badges = '{definitely_not_a_badge}'
  where playbook_id = (select id from public.playbooks where slug = 'p9-bare')
  $$,
  '23514',
  null,
  'an unknown badge name is refused'
);

-- The whole array is checked, not just its first element.
select throws_ok(
  $$
  update public.playbook_stats
  set badges = '{high_success, also_not_real}'
  where playbook_id = (select id from public.playbooks where slug = 'p9-bare')
  $$,
  '23514',
  null,
  'a valid badge does not smuggle an invalid one through'
);

/* ==========================================================================
   4. A reader can neither raise their own trust nor their own evidence
   ========================================================================== */

-- The grant is a column list, not a table-level UPDATE. Asserted structurally
-- rather than by exception, because the connection user here is the table
-- owner and would succeed at the very update that must be refused below.
select ok(
  not exists (
    select 1
    from information_schema.column_privileges
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'email_verified'
      and grantee in ('anon', 'authenticated')
      and privilege_type = 'UPDATE'
  ),
  'no role is granted UPDATE on email_verified'
);

set local role authenticated;

select set_config('request.jwt.claims', '{"sub":"90000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select throws_ok(
  $$ update public.profiles set email_verified = true $$,
  '42501',
  null,
  'a signed-in reader cannot claim to be email-verified'
);

-- The stats row is admin-only to write. A reader who could write it could grant
-- themselves a percentage on four reports, which is the one thing the columns
-- and constraints above exist to prevent.
select throws_ok(
  $$
  update public.playbook_stats
  set evidence_score = 1
  where playbook_id = (select id from public.playbooks where slug = 'p9-bare')
  $$,
  '42501',
  null,
  'a signed-in reader cannot write their own evidence score'
);

-- But reading one is public: the badge set is what the card renders.
select lives_ok(
  $$
  select badges, show_rate, evidence_approved from public.playbook_stats
  where playbook_id = (select id from public.playbooks where slug = 'p9-bare')
  $$,
  'a stats row is publicly readable'
);

select * from finish();
rollback;