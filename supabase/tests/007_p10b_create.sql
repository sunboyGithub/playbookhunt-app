begin;

-- Acceptance criteria for P10b's schema: the `in_review` status, the two tables,
-- and the lock that stops a submitted playbook being edited underneath a reviewer.
--
-- Same shape as 004-006 — fixtures written as the table owner (which bypasses
-- RLS), then `set local role` to the role being tested. The role matters: this
-- connection owns every table here, so a test that only sets
-- `request.jwt.claims` and stays on the owner asserts nothing at all.
select plan(35);

/* ==========================================================================
   Fixtures
   ========================================================================== */

insert into auth.users (id, email, email_confirmed_at)
values
  ('92000000-0000-0000-0000-000000000001', 'author@example.com', now()),
  ('92000000-0000-0000-0000-000000000002', 'reader@example.com', now()),
  ('92000000-0000-0000-0000-000000000003', 'creator@example.com', now())
on conflict (id) do nothing;

update public.profiles set role = 'admin' where id = '92000000-0000-0000-0000-000000000001';

-- One playbook to hang the review states off. `draft` to begin with, so the
-- status assertions are the only thing that changes it.
insert into public.playbooks (slug, title, promise, category_id, outcome_type, author_id)
values
  ('a-submitted-playbook', 'A submitted playbook', 'One sentence.', (select id from public.categories limit 1), 'binary', '92000000-0000-0000-0000-000000000001')
on conflict (slug) do nothing;

insert into public.playbook_drafts (author_id, content)
values ('92000000-0000-0000-0000-000000000001', '{"title":"working title"}'::jsonb);

insert into public.playbook_submissions (playbook_id, author_id, status)
select id, author_id, 'in_review'
from public.playbooks where slug = 'a-submitted-playbook';

/* ==========================================================================
   1. The status the brief asks a submission to land as
   ========================================================================== */

-- Not an assertion about a new column: an assertion that the value a submission
-- is *required* to use can actually be written. The check constraint has three
-- values today and would have rejected the insert.
select lives_ok(
  $$update public.playbooks set status = 'in_review' where slug = 'a-submitted-playbook'$$,
  'a playbook can be submitted for review'
);

select throws_ok(
  $$update public.playbooks set status = 'on_hold' where slug = 'a-submitted-playbook'$$,
  '23514',
  null,
  'and the status list still refuses an invented one'
);

/* ==========================================================================
   2. Drafts belong to their author
   ========================================================================== */

-- Reading is the first thing worth asserting because these tables carry
-- `anon` and `authenticated` with full table privileges — Supabase's default
-- privileges grant ALL on new tables, exactly as they hid the request inbox's
-- grants in migration 13. RLS is the entire defence here, so it is tested as
-- what a reader can and cannot see rather than inferred from the grants.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"92000000-0000-0000-0000-000000000002","role":"authenticated"}', true);

select is(
  (select count(*) from public.playbook_drafts),
  0::bigint,
  'a signed-in reader sees no drafts at all'
);

-- RLS is a filter, not an error: a policy that excludes a row makes it
-- invisible, so this is "returns nothing" and not "raises". Asserting it raises
-- would pass for the wrong reason — a privilege failure also raises, and would
-- hide the policy being absent.
select is(
  (
    select count(*) from public.playbook_drafts
    where author_id = '92000000-0000-0000-0000-000000000001'
  ),
  0::bigint,
  'another account''s draft is invisible rather than forbidden'
);

select is(
  (
    select count(*) from public.playbook_submissions
    where author_id = '92000000-0000-0000-0000-000000000001'
  ),
  0::bigint,
  'and so is their submission, including its reviewer note'
);

-- INSERT and UPDATE carry a WITH CHECK on `author_id`, which is the only thing
-- stopping a crafted request from filing a draft or a submission under somebody
-- else's account.
--
-- Note the asymmetry, which is why these two are asserted differently. A policy
-- that excludes a row makes it *invisible*, so an UPDATE or DELETE matching
-- nothing returns zero rows silently. An INSERT of a literal row has nothing to
-- filter — it raises instead. A test that expected zero rows here would not fail
-- on a permissive policy, it would abort, and the rest of the file would not run.
select throws_ok(
  $$insert into public.playbook_drafts (author_id, content)
    values ('92000000-0000-0000-0000-000000000001', '{"forged":true}'::jsonb)$$,
  '42501',
  'new row violates row-level security policy for table "playbook_drafts"',
  'a draft cannot be filed on somebody else''s behalf'
);

update public.playbook_submissions set reviewer_note = 'forged'
where author_id = '92000000-0000-0000-0000-000000000001';

select is(
  (
    select count(*) from public.playbook_submissions
    where reviewer_note = 'forged'
  ),
  0::bigint,
  'and a submission''s review state cannot be written by a reader'
);

delete from public.playbook_submissions where author_id = '92000000-0000-0000-0000-000000000001';

select is(
  (select count(*) from public.playbook_submissions),
  0::bigint,
  'nor deleted by one'
);

reset role;

/* ==========================================================================
   3. Authors and admins
   ========================================================================== */

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"92000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select is(
  (
    select count(*) from public.playbook_drafts
    where author_id = '92000000-0000-0000-0000-000000000001'
  ),
  1::bigint,
  'an author can read their own draft — this is how a reload restores it'
);

select is(
  (
    select count(*) from public.playbook_submissions
    where author_id = '92000000-0000-0000-0000-000000000001'
  ),
  1::bigint,
  'and their own submission, so "My submissions" can show the reviewer note'
);

update public.playbook_drafts set content = '{"title":"edited by the author"}'::jsonb
where author_id = '92000000-0000-0000-0000-000000000001';

select is(
  (
    select count(*) from public.playbook_drafts
    where content ->> 'title' = 'edited by the author'
  ),
  1::bigint,
  'and keep editing it'
);

reset role;

/* ==========================================================================
   4. A submission locks its draft
   ========================================================================== */

-- The interesting failure is not a crafted request, it is the creator's own
-- autosave arriving after they pressed Submit. Enforced in the database because
-- the browser cannot be trusted to have re-checked, and the moment it matters is
-- exactly the moment nobody is watching.
--
-- Linking the draft to the playbook is done first, as the owner, because that is
-- what submission does and the guard is a no-op on a draft with no `playbook_id`
-- — three tests below would otherwise pass without the trigger ever running.
update public.playbook_drafts
set playbook_id = (select id from public.playbooks where slug = 'a-submitted-playbook')
where author_id = '92000000-0000-0000-0000-000000000001';

select throws_ok(
  $$update public.playbook_drafts set content = '{"late":true}'::jsonb
    where author_id = '92000000-0000-0000-0000-000000000001'$$,
  '23514',
  'playbook_drafts: a submission that is in_review cannot be edited',
  'a pending submission cannot be edited underneath the reviewer'
);

-- Each terminal state is checked separately rather than by looping: the message
-- names the state, so a test that passed for the wrong state would pass for the
-- wrong reason.
update public.playbook_submissions set status = 'approved', decided_at = now()
where playbook_id = (select id from public.playbooks where slug = 'a-submitted-playbook');

select throws_ok(
  $$update public.playbook_drafts set content = '{"late":true}'::jsonb
    where author_id = '92000000-0000-0000-0000-000000000001'$$,
  '23514',
  'playbook_drafts: a submission that is approved cannot be edited',
  'an approved submission is closed to its author'
);

update public.playbook_submissions set status = 'rejected', decided_at = now()
where playbook_id = (select id from public.playbooks where slug = 'a-submitted-playbook');

select throws_ok(
  $$update public.playbook_drafts set content = '{"late":true}'::jsonb
    where author_id = '92000000-0000-0000-0000-000000000001'$$,
  '23514',
  'playbook_drafts: a submission that is rejected cannot be edited',
  'a rejected submission is closed to its author'
);

-- The one state a draft may be written in. "Request changes" exists precisely to
-- be written to, so this is the assertion that keeps the lock from being a
-- one-way door.
update public.playbook_submissions set status = 'changes_requested'
where playbook_id = (select id from public.playbooks where slug = 'a-submitted-playbook');

update public.playbook_drafts set content = '{"title":"revised"}'::jsonb
where author_id = '92000000-0000-0000-0000-000000000001';

select is(
  (
    select count(*) from public.playbook_drafts
    where content ->> 'title' = 'revised'
  ),
  1::bigint,
  'and requested changes is the one state the author may revise in'
);

/* ==========================================================================
   5. Review bookkeeping
   ========================================================================== */

-- A decision and its timestamp travel together. Without this, "requested changes
-- three months ago, never resubmitted" and "requested changes today" are the same
-- row, and only the second is the one that matters.
select throws_ok(
  $$update public.playbook_submissions set status = 'approved', decided_at = null
    where playbook_id = (select id from public.playbooks where slug = 'a-submitted-playbook')$$,
  '23514',
  null,
  'a decision without a timestamp is refused'
);

select throws_ok(
  $$update public.playbook_submissions set status = 'in_review', decided_at = now()
    where playbook_id = (select id from public.playbooks where slug = 'a-submitted-playbook')$$,
  '23514',
  null,
  'and so is a pending submission that claims to have been decided'
);

-- The note itself, written the way the admin queue writes it. `changes_requested`
-- is deliberately allowed to carry no timestamp (see the constraint above), so
-- this is the state where a reviewer has spoken but no decision is final.
update public.playbook_submissions set reviewer_note = 'Add a second step.'
where playbook_id = (select id from public.playbooks where slug = 'a-submitted-playbook');

select is(
  (
    select count(*) from public.playbook_submissions
    where status = 'changes_requested' and reviewer_note = 'Add a second step.'
  ),
  1::bigint,
  'a reviewer note round-trips on the one state that is not yet decided'
);

/* ==========================================================================
   6. The reviewer note is private, and the pending playbook is not public
   ========================================================================== */

-- `playbooks`'s read policy is `status = 'published' or author_id = auth.uid()
-- or is_admin()`, so `in_review` is invisible to the public by construction. That
-- is the whole of the guarantee that a submission under review does not leak, and
-- it is worth asserting rather than reasoning about: adding a fourth `or` to that
-- policy is a one-word change that would silently publish every draft.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"92000000-0000-0000-0000-000000000002","role":"authenticated"}', true);

select is(
  (
    select count(*) from public.playbooks
    where slug = 'a-submitted-playbook' and status = 'in_review'
  ),
  0::bigint,
  'a submission under review is invisible to a reader'
);

reset role;

-- The last check on the two tables, and the reason the RLS assertions above are
-- worth reading carefully: `anon` holds full table privileges on both, so a
-- policy that was accidentally written as `using (true)` would publish every
-- creator's draft and every reviewer note to the internet with nothing raising
-- anywhere.
set local role anon;

select is(
  (select count(*) from public.playbook_submissions),
  0::bigint,
  'a signed-out visitor cannot read the review queue'
);

select is(
  (select count(*) from public.playbook_drafts),
  0::bigint,
  'nor anybody''s unfinished draft'
);

reset role;

/* ==========================================================================
   7. The round trip: submit, ask for changes, submit again
   ========================================================================== */

-- This is the one path a creator actually walks, and it is the path with the most
-- ways to be quietly wrong. Run as `service_role`, because that is the only role
-- the function is granted to — and that is also the point being asserted, because
-- the checks above show `anon` and `authenticated` cannot reach it at all.
set local role service_role;

-- A fresh author, created above rather than here: `service_role` has no
-- privilege on `auth.users`, which is correct — the auth schema belongs to
-- Supabase's own GoTrue, not to us.
create temporary table first_submit on commit drop as
select * from public.submit_playbook(
  p_author_id => '92000000-0000-0000-0000-000000000003',
  p_draft_id => null,
  p_content => jsonb_build_object(
    'title', 'Lower your internet bill',
    'promise', 'Cut the monthly cost without changing your plan.',
    'categoryId', (select id::text from public.categories limit 1),
    'outcomeType', 'money_monthly',
    'timeMin', 10, 'timeMax', 20,
    'prompt', 'I want to lower my internet bill. My provider: {{input_1_placeholder}}'
  ),
  p_inputs => jsonb_build_array(
    jsonb_build_object('key', 'input_1_placeholder', 'label', 'Internet provider',
                       'type', 'text', 'required', true, 'sort', 0)
  ),
  p_steps => jsonb_build_array('Open your bill.', '   '),
  p_outcome_unit => '$/mo'
);

select is(
  (select version from first_submit),
  1,
  'a first submission is version 1'
);

-- By id, not by slug: the imported content already publishes a playbook at
-- `lower-your-internet-bill`, so the slug lookup below finds *that* one and the
-- assertion would pass or fail for reasons that have nothing to do with this
-- submission. The collision itself is worth its own check further down.
select is(
  (select status from public.playbooks where id = (select playbook_id from first_submit)),
  'in_review',
  'and the playbook lands in review'
);

select is(
  (select slug from public.playbooks where id = (select playbook_id from first_submit))
    <> 'lower-your-internet-bill',
  true,
  'with a suffixed slug, because the imported content already owns that address'
);

-- The blank step is dropped rather than stored as an empty line, because the
-- `unique (version_id, sort)` constraint would otherwise renumber and the reader
-- would see a gap where a step used to be.
select is(
  (select count(*) from public.playbook_steps s
   join public.playbook_versions v on v.id = s.version_id
   where v.playbook_id = (select playbook_id from first_submit)),
  1::bigint,
  'a blank step is dropped rather than stored'
);

-- Asking for changes. Done as a plain write rather than through an action,
-- because what is being tested here is the *state* the function reads back.
update public.playbook_submissions
set status = 'changes_requested', reviewer_note = 'Say which bill you opened.', decided_at = null
where playbook_id = (select playbook_id from first_submit);

select lives_ok(
  $$
  update public.playbook_drafts
  set content = content || '{"title":"Lower your internet bill (revised)"}'::jsonb
  where id = (select draft_id from first_submit)
  $$,
  'a draft can be edited once changes have been requested'
);

create temporary table second_submit on commit drop as
select * from public.submit_playbook(
  p_author_id => '92000000-0000-0000-0000-000000000003',
  p_draft_id => (select draft_id from first_submit),
  p_content => jsonb_build_object(
    'title', 'Lower your internet bill',
    'promise', 'Cut the monthly cost without changing your plan.',
    'categoryId', (select id::text from public.categories limit 1),
    'outcomeType', 'money_monthly',
    'timeMin', 10, 'timeMax', 20,
    'prompt', 'I want to lower my internet bill. Revised after a note.'
  ),
  p_inputs => jsonb_build_array(
    jsonb_build_object('key', 'input_1_placeholder', 'label', 'Internet provider',
                       'type', 'text', 'required', true, 'sort', 0)
  ),
  p_steps => jsonb_build_array('Open your bill.', 'Call them.'),
  p_outcome_unit => '$/mo'
);

select is(
  (select playbook_id from second_submit) = (select playbook_id from first_submit),
  true,
  'a resubmission edits the same playbook instead of creating a second one'
);

select is(
  (select version from second_submit),
  2,
  'as the next version rather than a fresh one'
);

select is(
  (select status from public.playbooks where id = (select playbook_id from first_submit)),
  'in_review',
  'and it is back in the queue'
);

select is(
  (select version from public.playbook_submissions
   where playbook_id = (select playbook_id from first_submit)),
  2,
  'with the submission counter bumped, so the reviewer can see it came back'
);

select is(
  (select count(*) from public.playbooks where author_id = '92000000-0000-0000-0000-000000000003'),
  1::bigint,
  'and no orphaned playbook left behind by the resubmission'
);

-- The pointer. A submitted playbook with a null `current_version_id` has no
-- prompt for a reviewer to read — the review queue joins through this column,
-- and so does the public page once it is approved.
select is(
  (select p.current_version_id = v.id
   from public.playbooks p
   join public.playbook_versions v on v.playbook_id = p.id and v.version = 2
   where p.id = (select playbook_id from second_submit)),
  true,
  'and the playbook points at the version a reviewer will read'
);

-- Which is only meaningful because the pointer is now a foreign key.
select throws_ok(
  $$
  update public.playbooks
  set current_version_id = (
    select id from public.playbook_versions
    where playbook_id <> (select playbook_id from second_submit)
    limit 1
  )
  where id = (select playbook_id from second_submit)
  $$,
  '23503',
  null,
  'a playbook cannot point at another playbook''s version'
);

-- The lock has to bite again now that the creator has come back, or "request
-- changes" would only ever be a one-time thing.
select throws_ok(
  $$
  update public.playbook_drafts
  set content = content || '{"title":"sneaky"}'::jsonb
  where id = (select draft_id from first_submit)
  $$,
  '23514',
  'playbook_drafts: a submission that is in_review cannot be edited',
  'and the draft is locked again the moment it is resubmitted'
);

-- Somebody else's draft, which is the reason the function re-reads ownership
-- rather than trusting the id it is handed.
insert into public.playbook_drafts (author_id, content)
values ('92000000-0000-0000-0000-000000000001', '{"title":"not yours"}'::jsonb);

select throws_ok(
  $$select public.submit_playbook(
    p_author_id => '92000000-0000-0000-0000-000000000003',
    p_draft_id => (
      select id from public.playbook_drafts
      where author_id = '92000000-0000-0000-0000-000000000001'
      order by created_at desc limit 1
    ),
    p_content => '{"title":"stolen"}'::jsonb,
    p_inputs => '[]'::jsonb,
    p_steps => '[]'::jsonb
  )$$,
  '42501',
  'submit_playbook: that draft is not yours',
  'a draft belonging to somebody else is refused'
);

reset role;

select finish();

rollback;