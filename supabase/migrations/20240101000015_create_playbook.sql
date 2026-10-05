-- P10b — "Create a playbook": draft storage and the review queue.
--
-- Two tables and one status value. Everything else the form needs already exists
-- (`playbook_versions`, `playbook_inputs`, `playbook_steps`, `playbook_agents`,
-- `playbook_sources`, `playbooks.author_id`); what was missing is somewhere for an
-- *unfinished* playbook to live, and somewhere for a reviewer to record a decision.
--
-- --------------------------------------------------------------------------------------
-- Why `in_review` is added to `playbooks.status`
-- --------------------------------------------------------------------------------------
--
-- The brief says a submission lands as "a playbooks row with status='in_review'".
-- The column had no such value, so the insert would have failed on the check
-- constraint — a status the queue and the public policy both need to be able to
-- tell apart. The public read policy is `status = 'published' or author_id = ... or
-- is_admin()`, so `in_review` is already invisible to the public by construction;
-- the value only has to exist.
--
-- --------------------------------------------------------------------------------------
-- Why drafts are a separate table and not a `playbooks` row
-- --------------------------------------------------------------------------------------
--
-- `playbooks` has four NOT NULL columns with no defaults that make sense for an
-- empty form: `title`, `promise`, `category_id` and `outcome_type`. A creator who
-- has typed a title and nothing else must still be able to hit "Save draft" — the
-- brief requires saving to work at every point and to work without satisfying the
-- submission rules. Writing a `playbooks` row would mean inventing a placeholder
-- title and a guessed outcome type and then having to keep them in step with the
-- JSON, so the form would hold two copies of every field and one of them would
-- eventually be wrong.
--
-- So `playbook_drafts.content` is the single writable copy while the playbook is
-- being written, and submission is the one moment it is translated into real rows.

-- --------------------------------------------------------------------------------------
-- 1. The status value
-- --------------------------------------------------------------------------------------

-- --------------------------------------------------------------------------------------
-- Why `playbooks.current_version_id` gets a foreign key here
-- --------------------------------------------------------------------------------------
--
-- It has been a bare `uuid` since the initial schema, with every reader resolving
-- it in a second query. Nothing enforced that it named a version at all, and
-- PostgREST cannot join through a column with no foreign key — so the review
-- queue, which needs the prompt and the inputs on the same row as the decision
-- buttons, had no way to fetch them together.
--
-- The constraint is on the *pair* `(id, current_version_id)`, not on
-- `current_version_id` alone, and the difference is the whole point: a plain
-- foreign key would prove the version exists while happily allowing a playbook to
-- point at another playbook's version, which is precisely the mistake that makes
-- a page show somebody else's prompt. The unique constraint it references is
-- redundant as an index and load-bearing as the target of this key.
--
-- A null `current_version_id` is not checked at all, which is right — that is an
-- imported playbook with no version yet, not a broken one.
alter table public.playbook_versions
  add constraint playbook_versions_playbook_id_id_key unique (playbook_id, id);

alter table public.playbooks
  add constraint playbooks_current_version_fkey
  foreign key (id, current_version_id)
    references public.playbook_versions (playbook_id, id);

alter table public.playbooks drop constraint playbooks_status_check;
alter table public.playbooks
  add constraint playbooks_status_check
  check (status in ('draft', 'in_review', 'published', 'archived'));

-- --------------------------------------------------------------------------------------
-- 2. The review queue
-- --------------------------------------------------------------------------------------

-- One row per submitted playbook. Re-submitting after "request changes" updates
-- this row and bumps `version`; the *history* of what was submitted lives in
-- `playbook_versions`, which only ever appends. A report cites the version its
-- reader was given, so that history is not optional and this table is explicitly
-- not it.
create table public.playbook_submissions (
  id uuid primary key default gen_random_uuid(),
  playbook_id uuid not null unique references public.playbooks (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,

  -- `in_review` is the queue's work list. `changes_requested` is the only state an
  -- author may act on: it is "fix this and send it back", which is different from
  -- both the pending state and a refusal.
  status text not null default 'in_review'
    check (status in ('in_review', 'changes_requested', 'rejected', 'approved')),

  -- Why changes were requested, or why a submission was turned down.
  --
  -- Private to the author and admins, and never rendered on the public page. The
  -- same reasoning as the report moderation note applies and for the same reason:
  -- it is prose about a named account, and publishing it beside the playbook would
  -- be a second and worse version of the same data point.
  reviewer_note text,

  -- Which version of `playbook_versions` this submission is about.
  version int not null default 1 check (version >= 1),

  submitted_at timestamptz not null default now(),
  decided_at timestamptz,

  -- A decision and its timestamp travel together. Without this, "requested changes
  -- three months ago, never resubmitted" and "requested changes today" are the same
  -- row, and the second is the one that matters.
  constraint playbook_submissions_decided check (
    (status in ('approved', 'rejected') and decided_at is not null)
    or (status = 'in_review' and decided_at is null)
    or status = 'changes_requested'
  )
);

alter table public.playbook_submissions enable row level security;

-- The author sees their own submission — that is how "My submissions" shows review
-- status and the reviewer note. Admins see all of it; that is the queue.
--
-- No client write policy at any role. Every decision is a server action that
-- re-checks the caller, so a browser cannot move a submission between states by
-- posting to PostgREST directly.
create policy "Authors and admins can read submissions"
  on public.playbook_submissions for select
  using (author_id = auth.uid() or public.is_admin());

create index playbook_submissions_status_idx on public.playbook_submissions (status);
create index playbook_submissions_author_id_idx on public.playbook_submissions (author_id);

-- --------------------------------------------------------------------------------------
-- 3. Draft storage
-- --------------------------------------------------------------------------------------

create table public.playbook_drafts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,

  -- Set when the draft is submitted, null until then. Null is the normal state for
  -- a good long while — a draft usually exists for days before anyone submits it —
  -- so the write path has to treat "no playbook yet" as ordinary rather than as a
  -- broken row.
  playbook_id uuid references public.playbooks (id) on delete cascade,

  -- Optimistic concurrency. A save carries the revision it was loaded at and the
  -- update is conditional on it, so a slow autosave that was already in flight when
  -- a second browser tab saved cannot overwrite the newer content by arriving
  -- later. See `saveDraft` for why this is not a nicety.
  revision int not null default 1 check (revision >= 1),

  content jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.playbook_drafts enable row level security;

create policy "Authors and admins can read drafts"
  on public.playbook_drafts for select
  using (author_id = auth.uid() or public.is_admin());

-- A creator may start a draft, keep their own, and remove it. `author_id` is in
-- the WITH CHECK, so a row cannot be inserted on somebody else's behalf — which is
-- the only way an INSERT-only policy can be abused.
create policy "Authors create their own drafts"
  on public.playbook_drafts for insert
  with check (author_id = auth.uid());

create policy "Authors and admins can update drafts"
  on public.playbook_drafts for update
  using (author_id = auth.uid() or public.is_admin())
  with check (author_id = auth.uid() or public.is_admin());

create policy "Authors and admins can delete drafts"
  on public.playbook_drafts for delete
  using (author_id = auth.uid() or public.is_admin());

create trigger playbook_drafts_set_updated_at
  before update on public.playbook_drafts
  for each row execute function public.set_updated_at();

create index playbook_drafts_author_id_idx on public.playbook_drafts (author_id);

-- --------------------------------------------------------------------------------------
-- 4. Review states lock the draft
-- --------------------------------------------------------------------------------------
--
-- A submission is under review, so it cannot be edited; a submission that was
-- approved or turned down is closed. The one state an author may write to is
-- `changes_requested`, which exists precisely to be written to.
--
-- Enforced here rather than only in the server action because the interesting
-- failure is not a hand-crafted request — it is the creator's own autosave, which
-- is a legitimate-looking client sending a legitimate-looking payload at a moment
-- when the answer is no. The browser cannot be trusted to have re-checked, and the
-- one moment this matters is exactly the moment nobody is looking.

create or replace function public.playbook_drafts_guard_locked()
returns trigger
language plpgsql
as $$
declare
  submission_status text;
begin
  if new.playbook_id is null then
    return new;
  end if;

  -- The one write that links a draft to its playbook *is* submission, and it
  -- happens while the submission is `in_review` — so guarding every update would
  -- refuse the act of submitting. Only writes made after the link exists are
  -- refused, which is the whole of what this trigger is for.
  if tg_op = 'UPDATE' and old.playbook_id is distinct from new.playbook_id then
    return new;
  end if;

  select s.status into submission_status
  from public.playbook_submissions s
  where s.playbook_id = new.playbook_id;

  if submission_status in ('in_review', 'approved', 'rejected') then
    raise exception
      'playbook_drafts: a submission that is % cannot be edited', submission_status
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger playbook_drafts_locked
  before insert or update on public.playbook_drafts
  for each row execute function public.playbook_drafts_guard_locked();
-- --------------------------------------------------------------------------------------
-- 5. Submitting, atomically
-- --------------------------------------------------------------------------------------
--
-- A submission writes five tables: `playbooks`, `playbook_versions`,
-- `playbook_inputs`, `playbook_steps`, `playbook_agents`, and optionally
-- `playbook_sources`, plus the draft row and the submission row. The client
-- library issues one statement per call and has no transaction, so doing this from
-- the server action would leave a playbook row whose version does not exist — a
-- page that renders with an empty prompt, which is worse than no submission at
-- all because it looks accepted.
--
-- So the multi-table write is one function, in one transaction. Two consequences
-- worth stating:
--
-- - The *shape* of the content is decided in TypeScript, not here. The caller
--   passes `p_content` (the draft as the form has it, camelCase), `p_inputs` and
--   `p_steps` already materialized by `materialize()`. Duplicating the input-key
--   and step rules in SQL would give the two implementations a chance to disagree,
--   and the disagreement would show up as an input count that does not match the
--   prompt's placeholders.
-- - `p_content`'s keys are the contract. They are named the way the form names
--   them rather than the way the columns are named, so the mapping is written out
--   explicitly below instead of being implied.
--
-- Authorization is a staleness check, not authentication — the same shape as
-- `admin_request_inbox` in migration 14, and for the same reason: this function is
-- granted to `service_role` only, and a service-role key carries no `sub`, so it
-- is handed the author id and verifies the row still says so. The granted role
-- being the application, and only the application, is the actual boundary.

create or replace function public.submit_playbook(
  p_author_id uuid,
  p_draft_id uuid,
  p_content jsonb,
  p_inputs jsonb,
  p_steps jsonb,
  p_outcome_unit text default null,
  p_source jsonb default null
)
returns table (
  playbook_id uuid,
  slug text,
  version_id uuid,
  version int,
  draft_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_content jsonb;
  v_title text;
  v_base_slug text;
  v_slug text;
  v_playbook_id uuid;
  v_version_id uuid;
  v_draft_id uuid;
  v_muse_id uuid;
  v_category_id uuid;
  v_outcome_type text;
  v_attempt int := 0;
  v_existing_playbook_id uuid;
  v_version_number int;
  v_step text;
  v_step_sort int := 0;
begin
  if p_author_id is null then
    raise exception 'submit_playbook: an author id is required'
      using errcode = 'insufficient_privilege';
  end if;

  if not exists (
    select 1 from public.profiles p where p.id = p_author_id
  ) then
    raise exception 'submit_playbook: unknown author'
      using errcode = 'foreign_key_violation';
  end if;

  v_content := coalesce(p_content, '{}'::jsonb);

  -- Ownership is settled before anything else is looked at.
  --
  -- The order is the point. Validating the payload first would mean the error a
  -- caller gets depends on what they typed rather than on who they are, and a
  -- caller holding somebody else's draft id would be told their category is
  -- missing — an answer about *their* request, from a function about *your*
  -- data. Authorization first also means the write below is the first thing this
  -- function does rather than the fourth.
  v_draft_id := nullif(p_draft_id::text, '')::uuid;

  if v_draft_id is not null and not exists (
    select 1 from public.playbook_drafts d
    where d.id = v_draft_id and d.author_id = p_author_id
  ) then
    -- Someone else's draft id, or one that does not exist. Refused rather than
    -- repaired: this function is the only writer of `playbooks.author_id`, so
    -- "repair" would mean guessing whose draft it was.
    raise exception 'submit_playbook: that draft is not yours'
      using errcode = 'insufficient_privilege';
  end if;

  v_title := coalesce(v_content ->> 'title', '');

  if btrim(v_title) = '' then
    raise exception 'submit_playbook: a title is required'
      using errcode = 'check_violation';
  end if;

  v_category_id := nullif(v_content ->> 'categoryId', '')::uuid;
  v_outcome_type := nullif(v_content ->> 'outcomeType', '');

  if v_category_id is null or v_outcome_type is null then
    raise exception 'submit_playbook: a category and a result type are required'
      using errcode = 'check_violation';
  end if;

  -- The draft is created here rather than required to exist. A creator who typed
  -- a title and pressed Submit without waiting for an autosave should not be told
  -- to go back and save first; and `nullif(..., '')` means the caller's "I have no
  -- draft" and "I have an empty draft id" are the same thing. Ownership of an
  -- existing draft was settled at the top of the function, so this is only ever
  -- the branch where there is nothing to own.
  if v_draft_id is null then
    v_draft_id := gen_random_uuid();

    insert into public.playbook_drafts (id, author_id, content)
    values (v_draft_id, p_author_id, v_content);

  else
    update public.playbook_drafts
    set content = v_content
    where id = v_draft_id;
  end if;

  -- Muse, by slug, and it has to exist. Hard-coding the uuid would make the
  -- seed data load-bearing in a way that is invisible until it breaks.
  select a.id into v_muse_id from public.agents a where a.slug = 'muse';

  if v_muse_id is null then
    raise exception 'submit_playbook: the muse agent row is missing'
      using errcode = 'no_data_found';
  end if;

  -- A resubmission edits the playbook it already has instead of creating a
  -- second one.
  --
  -- The draft is the thing the creator edits; the playbook is what a review
  -- decision attaches to. A creator who is asked for changes and comes back
  -- should end up with one playbook at version 2 — not two, one of which would sit
  -- at `in_review` for ever with nobody in the queue holding it, and whose slug
  -- would have grown a fingerprint suffix for no reason a reader could explain.
  --
  -- Only `changes_requested` qualifies. `in_review`, `approved` and `rejected` all
  -- mean the draft is locked, and `playbook_drafts_guard_locked` refuses the write
  -- that would reach them anyway; this reads the same rule so the function fails
  -- with a sentence rather than a trigger message.
  select d.playbook_id into v_existing_playbook_id
  from public.playbook_drafts d
  where d.id = v_draft_id
    and d.playbook_id is not null
    and exists (
      select 1 from public.playbook_submissions s
      where s.playbook_id = d.playbook_id and s.status = 'changes_requested'
    );

  -- Slug resolution inside the transaction. Two creators writing "Lower my
  -- internet bill" is not a rare event — the brief asks for an *outcome-first*
  -- title, and there are only so many ways to phrase an outcome. Resolving this
  -- in TypeScript and inserting the result would leave a window in which the
  -- other submission lands first and this one fails on a unique violation.
  --
  -- The suffix comes from the draft id, which is already unique, so a retry of
  -- the *same* draft lands on the same slug.
  v_base_slug := regexp_replace(
    regexp_replace(
      regexp_replace(lower(v_title), '[^a-z0-9]+', '-', 'g'),
      '^-+', '', 'g'
    ),
    '-+$', '', 'g'
  );

  if v_base_slug = '' then
    raise exception 'submit_playbook: the title cannot be turned into a web address'
      using errcode = 'check_violation';
  end if;

  if v_existing_playbook_id is not null then
    -- Keep the slug. Changing it would break any link already sent to the
    -- creator's reviewer and leave a redirect nobody asked for; the title can
    -- change freely, the address does not.
    select p.slug into v_slug from public.playbooks p where p.id = v_existing_playbook_id;

    update public.playbooks
    set title = btrim(v_title),
        promise = btrim(coalesce(v_content ->> 'promise', '')),
        category_id = v_category_id,
        status = 'in_review',
        who_for = nullif(btrim(coalesce(v_content ->> 'whoFor', '')), ''),
        who_not_for = nullif(btrim(coalesce(v_content ->> 'whoNotFor', '')), ''),
        time_min = (v_content ->> 'timeMin')::int,
        time_max = (v_content ->> 'timeMax')::int,
        outcome_type = v_outcome_type,
        outcome_unit = p_outcome_unit,
        updated_at = now()
    where id = v_existing_playbook_id;

    v_playbook_id := v_existing_playbook_id;

    -- Read rather than count: `count(*)` would be one short the moment an insert
    -- and a delete raced, and the version number is what reports cite.
    select coalesce(max(v.version), 0) + 1 into v_version_number
    from public.playbook_versions v
    where v.playbook_id = v_playbook_id;

  else
    v_slug := v_base_slug;

    while exists (select 1 from public.playbooks p where p.slug = v_slug) loop
      v_attempt := v_attempt + 1;
      v_slug := v_base_slug || '-' || substr(replace(v_draft_id::text, '-', ''), 1, 6)
        || case when v_attempt > 1 then '-' || v_attempt::text else '' end;
    end loop;

    insert into public.playbooks (
      slug, title, promise, category_id, status, who_for, who_not_for,
      time_min, time_max, outcome_type, outcome_unit, required_capability,
      report_fields, followup_days, primary_agent_id, author_id, tags
    )
    values (
      v_slug,
      btrim(v_title),
      btrim(coalesce(v_content ->> 'promise', '')),
      v_category_id,
      'in_review',
      nullif(btrim(coalesce(v_content ->> 'whoFor', '')), ''),
      nullif(btrim(coalesce(v_content ->> 'whoNotFor', '')), ''),
      (v_content ->> 'timeMin')::int,
      (v_content ->> 'timeMax')::int,
      v_outcome_type,
      p_outcome_unit,
      'info',
      '{}'::jsonb,
      7,
      v_muse_id,
      p_author_id,
      '{}'::text[]
    )
    returning id into v_playbook_id;

    v_version_number := 1;
  end if;

  insert into public.playbook_versions (playbook_id, version, prompt_template, changelog)
  values (v_playbook_id, v_version_number, coalesce(v_content ->> 'prompt', ''), 'Submitted for review')
  returning id into v_version_id;

  -- The pointer moves here rather than in the insert above, because the version
  -- does not exist until this statement returns. A submitted playbook with a null
  -- `current_version_id` would have no prompt for a reviewer to read — the review
  -- queue joins through that column, and so does the public page.
  update public.playbooks
  set current_version_id = v_version_id
  where id = v_playbook_id;

  -- Inputs, in the order the caller materialized them. `sort` is taken from the
  -- payload rather than from array position so the order is decided in one place.
  insert into public.playbook_inputs (
    version_id, key, label, type, options, required, sort, help, why_it_helps
  )
  select
    v_version_id,
    element ->> 'key',
    element ->> 'label',
    element ->> 'type',
    coalesce(element -> 'options', '[]'::jsonb),
    coalesce((element ->> 'required')::boolean, false),
    coalesce((element ->> 'sort')::int, 0),
    element ->> 'help',
    element ->> 'why_it_helps'
  from jsonb_array_elements(coalesce(p_inputs, '[]'::jsonb)) as element;

  -- `ordinality` rather than `sort` from the payload: the steps table's
  -- `unique (version_id, sort)` constraint would turn a duplicated payload sort
  -- into a failed submission, and a blank optional step the caller already
  -- dropped should not be able to take a submission down at this point.
  for v_step, v_step_sort in
    select value, ordinality - 1
    from jsonb_array_elements_text(coalesce(p_steps, '[]'::jsonb)) with ordinality
  loop
    if btrim(v_step) <> '' then
      insert into public.playbook_steps (version_id, sort, body)
      values (v_version_id, v_step_sort, btrim(v_step));
    end if;
  end loop;

  -- `tested` is false, and that is the interesting decision.
  --
  -- The column means "the *site* has verified this playbook works with this
  -- agent" — it is what the admin page reads to decide whether a playbook can be
  -- recommended for an agent at all. A creator writing "what result did you get"
  -- is reporting their own experience, and the brief is explicit that it must
  -- never become site verification, a report, or a savings statistic. So the
  -- account goes in `notes`, which the admin can read, and `tested` is left for
  -- an administrator to set when they are satisfied.
  insert into public.playbook_agents (playbook_id, agent_id, tested, notes)
  values (
    v_playbook_id,
    v_muse_id,
    false,
    nullif(btrim(coalesce(v_content ->> 'testingNotes', '')), '')
  )
  -- `tested` is deliberately left out of the update. It is a claim the *site*
  -- makes, and a creator coming back with a revised prompt does not get to clear
  -- it by resubmitting — nor should a resubmission silently keep an admin's
  -- verification of content that has since changed; that is a judgement for the
  -- admin queue, which can see that a new version arrived.
  --
  -- `on conflict on constraint` for the same reason as the submission upsert
  -- below: `playbook_id` is an output column of this function, so every such name
  -- is a PL/pgSQL variable in scope for the whole body and the column-list form
  -- resolves to the variable instead.
  on conflict on constraint playbook_agents_pkey do update
    set notes = excluded.notes;

  -- The inspiration link. `platform` is `other` for everything a creator pastes
  -- in, because the brief says to "accept valid http/https links from other sites
  -- too" — so this is not a lookup table, it is the one bucket for every host that
  -- is not one of the four named platforms.
  --
  -- Replaced rather than appended to, and deleted even when the new submission
  -- has no link at all: a resubmission is the creator correcting their own work,
  -- so the previous link is the wrong one, and leaving it would show a reader two
  -- "inspired by" links pointing at different places.
  if v_existing_playbook_id is not null then
    -- Aliased because a bare `where playbook_id = ...` resolves to this
    -- function's output column, which is in scope for the whole body — the same
    -- trap as the upsert below, and the same reason the constraint is named.
    delete from public.playbook_sources s where s.playbook_id = v_playbook_id;
  end if;

  if p_source is not null and btrim(coalesce(p_source ->> 'url', '')) <> '' then
    insert into public.playbook_sources (playbook_id, platform, url)
    values (v_playbook_id, 'other', btrim(p_source ->> 'url'));
  end if;

  -- The draft is linked *before* the submission is touched, and that order is the
  -- whole reason a resubmission is possible at all.
  --
  -- `playbook_drafts_guard_locked` refuses any write to a draft whose submission
  -- is `in_review`, `approved` or `rejected` — and the first submit is exactly the
  -- write that puts it there. Linking first means the guard sees the state the
  -- draft is leaving, not the state this function is creating.
  update public.playbook_drafts
  set playbook_id = v_playbook_id, revision = revision + 1
  where id = v_draft_id;

  -- One submission row per playbook: resubmission updates this and bumps the
  -- version, while `playbook_versions` keeps what each reader was actually given.
  --
  -- `on conflict on constraint` rather than `on conflict (playbook_id)`: every
  -- name in `returns table` is a PL/pgSQL variable in scope for the whole body,
  -- so the column-list form resolves `playbook_id` to the output parameter and
  -- Postgres refuses with "column reference is ambiguous". Naming the constraint
  -- sidesteps that, and survives a future return column called `version` too.
  insert into public.playbook_submissions (playbook_id, author_id, status, version)
  values (v_playbook_id, p_author_id, 'in_review', 1)
  on conflict on constraint playbook_submissions_playbook_id_key do update
    set status = 'in_review',
        version = public.playbook_submissions.version + 1,
        reviewer_note = null,
        decided_at = null,
        submitted_at = now();

  return query select v_playbook_id, v_slug, v_version_id, v_version_number, v_draft_id;
end;
$$;

-- By role name, not `from public`. Migration 13 revoked from `public` and believed
-- it had narrowed the grant; it had not, because Supabase's default privileges
-- write explicit `anon` and `authenticated` EXECUTE entries when the function is
-- created. This is asserted directly in `supabase/tests/007_p10b_create.sql`.
revoke all on function public.submit_playbook(uuid, uuid, jsonb, jsonb, jsonb, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.submit_playbook(uuid, uuid, jsonb, jsonb, jsonb, text, jsonb)
  to service_role;
