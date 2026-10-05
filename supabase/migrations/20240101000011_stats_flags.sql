-- The columns the ranking aggregation job writes, and the one reader fact it
-- cannot get any other way.
--
-- Two unrelated problems, one migration.
--
-- 1. Eligibility and badges. `playbook_stats` predates the ranking module and
--    holds the raw aggregates only. The rules that decide what a card is
--    *allowed to say* — show a percentage, show a median, claim to be the
--    strongest in its category — are computed by `src/lib/ranking`, and a
--    component that recomputed them would eventually disagree with the job that
--    wrote the row. They are stored here so the page reads one source.
--
-- 2. `profiles.email_verified`. Ranking weights a report by its reporter's
--    trust, and "email verified" is one of the three trust inputs. It lives in
--    `auth.users.email_confirmed_at`, which is not reachable: `auth` is not in
--    the exposed schema, and `profiles` deliberately carries no email column,
--    so there is no path from a report to the fact it needs. Denormalising it
--    onto the profile is the fix, kept honest by a trigger rather than by
--    remembering to sync it.

-- ===========================================================================
-- 1. Eligibility flags and badges
-- ===========================================================================

-- The weighted success behind `evidence_score`. Nullable because it is
-- nullable in exactly one case: no reports at all. It is stored rather than
-- recomputed on read so the number a score was built from is inspectable
-- without re-deriving the whole pipeline.
alter table public.playbook_stats
  add column if not exists weighted_success numeric;

comment on column public.playbook_stats.weighted_success is
  'Trust-weighted, decay-scaled success: each counted report worth 1 for worked, 0.5 for partly, 0 for did not, scaled by its trust weight and then by a 60-day half-life. Null when there are no reports.';

-- How many counted reports had evidence approved by a moderator. One of the
-- two conditions for "Proven to work" (the other is 20 reports), and stored
-- rather than joined because the evidence rows themselves are not public.
alter table public.playbook_stats
  add column if not exists evidence_approved int not null default 0;

comment on column public.playbook_stats.evidence_approved is
  'Counted reports with moderator-approved evidence. Only the count is public; the evidence is never exposed.';

-- Whether a success percentage may be shown. False below 20 counted reports.
-- Stored so the rule is applied once, in the job that already counts, and the
-- page cannot show a percentage the job would have withheld.
alter table public.playbook_stats
  add column if not exists show_rate boolean not null default false;

comment on column public.playbook_stats.show_rate is
  'True only at or above 20 counted reports. A card reads this and renders no percentage when it is false, rather than re-deriving the threshold.';

-- Whether a median may be shown. False below 10 amounts, and false for a
-- playbook whose outcome is binary — there is no number to show.
alter table public.playbook_stats
  add column if not exists show_median boolean not null default false;

comment on column public.playbook_stats.show_median is
  'True only at or above 10 amounts, and only for a playbook that reports an amount at all.';

-- Whether this playbook is in the top slice of its category on evidence.
--
-- NOT a ranking input. `search_playbooks_ranked` orders by text rank and
-- nothing here feeds back into it; this column exists so a card can *say*
-- "strongest in Category", which is a claim about one category, not about the
-- site. Keeping it out of the sort is the structural half of AGENTS.md's rule
-- that badges never affect ranking — there is no code path from here to an
-- order by, so the rule cannot be violated by a later edit either.
alter table public.playbook_stats
  add column if not exists strongest_eligible boolean not null default false;

comment on column public.playbook_stats.strongest_eligible is
  'True when this playbook is in the top 10% of its category by evidence score. Display-only: never read by any ordering query.';

-- The badges earned: verified_recent, high_success, top_saver, most_tried.
--
-- `text[]` rather than a join table because there is no such thing as "the one
-- badge on a playbook" — a card shows all of them, so the set is read whole
-- every time and never queried by membership. The empty array is the honest
-- default; a playbook with no badges is not a playbook in a bad state.
alter table public.playbook_stats
  add column if not exists badges text[] not null default '{}';

comment on column public.playbook_stats.badges is
  'Earned badges: verified_recent, high_success, top_saver, most_tried. Display-only. Empty means nothing has been earned yet.';

-- Guard the badge values at the database rather than trusting the writer. The
-- renderer switches on these strings, and an unrecognised one would have to
-- fall through a case it was never written to handle.
alter table public.playbook_stats
  drop constraint if exists playbook_stats_badges_known;

alter table public.playbook_stats
  add constraint playbook_stats_badges_known
  check (badges <@ array['verified_recent', 'high_success', 'top_saver', 'most_tried']::text[]);

-- A percentage that is stored but not permitted to be shown would be a trap
-- for whoever writes the card next. The two cannot disagree in the database.
alter table public.playbook_stats
  drop constraint if exists playbook_stats_rate_needs_show;

alter table public.playbook_stats
  add constraint playbook_stats_rate_needs_show
  check (not show_rate or report_count >= 20);

alter table public.playbook_stats
  drop constraint if exists playbook_stats_median_needs_show;

alter table public.playbook_stats
  add constraint playbook_stats_median_needs_show
  check (not show_median or amount_n >= 10);

-- ===========================================================================
-- 2. Email verification, denormalised onto the profile
-- ===========================================================================

-- `not null default false` rather than nullable: every reader of this column
-- has an opinion about an unverified account, and three-valued logic would mean
-- three different answers. False is the safe one — an unconfirmed address
-- weighs less — and the backfill below brings every existing row in line with
-- what auth already knows.
alter table public.profiles
  add column if not exists email_verified boolean not null default false;

comment on column public.profiles.email_verified is
  'Mirrors auth.users.email_confirmed_at is not null. Ranking reads it as one of three trust inputs. Maintained by a trigger on auth.users, never by application code.';

-- Not grantable by the reader. `profiles` revokes table-level UPDATE and
-- re-grants an explicit column list (see the reminders migration); this column
-- is deliberately outside that list, so a reader cannot claim to be verified.
-- The one thing the owner cannot do is un-verify themselves, which is the
-- correct direction for a column that can only ever raise a report's weight.

-- Keep it in step with auth, including for rows that already exist. The
-- backfill is the part that matters today: without it every profile created
-- before this migration would read as unverified and its author's reports would
-- be down-weighted forever.
update public.profiles p
set email_verified = (u.email_confirmed_at is not null)
from auth.users u
where u.id = p.id
  and p.email_verified is distinct from (u.email_confirmed_at is not null);

-- One trigger for insert and update rather than two. The column changes exactly
-- once in a user's life — when they confirm — and both events have to be
-- caught, because the signup trigger creates the row before confirmation and a
-- confirmation-only trigger would miss every account created through an
-- OAuth-style provider that confirms in the same request.
create or replace function public.sync_profile_email_verified()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- No `on conflict`: this fires on the second event for the same account, by
  -- which time the row certainly exists. An upsert here would mask a genuine
  -- "profile row is missing" bug behind a silent insert.
  update public.profiles
  set email_verified = (new.email_confirmed_at is not null)
  where id = new.id
    and email_verified is distinct from (new.email_confirmed_at is not null);

  return new;
end;
$$;

-- The function is `security definer` because the trigger fires as the auth
-- user, who has no UPDATE on `profiles` — the very UPDATE that was revoked for
-- exactly this reason. It writes one column, for one id, taken from the row the
-- trigger is already running on.
drop trigger if exists on_auth_user_email_verified on auth.users;

create trigger on_auth_user_email_verified
  after insert or update of email_confirmed_at on auth.users
  for each row execute function public.sync_profile_email_verified();

-- A profile row can be deleted while the auth user survives — an admin action,
-- or a cascade from something upstream. There is no trigger to un-set the
-- column in that case because there is no row left to hold it.