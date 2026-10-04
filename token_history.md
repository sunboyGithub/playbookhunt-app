# Token history

Per-milestone token accounting for the Playbook Hunt build.

## Read this first — the data here is largely unavailable

**I cannot report token usage or cost for this project.** There is no tool
available to me that reads token counts, per-turn usage, context consumption, or
billing. The prompts, files and shell I operate cannot see any of it.

So this file is not a usage report. It records:

1. **What is genuinely observable**, stated as such.
2. **Explicit gaps**, marked rather than filled with estimates.

Any per-milestone token number that appeared here would be invented. The
"unavailable" markers below are deliberate and should stay unless a real source
becomes available.

### How to get real numbers

If you need actual usage and cost, the sources are outside this session:

- **Your API provider's dashboard.** This project routes through
  `ANTHROPIC_BASE_URL = https://openrouter.ai/api` with
  `ANTHROPIC_MODEL = space-bunny-alpha`, so OpenRouter's dashboard is the
  authoritative record of requests, tokens and spend for every session —
  including all P0–P12 work.
- **`/cost` in Claude Code**, which reports session usage as measured by the
  harness, if you want per-session figures.
- Both are per-session or per-provider, not per-milestone. Mapping them onto
  P0, P1, P2 … means matching sessions to commits by timestamp.

---

## Observable signals

One figure is available from the environment, and it is a cumulative
remaining-context reading rather than a usage total:

| Signal | Value | When |
|---|---|---|
| Context remaining, session total | 15,000,000 tokens | Start of P1 planning |
| Context remaining, session total | 15,000,000 tokens | After P0 committed |

The value did not move between those two readings, which means this figure
tracks a fixed session budget and is **not** a consumption counter. It cannot be
used to derive per-milestone usage.

### Milestone token accounting

| Milestone | Session tokens used | Cumulative | Cost |
|---|---|---|---|
| P0 | unavailable | unavailable | unavailable |
| P1 | unavailable | unavailable | unavailable |
| P2 | unavailable | unavailable | unavailable |

---

## Per-milestone notes

### P0 — Project brief

**Tokens:** unavailable. No measurement source.

**What the session did instead of application work:** the milestone was consumed
by environment setup and access problems rather than by building. In order:

1. Environment audit — found pnpm, Docker and the Supabase CLI missing.
2. Three failed install paths: Homebrew requiring Command Line Tools; a
   `/usr/local/bin` permission denial on the direct binary; the Supabase CLI
   absent entirely.
3. A misdiagnosed Docker state — the daemon was running the whole time, but the
   CLI was only on `PATH` via `~/.docker/bin`, which made a working daemon look
   broken and caused one wasted `supabase start`.
4. A second wasted start, launched from the wrong directory, producing
   containers named `supabase_*_GitHub` that had to be stopped and relaunched.
5. Root-causing a stale Command Line Tools receipt — macOS believed CLT was
   installed because five package receipts from macOS 14 survived an upgrade to
   26.2, while the payload at `/Library/Developer/CommandLineTools` was gone.
   This silently broke `git` and `brew` until the receipts were cleared and the
   tools reinstalled.
6. A credential-exposure stop: `.claude/settings.local.json` contained a live
   `ANTHROPIC_AUTH_TOKEN`, and the user asked for it to be pushed to a **public**
   repository. It was not pushed. The commit was amended so the token never
   entered history, the file was untracked and ignored, and the credential was
   copied to `~/.claude/settings.json` outside any repository.

Roughly the entire P0 session went to setup and remediation. The brief itself
needed one `diff`.

### P1 — Scaffold

**Tokens:** unavailable.

Unlike P0, the work here was mostly real output: a 64-file commit. The session
ran the four acceptance checks repeatedly rather than once, because three
defects surfaced only at runtime and each needed a fix-and-recheck cycle:

1. Escaped quotes in a generated placeholder route broke `tsc`.
2. Generated `PageProps`/`LayoutProps` types do not exist until `next typegen`
   runs, so `tsc --noEmit` failed. Replaced with explicit prop types.
3. **Blank optional env values took down every route.** `.env.local` copied
   from `.env.example` has `RESEND_API_KEY=` and friends, which the runtime
   surfaces as empty strings. `z.string().min(1).optional()` does not skip an
   empty string, so validation threw and the site 500'd. Fixed by treating blank
   values as absent, with two regression tests added.

Also spent effort on two Next.js 16 defaults that fight the brief: the
auto-generated `AGENTS.md` block, and the `middleware` → `proxy` rename.

### P2 — Database schema, RLS, types

**Tokens:** unavailable. No measurement source; see the note at the top.

This milestone was dominated by iteration against a live database rather than by
writing files. Five defects were found by tests rather than by reading the code,
and three of them were the kind that pass every static check:

1. A trigger assigning a column the table does not have — which would have made
   **every user signup fail** and was invisible to TypeScript.
2. A policy left unscoped, so `anon` evaluated a subquery it had no grant for
   and got a permission error where an empty result was correct.
3. A reversed sort comparator. Correct types, correct inputs, opposite output.

Each fix cost a migration, a reset and a test re-run. The loop that actually paid
for itself was writing the RLS tests as SQL that impersonates a role, because
that made "anon cannot do X" a runnable assertion instead of a claim. Every one
of those five was caught by a test rather than by inspection.


### P3 — Content pipeline: schema, importer, first playbooks

**Tokens:** unavailable. No measurement source; see the note at the top.

Like P2, this milestone was mostly iteration against a running system rather
than file writing, and again the most valuable thing was a check that could
fail. The decisive one was probing the PostgREST embed directly:

```
error: Could not find a relationship between 'playbook_versions' and 'inputs'
data? false version: undefined
```

That single probe turned "the importer says unchanged" from a claim into a
diagnosed failure. The importer had been reporting `unchanged` because its
version query returned null — not because content matched. Had that not been
probed, P3 would have been committed green with its central criterion unmet:
editing a prompt would never have created version 2, and no test existed to say
otherwise.

Two things are worth carrying forward as method:

- **Probing the layer beneath the symptom.** Two candidate embed syntaxes, two
  queries, thirty seconds — cheaper than any amount of re-reading the importer.
- **Asserting the thing that is easy to lose.** The version check's `error` was
  discarded, so a hard failure presented as a clean success. Adding a `throw`
  costs one line and closes the whole class.

---

## Maintaining this file

- Update on the same cadence as [build_history.md](build_history.md) — one entry
  per prompt, written when that prompt's checks pass.
- Keep "unavailable" in place for cost. Do not substitute an estimate.
- If OpenRouter or `/cost` figures are added, put them in the table with their
  source and date, and note that they are provider-reported rather than
  session-measured.
