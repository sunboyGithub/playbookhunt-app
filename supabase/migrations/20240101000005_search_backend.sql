-- ===========================================================================
-- Full search backend: text rank + trigram tolerance
-- ===========================================================================

-- `search_playbooks` (migration 000002) answers the ⌘K palette: a title-only
-- `ilike` for one query. That is the right shape for a ten-row dropdown and the
-- wrong shape for the results page, which needs to weigh a match against
-- evidence and must survive a typo.
--
-- So this file adds a second, separate function rather than widening the old
-- one. The palette needs "cheap, fast, never wrong"; the results page needs
-- "rank, tolerate 'insurence', and let the caller fall back to a category when
-- there is not enough". Two different contracts, and merging them would leave
-- both callers passing arguments the other one does not understand.

-- ===========================================================================
-- search_playbooks_ranked
-- ===========================================================================

-- Returns playbook ids with a relevance rank, for the results page.
--
-- Two match paths, OR'd:
--
--   1. `search_tsv @@ query` — full text over title, promise, who_for, tags
--      and the category name, maintained by the trigger in 000000. This is what
--      finds "japan itinerary" for plan-7-days-in-japan.
--
--   2. `word_similarity(probe, title) >= threshold` — pg_trgm, for the typo
--      case. `similarity()` compares whole strings, and "insurence" against
--      "Cheaper car insurance" scores poorly because the two strings differ in
--      length; `word_similarity()` instead asks how well the probe matches the
--      best-matching *word* in the title, which is the question a typo
--      actually poses. That is what gets cheaper-car-insurance from
--      "insurence".
--
-- The rank is the brief's `ts_rank + similarity`, with the trigram term
-- weighted so it can carry a row on its own: a pure typo match has
-- ts_rank 0, and an unweighted sum would tie it with a title-prefix match and
-- leave the order to `id`. The 0.35 weight also keeps a strong text match ahead
-- of a weak spelling match, which is the ordering a reader expects.
--
-- `syn` is OR'd in alongside the reader's own terms rather than instead of them.
-- A synonym can widen the search; it must never let a row match on a word the
-- reader did not type while dropping one they did.
--
-- Restricted to published rows. This runs as the definer and so bypasses the
-- RLS policy that hides drafts — drafts must not surface in search.
create or replace function public.search_playbooks_ranked(
  q text,
  syn text default '',
  similarity_threshold real default 0.4,
  match_limit int default 24
)
returns table (id uuid, rank real)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with parsed as (
    select
      case
        when nullif(btrim(coalesce(q, '')), '') is null then null::tsquery
        when nullif(btrim(coalesce(syn, '')), '') is null
          then websearch_to_tsquery('english', q)
        -- `||` on a tsquery is OR. So the reader's AND-ed phrase is OR'd with
        -- the synonym branch, which is itself a `|`-separated OR built in
        -- lib/search/query.ts.
        else websearch_to_tsquery('english', q) || websearch_to_tsquery('english', syn)
      end as query,
      btrim(coalesce(q, '')) as probe
  ),
  scored as (
    select
      p.id,
      (
        ts_rank_cd(p.search_tsv, parsed.query)
        + 0.35 * word_similarity(parsed.probe, p.title)
      )::real as rank
    from public.playbooks p
    cross join parsed
    where p.status = 'published'
      and parsed.query is not null
      and (
        p.search_tsv @@ parsed.query
        or word_similarity(parsed.probe, p.title) >= similarity_threshold
      )
  )
  select scored.id, scored.rank
  from scored
  order by scored.rank desc, scored.id asc
  -- Bounded so a caller cannot ask for the whole table by passing a large
  -- number. The catalogue is small today; this is about the contract, not the
  -- current size.
  limit greatest(1, least(match_limit, 200));
$$;

comment on function public.search_playbooks_ranked(text, text, real, int) is
  'Ranked ids for the results page: full text over search_tsv OR trigram word_similarity on title. Published rows only. NOTE: the word_similarity branch is a sequential scan; see the trigram index note below.';

-- Callable by anon: search runs before anyone is signed in.
grant execute on function public.search_playbooks_ranked(text, text, real, int)
  to anon, authenticated;

-- ===========================================================================
-- Trigram index coverage
-- ===========================================================================

-- The existing `playbooks_title_trgm_idx` is a GIN index on
-- `title gin_trgm_ops`, which backs `%` and `<%`. `word_similarity(...) >=
-- constant` is not one of those operators — it is a bare function comparison —
-- so the index does not apply and this falls back to a sequential scan.
--
-- That is the correct trade at ~48 rows and the wrong one at 48,000, so it is
-- recorded here rather than left to be rediscovered. The fix when it matters is
-- a GiST index and `title % probe`, or an expression index on
-- `word_similarity(probe, title)`, which Postgres cannot build without a
-- constant probe.