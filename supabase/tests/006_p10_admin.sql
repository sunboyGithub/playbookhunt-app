begin;

-- Acceptance criteria for P10's schema: the audit log, the request inbox's
-- grouping function, and the two private note columns.
--
-- Same shape as 004 and 005 — fixtures written as the table owner (which
-- bypasses RLS), then `set local role` to the role being tested. The role
-- matters: this connection is the table owner, so a test that only sets
-- `request.jwt.claims` asserts nothing.
select plan(20);

/* ==========================================================================
   Fixtures
   ========================================================================== */

insert into auth.users (id, email, email_confirmed_at)
values
  ('91000000-0000-0000-0000-000000000001', 'admin@example.com', now()),
  ('91000000-0000-0000-0000-000000000002', 'reader@example.com', now())
on conflict (id) do nothing;

update public.profiles set role = 'admin' where id = '91000000-0000-0000-0000-000000000001';

/* ==========================================================================
   1. The audit log is append-only to every role that can reach it
   ========================================================================== */

-- Reading is admin-only. As a signed-in reader the table is not merely empty, it
-- is invisible.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"91000000-0000-0000-0000-000000000002","role":"authenticated"}', true);

select is(
  (select count(*) from public.admin_actions),
  0::bigint,
  'a non-admin sees no audit rows'
);

reset role;

-- One row written as the owner, the way `writeAdminAction` does it.
insert into public.admin_actions (admin_id, action, target, payload)
values (
  '91000000-0000-0000-0000-000000000001',
  'report.approve',
  'a-report',
  '{"playbookId":"11111111-1111-1111-1111-111111111111"}'::jsonb
);

select is(
  (select count(*) from public.admin_actions),
  1::bigint,
  'the server can write the log'
);

-- The interesting grant. `authenticated` has no INSERT on this table at all,
-- so an admin holding a live session still cannot write a log entry describing
-- their own actions. This is a privilege failure rather than an RLS one, which
-- is why it is tested as "does it raise" and not as "does it return nothing".
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"91000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select is(
  (select count(*) from public.admin_actions),
  1::bigint,
  'an admin can read the log'
);

select throws_ok(
  $$insert into public.admin_actions (admin_id, action, target)
    values ('91000000-0000-0000-0000-000000000001', 'report.approve', 'forged')$$,
  '42501',
  null,
  'not even an admin may insert an audit row'
);

select throws_ok(
  $$update public.admin_actions set target = 'edited' where target = 'a-report'$$,
  '42501',
  null,
  'the log cannot be edited'
);

select throws_ok(
  $$delete from public.admin_actions where target = 'a-report'$$,
  '42501',
  null,
  'the log cannot be deleted by a session admin'
);

reset role;

/* ==========================================================================
   2. The request inbox's grouping
   ========================================================================== */

-- Four requests: two wordings of the same thing, one different thing, one
-- different thing. Grouping has to produce two pairs and two singletons — the
-- failure mode worth guarding against is a threshold low enough to merge
-- everything, which looks like a working inbox and is worse than none.
insert into public.playbook_requests (query, topic, created_at)
values
  ('cancel my subscription', 'billing', now() - interval '4 days'),
  ('how do I cancel my subscription', 'billing', now() - interval '3 days'),
  ('dispute a charge on my card', 'billing', now() - interval '2 days'),
  ('cancel my subscription', 'billing', now() - interval '1 day');

-- As a reader, the function does not exist for them. It is SECURITY DEFINER
-- with the check inside, and granted to service_role alone — so this raises
-- rather than returning an empty set.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"91000000-0000-0000-0000-000000000002","role":"authenticated"}', true);

select throws_ok(
  $$select * from public.admin_request_inbox()$$,
  '42501',
  null,
  'a non-admin cannot execute the request inbox'
);

reset role;

-- And as an admin session it still refuses: the guard is `is_admin()`, and a
-- service-role connection with no `sub` claim is not an administrator either.
-- The application calls it with the service key *after* its own check, which is
-- the only combination these two clauses are meant to allow.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"91000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select lives_ok(
  $$select count(*) from public.admin_request_inbox()$$,
  'an admin session may execute the request inbox'
);

select is(
  (select count(distinct group_key) from public.admin_request_inbox(0.55)),
  2::bigint,
  'two pairs and two singletons, not one group and not four'
);

select is(
  (select count(*) from public.admin_request_inbox(0.55) where group_key <> id),
  2::bigint,
  'each row that resembles an earlier one is filed under it'
);

-- The group key is the *earliest* earlier match, so the representative does not
-- move as copies arrive. Without that, the inbox would re-file the same request
-- under a newer row every time somebody typed it again, and the count would
-- reset to one.
select is(
  (
    select r2.query
    from public.admin_request_inbox(0.55) r1
    join public.admin_request_inbox(0.55) r2 on r2.group_key = r1.group_key
    where r1.query = 'cancel my subscription' and r1.created_at = now() - interval '4 days'
    order by r2.created_at
    limit 1
  ),
  'cancel my subscription',
  'the group is keyed on the oldest copy'
);

select ok(
  exists (
    select 1 from public.admin_request_inbox(0.95)
    where query = 'how do I cancel my subscription' and group_key = id
  ),
  'a strict threshold stops filing a different wording under an earlier request'
);

reset role;

/* ==========================================================================
   3. Request triage state
   ========================================================================== */

select is(
  (select status from public.playbook_requests where query = 'dispute a charge on my card'),
  'new',
  'a new request starts unread'
);

select throws_ok(
  $$update public.playbook_requests set status = 'in-progress'
     where query = 'dispute a charge on my card'$$,
  '23514',
  null,
  'and only ever holds one of the three states'
);

-- `decided_at` is set with the decision and cleared with the withdrawal, so
-- "planned last month and never built" stays distinguishable from "planned and
-- shipped" without a second column.
update public.playbook_requests
set status = 'planned', decided_at = now()
where query = 'dispute a charge on my card';

select is(
  (select decided_at is not null from public.playbook_requests where query = 'dispute a charge on my card'),
  true,
  'marking a request planned stamps when it was decided'
);

update public.playbook_requests set status = 'new', decided_at = null
where query = 'dispute a charge on my card';

select is(
  (select decided_at is null from public.playbook_requests where query = 'dispute a charge on my card'),
  true,
  'withdrawing the decision clears the stamp'
);

/* ==========================================================================
   4. The two private notes never reach a reader
   ========================================================================== */

-- The columns exist for moderators...
select has_column(
  'public', 'outcome_reports', 'moderation_note',
  'outcome_reports keeps the reason a report was rejected'
);

select has_column(
  'public', 'report_evidence', 'review_note',
  'report_evidence keeps the reason a file was rejected'
);

-- ...and `create or replace view` can only append columns, so neither was ever
-- added to the view anon reads from. This is the assertion that matters: the
-- rejection reason is an accusation about a named account, and publishing it
-- beside the report would be a second, worse version of the same data point.
select ok(
  not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'public_reports'
      and column_name = 'moderation_note'
  ),
  'public_reports does not project the rejection reason'
);

select ok(
  not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'public_reports'
      and column_name = 'review_note'
  ),
  'public_reports does not project the evidence review note'
);

select finish();

rollback;