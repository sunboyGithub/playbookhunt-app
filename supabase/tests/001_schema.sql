begin;

-- pgTAP is bundled with Supabase's local stack. These tests run under
-- `supabase test db`, which rolls the transaction back afterwards.
select plan(14);

-- ===========================================================================
-- Taxonomy
-- ===========================================================================

select has_table('public', 'categories', 'categories exists');
select has_table('public', 'agents', 'agents exists');

select is(
  (select count(*)::int from public.categories),
  8,
  'AGENTS.md names exactly 8 categories'
);

select is(
  (select count(*)::int from public.agents where status = 'active'),
  1,
  'exactly one active agent in v1'
);

select is(
  (select count(*)::int from public.agents where status = 'coming_soon'),
  3,
  'ChatGPT, Grok and Manus are coming_soon'
);

select is(
  (select count(*)::int from public.agents where status = 'hidden'),
  3,
  'instinct, claude and gemini are hidden'
);

select is(
  (select count(*)::int from public.agents where launch_url_template is not null),
  0,
  'no agent has a launch_url_template: prefill support is unverified'
);

select is(
  (select capabilities from public.agents where slug = 'muse'),
  array['info', 'web_actions', 'phone_calls'],
  'muse has all three capabilities'
);

-- ===========================================================================
-- Profiles
-- ===========================================================================

select has_table('public', 'profiles', 'profiles exists');

-- ===========================================================================
-- search_tsv
-- ===========================================================================

select has_function(
  'public', 'playbooks_refresh_search', 'trigger that builds search_tsv'
);

select col_is_pk(
  'public', 'playbook_stats', 'playbook_id',
  'playbook_stats is keyed by playbook'
);

-- col_is_unique cannot express a composite key, so this checks the index that
-- backs unique(user_id, version_id) directly. The behaviour it protects is
-- asserted against a real role in 002_rls.sql.
select has_index(
  'public', 'outcome_reports', 'outcome_reports_user_id_version_id_key',
  'outcome_reports has a unique(user_id, version_id) — one report per version'
);

select col_is_unique(
  'public', 'playbooks', 'slug',
  'playbook slugs are unique'
);

-- is_admin must exist and be callable; it is what every admin policy resolves
-- through, so a missing grant would silently turn admin UIs into 403s.
select has_function(
  'public', 'is_admin', 'admin check helper'
);

select * from finish();
rollback;