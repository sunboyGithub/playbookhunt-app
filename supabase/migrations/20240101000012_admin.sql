-- P10: what an administrator is allowed to leave behind.
--
-- Three things, and each of them exists because a queue without it is a queue
-- that quietly lies. The log of who did what, the state a request is in once
-- somebody has looked at it, and the reason a report was thrown out — a reason
-- that is read by moderators and by nobody else, because a rejection nobody can
-- understand is a rejection of the wrong report.

-- ===========================================================================
-- The audit log
-- ===========================================================================

-- Written by every admin action, read by admins, and writable by nobody.
--
-- There is no INSERT policy here on purpose, and no insert grant either: the
-- only writer is the server, through `writeAdminAction`, with the service-role
-- client. An admin who can write the log describing their own actions can edit
-- what they did, which is the one thing a log exists to prevent — so the table
-- is append-only to every role, including the administrators reading it. The
-- cost is that the log has no self-service UI for corrections, which is the
-- correct cost: a mistake in the log is a problem to escalate, not to patch.
create table public.admin_actions (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.profiles (id) on delete cascade,
  -- A dotted verb the reader can sort by: 'report.approve', 'playbook.edit'.
  -- Free text, because the set of things an admin can do is still growing and a
  -- check constraint here would be a migration every time it does.
  action text not null,
  -- What it was done to, in the form the action already knows: a playbook slug,
  -- a report id, a request id. Not a foreign key, deliberately — the log has to
  -- survive the row it describes being deleted, or "who removed this" becomes
  -- unanswerable exactly when it is asked.
  target text not null,
  -- Whatever the action needs to be reconstructible. Never anything the caller
  -- supplied as free text that a reader already saw: see moderation_note.
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.admin_actions enable row level security;

-- Read-only even to admins, and so RLS is doing exactly one job.
create policy "Admins read the audit log"
  on public.admin_actions for select using (public.is_admin());

-- The one hard deletion case: an admin who deleted the account the log names.
-- Without this the profile delete cascades and takes the record of what that
-- person did with the site, which is the opposite of what an audit log is for.
create policy "Admins delete their own audit rows"
  on public.admin_actions for delete using (admin_id = auth.uid());

create index admin_actions_created_at_idx on public.admin_actions (created_at desc);
create index admin_actions_target_idx on public.admin_actions (target);

revoke insert, update, delete on public.admin_actions from anon, authenticated;

-- ===========================================================================
-- Request triage
-- ===========================================================================

-- A request that has been seen is not the same as a request that has not. Left
-- to created_at alone the inbox is a wall of everything ever asked for, with no
-- way to answer "which of these am I actually building".
--
-- `planned` and `done` rather than a boolean, because the third state is the
-- one people need: a request that has been decided against is still worth
-- remembering, and a two-state flag would make "we are not building this" look
-- the same as "we have not got to this yet".
alter table public.playbook_requests
  add column status text not null default 'new'
    check (status in ('new', 'planned', 'done'));

-- When it was decided, which is what separates "planned last month and never
-- built" from "planned and shipped" in the inbox itself.
alter table public.playbook_requests
  add column decided_at timestamptz;

create index playbook_requests_status_created_idx
  on public.playbook_requests (status, created_at desc);

-- The brief asks for requests grouped by similar query, which is
-- `similarity(query, ...)` from pg_trgm — so the index has to exist for that to
-- be a lookup rather than a full scan of every request ever filed.
create index playbook_requests_query_trgm_idx
  on public.playbook_requests using gin (query gin_trgm_ops);

-- ===========================================================================
-- Why a report was rejected
-- ===========================================================================

-- Private. The public report view projects a fixed column list, so this cannot
-- reach a reader even though the table is readable to admins, and it is not
-- added to the view deliberately: "this report was rejected because the amount
-- was a guess" is an accusation about a named person's account, and publishing
-- it beside the report they filed would be a second, worse version of the same
-- data point.
--
-- Nullable, and not cleared when the report is approved again — an approval
-- that erases why it was rejected cannot be reasoned about later.
alter table public.outcome_reports
  add column moderation_note text;

comment on column public.outcome_reports.moderation_note is
  'Private reason for a rejection or an outlier flag. Never projected into public_reports.';

-- The same for evidence, which has the same audience problem and a smaller
-- surface: a rejected file is a file the reporter chose to send.
alter table public.report_evidence
  add column review_note text;