-- P10: the requests inbox, grouped by how alike the requests are.
--
-- The inbox is not a list of rows. Twenty people asking for "lower my energy
-- bill" is one request that arrived twenty times, and an administrator reading
-- twenty rows will draw the conclusion that energy bills are the single most
-- wanted thing on the site — which is an artefact of the order people happened
-- to arrive in, not a finding. Grouping them is the difference between a queue
-- that can be read and a queue that has to be skimmed.
--
-- So the grouping happens here rather than in TypeScript. `pg_trgm` already
-- knows how similar two strings are, and a second implementation in application
-- code would be a second opinion about that question that the two could
-- disagree on — which is exactly the class of bug the ranking work in P9 was
-- built to avoid.

-- ===========================================================================
-- admin_request_inbox
-- ===========================================================================

-- Each request is filed under the earliest earlier request it resembles, which
-- makes the representative the oldest member of its group. That is the right
-- choice for an inbox: the first time something was asked for is the date worth
-- showing, and the group does not move when a new copy arrives, so a moderator
-- who bookmarked a group can come back to it.
--
-- The comparison is `a % b`, pg_trgm's similarity operator, so the trigram index
-- on `query` is what makes this a lookup rather than a scan. The default cutoff
-- of 0.55 is well above the 0.3 Postgres ships with: 0.3 matches things like
-- "save money on bills" and "find me a job", which are not the same request and
-- would bury both.
create or replace function public.admin_request_inbox(min_similarity real default 0.55)
returns table (
  id uuid,
  query text,
  email text,
  topic text,
  purpose text,
  pathname text,
  created_at timestamptz,
  status text,
  decided_at timestamptz,
  group_key uuid
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  -- Not a policy: this function is `security definer`, so RLS does not apply to
  -- the body, and without this the request queue would be readable by anybody
  -- who could reach PostgREST at all. Refusing loudly rather than returning
  -- nothing, because an empty inbox and a refused inbox are different bugs.
  if not public.is_admin() then
    raise exception 'admin_request_inbox: administrator access required'
      using errcode = 'insufficient_privilege';
  end if;

  return query
  with inbox as (
    select r.* from public.playbook_requests r
  ),
  placed as (
    select
      a.id,
      coalesce(
        (
          select b.id
          from inbox b
          where (b.created_at, b.id) < (a.created_at, a.id)
            and b.query % a.query
            and similarity(b.query, a.query) >= min_similarity
          order by b.created_at, b.id
          limit 1
        ),
        a.id
      ) as group_key
    from inbox a
  )
  select
    i.id,
    i.query,
    i.email,
    i.topic,
    i.purpose,
    i.pathname,
    i.created_at,
    i.status,
    i.decided_at,
    p.group_key
  from inbox i
  join placed p on p.id = i.id
  order by p.group_key, i.created_at;
end;
$$;

-- Deliberately *not* granted to anon or authenticated. The admin action reaches
-- it with the service-role client after its own check; a PostgREST role has no
-- business calling it even if the function would then refuse, because "would
-- refuse" is a property of a policy and policies get changed.
revoke all on function public.admin_request_inbox(real) from public;
grant execute on function public.admin_request_inbox(real) to service_role;

comment on function public.admin_request_inbox(real) is
  'Requests with the group key of their nearest earlier similar request. Admin only; groups requests by pg_trgm similarity so the queue shows one line per thing actually being asked for.';