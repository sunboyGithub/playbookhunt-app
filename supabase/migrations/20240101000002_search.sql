-- ===========================================================================
-- Full-text and fuzzy search
-- ===========================================================================

-- pg_trgm backs the command palette's title search. `ilike '%term%'` on its own
-- cannot use an index, so it degrades to a sequential scan of the catalogue —
-- tolerable at 48 rows, and the first thing that hurts as the catalogue grows.
--
-- The init migration already runs `create extension if not exists pg_trgm` with
-- no schema clause, so the extension is installed in `public`. Re-declaring it
-- here "with schema extensions" was a silent no-op — `if not exists` does not
-- move an extension that already exists elsewhere — and that is what made the
-- operator class unresolvable at db:reset: `extensions.gin_trgm_ops` never
-- existed, because the operator class is `public.gin_trgm_ops`.
--
-- So the operator class below is left unqualified and resolved through
-- search_path, which is set to both schemas immediately above. That works
-- whichever schema the extension ends up in, rather than encoding today's
-- answer.
create extension if not exists pg_trgm;

set search_path = public, extensions;

-- The GIN index below is what makes the trigram operator index-backed. Created
-- here rather than in the init migration so this file is the single place that
-- knows search depends on the extension.
create index if not exists playbooks_title_trgm_idx
  on public.playbooks using gin (title gin_trgm_ops);

comment on index public.playbooks_title_trgm_idx is
  'Backs search_playbooks(); ILIKE alone cannot use an index.';

-- ===========================================================================
-- search_playbooks
-- ===========================================================================

-- Title search for the ⌘K palette. Returns only what the palette renders:
-- slug, title and category. Deliberately not `select *` — a search result is
-- the most-exposed read path in the app, and a narrower column list is a
-- narrower blast radius if the function is ever changed carelessly.
--
-- Ranking is `similarity(title, q)` first, then a prefix match. Trigram
-- similarity alone ranks "internet bill" below "Lower your internet bill" only
-- by luck of the scores; the prefix boost makes the obvious answer win, which
-- is what a reader typing four characters expects.
--
-- Restricted to published playbooks: this runs as the definer, so it bypasses
-- the RLS policy that hides drafts, and drafts must not surface in search.
create or replace function public.search_playbooks(q text)
returns table (slug text, title text, category_slug text, category_name text, rank real)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select
    p.slug,
    p.title,
    c.slug,
    c.name,
    (
      similarity(p.title, q)
      + case when p.title ilike q || '%' then 0.4 else 0 end
    )::real as rank
  from public.playbooks p
  join public.categories c on c.id = p.category_id
  where p.status = 'published'
    and p.title ilike '%' || q || '%'
  order by rank desc, p.title asc
  limit 10;
$$;

-- Callable by anon: the palette runs before anyone is signed in.
grant execute on function public.search_playbooks(text) to anon, authenticated;

-- An empty query matches every title via `ilike '%%'`, which would return the
-- first ten playbooks in alphabetical order and look like search results rather
-- than a rest state. Guarded inside the function's callers and here.
comment on function public.search_playbooks(text) is
  'Fuzzy title search for the command palette. Published rows only.';