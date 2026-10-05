-- P10 follow-up: fix `admin_request_inbox`, which no caller could reach.
--
-- Migration 13 built the function correctly and then made it unreachable. Two
-- separate defects, each of which the tests were arranged not to see, and each
-- of which hides the other.
--
-- ===========================================================================
-- 1. The revoke did not revoke
-- ===========================================================================
--
-- Migration 13 said:
--
--   revoke all on function public.admin_request_inbox(real) from public;
--   grant execute on function public.admin_request_inbox(real) to service_role;
--
-- and believed it had narrowed the grant to `service_role`. It had not. Supabase
-- sets `alter default privileges in schema public grant execute on functions to
-- anon, authenticated, service_role` for the migration role, so *creating* the
-- function wrote explicit `anon=X` and `authenticated=X` ACL entries on it.
-- `revoke ... from public` removed only the PUBLIC entry and left both explicit
-- ones in place. Every signed-out visitor and every signed-in reader could call
-- the request inbox. The `is_admin()` check inside was the only thing between
-- them and the queue, which is the single-sentence version of "would refuse is a
-- property of a policy, and policies get changed".
--
-- The fix names the roles. `from public` is kept because PUBLIC is a grant of
-- its own and defaults may add it back for a later function.
--
-- ===========================================================================
-- 2. The guard refused the one caller that had a grant
-- ===========================================================================
--
-- The function's guard was `if not public.is_admin() then raise ...`. `is_admin()`
-- resolves `auth.uid()`, which comes from the caller's JWT `sub` claim. A
-- `service_role` key is not a user session and carries no `sub`, so `auth.uid()`
-- is null and `is_admin()` is false — always, for every caller that had survived
-- fix 1. The function refused the only caller it was written for.
--
-- Note what this is not: there is no way for the function to authenticate a
-- `service_role` caller, because `service_role` is the application. It bypasses
-- RLS on every table already. Whoever holds that key is not an untrusted party,
-- so asking the database whether the caller is an administrator is asking a
-- question with no answer behind it.
--
-- So the parameter is the administrator's own id, and the guard checks that the
-- row still says `admin`. That is a much narrower claim than the old one, and it
-- is the one that is true: it catches the realistic failures — a call site that
-- passes the wrong id, a session whose account was demoted since the page
-- rendered, a queue refetched after a revocation — and it catches them loudly
-- rather than with an empty inbox. Authentication happened earlier, in
-- `requireAdmin()`; this is the database refusing to act on a stale claim.
--
-- The parameter is `p_admin_id` rather than `admin_id` to match `owns_report`, and
-- because an unqualified name matching a column would be ambiguous inside the
-- profiles lookup.

drop function if exists public.admin_request_inbox(real);

create or replace function public.admin_request_inbox(
  p_admin_id uuid,
  min_similarity real default 0.55
)
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
  -- Not a policy, and not authentication either: see the header. This refuses
  -- when the caller cannot name an account that is currently an administrator.
  -- Raising rather than returning nothing, because an empty inbox and a refused
  -- inbox are different bugs and a moderator should not have to guess which
  -- one they are looking at.
  if p_admin_id is null or not exists (
    select 1 from public.profiles p where p.id = p_admin_id and p.role = 'admin'
  ) then
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

revoke all on function public.admin_request_inbox(uuid, real) from public, anon, authenticated;
grant execute on function public.admin_request_inbox(uuid, real) to service_role;

comment on function public.admin_request_inbox(uuid, real) is
  'Requests with the group key of their nearest earlier similar request. Admin only; groups requests by pg_trgm similarity so the queue shows one line per thing actually being asked for. Refuses unless p_admin_id names an account that is currently an administrator — a staleness check, not authentication; only service_role may execute it at all.';