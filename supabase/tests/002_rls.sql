begin;

-- Acceptance criteria for P2, as SQL. Each block sets up fixture data as the
-- table owner (which bypasses RLS), then drops to anon/authenticated and
-- asserts what that role can and cannot do.
--
-- auth.uid() reads the `request.jwt.claims` GUC, so impersonating a user means
-- setting it — the same thing PostgREST does per request.
select plan(22);

-- ===========================================================================
-- Fixtures (run as owner; RLS does not apply)
-- ===========================================================================

insert into auth.users (id, email)
values
  ('11111111-1111-1111-1111-111111111111', 'reporter@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'other@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'admin@example.com')
on conflict (id) do nothing;

-- handle_new_user derives a handle from the email, so the profiles now exist.
update public.profiles set role = 'admin' where id = '33333333-3333-3333-3333-333333333333';

insert into public.playbooks (slug, title, promise, category_id, status, outcome_type, tags)
select 'test-playbook', 'Test playbook', 'A promise about bills',
       id, 'published', 'money_monthly', array['bills', 'internet']
from public.categories where slug = 'personal-finance';

insert into public.playbook_versions (playbook_id, version, prompt_template)
select id, 1, 'Hello' from public.playbooks where slug = 'test-playbook';

update public.playbooks p
set current_version_id = v.id
from public.playbook_versions v
where v.playbook_id = p.id and p.slug = 'test-playbook';

insert into public.outcome_reports (playbook_id, version_id, user_id, result, amount, unit)
select p.id, p.current_version_id, '11111111-1111-1111-1111-111111111111', 'worked', 18, 'mo'
from public.playbooks p where p.slug = 'test-playbook';

insert into public.report_evidence (report_id, storage_path, kind)
select r.id, '11111111-1111-1111-1111-111111111111/redacted.png', 'image'
from public.outcome_reports r
join public.playbooks p on p.id = r.playbook_id
where p.slug = 'test-playbook';

-- ===========================================================================
-- Taxonomy reads are public
-- ===========================================================================

set local role anon;

select is(
  (select count(*)::int from public.categories), 8,
  'anon can read categories'
);

select is(
  (select count(*)::int from public.agents), 7,
  'anon can read agents'
);

select is(
  (select count(*)::int from public.playbooks where slug = 'test-playbook'), 1,
  'anon can read a published playbook'
);

-- ===========================================================================
-- Reports: readable, but anonymous
-- ===========================================================================

select is(
  (
    select count(*)::int
    from public.outcome_reports
    where playbook_id = (select id from public.playbooks where slug = 'test-playbook')
  ),
  1,
  'anon can read approved reports'
);

-- The headline privacy requirement. Column grants make this a permission error
-- rather than an empty result, so it cannot be worked around by a query that
-- happens to select fewer columns.
select throws_ok(
  $$ select user_id from public.outcome_reports $$,
  '42501',
  null,
  'anon cannot read outcome_reports.user_id'
);

-- Scoped to this file's own playbook, like the assertion above. An unscoped
-- count is a statement about the whole table, and the table is not this test's
-- to assume: `pnpm db:seed-stats` writes reports here, and an unscoped count
-- reported 72 against an expected 1 when it did. What the test means to say is
-- that anon can read the view and that its rows are the fixture's own.
select is(
  (
    select count(*)::int
    from public.public_reports
    where playbook_id = (select id from public.playbooks where slug = 'test-playbook')
  ),
  1,
  'anon can read the anonymised public_reports view'
);

-- Same scoping reason: `limit 1` over an unsorted view picks an arbitrary row,
-- so seeded reports would decide which initial this asserts on.
select is(
  (select display_initial
     from public.public_reports
    where playbook_id = (select id from public.playbooks where slug = 'test-playbook')),
  'A',
  'public_reports exposes an initial instead of an identity'
);

-- ===========================================================================
-- Evidence is private
-- ===========================================================================

-- No select policy exists for report_evidence, so RLS filters every row away.
-- From a client's point of view that is "cannot read": zero rows, not an error.
-- (Only the column grant on user_id above raises 42501.)
select is_empty(
  $$ select * from public.report_evidence $$,
  'anon reads no evidence rows'
);

select throws_ok(
  $$
  insert into public.report_evidence (report_id, storage_path, kind)
  select r.id, 'anon.png', 'image'
  from public.outcome_reports r
  join public.playbooks p on p.id = r.playbook_id
  where p.slug = 'test-playbook'
  $$,
  '42501',
  null,
  'anon cannot attach evidence'
);

-- ===========================================================================
-- Anonymous inserts
-- ===========================================================================

select throws_ok(
  $$
  insert into public.outcome_reports (playbook_id, version_id, user_id, result)
  select id, current_version_id, '22222222-2222-2222-2222-222222222222', 'worked'
  from public.playbooks where slug = 'test-playbook'
  $$,
  '42501',
  null,
  'anon cannot insert a report'
);

select lives_ok(
  $$
  insert into public.try_events (playbook_id, version_id, device_id, action)
  select id, current_version_id, 'anon-device-1', 'started'
  from public.playbooks where slug = 'test-playbook'
  $$,
  'anon may log a try event with a device_id'
);

select is_empty(
  $$ select * from public.try_events $$,
  'try events are admin-only, so the anon who logged one cannot read it back'
);

select is(
  (select count(*)::int from public.playbook_requests),
  0,
  'anon cannot read the request queue'
);

select lives_ok(
  $$ insert into public.playbook_requests (query) values ('help me with taxes') $$,
  'anyone may submit a playbook request'
);

-- ===========================================================================
-- Authenticated: the reporter's own report
-- ===========================================================================

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

-- This version already has a report from this user, so the unique
-- (user_id, version_id) constraint is what stops a second one.
select throws_ok(
  $$
  insert into public.outcome_reports (playbook_id, version_id, user_id, result)
  select id, current_version_id, '11111111-1111-1111-1111-111111111111', 'worked'
  from public.playbooks where slug = 'test-playbook'
  $$,
  '23505',
  null,
  'a user cannot file a second report for the same version'
);

-- The insert policy also checks user_id = auth.uid(), so even on a version with
-- no prior report a user cannot file on someone else's behalf.
select throws_ok(
  $$
  insert into public.outcome_reports (playbook_id, version_id, user_id, result)
  select id, current_version_id, '22222222-2222-2222-2222-222222222222', 'worked'
  from public.playbooks where slug = 'test-playbook'
  $$,
  '42501',
  null,
  'a user cannot file a report under another user id'
);

-- Moderation state is not the reporter's to set. Without the column grant this
-- would insert happily and let someone mark their own evidence approved.
select throws_ok(
  $$
  insert into public.outcome_reports
    (playbook_id, version_id, user_id, result, is_verified, weight)
  select id, current_version_id, '11111111-1111-1111-1111-111111111111',
         'worked', true, 99
  from public.playbooks where slug = 'test-playbook'
  $$,
  '42501',
  null,
  'a reporter cannot set is_verified or weight on insert'
);

select throws_ok(
  $$ update public.profiles set role = 'admin' where id = auth.uid() $$,
  '42501',
  null,
  'a user cannot promote themselves to admin'
);

select lives_ok(
  $$ update public.profiles set display_name = 'Renamed' where id = auth.uid() $$,
  'a user can still edit their own display name'
);

-- ===========================================================================
-- Admin sees what nobody else can
-- ===========================================================================

set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';

select is(
  (select count(*)::int from public.try_events where device_id = 'anon-device-1'),
  1,
  'an admin can read the try event an anon logged'
);

select is(
  (select count(*)::int from public.report_evidence),
  1,
  'an admin can read evidence'
);

select is(
  (select count(*)::int from public.playbook_requests),
  1,
  'an admin can read submitted requests'
);

select * from finish();
rollback;