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

---

## Maintaining this file

- Update on the same cadence as [build_history.md](build_history.md) — one entry
  per prompt, written when that prompt's checks pass.
- Keep "unavailable" in place for cost. Do not substitute an estimate.
- If OpenRouter or `/cost` figures are added, put them in the table with their
  source and date, and note that they are provider-reported rather than
  session-measured.
