-- Playbook Hunt — initial schema.
--
-- Everything here is also applied to production by `supabase db push`, so this
-- file is the single source of truth for the database. Taxonomy seed data lives
-- in the following migration.

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;
create extension if not exists citext;

-- ===========================================================================
-- Shared helpers
-- ===========================================================================

-- Admin checks run inside RLS policies, which execute as the calling role. A
-- plain `select role from profiles` would recurse through the profiles policy,
-- so this has to be SECURITY DEFINER and has to be owned by the migration role
-- (which bypasses RLS).
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ===========================================================================
-- Profiles
-- ===========================================================================

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  handle citext unique,
  display_name text,
  avatar_url text,
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Profiles are publicly readable"
  on public.profiles for select using (true);

-- A user may edit their own profile but must not promote themselves: the role
-- column is revoked below, so this policy cannot be used to become an admin.
create policy "Users can update their own profile"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- No set_updated_at trigger here on purpose: profiles has created_at only, per
-- the brief. Adding one would make every signup fail, because the function
-- assigns a column the table does not have.

-- Defined here rather than with the other helpers because its body references
-- public.profiles, and Postgres validates a function body at creation time.
--
-- Admin checks run inside RLS policies, which execute as the calling role. A
-- plain `select role from profiles` would recurse through the profiles select
-- policy, so this has to be SECURITY DEFINER and owned by the migration role
-- (which bypasses RLS).
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated, anon;

-- Signup trigger. handle is derived from the email local part so the unique
-- index cannot collide on two accounts created with the same address prefix.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base text;
begin
  base := regexp_replace(
    coalesce(new.raw_user_meta_data ->> 'handle', split_part(new.email, '@', 1), 'member'),
    '[^a-zA-Z0-9_]', '', 'g'
  );
  if base = '' then
    base := 'member';
  end if;

  insert into public.profiles (id, handle, display_name)
  values (
    new.id,
    base || '_' || substr(replace(new.id::text, '-', ''), 1, 6),
    coalesce(new.raw_user_meta_data ->> 'display_name', new.raw_user_meta_data ->> 'full_name')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ===========================================================================
-- Taxonomy
-- ===========================================================================

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  slug citext unique not null,
  name text not null,
  emoji text not null,
  description text,
  sort int not null default 0
);

create table public.agents (
  id uuid primary key default gen_random_uuid(),
  slug citext unique not null,
  display_name text not null,
  vendor text,
  prompt_format text,
  -- Left null until each vendor's prefill support is verified. AGENTS.md says to
  -- copy the prompt and open the home page rather than guess a URL scheme.
  launch_url_template text,
  home_url text,
  capabilities text[] not null default '{}',
  status text not null default 'active'
    check (status in ('active', 'coming_soon', 'hidden')),
  sort int not null default 0,
  constraint agents_capabilities_valid
    check (capabilities <@ array['info', 'web_actions', 'phone_calls'])
);

alter table public.categories enable row level security;
alter table public.agents enable row level security;

create policy "Categories are publicly readable"
  on public.categories for select using (true);
create policy "Agents are publicly readable"
  on public.agents for select using (true);
-- Taxonomy is data-driven but only an admin edits it; no client write policies.

-- ===========================================================================
-- Playbooks
-- ===========================================================================

create table public.playbooks (
  id uuid primary key default gen_random_uuid(),
  slug citext unique not null,
  title text not null,
  promise text not null,
  category_id uuid not null references public.categories (id),
  status text not null default 'draft'
    check (status in ('draft', 'published', 'archived')),
  who_for text,
  who_not_for text,
  time_min int check (time_min is null or time_min >= 0),
  time_max int check (time_max is null or time_max >= 0),
  outcome_type text not null
    check (outcome_type in ('money_monthly', 'money_yearly', 'money_once', 'time_hours', 'binary')),
  outcome_unit text,
  required_capability text not null default 'info'
    check (required_capability in ('info', 'web_actions', 'phone_calls')),
  report_fields jsonb not null default '{}'::jsonb,
  followup_days int not null default 7,
  preview_image_url text,
  primary_agent_id uuid references public.agents (id),
  author_id uuid references public.profiles (id) on delete set null,
  current_version_id uuid,
  last_verified_at timestamptz,
  tags text[] not null default '{}',
  search_tsv tsvector,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint playbooks_time_ordered check (time_max is null or time_min is null or time_max >= time_min)
);

alter table public.playbooks enable row level security;

-- Published playbooks are public. Everything else — drafts and archived rows
-- — is visible to its author and to admins only.
create policy "Published playbooks are publicly readable"
  on public.playbooks for select
  using (
    status = 'published'
    or author_id = auth.uid()
    or public.is_admin()
  );

-- Only admins create or change playbooks. Authoring runs through the import
-- script (service role) and P10b's review queue.
create policy "Admins manage playbooks"
  on public.playbooks for all
  using (public.is_admin())
  with check (public.is_admin());

create index playbooks_category_id_idx on public.playbooks (category_id);
create index playbooks_primary_agent_id_idx on public.playbooks (primary_agent_id);
create index playbooks_author_id_idx on public.playbooks (author_id);
create index playbooks_status_idx on public.playbooks (status);
create index playbooks_search_tsv_idx on public.playbooks using gin (search_tsv);
create index playbooks_title_trgm_idx on public.playbooks using gin (title gin_trgm_ops);
create index playbooks_tags_idx on public.playbooks using gin (tags);

create trigger playbooks_set_updated_at
  before update on public.playbooks
  for each row execute function public.set_updated_at();

-- search_tsv spans columns on this table plus the joined category name, so it
-- cannot be a generated column — it is maintained by this trigger.
create or replace function public.playbooks_refresh_search()
returns trigger
language plpgsql
as $$
declare
  category_name text;
begin
  select c.name into category_name
  from public.categories c
  where c.id = new.category_id;

  new.search_tsv :=
    setweight(to_tsvector('english', coalesce(new.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(new.promise, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(new.who_for, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(array_to_string(new.tags, ' '), '')), 'C') ||
    setweight(to_tsvector('english', coalesce(category_name, '')), 'B');

  return new;
end;
$$;

create trigger playbooks_search_tsv
  before insert or update of title, promise, who_for, tags, category_id
  on public.playbooks
  for each row execute function public.playbooks_refresh_search();

create or replace function public.categories_refresh_playbook_search()
returns trigger
language plpgsql
as $$
begin
  update public.playbooks p
  set category_id = p.category_id
  where p.category_id = coalesce(new.id, old.id);
  return null;
end;
$$;

create trigger categories_refresh_search
  after update of name on public.categories
  for each row execute function public.categories_refresh_playbook_search();

-- ===========================================================================
-- Playbook content
-- ===========================================================================

create table public.playbook_versions (
  id uuid primary key default gen_random_uuid(),
  playbook_id uuid not null references public.playbooks (id) on delete cascade,
  version int not null check (version >= 1),
  prompt_template text not null,
  changelog text,
  created_at timestamptz not null default now(),
  unique (playbook_id, version)
);

alter table public.playbook_versions enable row level security;

-- A version is public exactly when its playbook is published. `current_version_id`
-- and the RLS policies below cannot reference each other circularly, so the join
-- is written out.
create policy "Versions of published playbooks are publicly readable"
  on public.playbook_versions for select
  using (
    exists (
      select 1 from public.playbooks p
      where p.id = playbook_id and p.status = 'published'
    )
    or public.is_admin()
  );

create policy "Admins manage versions"
  on public.playbook_versions for all
  using (public.is_admin())
  with check (public.is_admin());

create index playbook_versions_playbook_id_idx on public.playbook_versions (playbook_id);

create table public.playbook_inputs (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.playbook_versions (id) on delete cascade,
  key text not null,
  label text not null,
  help text,
  why_it_helps text,
  type text not null check (
    type in ('text', 'textarea', 'select', 'number', 'money', 'zip', 'provider_picker', 'date')
  ),
  options jsonb not null default '{}'::jsonb,
  required boolean not null default false,
  sort int not null default 0,
  -- AGENTS.md caps the ask on the reader. Enforced here rather than in the app
  -- so a bad import cannot slip past.
  constraint playbook_inputs_key_unique unique (version_id, key)
);

alter table public.playbook_inputs enable row level security;

create policy "Inputs of published playbooks are publicly readable"
  on public.playbook_inputs for select
  using (
    exists (
      select 1
      from public.playbook_versions v
      join public.playbooks p on p.id = v.playbook_id
      where v.id = version_id and p.status = 'published'
    )
    or public.is_admin()
  );

create policy "Admins manage inputs"
  on public.playbook_inputs for all
  using (public.is_admin())
  with check (public.is_admin());

create index playbook_inputs_version_id_idx on public.playbook_inputs (version_id);

-- At most two required inputs per version, across all rows.
create or replace function public.playbook_inputs_cap_required()
returns trigger
language plpgsql
as $$
declare
  required_count int;
begin
  if not new.required then
    return new;
  end if;

  -- Excludes the row being updated, so re-saving an already-required input does
  -- not count it against the cap twice.
  select count(*) into required_count
  from public.playbook_inputs
  where version_id = new.version_id and required and id <> new.id;

  if required_count >= 2 then
    raise exception
      'a playbook version may have at most 2 required inputs (attempted a third on version %)',
      new.version_id
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger playbook_inputs_cap_required
  before insert or update of required on public.playbook_inputs
  for each row execute function public.playbook_inputs_cap_required();

create table public.playbook_steps (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.playbook_versions (id) on delete cascade,
  sort int not null default 0,
  body text not null,
  unique (version_id, sort)
);

alter table public.playbook_steps enable row level security;

create policy "Steps of published playbooks are publicly readable"
  on public.playbook_steps for select
  using (
    exists (
      select 1
      from public.playbook_versions v
      join public.playbooks p on p.id = v.playbook_id
      where v.id = version_id and p.status = 'published'
    )
    or public.is_admin()
  );

create policy "Admins manage steps"
  on public.playbook_steps for all
  using (public.is_admin())
  with check (public.is_admin());

create index playbook_steps_version_id_idx on public.playbook_steps (version_id);

create table public.playbook_agents (
  playbook_id uuid not null references public.playbooks (id) on delete cascade,
  agent_id uuid not null references public.agents (id) on delete cascade,
  tested boolean not null default false,
  notes text,
  primary key (playbook_id, agent_id)
);

alter table public.playbook_agents enable row level security;

create policy "Agent links of published playbooks are publicly readable"
  on public.playbook_agents for select
  using (
    exists (
      select 1 from public.playbooks p
      where p.id = playbook_id and p.status = 'published'
    )
    or public.is_admin()
  );

create policy "Admins manage agent links"
  on public.playbook_agents for all
  using (public.is_admin())
  with check (public.is_admin());

create index playbook_agents_agent_id_idx on public.playbook_agents (agent_id);

create table public.playbook_sources (
  id uuid primary key default gen_random_uuid(),
  playbook_id uuid not null references public.playbooks (id) on delete cascade,
  platform text not null check (platform in ('x', 'threads', 'reddit', 'rednote', 'other')),
  handle text,
  url text,
  title text
);

alter table public.playbook_sources enable row level security;

create policy "Sources of published playbooks are publicly readable"
  on public.playbook_sources for select
  using (
    exists (
      select 1 from public.playbooks p
      where p.id = playbook_id and p.status = 'published'
    )
    or public.is_admin()
  );

create policy "Admins manage sources"
  on public.playbook_sources for all
  using (public.is_admin())
  with check (public.is_admin());

create index playbook_sources_playbook_id_idx on public.playbook_sources (playbook_id);

-- ===========================================================================
-- Collections and use cases
-- ===========================================================================

create table public.collections (
  id uuid primary key default gen_random_uuid(),
  slug citext unique not null,
  title text not null,
  blurb text,
  illustration_url text,
  is_featured boolean not null default false,
  sort int not null default 0
);

alter table public.collections enable row level security;
create policy "Collections are publicly readable"
  on public.collections for select using (true);
create policy "Admins manage collections"
  on public.collections for all using (public.is_admin()) with check (public.is_admin());

create table public.collection_items (
  collection_id uuid not null references public.collections (id) on delete cascade,
  playbook_id uuid not null references public.playbooks (id) on delete cascade,
  sort int not null default 0,
  primary key (collection_id, playbook_id)
);

alter table public.collection_items enable row level security;
create policy "Collection items are publicly readable"
  on public.collection_items for select using (true);
create policy "Admins manage collection items"
  on public.collection_items for all using (public.is_admin()) with check (public.is_admin());
create index collection_items_playbook_id_idx on public.collection_items (playbook_id);

create table public.use_cases (
  id uuid primary key default gen_random_uuid(),
  slug citext unique not null,
  title text not null,
  description text,
  gradient_from text not null,
  gradient_to text not null,
  sort int not null default 0
);

alter table public.use_cases enable row level security;
create policy "Use cases are publicly readable"
  on public.use_cases for select using (true);
create policy "Admins manage use cases"
  on public.use_cases for all using (public.is_admin()) with check (public.is_admin());

create table public.use_case_items (
  use_case_id uuid not null references public.use_cases (id) on delete cascade,
  playbook_id uuid not null references public.playbooks (id) on delete cascade,
  sort int not null default 0,
  primary key (use_case_id, playbook_id)
);

alter table public.use_case_items enable row level security;
create policy "Use case items are publicly readable"
  on public.use_case_items for select using (true);
create policy "Admins manage use case items"
  on public.use_case_items for all using (public.is_admin()) with check (public.is_admin());
create index use_case_items_playbook_id_idx on public.use_case_items (playbook_id);

-- ===========================================================================
-- Try events and reports
-- ===========================================================================

create table public.try_events (
  id uuid primary key default gen_random_uuid(),
  playbook_id uuid not null references public.playbooks (id) on delete cascade,
  version_id uuid references public.playbook_versions (id) on delete set null,
  agent_id uuid references public.agents (id) on delete set null,
  user_id uuid references public.profiles (id) on delete set null,
  device_id text not null,
  action text not null check (action in ('started', 'copied', 'opened')),
  created_at timestamptz not null default now()
);

alter table public.try_events enable row level security;

-- Anonymous visitors may log a try; the log itself is admin-only, so nothing
-- here is readable by the person who wrote it.
create policy "Anyone may log a try event"
  on public.try_events for insert to anon, authenticated
  with check (true);

create policy "Admins read try events"
  on public.try_events for select using (public.is_admin());

create index try_events_playbook_id_created_at_idx
  on public.try_events (playbook_id, created_at desc);
create index try_events_device_id_idx on public.try_events (device_id);

create table public.outcome_reports (
  id uuid primary key default gen_random_uuid(),
  playbook_id uuid not null references public.playbooks (id) on delete cascade,
  version_id uuid not null references public.playbook_versions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  agent_id uuid references public.agents (id) on delete set null,
  result text not null check (result in ('worked', 'partly', 'didnt')),
  amount numeric,
  unit text,
  hours_saved numeric,
  time_spent_bucket text check (
    time_spent_bucket in ('lt15', '15_30', '30_60', '1_2h', '2h_plus')
  ),
  provider text,
  region text,
  note text,
  referral_code text,
  -- Everything below is moderation state. These columns are explicitly revoked
  -- from client roles so a reporter cannot approve, weight or de-weight
  -- themselves. See the grants at the end of this migration.
  status text not null default 'approved' check (status in ('pending', 'approved', 'rejected')),
  is_verified boolean not null default false,
  is_outlier boolean not null default false,
  weight numeric not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, version_id)
);

alter table public.outcome_reports enable row level security;

create policy "Approved reports are publicly readable"
  on public.outcome_reports for select
  using (status = 'approved' or public.is_admin());

-- A report can only be written for yourself. Column grants keep the moderation
-- columns out of reach.
create policy "Users insert their own reports"
  on public.outcome_reports for insert to authenticated
  with check (user_id = auth.uid());

-- Edits are allowed for 24 hours, which is when the numbers behind the median
-- are most likely to be a typo.
create policy "Users update their own reports within 24h"
  on public.outcome_reports for update to authenticated
  using (user_id = auth.uid() and created_at > now() - interval '24 hours')
  with check (user_id = auth.uid());

create policy "Users delete their own reports within 24h"
  on public.outcome_reports for delete to authenticated
  using (user_id = auth.uid() and created_at > now() - interval '24 hours');

create policy "Admins manage reports"
  on public.outcome_reports for all
  using (public.is_admin())
  with check (public.is_admin());

create index outcome_reports_playbook_id_created_at_idx
  on public.outcome_reports (playbook_id, created_at desc);
create index outcome_reports_user_id_idx on public.outcome_reports (user_id);
create index outcome_reports_version_id_idx on public.outcome_reports (version_id);
create index outcome_reports_status_idx on public.outcome_reports (status);

create trigger outcome_reports_set_updated_at
  before update on public.outcome_reports
  for each row execute function public.set_updated_at();

-- Public reads must not expose who reported what. The table's user_id column is
-- ungranted to anon (see the column grants below), so this view is the only
-- route to report data and it emits a display name and initial instead.
--
-- Deliberately NOT `security_invoker`. An invoker view would run as anon, which
-- cannot read user_id and so could not evaluate its own join — and granting it
-- that column to make the view work would hand the identity back. A
-- security-definer view runs as its owner, so the join resolves server-side and
-- anon only ever selects the derived columns. The view carries its own
-- `status = 'approved'` filter in place of the table's RLS.
create view public.public_reports
as
select
  r.id,
  r.playbook_id,
  r.version_id,
  r.agent_id,
  r.result,
  r.amount,
  r.unit,
  r.hours_saved,
  r.time_spent_bucket,
  r.provider,
  r.region,
  r.note,
  r.is_verified,
  r.created_at,
  coalesce(p.display_name, 'A Playbook Hunt member') as display_name,
  upper(left(coalesce(p.display_name, 'A Playbook Hunt member'), 1)) as display_initial
from public.outcome_reports r
left join public.profiles p on p.id = r.user_id
where r.status = 'approved';

grant select on public.public_reports to anon, authenticated;

-- One referral code per user, shown only on verified reports. Enforced here
-- rather than in the UI so a second code cannot be stored via the API.
create unique index outcome_reports_one_referral_per_user
  on public.outcome_reports (user_id)
  where referral_code is not null;

-- Ownership check for evidence. Same reason as is_admin(): the policy body
-- needs outcome_reports.user_id, which is deliberately ungranted to client
-- roles so it cannot be read directly. Resolving it in a SECURITY DEFINER
-- function keeps the column unreadable while still letting the policy ask the
-- question it needs answered.
create or replace function public.owns_report(p_report_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.outcome_reports r
    where r.id = p_report_id and r.user_id = auth.uid()
  );
$$;

revoke all on function public.owns_report(uuid) from public;
grant execute on function public.owns_report(uuid) to authenticated;

create table public.report_evidence (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.outcome_reports (id) on delete cascade,
  storage_path text not null,
  kind text not null check (kind in ('image', 'pdf')),
  review_status text not null default 'pending'
    check (review_status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

alter table public.report_evidence enable row level security;

-- Private by construction: the uploader and admins only. There is no public
-- select policy at all, and v1 never renders evidence on a public page.
-- Scoped to authenticated deliberately: the policy body joins outcome_reports,
-- whose user_id column anon cannot read. Left unscoped it applies to PUBLIC,
-- so anon evaluates the subquery and gets a permission error instead of an
-- empty result — which is both a confusing error and a needless check.
create policy "Reporters read their own evidence"
  on public.report_evidence for select to authenticated
  using (public.owns_report(report_id) or public.is_admin());

create policy "Reporters attach evidence to their own reports"
  on public.report_evidence for insert to authenticated
  with check (public.owns_report(report_id));

create policy "Admins manage evidence"
  on public.report_evidence for all
  using (public.is_admin())
  with check (public.is_admin());

create index report_evidence_report_id_idx on public.report_evidence (report_id);

create table public.followups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  playbook_id uuid not null references public.playbooks (id) on delete cascade,
  try_event_id uuid references public.try_events (id) on delete set null,
  due_at timestamptz not null,
  sent_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.followups enable row level security;
create policy "Users read their own follow-ups"
  on public.followups for select using (user_id = auth.uid() or public.is_admin());
create policy "Admins manage follow-ups"
  on public.followups for all using (public.is_admin()) with check (public.is_admin());
create index followups_user_id_idx on public.followups (user_id);
create index followups_due_at_idx on public.followups (due_at) where sent_at is null;

create table public.playbook_requests (
  id uuid primary key default gen_random_uuid(),
  query text not null,
  email text,
  user_id uuid references public.profiles (id) on delete set null,
  -- Readable context for the admin queue. /request stores topic and purpose
  -- alongside the free text so a request can be triaged without guessing.
  topic text,
  purpose text,
  pathname text,
  created_at timestamptz not null default now()
);

alter table public.playbook_requests enable row level security;

-- Anyone may submit a request; nobody but an admin may read them.
create policy "Anyone may submit a request"
  on public.playbook_requests for insert to anon, authenticated
  with check (true);
create policy "Admins read requests"
  on public.playbook_requests for select using (public.is_admin());
create policy "Admins manage requests"
  on public.playbook_requests for update using (public.is_admin()) with check (public.is_admin());
create policy "Admins delete requests"
  on public.playbook_requests for delete using (public.is_admin());

create table public.saves (
  user_id uuid not null references public.profiles (id) on delete cascade,
  playbook_id uuid not null references public.playbooks (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, playbook_id)
);

alter table public.saves enable row level security;
create policy "Users read their own saves"
  on public.saves for select using (user_id = auth.uid() or public.is_admin());
create policy "Users manage their own saves"
  on public.saves for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create index saves_playbook_id_idx on public.saves (playbook_id);

-- ===========================================================================
-- Aggregates
-- ===========================================================================

-- One row per playbook, written by the P9 aggregation job. read_only here: the
-- numbers are derived, never edited by hand.
create table public.playbook_stats (
  playbook_id uuid primary key references public.playbooks (id) on delete cascade,
  tried_count int not null default 0,
  report_count int not null default 0,
  worked int not null default 0,
  partly int not null default 0,
  didnt int not null default 0,
  success_rate_raw numeric,
  wilson_lb numeric,
  median_amount numeric,
  p25 numeric,
  p75 numeric,
  amount_n int not null default 0,
  last30_success numeric,
  evidence_score numeric not null default 0,
  trending_score numeric not null default 0,
  last_report_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.playbook_stats enable row level security;
create policy "Stats are publicly readable"
  on public.playbook_stats for select using (true);
create policy "Admins manage stats"
  on public.playbook_stats for all using (public.is_admin()) with check (public.is_admin());

create index playbook_stats_evidence_score_idx
  on public.playbook_stats (evidence_score desc);
create index playbook_stats_trending_score_idx
  on public.playbook_stats (trending_score desc);

-- ===========================================================================
-- Phase 2 stubs
-- ===========================================================================

-- No UI in v1. Present so phase 2 does not need a schema migration, and so the
-- non-negotiable ranking rule can be enforced structurally: nothing in the
-- ranking pipeline reads this table.
create table public.referral_links (
  id uuid primary key default gen_random_uuid(),
  playbook_id uuid not null references public.playbooks (id) on delete cascade,
  creator_id uuid not null references public.profiles (id) on delete cascade,
  agent_id uuid references public.agents (id) on delete set null,
  url text not null,
  label text,
  created_at timestamptz not null default now()
);

alter table public.referral_links enable row level security;
create policy "Admins manage referral links"
  on public.referral_links for all using (public.is_admin()) with check (public.is_admin());
create index referral_links_playbook_id_idx on public.referral_links (playbook_id);

create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  email text,
  message text not null,
  -- Pathname only. Query strings and fragments are stripped before insert
  -- because they can carry a search term or an email.
  pathname text,
  status text not null default 'new' check (status in ('new', 'reviewed', 'closed')),
  created_at timestamptz not null default now()
);

alter table public.feedback enable row level security;
create policy "Anyone may submit feedback"
  on public.feedback for insert to anon, authenticated with check (true);
create policy "Admins read feedback"
  on public.feedback for select using (public.is_admin());
create policy "Admins manage feedback"
  on public.feedback for update using (public.is_admin()) with check (public.is_admin());
create policy "Admins delete feedback"
  on public.feedback for delete using (public.is_admin());

-- ===========================================================================
-- Column grants
-- ===========================================================================
--
-- RLS policies say which *rows* a role may touch. These say which *columns*.
-- Without this a reporter could set status/is_verified/is_outlier/weight in the
-- body of their own insert and approve their own evidence, or set role='admin'
-- in a profile update.

revoke update on public.profiles from authenticated;
grant update (handle, display_name, avatar_url) on public.profiles to authenticated;

revoke insert on public.outcome_reports from anon, authenticated;
revoke update on public.outcome_reports from anon, authenticated;
grant insert (
  playbook_id, version_id, user_id, agent_id, result, amount, unit,
  hours_saved, time_spent_bucket, provider, region, note, referral_code
) on public.outcome_reports to authenticated;
grant update (
  result, amount, unit, hours_saved, time_spent_bucket, provider, region, note
) on public.outcome_reports to authenticated;

revoke insert on public.report_evidence from anon, authenticated;
revoke update on public.report_evidence from anon, authenticated;
grant insert (report_id, storage_path, kind) on public.report_evidence to authenticated;

revoke insert on public.feedback from anon, authenticated;
revoke update on public.feedback from anon, authenticated;
grant insert (user_id, email, message, pathname) on public.feedback to anon, authenticated;

revoke insert on public.playbook_requests from anon, authenticated;
revoke update on public.playbook_requests from anon, authenticated;
grant insert (query, email, user_id, topic, purpose, pathname)
  on public.playbook_requests to anon, authenticated;

revoke insert on public.try_events from anon, authenticated;
revoke update on public.try_events from anon, authenticated;
grant insert (playbook_id, version_id, agent_id, user_id, device_id, action)
  on public.try_events to anon, authenticated;

-- Nothing in v1 is writable by a client. These grants exist so a future
-- migration that adds a policy does not silently open the table.
revoke insert, update, delete on
  public.categories, public.agents, public.playbooks, public.playbook_versions,
  public.playbook_inputs, public.playbook_steps, public.playbook_agents,
  public.playbook_sources, public.collections, public.collection_items,
  public.use_cases, public.use_case_items, public.playbook_stats,
  public.followups, public.referral_links
from anon, authenticated;

grant select on
  public.categories, public.agents, public.playbook_stats, public.public_reports
to anon, authenticated;

-- Approved reports are readable, but not the reporter. Supabase grants a
-- table-level `select` to anon and authenticated by default, so that has to be
-- taken away first — otherwise the column grant below is redundant and user_id
-- stays readable. The grant is then enumerated column by column. Anything added
-- to this list later is a privacy decision, which is the point of writing it out.
revoke select on public.outcome_reports from anon, authenticated;

grant select (
  id, playbook_id, version_id, agent_id, result, amount, unit, hours_saved,
  time_spent_bucket, provider, region, note, is_verified, status, created_at
) on public.outcome_reports to anon, authenticated;

grant usage, select on all sequences in schema public to anon, authenticated;

-- ===========================================================================
-- Storage
-- ===========================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('evidence', 'evidence', false, 10485760, array['image/png', 'image/jpeg', 'image/webp', 'application/pdf']),
  ('previews', 'previews', true, 5242880, array['image/png', 'image/jpeg', 'image/webp', 'image/avif'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Evidence is private and scoped to the uploader. The path is
-- `<user_id>/<report_id>/<file>`, so the first folder is the owner.
create policy "Reporters upload their own evidence"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'evidence'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Reporters read their own evidence"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'evidence'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

create policy "Reporters delete their own evidence"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'evidence'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Previews are public to read, admin-only to write.
create policy "Preview images are publicly readable"
  on storage.objects for select
  using (bucket_id = 'previews');

create policy "Admins write preview images"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'previews' and public.is_admin());

create policy "Admins update preview images"
  on storage.objects for update to authenticated
  using (bucket_id = 'previews' and public.is_admin())
  with check (bucket_id = 'previews' and public.is_admin());

create policy "Admins delete preview images"
  on storage.objects for delete to authenticated
  using (bucket_id = 'previews' and public.is_admin());