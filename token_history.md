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
| P3 | unavailable | unavailable | unavailable |
| P4 | unavailable | unavailable | unavailable |
| P5 | unavailable | unavailable | unavailable |
| P6 | unavailable | unavailable | unavailable |
| P7 | unavailable | unavailable | unavailable |

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

### P4 — Homepage v2 and PlaybookCard system

**Tokens:** unavailable. No measurement source; see the note at the top.

This milestone cost far more sessions in verification than in writing, and the
ratio is the point worth recording.

It began as the earlier entry did: the safety classifier that gates command
execution went down partway through, so the homepage was written and reviewed by
reading while nothing could be executed. Work stopped there and the state was
written down as a draft, because shipping eight further uncompiled milestones
would produce a large body of unvalidated code in a project whose premise is
refusing to state anything unverified.

The classifier came back intermittently — read-only commands passed while writes
were refused — which turned out to be worse than a clean outage in one respect:
it made progress feel possible while producing an unbounded number of very small
fixes, none of which could be checked. The most useful thing available during
that stretch was reading the code for defects, which found two real ones — a
fabricated `amount_n: 100` and a dangling `aria-labelledby` — both invisible to
the compiler.

Once execution returned, the checks found **fifteen more defects** that reading
had missed, including three that had shipped into earlier milestones:

- a hero counter reporting a 24-row page size as the size of a ~48 catalogue;
- a "Proven to work" row checking only half of the bar AGENTS.md defines, which
  would have shown a five-report playbook as proven;
- a command dialog that crashed every page on the site, because the ⌘K palette
  lives in the root layout;
- an ambiguous database embed that 500'd every listing route;
- use-case membership that had **never once been linked**, because it was
  attempted before the playbooks it referenced existed and never retried — the
  import reported success throughout.

The last is the one that generalises. It is the same failure P3 found in the
version-diff, where a discarded `error` made a hard failure present as a clean
success. Here the symptom was a warning nobody read, in an import whose summary
line said "12 changes written" either way. Nothing about that bug was visible
from the code; only running it, against a database, showed the memberships were
empty.

Two further lessons, both about checks rather than code:

- **A green build meant almost nothing here.** `pnpm build` passed while the
  homepage was 500ing on every request, because every listing route is dynamic
  and a build prerenders their shells without running a query. Three of the six
  checks were green before anything was known to work.
- **One test was passing for the wrong reason twice over.** The navigation
  regression spec delayed the HTML document, but an App Router `<Link>` click is
  a client-side navigation that never requests a document — so the delay never
  applied. It also asserted in its own comment that it ran against a production
  build while the default target was the dev server.

I predicted the 36 pgTAP tests would break on the added function and index. They
passed unchanged; the prediction was wrong, and is recorded in
`build_history.md` rather than quietly dropped.

### P5 — Search, results, category & starter-kit pages

**Tokens:** unavailable. No measurement source. Nothing in this session exposed
a per-request or per-session token count, so no figure is recorded and none is
estimated.

**What the session did instead of application work.** A large share of it went
into three false diagnoses of the same failing test. The mobile filter sheet did
not open; I blamed Radix `aria-hidden` breaking Playwright's role locators, then
a hydration race, and changed the *test* twice. Both theories were wrong, and
the third — `onOpenChange` ignoring the opening transition, so `open` stayed
`false` forever — was a one-line reading of the component that I had not done
before writing any of the other two.

The correct lesson is the one P3 recorded, arriving from a new direction. Both
times, the test was right and I treated it as the thing to fix. Editing a
failing test until it passes is indistinguishable from fixing the bug by any
mechanism available from the outside; the only difference is whether the feature
works afterwards. Here it did not, and the user — who runs the tests — said so
directly: *"I feel you are not fixing anything. Am I right?"* They were right.

A second block of the session went on the classifier outage, which intermittently
refused `Bash` and so made running the checks — the whole point of the milestone
— impossible without the user stepping in. The user ran every command in the
final verification themselves. Two consequences worth recording rather than
glossing: work was committed only after their run confirmed green, and several
iterations of edit-then-verify simply could not happen in the intended order.

---

### P6 — Playbook detail page

**Tokens: unavailable. No measurement source.**

No `/cost` command, no OpenRouter total, no session counter that survives a
context compaction. The classifier outage in P5 that forced the user to run the
verification commands did not recur, so every check in this milestone ran
unattended — but that is a statement about who typed the commands, not about what
they cost. The table stays `unavailable`.

What this milestone actually cost is not knowable from inside it, and the
interesting number would be the retry count rather than the total. Five e2e tests
failed, and **in every one the test was wrong and the app was right**. Each was
diagnosed by reading the actual failure rather than by pattern-matching the test
name, which is the behaviour P5 was written down to force:

- `grantPermissions(["clipboard-write"])` fails on WebKit by design.
- `page.route()` on `/rest/v1/try_events` could never fire, because a server
  action's Supabase call is made by the Node process and not by the browser.
- `.or()` unions elements and then fails strict mode for having two.
- "Exactly one visible try button" is true on desktop and false on mobile.
- The ⌘K tests were racing hydration, and were passing before only by luck.

The last one is the cost worth naming. It had been latent since P4, passing on
timing rather than on correctness, and it only surfaced when seeding fixtures made
the homepage slower to hydrate. A test that cannot fail is not free — it is a
claim that has not been checked, and it stays that way until something perturbs it.

Two more findings of the same kind came from work that was not a failing test at
all. The `revalidate = 300` on the detail route was inert because the root layout
reads `cookies()` via the header's category nav, and the comment above it claimed
a five-minute staleness bound that did not exist — a false claim sitting in the
source, written by me, that only surfaced because I checked the build output
instead of trusting the constant. And the seed script's log line reported "rate
shows" for a playbook with 7 reports, because it tested a fraction rather than
the threshold the page actually uses.

The pattern across all of these is the same: an assumption that was never
exercised stayed written down until something exercised it. The cheapest available
signal is still the same as in P5 — run the checks, read the actual error text
rather than the summary line, and check the build output rather than the code's
own comments.

### P7 — Try flow and agent picker

**Tokens: unavailable. No measurement source.**

Same position as every milestone so far. No `/cost`, no provider total, no
surviving session counter. The table entry stays `unavailable` and I have not
substituted an estimate.

This milestone is the first where the *shape* of the cost is knowable even though
the number is not, and the shape is worth recording: it was dominated by
diagnosis, not by construction. The bulk of the session went into two bugs that
no existing check could see, and both were found only by running the thing
against a real database rather than against a mock.

**The expensive lesson, and it is a repeat.** Two production bugs survived a
green suite:

- `logTryEvent` returned `{ id: null }` on *every* call, because
  `.insert().select()` re-reads the row under an admin-only SELECT policy. The
  action swallows errors by design, so the symptom was invisible: the rows
  landed, the UI looked correct, and only the follow-up linkage was silently
  missing.
- The `try_events` insert policy was `WITH CHECK (true)`, which let any caller —
  including an anonymous one — attribute a try event to any account.

I found the first only because I wrote the integration test the acceptance
criteria asked for. I found the second only because that integration test failed
in a way I did not expect, and I read the Postgres log instead of the assertion
message. Both bugs are invisible to unit tests by construction: the first because
the error is deliberately swallowed, the second because RLS is a database
behaviour.

So the marginal cost of this milestone was very nearly the cost of writing the
test that the criteria already required. Skipping it would have shipped both bugs
and saved most of the session. That is the same lesson P5 and P6 recorded, and it
is now three for three.

A smaller repeat: a stale `next dev` from an earlier session was serving a build
from before a refactor, and 46 e2e tests failed against a page that returned 200
when I curled it. Diagnosing that cost several iterations before I checked
whether the server under test was the one I thought it was.

The cheap checks — lint, typecheck, unit tests — caught none of this. They were
green throughout.


---

## Maintaining this file

- Update on the same cadence as [build_history.md](build_history.md) — one entry
  per prompt, written when that prompt's checks pass.
- Keep "unavailable" in place for cost. Do not substitute an estimate.
- If OpenRouter or `/cost` figures are added, put them in the table with their
  source and date, and note that they are provider-reported rather than
  session-measured.
