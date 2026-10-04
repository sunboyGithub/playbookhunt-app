-- Whether a moderator has reviewed the evidence attached to a report.
--
-- Why this is a column and not a join to report_evidence: that table has no
-- public select policy at all, deliberately — v1 never renders evidence on a
-- public page — so the detail page physically cannot ask "did this report have
-- approved evidence" without opening a hole in that policy.
--
-- What leaks here is one boolean: that a moderator looked at a file someone
-- chose to attach, and approved it. Not the file, not its path, not who
-- uploaded it. That is the whole of the "Evidence reviewed" tag, and it is the
-- difference between showing a reader that a result was checked and showing them
-- nothing at all.
--
-- Set by the moderation flow when it approves an evidence row. Until then it is
-- false, which renders the tag absent rather than wrong — a missing tag is the
-- honest default for a claim nobody has checked.

alter table public.outcome_reports
  add column evidence_reviewed boolean not null default false;

comment on column public.outcome_reports.evidence_reviewed is
  'True once a moderator has approved evidence attached to this report. Exposed publicly as a boolean; the evidence itself is never public.';

-- The view is the only route to report data for anon, so the flag has to be
-- projected through it or the page cannot read it.
--
-- `create or replace view` can only *append* columns: renaming or reordering an
-- existing one is refused outright. So `evidence_reviewed` goes last rather than
-- beside `is_verified`, which is where it would read best. Reordering would mean
-- dropping and recreating the view, and a recreation window in which anon can
-- read nothing at all.
create or replace view public.public_reports
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
  upper(left(coalesce(p.display_name, 'A Playbook Hunt member'), 1)) as display_initial,
  r.evidence_reviewed
from public.outcome_reports r
left join public.profiles p on p.id = r.user_id
where r.status = 'approved';

grant select on public.public_reports to anon, authenticated;