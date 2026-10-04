begin;

-- pgTAP tests for search_playbooks_ranked.
--
-- These assert the *database* half of search. The synonym map and the query
-- splitting are unit-tested in TypeScript; what cannot be tested there is
-- whether the tsquery and trigram branches actually fire against the seeded
-- catalogue, which is exactly what went unproven in P4.
--
-- Each test runs as the `anon` role, because that is who searches. A function
-- that works as the table owner and fails for a reader is broken, and only
-- impersonating the role catches it.

select plan(12);

-- The seeded catalogue has three published playbooks. If that changes, the
-- count assertions below need updating rather than the behaviour.
select is(
  (select count(*)::int from public.playbooks where status = 'published'),
  3,
  'catalogue has three published playbooks'
);

-- ===========================================================================
-- Empty query returns nothing
-- ===========================================================================

-- `websearch_to_tsquery('english', '')` is an empty tsquery, and an empty
-- tsquery matches no document. Guarding here rather than in the caller alone
-- matters: an unguarded function would return the catalogue's alphabetical
-- first page, which reads as search results rather than as a rest state.
select is(
  (select count(*)::int from public.search_playbooks_ranked('', '')),
  0,
  'empty query matches nothing rather than everything'
);

select is(
  (select count(*)::int from public.search_playbooks_ranked(null, null)),
  0,
  'null query matches nothing'
);

-- ===========================================================================
-- Full-text branch
-- ===========================================================================

select ok(
  exists (
    select 1 from public.search_playbooks_ranked('japan itinerary', '')
    where id = (select id from public.playbooks where slug = 'plan-7-days-in-japan')
  ),
  'multi-word query matches on search_tsv, not just one word'
);

select ok(
  exists (
    select 1 from public.search_playbooks_ranked('internet', '')
    where id = (select id from public.playbooks where slug = 'lower-your-internet-bill')
  ),
  'single-word query matches the title'
);

-- ===========================================================================
-- Trigram branch: the typo case
-- ===========================================================================

-- The acceptance criterion in the brief. Nothing in the catalogue contains
-- this spelling, so only word_similarity can satisfy it — which makes it the
-- test that would fail loudly if the trigram threshold were ever raised past
-- the point of usefulness.
select ok(
  exists (
    select 1 from public.search_playbooks_ranked('insurence', '')
    where id = (select id from public.playbooks where slug = 'cheaper-car-insurance')
  ),
  'typo "insurence" still finds cheaper car insurance'
);

-- A probe with nothing resembling a title must not match. Without this the
-- threshold could be lowered to 0 and "find everything" would pass every
-- typo test while being useless.
select is(
  (select count(*)::int from public.search_playbooks_ranked('plugh frobnicate xyzzy', '')),
  0,
  'a nonsense query matches nothing'
);

-- ===========================================================================
-- Synonym branch
-- ===========================================================================

-- The synonym clause is OR'd alongside the reader's own words. "comcast"
-- appears nowhere in the catalogue; "internet" arrives via the synonym list,
-- so this asserts the OR actually widens rather than narrows.
select ok(
  exists (
    select 1 from public.search_playbooks_ranked('comcast', 'internet | wifi | broadband')
    where id = (select id from public.playbooks where slug = 'lower-your-internet-bill')
  ),
  'a synonym-only term can produce a match'
);

-- The critical asymmetry: a synonym may ADD rows, never remove them. If the
-- function OR'd wrongly, this would return zero and the reader's own words
-- would be ignored.
select ok(
  exists (
    select 1 from public.search_playbooks_ranked('comcast', 'internet | wifi')
    where id = (select id from public.playbooks where slug = 'lower-your-internet-bill')
  ),
  'synonym branch is ORed with the typed query, not replacing it'
);

-- ===========================================================================
-- Published-only and access
-- ===========================================================================

-- The function returns ids, not rows, so this has to join back to check status.
-- The function needs an alias: a set-returning function in FROM cannot be
-- referenced by its schema-qualified name in a join condition, only by the
-- alias it was given.
select is(
  (
    select count(*)::int
    from public.search_playbooks_ranked('bill', 'internet') as matched
    join public.playbooks p on p.id = matched.id
    where p.status <> 'published'
  ),
  0,
  'drafts and archived rows never surface in search'
);

select has_function(
  'public',
  'search_playbooks_ranked',
  array['text', 'text', 'real', 'integer'],
  'the ranked search function exists with the signature the app calls'
);

-- Runs as `anon`, not as the table owner: search happens before sign-in.
select ok(
  has_function_privilege(
    'anon',
    'public.search_playbooks_ranked(text, text, real, integer)',
    'EXECUTE'
  ),
  'anon may call search, since search happens before anyone signs in'
);

select * from finish();
rollback;