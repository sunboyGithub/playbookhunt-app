# Build history

Milestone-by-milestone record of the Playbook Hunt build, written from
[playbookhunt_prompt/playbookhunt_coding_agent_prompts.md](../playbookhunt_prompt/playbookhunt_coding_agent_prompts.md).

One prompt per milestone. An entry is written after that prompt's checks run,
and again if the entry changes during review. Commits follow the same
one-prompt-per-session rule.

Each entry records four things:

- **What was built** — files and behaviour, as far as committed.
- **Checks and results** — what was actually run, and what it returned.
- **What to inspect in the browser** — concrete things for the project owner
  to open and look at, if anything.
- **Blocks and unverified criteria** — what is unfinished, untested, or could
  not be confirmed locally.

---

## P0 — Project brief (`AGENTS.md`)

**Status:** complete. Commit `5eaa6fb`, branch `main`, 31 tracked files.

### What was built

- `AGENTS.md` — the project brief, verbatim from the P0 prompt, cleaned up as
  Markdown.
- `CLAUDE.md` — exactly `See AGENTS.md`.
- Handoff materials copied per `BUILD_HANDOFF.md`:
  - `docs/design/` — 13 design frames (PNG) plus `CURRENT_DESIGN.md`.
  - `docs/brand/muse-avatar.png` and `public/brand/muse-avatar.png`.
  - `public/brand/agents/` — ChatGPT, Grok and Manus logos with `LICENSE.txt`
    and `README.md`.
  - `content/playbooks/` — 3 authored, untested starter playbooks.
  - `content/use_cases_and_kits.yaml` — starter catalog (8 categories).
  - `content/templates/` — blank template and filled example. `catalog_plan.yaml`
    deliberately **not** copied as import content; it is planning material.
- `supabase/config.toml` — local development config (`project_id = playbookhunt_app`).
- `.gitignore` — added beyond the P0 deliverables; covers `.env*`,
  `supabase/.temp` (which holds live local database keys), `.next/`,
  `node_modules/` and test output.

No application code. P0 instructed that none be written.

### Checks and results

| Check | Result |
|---|---|
| `AGENTS.md` vs brief extracted from prompt lines 26–114 | **Byte-for-byte identical** (`diff` clean) |
| `CLAUDE.md` contents | `See AGENTS.md\n` — verified at byte level |
| `git status` after commit | Clean |
| Files tracked | 31 |
| Local Supabase | 12 containers healthy (`supabase_*_playbookhunt_app`) |
| Secret scan of commit | `supabase/.temp/` excluded; no keys staged |

### What to inspect in the browser

Nothing is served yet — no dev server was started at P0. Useful things to open:

- **Design frames** — `docs/design/01_homepage.png` is the Frame 1 baseline for
  P4; `07a_mobile.png` / `07b_mobile.png` are the mobile-parity reference every
  UI prompt must match.
- **Supabase Studio** — <http://127.0.0.1:54323>. Expected to show an **empty**
  database; P1 creates no schema. A non-empty schema here would mean scope drift.
- **Muse avatar** — `public/brand/muse-avatar.png`, the fluffy character that
  appears in a Meta-blue ring wherever Muse is shown as an agent.

### Blocks and unverified criteria

- **P0 ships no explicit acceptance criteria.** The prompt states the task and
  "do not write any other code" but has no `Acceptance criteria:` block, unlike
  every later prompt. Verification above is by comparison against the prompt text.
- **Nothing has been executed.** No build, no tests, no runtime — by design.
- **Toolchain versions are unverified against the stack.** Installed: Node
  **v26.10.0**, pnpm **12.9.1**, Supabase CLI **2.119.0**, Docker **29.8.1**,
  git **2.50.1**. Node 26 is newer than Next.js/Playwright are typically
  validated against; expect to fall back to Node 24 LTS if native modules fail.
- **No keys or accounts configured.** Resend, PostHog, Sentry, Cloudflare
  Turnstile, Vercel and a hosted Supabase project are all still outstanding.
  Not blocking until roughly P10–P11; see the note in the P1 entry to follow.
- **Git topology is decided but not acted on.** The app is its own repository;
  the parent `playbookhunt/` spec package is untouched and has one unpushed
  commit that deliberately excludes a local credential file.

---

## P1 — Scaffold the app

**Status:** complete. Commit `c51127d`, 64 files. Supersedes the P0 note about
unverified toolchain versions — Node 26.10.0 and pnpm 12.9.1 both work.

### What was built

- **Next.js 16.3.8** — App Router, Turbopack, TypeScript strict, `src/`.
  Scaffolded via `create-next-app` into a temp directory and merged, because
  `create-next-app` refuses a non-empty directory.
- **Tailwind v4 + shadcn/ui** (radix base). All 14 required components
  installed: button, card, badge, input, dialog, sheet, tabs, select, checkbox,
  dropdown-menu, sonner, skeleton, avatar, tooltip, command. `textarea` and
  `input-group` came in as transitive dependencies.
- **Design tokens** in [src/app/globals.css](../src/app/globals.css) exactly as
  `AGENTS.md` specifies — background `#FAF9F6`, card white, border `#E7E5E0`,
  accent `#FF5A1F`, worked `#16A34A` / partly `#F59E0B` / didn't `#DC2626`, the
  Muse blue family (`#2A66DE`, soft `#E8EFFC`, dark `#1D4FB8`, line `#C3D4F5`),
  the Meta-blue avatar ring `#0081FB`, and 12/16px radii. Light theme only; no
  `.dark` block. Geist and Geist Mono via `next/font`.
- **Supabase SSR clients** — browser, server, admin (service-role), and session
  refresh middleware. `SUPABASE_SERVICE_ROLE_KEY` is server-only and the admin
  client refuses to build without it.
- **Env validation** — `src/lib/env.ts` fails at startup and names every missing
  key. Only the three Supabase/site keys are required; Resend, PostHog, Sentry
  and the service-role key stay optional until their prompt.
- **App shell** — header (two-tone `Playbook`+`Hunt` wordmark, nav, `⌘K` search
  trigger, Create, Report, Sign in, and a mobile menu) and the shared compact
  footer used on every page.
- **17 placeholder routes** — every route P1 names, plus `/privacy` and
  `/terms`, which the footer links to.
- **Tooling** — ESLint, Prettier, Vitest, Playwright, and the
  `dev`/`build`/`start`/`lint`/`typecheck`/`test`/`test:e2e` scripts.
  `README.md` documents setup; `.env.example` lists all seven variables.
- **`.env.local`** generated from the running local Supabase stack rather than
  pasted, so the keys never entered a transcript. Gitignored.

### Checks and results

| Check | Result |
|---|---|
| `pnpm typecheck` | **Pass** — no errors |
| `pnpm lint` | **Pass** — no findings |
| `pnpm test` | **Pass** — 7/7 across 1 file |
| `pnpm test:e2e` | **Pass** — 4/4, desktop + iPhone 13 (390x844) |
| `pnpm build` | **Pass** — 17 routes, Proxy registered |
| `pnpm dev` | **Pass** — HTTP 200 on `/` |
| Secret scan of the commit | `.env.local`, `.next/`, `node_modules/` all excluded; no key values staged |

### What to inspect in the browser

Dev server is running at **<http://localhost:3000>**.

- **Homepage** — background should be `#FAF9F6`, not white. "Hunt" in the
  wordmark must be orange; the word "Muse" in the H1 must be Muse blue. That
  pair is the quickest way to confirm the tokens landed.
- **Footer** — five links. Resize to ~390px wide: it should become three
  columns across two rows, with no tagline and generous tap targets.
- **Header at 390px** — nav collapses to a search icon and `☰`. Open the menu:
  labels stay descriptive ("+ Create a playbook", not "+").
- **<http://localhost:3000/p/some-slug>** — a dynamic route renders
  "Playbook: some-slug", which proves `params` await correctly.
- **<http://localhost:54323>** — Supabase Studio, still an empty schema (P1
  creates no database objects).

### Blocks and unverified criteria

- **Nothing is verified visually yet.** Automated checks confirm the shell
  renders and tokens compile, but no one has confirmed the colours *look*
  right against the design frames. That review is outstanding.
- **`pnpm dev` was verified in development mode only.** The production build
  succeeds, but P1's acceptance criterion is specifically about `pnpm dev`.
- **No placeholder route has a real page**, by design — that is P4–P12d.
- **Design tokens are inferred where the brief is silent.** `AGENTS.md` does not
  specify body text colour, muted greys, or the focus ring. Values were chosen
  to match the warm `#FAF9F6` surface, then corrected against the design frames
  in the P1 review entry below.
- **⌘K, the avatar menu and sign-in are inert.** The search trigger is a
  non-functional button and "Sign in" is a plain link, because auth and the
  palette are P8 and P4.
- **Two Next.js 16 behaviours needed intervention.** `next dev` appends a
  generated agent-rules block to `AGENTS.md`, which would break P0's verbatim
  requirement, so `agentRules: false` is set. The `middleware` file convention
  is deprecated in favour of `proxy`, so the file is [src/proxy.ts](../src/proxy.ts).
- **Playwright needs WebKit as well as Chromium.** The iPhone 13 device
  descriptor uses WebKit, so `pnpm exec playwright install chromium webkit` is
  required in CI. Noted in the README.
- **`docs/` was not modified**, per the prompt. Brand and template copies were
  already present from P0.

---

## P1 review — design-frame corrections

Not a new milestone. Findings from comparing the running shell against
`docs/design/01a_homepage_top.png` and `01b_homepage_bottom.png`, after the
owner reported visual mismatches.

### Colour tokens sampled from the frames

Values were read out of the PNGs with PIL rather than eyeballed. Flat fills are
exact; text values are the mode of the darkest cluster, since antialiased glyphs
fringe. Findings:

| Role | Frame | `AGENTS.md` | Action |
|---|---|---|---|
| Page background | `#FAF9F6` | `#FAF9F6` | matched |
| Card surface | `#FFFFFF` | `#FFFFFF` | matched |
| Brand accent | `#FF5A1F` | `#FF5A1F` | matched |
| Muse blue / dark / soft | `#2A66DE` / `#1D4FB8` / `#E8EFFC` | same | matched |
| Worked green | `#16A34A` | `#16A34A` | matched |
| Primary ink | `#1C1B19` | **unspecified** | adopted |
| Secondary ink (nav, kit headings) | `#2A2926` | **unspecified** | within 8/255 of primary; no separate token |
| Muted ink | `#66635D` (cluster `#625F59`–`#74716B`) | **unspecified** | kept `#6B675F`, inside the cluster |
| Card/pill border | `#E5E3DE`; header hairline `#E6E4DF` | `#E7E5E0` | kept the brief's value |
| Verified pill | `#DCFCE7` | **unspecified** | added as `--verified-bg` |
| Category tints | `#EAF4EE` mint, `#EEF0F8` lavender, `#FBF1E6` peach | **unspecified** | added as `--tint-*` |
| Skeleton rules | `#ECEAE4` | **unspecified** | added as `--skeleton` |
| Illustration palette | `#566094` indigo, `#3E6356` green | **unspecified** | noted, not tokenised |

The frames and the brief disagree by one or two units on every grey, consistently
in the same direction. That reads as a colour-profile shift in the export rather
than a different palette, so the brief wins wherever it speaks and the frames
supply only what the brief is silent about. The frames are themselves labelled
"illustrative data".

### What changed

- `--foreground` and the shadcn foreground aliases: `#1A1917` → `#1C1B19`, sampled.
- Four new tokens for values the frames use and the brief omits (above).
- **Header**, corrected against frame 01a: solid near-black Sign in button
  instead of an outline; Create and Report as white outlined pills instead of
  ghost; nav links in foreground ink rather than muted grey; fully-rounded pills
  throughout; header background solid `#FAF9F6` instead of `bg-background/90`
  with a backdrop blur.

### Correction to an earlier note

An earlier review claimed the search field was missing its magnifier icon. That
was wrong — the icon was already there. It is visible in the frame at the left
inside the field, and the component already rendered it there.

### Checks and results

| Check | Result |
|---|---|
| `pnpm typecheck` | **Pass** |
| `pnpm lint` | **Pass** |
| `pnpm test` | **Pass** — 7/7 |
| `pnpm test:e2e` | **Pass** — 6/6 (was 4/4; see below) |
| `pnpm build` | **Pass** — 17 routes |
| Header screenshot vs frame 01a | Matches on button treatment, rounding, ink colour and hairline |

### New e2e test: `renders with no console errors or hydration warnings`

Fails on any console error, console warning or uncaught page error. Two reasons.
First, a hydration mismatch surfaces *only* as a console error, so every other
test in this file would stay green through one. Second, it pins down a
confusing report: three errors the owner sees in a normal browser window —
a React hydration mismatch showing `bis_skin_checked` / `bis_register`
attributes, a `Cannot read properties of undefined (reading 'M_ID')` from
`chrome-extension://eppiocemhmnlbhjplcgkofciiegomcon`, and
`Failed to connect to MetaMask` from
`chrome-extension://nkbihfbeogaeaoehlefnkodbefgpgknn` — are all browser
extensions, not application code. The first is Google Bisect rewriting the DOM
before React hydrates, which Next.js documents as a cause of hydration errors;
the other two are third-party extensions that the page never references.
Playwright loads no extensions, and this test passes clean on both desktop and
mobile. The fix for a noisy local console is an incognito window or disabling
those extensions, not changing the app.

### Still outstanding

- **The homepage is still a placeholder.** Frame 01a differs from what is served
  in almost every visible respect: centred bold H1, large centred search field
  with the orange Search button inline, the `48 playbooks · 3,210 real results`
  line, three sort tabs, a row of category pills, tinted cards, "Top playbooks
  this week" and "Trending". All of that is P4, and the placeholder should not be
  read as a design regression.
- **Frame 01b's footer is not what is built**, deliberately. The frame shows
  "Request a playbook" and "Create a playbook (beta)" plus the
  "Numbers shown are illustrative…" tagline. `CURRENT_DESIGN.md` and
  `AGENTS.md` replace that with the compact five-link footer that is served.
- **Header container width** is `max-w-6xl` centred; the frame is full-bleed at
  1440. Cosmetic, and left alone.

---

## P2 — Database schema, RLS, types

**Status:** complete. `supabase db reset` applies cleanly; 36 pgTAP assertions pass.

### What was built

- **`supabase/migrations/20240101000000_init_schema.sql`** — every table the
  brief names (plus a `feedback` table, which P12c needs and the brief requires
  under Privacy). RLS on all of them, a `public_reports` view, both storage
  buckets, column grants, and four helper functions.
- **`supabase/migrations/20240101000001_seed_taxonomy.sql`** — the 8 categories
  and 7 agents as a migration, so production gets them. All
  `launch_url_template` values are null.
- **`src/lib/database.types.ts`** — generated, and wired into all four Supabase
  clients so a schema change breaks the build rather than the runtime.
- **`src/server/queries/`** — `types.ts` (shared row types, thresholds, sort
  options), `playbooks.ts` (`getPublishedPlaybookBySlug`, `listPlaybooks`,
  `getVersionContent`, sorting, the "proven to work" eligibility query) and
  `taxonomy.ts` (`getCategory`, `getCollection`, and the category/agent/kit/use
  case lists).
- **Scripts** — `db:types`, `db:reset`, `test:db`, `test:all`.
- **Tests** — 14 schema assertions and 22 RLS assertions in pgTAP, plus 12 unit
  tests over the sorting rules.

### Design decisions worth knowing

- **Sorting happens in JS, not SQL.** PostgREST cannot order by an embedded
  resource, so `evidence_score` cannot be reached through a `stats` embed. The
  alternative was denormalising the score onto `playbooks`, which would put the
  ranking output in two places that could disagree. At ~48 rows the cost of
  sorting here is nil.
- **`user_id` is ungranted on `outcome_reports`.** Supabase grants table-level
  `select` to anon by default, so that had to be revoked before the enumerated
  column grant meant anything. This is what the acceptance criterion "anon cannot
  read user_id on reports" actually turns on.
- **`public_reports` is deliberately not `security_invoker`.** An invoker view
  runs as anon, which cannot read `user_id` and so cannot evaluate its own join.
  Granting that column to make it work would hand the identity straight back. It
  runs as its owner instead, carries its own `status = 'approved'` filter in
  place of RLS, and anon only ever selects derived columns.
- **`owns_report()` mirrors `is_admin()`.** The evidence policies need to ask
  "is this report mine?", which needs `user_id`. Resolving that in a
  `SECURITY DEFINER` function keeps the column unreadable while still letting the
  policy ask. Same reason `is_admin()` is not a plain `select role from profiles`.
- **Row counts below a threshold filter in JS** for the same reason: filtering an
  embedded relation server-side would drop every playbook with no stats row,
  which before P9 is all of them.

### Bugs the tests caught before anything shipped

1. **`set_updated_at` on `profiles` would have broken every signup.** The
   trigger assigned `new.updated_at`, but the brief gives `profiles` only
   `created_at`. Every `auth.users` insert would have raised. Found by the RLS
   test's own signup fixture.
2. **The evidence policies were unreachable.** Left unscoped they applied to
   PUBLIC, so anon evaluated a subquery against a table anon cannot read and got
   a permission error instead of an empty result. Now scoped to
   `authenticated`.
3. **`playbook_agents` and `playbook_sources` hang off the playbook, not the
   version.** A nested select under `playbook_versions` asked for a relation
   that does not exist; TypeScript caught it. They are now a second query keyed
   on `playbook_id`.
4. **The sort comparator was reversed**, which silently ordered the homepage
   worst-first. Caught by the unit tests.
5. **The required-input trigger double-counted on update**, so re-saving an
   already-required input would trip the two-input cap against itself.

### Checks and results

| Check | Result |
|---|---|
| `supabase db reset` | **Pass** — applies cleanly, no warnings |
| `pnpm test:db` | **Pass** — 36/36 across 2 files |
| `pnpm typecheck` | **Pass** |
| `pnpm lint` | **Pass** |
| `pnpm test` | **Pass** — 19/19 |
| `pnpm build` | **Pass** — 17 routes |
| `pnpm test:e2e` | **Pass** — 6/6 |

### What to inspect in the browser

- **<http://localhost:54323>** — Supabase Studio. Tables and views under
  `public`. Expected: 8 categories, 7 agents, and **no playbooks** (P3 creates
  them). A playbook here before P3 means scope drift.
- **Table Editor → `public_reports`** — empty, and structurally unable to show a
  reporter: the view exposes `display_name` and `display_initial`, never
  `user_id`.
- **Storage** — two buckets, `evidence` private and `previews` public.

### Blocks and unverified criteria

- **Nothing is committed to git and nothing is pushed.** `gh` is now installed
  but is not authenticated, so `git push` cannot run until someone logs in.
- **`playbook_stats` is empty and has no writer.** Every aggregate column exists
  with a zero default; the job that fills them is P9. Until then `listPlaybooks`
  returns rows with `stats: null`, which is the path the tests cover.
- **The full-text search path is untested against real content.** `search_tsv` is
  maintained by trigger and GIN-indexed, and pgTAP asserts the trigger exists,
  but no content exists yet to search. P3 and P5 exercise it properly.
- **Types were generated from the local database**, so they reflect local config.
  Regenerate against the hosted project before the first deploy if the hosted
  project's extensions differ.

---

## P3 — Content pipeline: schema, importer, first playbooks

**Status:** complete. Three example playbooks imported, idempotency and the
version-bump criterion both verified.

### What was built

**Authoring format.** `content/playbooks/<slug>.yaml`, one file per playbook,
with `content/templates/playbook_template.yaml` as the copy-me starting point
and `content/use_cases_and_kits.yaml` for use cases and starter kits. A
playbook's identity *is* its filename: `validate-content.ts` fails the build if
the two disagree, which stops `lower-your-internet-bill.yaml` from importing as
`lower-your-internet-bill-2`.

**`src/lib/content/schema.ts`** — zod schemas for both file types. Two rules
here are product constraints rather than type hygiene, enforced where the
content is written rather than trusted at runtime:

- At most **two required inputs**. AGENTS.md caps the ask on the reader, and a
  DB trigger enforces the same rule independently, so neither layer can be
  edited past it alone.
- Every `{{placeholder}}` in the prompt must name a declared input, and every
  required input must appear. An undeclared `{{provider}}` would be sent to the
  agent as literal text; an unused *required* field makes the reader do work
  that changes nothing. An unused *optional* field is a deliberate choice and is
  left alone — it still shows on the "what you'll need" list.

**`scripts/import-content.ts`** — the importer. Upserts categories (owned by
the seed migration, so it warns on drift instead of writing), use cases,
playbooks, versions, inputs, steps, agent links, sources, and memberships. It
reports every intended write as `create`/`update`/`version`/`unchanged`/`skip`,
honours `--dry-run`, and prints a summary line.

**`scripts/validate-content.ts`** — the same validation with no database, for CI.
It adds two checks only possible offline: every category referenced is one of the
eight in AGENTS.md, and every playbook the catalog names either has a file or is
at least a well-formed slug. The last case is a *note*, not a failure — the
catalog is allowed to reference playbooks not yet written.

**Three example playbooks** — `lower-your-internet-bill`,
`cheaper-car-insurance`, `plan-7-days-in-japan` — chosen to span outcomes
(monthly money, yearly money, non-money binary) so the ranking and reporting
thresholds are exercised by real data rather than by fixtures alone.

### Bugs found and fixed

1. **The version check was a silent no-op.** The embed
   `inputs:playbook_inputs (...)` could not be resolved by PostgREST, so the
   query returned `null` with its `error` discarded. The diff then compared
   nothing, took the "unchanged" branch, and **editing a prompt would never
   have created version 2** — the single acceptance criterion P3 exists to
   satisfy. Fixed with explicit FK hints (`!playbook_inputs_version_id_fkey`)
   and a `throw` on `error`, so a future schema-cache failure cannot again
   masquerade as "nothing changed". `src/server/queries/playbooks.ts` had the
   same embed and the same latent bug; fixed there too.
2. **Import order dropped every use-case membership.** Playbooks were imported
   before the use cases they reference existed, so each membership was skipped
   with a warning and the importer still exited 0. Reordered into three phases —
   catalog metadata, then playbooks, then kit membership — with a comment
   recording why the order is load-bearing.
3. **`linkMembers` misreported its own work.** The caller counted rows before
   and after to infer what had been inserted, so a run that had just linked two
   playbooks reported "already linked". It now returns the count it inserted.
4. **A dry run would have written to the database.** The guard read
   `if (dryRun || drifted)`; it must be `if (!dryRun && drifted)`.
5. **Three type errors in the membership writer**, all from trying to be too
   clever: computing the parent key as `[foreignKey]` widened the row to an
   index signature matching neither insert shape, and passing a union of tables
   to `.from()` with a union of row arrays defeated overload resolution. Each
   branch is now written out in full with `rows` declared inside it.
6. **A dead `let currentVersion = …eq("id", "null")` placeholder** and an unused
   `file` parameter, both left from an earlier draft.

### Checks and results

| Check | Result |
|---|---|
| `pnpm content:validate` | **Pass** — 3 playbooks and the catalog valid |
| `pnpm content:import` on an empty DB | **Pass** — 12 changes written |
| `pnpm content:import` again | **Pass** — `0 change(s) written, 12 unchanged` |
| `supabase db reset` | **Pass** — migrations apply cleanly from scratch |
| Edit a prompt → re-import | **Pass** — `v2 — content changed (was v1)` |
| v1 retained after the bump | **Pass** — v1 present, `current_version_id` moved to v2 |
| `pnpm test` | **Pass** — 37/37, 18 of them new content-schema tests |
| `pnpm test:db` | **Pass** — 36/36 |
| `pnpm typecheck` | **Pass** |
| `pnpm lint` | **Pass** |
| `pnpm test:e2e` | **Pass** — 6/6 |

The two template-drift tests assert that every key in
`playbook_template.yaml` is declared by the schema *and* vice versa. The
schema's own doc comment claimed such a test existed; it did not, and now it
does.

### What to inspect in the browser

- **<http://localhost:3000/p/lower-your-internet-bill>** — currently a
  placeholder that says so. It becomes the real detail page in P6.
- **<http://localhost:54323> → Table Editor** — `playbooks` (3 rows, all
  `published`), `playbook_versions` (3 rows, all v1 after a reset),
  `playbook_inputs`, `playbook_steps`, `use_cases`, `collections`. Open a
  playbook's prompt and read it against the YAML file: they should match.
- **Re-run `pnpm content:import`** — every line should say `unchanged` or
  "already linked". If anything says `create`, the importer is not idempotent.

### Blocks and unverified criteria

- **Nothing is pushed to GitHub.** `gh` is installed but not authenticated, so
  no remote can be created. This needs the project owner's `gh auth login`.
- **`getVersionContent` is fixed but not yet exercised by a route.** The
  playbook detail page is still a P6 placeholder, so the page-level query path
  has no coverage. The identical embed in the importer is verified working, so
  the fix is real — but "the detail page renders its prompt" is untested until
  P6, and should be checked there rather than assumed.
- **Only three playbooks exist.** The catalog references more; those are
  reported as skipped, by design.
- **The importer has no automated test.** Its behaviour was verified by running
  it — idempotency, version bump, membership counts, clean-DB import — but
  there is no fixture-based suite, so a future refactor could regress it
  without a red test.
- **`supabase db reset` prints `no files matched pattern: supabase/seed.sql`.**
  Harmless: content is imported by the script, not by a SQL seed. Worth
  removing the reference or pointing it at the importer so the warning stops
  implying something is missing.

---

## P4 — Homepage v2 and PlaybookCard system

**Status: complete and verified.**

The checks below were all run to green. The first attempt at this milestone was
written and reviewed by reading but never compiled, because the tool that
executes commands became unavailable partway through; that draft is recorded
under *Bugs found and fixed* below, because every one of those defects was real
and only the checks found them.

### What was written

- **`src/lib/stats/format.ts`** — every outcome figure the UI renders, and the
  thresholds that decide whether a figure may appear at all. Functions that can
  show a percentage return a discriminated `{kind: "rate" | "early"}` rather
  than a string, so no call site can format a rate without also deciding whether
  one is allowed. `toOutcomeStats` merges a playbook with its stats row, because
  `outcome_type` and `last_verified_at` live on one table and the counts on the
  other, and a forgotten column would silently drop the median suffix.
  **`format.test.ts` (38 tests) was written but has never been executed.**
- **`src/components/playbook-card/`** — one card, three densities. All three
  read evidence through the shared formatter, so a compact card cannot render a
  percentage that a rich card would refuse.
- **Homepage sections** in `src/components/home/` — hero with a rotating
  placeholder, use-case carousel, proven row, top-this-week, trending switcher,
  starter kits, category explorer, report CTA. Three are client components; the
  rest are server components.
- **`src/server/queries/home.ts`** — one function returning everything, so the
  page has a single `await` and therefore no per-section skeletons, per the
  prompt.
- **⌘K palette** (`src/components/command-palette.tsx`) plus a new migration
  adding `pg_trgm`, a GIN trigram index on `playbooks.title`, and a
  `search_playbooks()` function restricted to published rows.
- **`src/lib/site-config.ts`** — the Muse referral note. `termsUrl` is empty, so
  `museReferralNote()` returns null and the note does not render. AGENTS.md
  requires a link to Muse's official referral terms wherever a referral code
  appears, and inventing that URL would put a fabricated citation in front of
  every reader.
- **e2e** — search submits to `/search?q=`, ⌘K opens and navigates, and a
  navigation-regression spec that delays the destination document and asserts
  the old page stays visible. `playwright.config.ts` gained an `E2E_TARGET=prod`
  switch, because that spec is meaningless against the dev server.

### Bugs found and fixed

Ten defects, none of which a compiler or a reviewer would have found. Worth
recording because they share a shape: each was a claim that read as true.

**Statistics and labels**

1. **The hero counter reported a page size as a catalogue size.** It derived
   `totals.playbooks` from `playbooks.length`, but that list is `listPlaybooks`'
   default page of 24. On a catalogue of ~48 the hero read "24 playbooks". Now
   counted separately with a `head: true` count.
2. **"Proven to work" checked half of its own bar.** `listProvenPlaybooks`
   filtered on evidence count alone and never checked report count. Three
   screenshots on one report are three evidence rows and one report, so a
   five-report playbook would have sat under a heading promising proof. Now
   requires `report_count >= REPORT_THRESHOLD` as well.
3. **That same function could silently drop a proven playbook.** It filtered a
   24-row page, so a genuinely proven playbook ranked 25th by evidence would
   never appear — in the one row whose whole purpose is surfacing them. Now
   requests a full-catalogue page.
4. **"Top playbooks this week" was sorted by all-time evidence.** `evidence_score`
   has no time window; `trending_score` is the weekly notion and is empty until
   P9. Renamed to "Most proven", named for what it orders.
5. **The "Proven to work" fallback discarded real results.** It triggered at
   fewer than three qualifying playbooks, so two genuine ones were thrown away in
   favour of three that had not cleared the bar. Now falls back only at zero.

**Broken rendering**

6. **Every page on the site crashed.** `CommandDialog` never wrapped its children
   in `<Command>`, so `CommandInput` read an undefined cmdk context and threw on
   `subscribe`. Because the ⌘K palette lives in the root layout, this took down
   all 19 routes, not only the ones that opened the palette.
7. **An ambiguous embed 500'd every listing route.** `PLAYBOOK_SELECT` embedded
   `primary_agent:agents` without naming the foreign key, and there are two paths
   from playbooks to agents — the `primary_agent_id` column and the
   `playbook_agents` join table. PostgREST raised rather than guessing, which was
   correct: guessing the join table would have attached the wrong agent to every
   card. Fixed with `!playbooks_primary_agent_id_fkey`.
8. **A database error would have 500'd every route.** `listCategories()` throws,
   and it was called from the root layout — so a DB hiccup took down sign-in and
   404 alike. The same failure mode P1 already recorded once. Now caught and
   degraded to an empty category list.
9. **The header's "Report a result" pointed at `/search`.** The route is
   `/report`; the link was dead in both desktop and mobile nav.
10. **The ⌘K palette was mounted twice**, once per breakpoint. Each instance
    registered its own global ⌘K listener and its own dialog, so two Radix
    dialogs opened on one keypress and fought over the focus trap — which is why
    the shortcut test passed on one project and failed on the other. Now one
    instance with a responsive trigger.

**Content pipeline — a bug that predates P4**

11. **Use-case membership had never been linked, ever.** `importCatalogMeta`
    linked use-case members in phase 1, before any playbook was imported, so
    every slug was reported as missing and skipped; phase 2 re-linked *kits* but
    never use cases. The import still reported success, because a skipped link
    and a written one produce the same summary when nothing was written. Fixed by
    moving use-case linking into a second phase, and `linkMembers` now throws
    rather than warns — at phase 2 an unresolved slug is never a sequencing
    artefact.

**Two tests that could not have caught their bug**

12. **The navigation regression delayed nothing.** It intercepted the *document*,
    but a `<Link>` click in the App Router is a client-side navigation that never
    requests a document. The delay never applied, so the spec passed against a
    no-op. It now intercepts the RSC payload — which is what React actually
    waits on before swapping trees, and therefore the window the test exists to
    measure.
13. **It also asserted a target it did not run against.** Its comment claimed a
    production build while `pnpm test:e2e` serves from `next dev`. It now skips
    unless `E2E_TARGET=prod`, rather than passing against the wrong target.

**Found by reading, before any check ran**

14. `ReportCta` synthesised a stats object with `amount_n: 100` to force a median
    to render — a fabricated statistic in source. Replaced with
    `describeOutcome`, which formats the amount actually filed.
15. A dangling `aria-labelledby` pointing at heading ids that had been removed.

### Checks and results

All run after the fixes above. Every one is green.

| Check | Result |
|---|---|
| `pnpm db:reset` | 3 migrations applied, including `20240101000002_search.sql` |
| `pnpm content:import` | 12 changes on an empty database, then `0 change(s) written, 14 unchanged` on re-run |
| `pnpm typecheck` | clean |
| `pnpm lint` | clean |
| `pnpm test` | **75 passed** (38 stats, 18 content schema, 12 playbooks, 7 env) |
| `pnpm test:db` | **36 pgTAP passed**, 2 files |
| `pnpm build` | 17 static pages, 19 routes |
| `pnpm test:e2e:prod` | **24 passed** — 16 on dev, 8 navigation skipped by design |

The use-case fix was confirmed against the database rather than inferred from the
import's own summary:

```
       slug        | playbooks
-------------------+-----------
 cut-monthly-bills |         2
 plan-a-trip       |         1
```

### Two things this milestone got wrong about itself

**A prediction I made and that was false.** I said the pgTAP suite would likely
fail, since it was written in P2 against a schema with four functions and now
there are five plus a GIN index. All 36 passed unchanged — they assert on tables,
RLS and permissions, not on the exact contents of the function set.

**A green build meant much less than it appeared to.** `pnpm build` succeeded
early, while the homepage was 500ing on every request. Every listing route is
`ƒ (Dynamic)`, so a build prerenders their shells and runs none of their queries.
The build was never going to catch defect 7; Playwright did, on its first real
request. Three of the six checks were green before anything was known to work.

### What to inspect in the browser

1. **`/`** — hero, category chips, use-case carousel, proven row, most-proven
   list, starter kits, report CTA. With three playbooks and no reports, the
   counter must read "3 playbooks" and **must not** show a results figure. The
   proven row should fall back to "Recently verified".
2. **`/` evidence text** — every card must show `Early · N reports`, never a
   percentage. This is the AGENTS.md threshold doing its job with real data.
3. **⌘K** — press it, type `internet`, and confirm it reaches the playbook. This
   is `search_playbooks()` and the trigram index, exercised end to end for the
   first time. At rest it must list categories and the two actions.
4. **390×844** — the single palette trigger collapses to an icon button, the
   hamburger opens the sheet, and the carousel peeks a tile past the right edge.
5. **`/playbooks`, `/c/[slug]`, `/p/[slug]`** — all three share `PLAYBOOK_SELECT`
   and all three were 500ing; confirm each renders a card with the right agent.

### Blocks and unverified criteria

- **The `/try` flow does not exist.** The rich card's Try button points at
  `/p/[slug]`. P7 builds it; a button that 404s would be worse.
- **`search_playbooks` is exercised by one e2e path.** It returns results and
  ranks them, but nothing tests the published-only restriction or a query that
  should match nothing. Worth a pgTAP test before P9 depends on it.
- **`/search?q=` is still a placeholder route.** The homepage form submits there
  and the page does nothing useful with the query yet.
- **`museReferralNote()` returns null** because `termsUrl` is empty, so the
  referral note never renders. That is deliberate — AGENTS.md requires a link to
  Muse's official terms wherever a referral code appears — but it means the note
  is untested and unrendered code until that URL is supplied.

---

## P5 — Search, results, category & starter-kit pages

**Status:** complete. Branch `main`.

### What was built

**Search backend.**

- `supabase/migrations/20240101000005_search_backend.sql` —
  `search_playbooks_ranked(q, syn, similarity_threshold, match_limit)`, a
  `SECURITY DEFINER` function returning `(id, rank)`. Three branches OR'd
  together: the reader's own words as a tsquery, a synonym clause (`||` on a
  tsquery is OR), and a trigram fallback on the title. `word_similarity` rather
  than `similarity`, because a whole-string comparison scores `insurence`
  against `Cheaper car insurance` poorly on length alone. Executable by `anon`,
  because search happens before sign-in.
- `supabase/tests/003_search.sql` — 12 pgTAP assertions, every one running as
  `anon` rather than the table owner. A function that works for the owner and
  fails for a reader is broken, and only impersonating the role catches it.

**Query layer** (all pure, all unit-tested, none `server-only`).

- `src/lib/search/synonyms.ts` — 37 hand-written groups. Symmetric, no
  chaining, and a word in two groups unions both.
- `src/lib/search/query.ts` — tokenising, stopwords, quoted phrases. Splits into
  an AND clause (`text`) and an OR clause (`synonyms`), which is the whole
  design: a synonym can widen a search but never let a row match on a word the
  reader did not type.
- `src/lib/search/category-keywords.ts` — 8 categories, weighted by matched-word
  length so a specific match beats a generic one.
- `src/lib/search/params.ts` — the URL as the single source of truth. Unknown
  values fall back to "no filter" rather than throwing, because a stale link
  should show the unfiltered list, not a 500.
- `src/server/search.ts` — the orchestrator, and the three never-dead-end
  layers: text results, then the category fallback when results are thin
  (`MIN_TEXT_RESULTS = 3`, and only when widening adds something), then popular
  playbooks plus the request form.
- `src/lib/analytics.ts` — hand-written PostHog wrapper, no SDK dependency.
  `trackSearch` sends query *length* only, never the query itself.

**Routes** — `/search`, `/playbooks`, `/categories`, `/c/[slug]`, `/kits`,
`/k/[slug]` and `/use-cases/[slug]` all rewritten from `Placeholder` stubs.
`/search`, `/playbooks`, `/c/[slug]` and `/use-cases/[slug]` render one shared
`ResultsView`, so a filter added to one appears on all four.

### Checks and results

| Check | Result |
|---|---|
| `pnpm lint` | clean |
| `pnpm typecheck` | clean |
| `pnpm test` | **141 passed** (66 new across synonyms, query, category-keywords, params) |
| `pnpm test:db` | **48 pgTAP passed**, 3 files |
| `pnpm build` | 17 pages, 18 routes, all `ƒ (Dynamic)` |
| `pnpm test:e2e` | **56 passed**, 8 navigation tests skipped by design |

The trigram threshold was the largest unproven risk in this milestone —
`similarity_threshold = 0.4` was a reasoned guess, not a measurement. It is now
settled by measurement rather than argument: `003_search.sql` asserts that
`insurence` reaches *Find cheaper car insurance*, and that a nonsense probe
matches nothing.

### Three real bugs, all found by tests rather than by reading

**The mobile filter sheet could never be opened.** `onOpenChange` handled only
the closing transition, so tapping "Filters" fired the callback with `true` and
the handler ignored it — `open` stayed `false` forever. The sheet was
unopenable for any user on a phone. Desktop could not catch this: the sidebar is
a different element. The mobile half of the suite is the only reason it was
found.

**The category and agent filters were inert.** Both filtered on an embedded
resource's column (`category.slug`), which PostgREST was not applying —
`/playbooks?category=personal-finance` returned the whole catalogue, Japan
included. Now filters on the real foreign keys, `category_id` and
`primary_agent_id`, resolved through one slug→id lookup. An unknown slug returns
zero rows rather than everything. **The agent filter had no test at all** and was
almost certainly broken the same way; it was fixed on the same reasoning rather
than left as a known-broken sibling.

**`/playbooks` printed `No playbooks yet for "…"` twice** on an empty result —
once as the `aria-live` count line and once as the empty-state heading, stacked
in two type sizes. The count line now counts; the empty state owns the prose.

### Two layout bugs found in review

**The header's search pill was misaligned.** `CommandPalette` used
`className ?? "inline-flex … items-center gap-2 …"`, so the header's
`className` — always passed, to set widths — discarded the default wholesale and
with it all three layout classes. Icon, label and ⌘K badge sat on an inline text
baseline, and `ml-auto` on the badge went inert because it is a flex-only trick.
Now merged with `cn`.

**Category emoji were missing from the homepage** chips and the Explore list,
while `/categories` already showed them. Both now render the same emoji.

### What to inspect in the browser

1. **`/search?q=comcast`** — no title or tag contains "comcast". This can only
   resolve through the synonym group.
2. **`/search?q=insurence`** — the typo. Reaches *Find cheaper car insurance*
   through the trigram branch alone.
3. **`/search?q=lower my bills`** — must show the substitution notice reading
   `Matched: “bills” → Personal finance`, quoting the reader's own word rather
   than the keyword that matched.
4. **`/search?q=xyzzy plugh frobnicate`** — the third layer: popular playbooks
   plus the request form. Must not be a blank page.
5. **`/playbooks` → click *Personal finance*** — URL gains `category=`, the card
   count drops, and Japan disappears. This is the filter that was silently inert.
6. **390×844 → Filters** — the sheet must open and the facets must work inside
   it. This is the control that could not be opened at all before this fix.
7. **`/k/cut-your-bills-kit`** — row density, two playbooks, author order.

### Blocks and unverified criteria

- **Three unit tests I wrote asserted things that were false.** `tokenize`
  expected a stopword to survive, `synonymsFor("invoice")` expected a word it was
  never grouped with, and the provider test correctly failed because
  `comcast`/`xfinity`/`verizon`/`att` were genuinely missing from the category
  map. Only the third was a product bug. The first two were fixed by correcting
  the expectations; I have not re-checked whether the *comments* in those tests
  were also wrong.
- **The trigram threshold is safe for `insurence`, not tuned.** 0.4 works for
  the tested pair. A shorter title, or a typo further from the real word, may not
  clear it, and nothing tests the range.
- **The word_similarity branch is a sequential scan.** It is not index-backed,
  because a bare function comparison does not use the GIN trigram index. At 3
  rows this is irrelevant; at 500 it is not.
- **The Plan / Research / Create outcome pills are a v1 approximation.**
  `outcome_type` records only *how much* a playbook saves, never what kind of
  task it is, so those three pills filter by category. Documented in
  `params.ts`, and an open question for the project owner.
- **`pnpm test:e2e:prod` has not been run since these fixes.** The 8 navigation
  tests only execute under `E2E_TARGET=prod`, so they are untested against every
  change in this milestone.
- **The e2e suite verifies filters work, not that the controls are correctly
  labelled for screen readers.** An accessible-name assertion was dropped when
  the locator moved to `data-facet` to escape Radix's `aria-hidden` handling.
  Nothing about the UI regressed, but that property is no longer asserted.

## P6 — Playbook detail page

### What was built

**The page itself** — `src/app/p/[slug]/page.tsx`, replacing a placeholder stub.
Breadcrumb, title, promise, category, primary agent and time range in the header;
then stat tiles, the redacted outcome preview, who it is for / not for, inputs,
the prompt, the steps, the worked/partly/didn't bar, the report list with its
filters, and a report CTA. `generateMetadata` publishes the promise verbatim as
the description, a canonical URL and OpenGraph tags. `HowToJsonLd` emits the steps
and nothing else — deliberately no `aggregateRating`, because a success percentage
is not a star rating, and emitting one would put in a search result a number this
site never computed.

**The statistic layer** — `src/lib/stats/detail.ts`, split out of `format.ts`
because these return structured results rather than strings. A tile is a value
plus the caption that explains what it counts, and whether that caption is a
percentage or the word "Early" is a threshold decision the caller must not be able
to make for itself. Returning a string would let a component print `68% worked` on
four reports by calling `.toString()` on something it should have had to ask
about. Thresholds are imported from `server/queries/types.ts` and never restated.

**The bar, and why it carries two numbers per segment.** `percent` is
`count / report_count`, the share of all reports, rounded for a label. `width` is
`count / sum(counts)`, exact, because the bar has to fill its track. They differ
whenever `worked + partly + didnt` is not exactly `report_count`, which happens
whenever a report is rejected or flagged an outlier. Normalising widths by
`report_count` would render a bar that stops two-thirds of the way across and
looks like a rendering bug rather than like what it is. The three labels are left
to round independently rather than forced to sum to 100, because forcing them
would mean inventing percentages.

**`last30Line` takes its denominator as a parameter.** `playbook_stats` stores
`last30_success` without the count it was computed from, so a 30-day percentage
cannot be threshold-checked at all — and an uncheckable percentage is exactly what
AGENTS.md forbids. The caller counts recent reports itself and passes the number
in. It reads `last30_success` and never `success_rate_raw`: the two are different
measurements, and labelling the all-time rate as a 30-day figure produces a page
whose halves each look right and whose labels disagree.

**`src/lib/share.ts`** — pure URL builders, no DOM, in brief order. Instagram and
TikTok get `href: null, nativeOnly: true`, because no web share URL exists for
them; the menu falls back to copy-link on desktop rather than inventing a link.

**Twelve detail components** in `src/components/playbook/detail/`: stat tiles,
worked bar, prompt block, share menu, save button, works-with, sources list,
sidebar, report list, report filters, inputs list, and the audience/steps/
outcome-preview/report-CTA group.

**A try page** at `/p/[slug]/try`, deliberately minimal and documented as
incomplete until P7. It exists so the sidebar's try button is not a 404 — a button
that does less is better than one that goes nowhere.

**An opengraph image** at 1200×630, whose evidence line is rendered by the *same*
`formatEvidenceHeadline`/`formatEvidenceSampleSize` the cards use. A share image
is the easiest place in the product to leak a percentage the page was not allowed
to show, so it does not get its own formatting path.

**`outcome_reports.evidence_reviewed`** — a migration adding the column and
re-declaring `public_reports` with it appended last, because `CREATE OR REPLACE
VIEW` can only append columns. `report_evidence` has no public select policy, so
the page otherwise cannot ask whether a report's evidence was approved. The leak is
one boolean, never the file, path or uploader.

**`log-try-event`** — a server action inserting into `try_events` with a
first-party `ph_device` httpOnly cookie. It never throws: a failed analytics
insert must not surface on an interaction that otherwise worked.

**`scripts/seed-fixture-stats.ts`** and `pnpm db:seed-stats`, which writes
synthetic reports so the bar, median, last-30 line and report list can be *seen*.
Every report belongs to a profile named "Fixture reporter N", so a populated page
is obviously populated with fixtures. It refuses any non-localhost URL, because a
fixture that can reach production would be a way to publish 40 fake verified
reports on a product whose entire claim is that its reports are real.

### Checks and results

| Check | Result |
| --- | --- |
| `pnpm lint` | clean, 0 errors 0 warnings |
| `pnpm typecheck` | clean |
| `pnpm test` | **181 passed**, 10 files (was 141) |
| `pnpm test:db` | **48 pgTAP passed**, 3 files |
| `pnpm build` | succeeded, 22 routes, all `ƒ (Dynamic)` |
| `pnpm test:e2e` | **90 passed, 8 skipped, 0 failed** (was 80 passed, 10 skipped, 8 failed) |

### Five test failures, and in every case the test was the thing that was wrong

This is the P5 lesson held to, and it paid out: all five were fixed by correcting
the test, none by changing the app.

1. **`grantPermissions(["clipboard-write"])` is rejected outright by WebKit** —
   "Unknown permission" — not ignored, but fatal to the whole call. The mobile
   project is iPhone 13. Now granted per browser.
2. **`page.route("**/rest/v1/try_events**")` could never have fired.**
   `logTryEvent` is a server action: the browser POSTs to the Next route with a
   `Next-Action` header and the Supabase insert happens *server-side*. `page.route`
   only sees requests the browser makes. The test now reads the row back with the
   service role, which is the stronger assertion anyway — it proves the action ran,
   wrote the right value, and attached it to the right playbook.
3. **`.or()` unions two elements, then fails strict mode for containing two.**
   The try button exists twice by design. The assertion was wrong about the page.
4. **Exactly one visible try button is true on desktop and false on mobile.** The
   sidebar sits below the entire main column on a phone, so its CTA is a
   deliberate second CTA rather than a replacement for the mobile bar's. The test
   now asserts where they point, not how many there are.
5. **The ⌘K tests were racing hydration.** The shortcut is bound in a `useEffect`,
   so it does not exist until hydration, and `keyboard.press` has nothing to wait
   for — unlike a click, which Playwright holds until actionable. This is why the
   header-button test passed and the keyboard one failed. Seeding fixtures made the
   homepage slower to hydrate and exposed a race that was already there. A real
   person cannot press ⌘K before the page loads, so this is a test-timing fix, not
   a product one.

### Two tests that assumed an empty database

Seeding fixtures broke three assertions written in earlier milestones. All three
were **scoped rather than weakened**, because a suite that only ever sees an empty
database is testing a state that stops existing on day one:

- `002_rls.sql` asserted `count(*) = 1` over the whole `public_reports` view and
  got 72. Its sibling assertion one block above already scoped by `test-playbook`;
  these now match. The `display_initial` check also used `limit 1` over an unsorted
  view, so seeded rows decided which initial it asserted on — now scoped too.
- `home.spec.ts` asserted "no percentage anywhere on the homepage". The rule is
  per-playbook, so the test is now per-card: `lower-your-internet-bill` shows
  Early and no percentage, and the converse is asserted too so the rule is not
  satisfied by never publishing anything.
- The detail page's "empty stats" test now reads the report count from the database
  and asserts the correct side of the threshold, whichever side that is.

### The `revalidate = 300` on this route is currently inert

The build reports `/p/[slug]` as `ƒ (Dynamic)`. So does `/privacy`, and `/terms`,
and every other route — including ones with no data at all. The cause is the root
layout: `src/app/layout.tsx` calls `listCategories()` for the header nav, that query
uses the server Supabase client, and `lib/supabase/server.ts` reads `cookies()`. A
`cookies()` read in the root layout opts the entire app into dynamic rendering.

The constant is kept and now carries a comment saying so, because the previous
comment claimed a five-minute staleness bound that does not exist. The fix is to
give the layout's nav query a public client that does not touch the session; that
is its own change and is not smuggled into this milestone.

### What to inspect in the browser

1. **`/p/cheaper-car-insurance`** — 40 fixture reports. All three tiles populated:
   tried count, a rate *with its denominator attached* (`n = 40 reports`), and a
   median with `n = 20 with amounts`. The bar renders three segments with counts
   beside them, and a "Last 30 days" line underneath.
2. **`/p/lower-your-internet-bill`** — 7 fixture reports, deliberately below the
   threshold. The bar must be **absent**, not an empty track, and must say
   `Not enough reports yet — 7 so far` rather than showing any percentage. This is
   the withholding rule, and it is the single most important thing to check by eye.
3. **`/p/plan-7-days-in-japan`** — `outcome_type` is `time_hours`, so the median
   tile reads `4 hrs saved`, not `$4`. Confirm the unit follows the outcome type.
4. **Copy the prompt** — the button collapses at `max-h-28` with a gradient fade,
   expands, and the toast reads `Copied! Paste it into Muse.` with a link to the
   try page. Paste it somewhere and confirm whitespace survived.
5. **Share menu** — Instagram and TikTok must show as copy-link fallbacks, not as
   dead web links.
6. **Report filters** — choose an agent, a provider and a result; all three go to
   the URL and a pasted URL reproduces the same list.
7. **390×844** — the try button appears under the header *and* again in the sidebar
   far below. Both are intentional; the sources and "Good to know" blocks appear
   once only.
8. **Save button while signed out** — opens a dialog titled exactly
   "Sign in to save this playbook". It must not fake a saved state.

### Blocks and unverified criteria

- **`/api/revalidate` is unauthenticated.** `POST {slug}` revalidates a path with
  no secret. It cannot corrupt anything, but anyone can use it as a cache-buster.
  The shared-secret check is deferred to P9, and the route says so in-file.
- **The Save button is deliberately half-built.** Signed out it opens the sign-in
  dialog; it never shows a saved state, because faking one would be a lie in a
  product built on real evidence. `SaveToggle` is the P8 seam.
- **The agent marks are placeholder glyphs**, deliberately not vendor trademarks —
  inline SVG per slug with a generic fallback. Swapping in real assets is a change
  to one file, `src/components/agents/agent-mark.tsx`.
- **`pnpm test:e2e:prod` has still not been run.** The 8 navigation tests only
  execute under `E2E_TARGET=prod` and are untested against every change in this
  milestone, including all twelve new components.
- **The median tile is omitted entirely when hidden**, rather than showing a
  placeholder. Nothing asserts the *absence* of the tile's container in the DOM —
  only that the "Not enough data" caption is absent — so a future change could
  leave an empty box behind without failing a test.
- **Two P6 files landed in the P5 commit.** `20240101000006_report_evidence_flag.sql`
  and `src/components/agents/agent-mark.tsx` were swept into `8f28264` by an
  over-broad `git add` during P5. They are on the remote already. I did not rewrite
  public history to fix it; noting it instead.
- **`db:seed-stats` creates 40 auth accounts.** Local only, and `pnpm db:reset`
  removes them, but the account creation is slower than the rest of the script and
  is the first thing to time out on a cold Docker stack.

---

## P7 — Try flow and agent picker

### What was built

The try flow, in three places: a Radix `Sheet` on desktop and full-screen on a
phone, opened from the playbook detail page's try button; a standalone page at
`/p/[slug]/try`; and a card hover "Try" link that goes to that standalone page.
All three render one component, `TryPanel`, so there is a single definition of
what the reader sees.

**Step 1, agent.** `AgentPicker` renders each selectable agent as a large card —
Muse in Muse blue with the official avatar inside a Meta-blue ring, "Recommended"
on the first, and an evidence line. Coming-soon agents are real `<button disabled>`
chips with no label and no explanation. Which agents are in which group is decided
by `listAgents()`, which filters on `status` and never on the display name — so
renaming a vendor cannot make it selectable.

**Step 2, details.** `TryFieldInput` renders all eight `playbook_inputs` types:
`provider_picker` and `select` as chips, `money` with a `$` affordance and a
decimal keypad, `zip` as `type="text"` with `inputMode="numeric"` so leading
zeros survive, `date`, `textarea`, and everything else as a plain input.
`toTryFields()` narrows the stored `jsonb` `options` and the `text` `type` rather
than casting them.

**Step 3, prompt.** `renderTemplate()` substitutes `{{key}}` in a single pass, so
a bill pasted in as `{{price}}` is never re-substituted, and leaves unfilled slots
as `[Label]`. Copy works with nothing filled — the missing required fields are
named, not enforced, because AGENTS.md forbids gating the copy on anything.

**Agent memory.** `src/lib/try/agent-memory.ts` reads and writes `localStorage`
through `useSyncExternalStore`. That is not a style preference: the effect-based
version this replaced set state synchronously on mount, which the React Compiler
rejects, *and* it logged the `started` event against the default agent before the
remembered one arrived — so a returning reader's first try was attributed to an
agent they did not pick.

**Logging.** `started` / `copied` / `opened` on `try_events`, with a server-issued
`ph_device` cookie for anonymous readers, and a `followups` row for signed-in ones
(`due_at` computed from the server clock, never from a client value).

### Checks and results

| Check | Result |
| --- | --- |
| `pnpm lint` | **Pass** — no findings, no warnings |
| `pnpm typecheck` | **Pass** — no errors |
| `pnpm test` | **Pass** — 234/234 across 15 files (was 181) |
| `pnpm test:db` | **Pass** — 51 tests across 3 files (was 48) |
| `pnpm build` | **Pass** — 22 routes, Proxy registered |
| `npx playwright test` | **Pass** — 104 passed, 8 skipped, 0 failed (was 90/8) |

### Two real bugs this milestone found

**1. `logTryEvent` always returned `{ id: null }`.** The insert was written as
`.insert(...).select("id").single()`. `try_events` grants SELECT to admins only,
by design, so asking PostgREST to return the inserted row re-reads it under that
policy — and the whole insert fails with a 42501 whose message reads like "you may
not log a try". The row was never the problem: a plain `POST` returns 201. Because
the action swallowed the error, the try flow looked perfect, the rows landed, and
only the *returned id* was always null — so every follow-up was created with no
`try_event_id` linking it to the try that caused it. Fixed by minting the id
client-side, which needs no read at all (`20240101000008`, because supplying `id`
needs an INSERT grant on that column).

**2. Anyone could attribute a try to any account.** The insert policy was
`WITH CHECK (true)`, correct for the parts of the row nobody should control but
wrong for `user_id`, which the same policy then let any caller set. I confirmed it
against the running stack: a signed-in attacker inserting a row with a stranger's
`user_id` returned 201, and so did an entirely anonymous caller. That is not
cosmetic — P8's "Tried" tab reads `try_events` by `user_id`, so a forged row puts
strangers' activity in someone else's list and mails them a follow-up for it.
`20240101000009` restricts the check to `auth.uid()`, from the verified JWT rather
than the request body.

The second one is the reason the acceptance criteria asked for an integration
test against local Supabase rather than unit tests: this is an RLS fact, and RLS
is only real against a running Postgres. Asserting it against a mock would have
asserted that the mock is correct.

### What to inspect in the browser

1. **`/p/lower-your-internet-bill`, then "Try this playbook"** — the sheet slides
   in from the right on desktop and covers the screen on a phone.
2. **Step 1** — Muse is preselected and badged "Recommended", with its avatar in a
   blue ring. ChatGPT, Grok and Manus are grey chips below; they must be genuinely
   unfocusable, not just styled that way. Instinct must be absent entirely.
3. **Step 2** — pick a provider chip, type into Monthly price and ZIP. The line
   under the prompt must read `Only Provider is required · stays in your browser`,
   and each optional field must show `optional · <why it helps>`.
4. **Step 3** — the prompt updates as you type. Leave a field blank and its slot
   reads `[ZIP code]`. The internet-bill playbook has six inputs; fill all six and
   no `[…]` should remain.
5. **Copy prompt** — the label becomes `✓ Copied`, and pasting gives the *filled*
   prompt, whitespace included.
6. **Copy with nothing filled** — it must still copy, and must say
   `Still needed: Provider`. This is the AGENTS.md rule that the copy is never
   gated; check it explicitly, because it is the easiest thing to break later.
7. **The reminder card** — signed out, after the first copy only. "Not now" must
   survive a reload.
8. **"Open in Muse"** — Muse has **no** `launch_url_template` in the database, so
   the button must read `Copy & open Muse` and copy first. If it ever reads "Open
   in Muse", someone has invented a URL scheme we never verified.
9. **390×844** — the whole flow, filled and copied, at the iPhone 13 viewport.

### Deliberate deviations, stated

- **Card hover "Try" links to `/p/[slug]/try` rather than opening the sheet.** A
  listing page cannot inline every card's prompt template and inputs to fill a
  dialog nobody opened. The standalone page is the same panel.
- **Coming-soon chips carry no text beyond the name.** No "Coming soon", no
  "Script only", no tooltip. A reader told an agent is nearly here has been told
  something we cannot yet promise.
- **`/p/[slug]/report` is a placeholder page.** The try flow ends by asking whether
  it worked, so the link must not 404; P8 replaces it with the real form.

### Blocks and unverified criteria

- **The integration test skips silently without a database.** It sets up at module
  scope and `describe.skipIf`s when local Supabase is unreachable, so `pnpm test`
  stays runnable without Docker — but that also means a green `pnpm test` on a
  machine with no database has verified *none* of the RLS rules above. I ran it
  against the running stack and all 7 pass.
- **The privacy test proves the two actions this panel calls take no field
  values.** It cannot prove a future third action would not. The structural
  guarantee is weaker than it looks: nothing stops someone adding a param.
- **`revalidate = 300` is still inert** (carried over from P6), so the build still
  reports every route as `ƒ (Dynamic)`.
- **`/api/revalidate` is still unauthenticated.** Deferred to P9.
- **`pnpm test:e2e:prod` has still not been run as a named script.** The suite was
  run against a production build served on port 3111 because a stale `next dev`
  from an earlier session held port 3000 and I did not have permission to kill a
  process I did not start. The build itself passes; what is unverified is the
  navigation-regression spec's timings under a clean `E2E_TARGET=prod` run.
- **Muse prefill is entirely unexercised.** With `launch_url_template` NULL there
  is no code path in production that reaches `mode: "prefill"`. It is unit-tested
  but has never run against a real agent URL, because none is verified.

---

## P8 — Accounts, sign-in, saving, reporting, `/me`

**Status:** complete. All six acceptance checks green.

### What was built

**Sign-in that works the way the brief describes it.** `/login` offers the three
providers and the email link. All four land on `/auth/callback`, which exchanges
the PKCE `?code=` server-side and sets cookies there — the browser never holds a
token. `SignInResume` reads `?error_description=` and strips it from the URL
before rendering, so a refused provider shows one sentence rather than GoTrue's
JSON. Sign-out is a server action that deletes the cookies and redirects home.

**`profiles.reminders_enabled`.** Migration `20240101000010` adds the column with
a `true` default and a table-level UPDATE revoke from both `anon` and
`authenticated`, re-granting `authenticated` only `handle`, `display_name`,
`avatar_url` and `reminders_enabled`. Column-level, not table-level: a reader who
could write their own `role` column would be an admin.

**Saving.** `toggleSave` is a server action with an optimistic star. The star is
optimistic because the alternative — a star that does not move until a round trip
— reads as broken; it survives a reload because it was a row, not a piece of
state.

**Reporting.** `/p/[slug]/report`, one form, `result` the only required field. It
serves two audiences: the reader who just used the try flow, and somebody who
arrived from `/report` with no playbook in hand. Submit files `pending`, applies
the amount cap as a **moderation flag** rather than a validation error, and
redirects to `/report/respond/[token]` — a signed, single-purpose link that lets
the filer correct the number for 24 hours without an account.

**The report list at `/report`.** Playbooks a reader has an open, expired or
answered report on. `/report/expired` explains what happened; the reminders cron
mails one link back to the form, once, and never re-sends.

**`/me`.** Three tabs — Saved, Tried, Reported — as links, not client state, so
the tab survives a reload, the back button and a copied URL. Each card shows when
it was saved, tried or reported, a "Updated since you saved" badge when the
playbook has moved on, and — the one thing the list exists to nudge — a "Did it
work? Report" button on a card that is tried but not reported. A fourth tab,
Settings, holds the reminders switch.

**Follow-ups.** `src/lib/followups/` mints HMAC-signed, expiring tokens.
`/api/cron/followups` is the Vercel cron entry (`vercel.json`, hourly at :17),
guarded by `CRON_SECRET`, and refuses to run at all when `FOLLOWUP_SECRET` is
blank rather than half-sending a batch of mails containing dead buttons.

### Checks and results

| Check | Result |
| --- | --- |
| `pnpm lint` | **Pass** — no findings, no warnings |
| `pnpm typecheck` | **Pass** — no errors |
| `pnpm test` | **Pass** — 357/357 across 22 files (was 234/15) |
| `pnpm test:db` | **Pass** — 69 tests across 4 files (was 51/3) |
| `pnpm build` | **Pass** — 26 routes, Proxy registered |
| `pnpm test:e2e` | **Pass** — 118 passed, 8 skipped, 0 failed (was 104/8) |

The 8 skipped are the navigation-regression spec, which requires
`E2E_TARGET=prod` and says why in the file: on the dev server the gap it measures
is dominated by on-demand compile time.

### Three real bugs this milestone found

**1. `anon` held UPDATE on every column of `profiles`.** Supabase's default
privileges give `anon` a table-level UPDATE, and the revoke written for the
original migration only named `authenticated`. The `id = auth.uid()` policy still
held — but only because an anonymous JWT carries no `sub`, so the predicate
matched no rows. That is a policy accidentally doing the work of a grant. Anyone
who later adds a JWT field that is present-but-null for anonymous callers turns
that into a writable column. Fixed in `20240101000010` and asserted in
`004_p8_accounts.sql`.

**2. Every report on a money playbook was rejected.** The form keeps one amount
field and renders either the money input or the hours input from it, so it sends
whatever was typed under *both* `amount` and `hoursSaved`. The schema demanded
`z.null()` on the key that did not apply, so a reader who filled in "$83 saved"
got `Invalid input: expected null, received string` and lost the whole report.
A whole outcome type, gone, over a field they were never shown. Fixed
symmetrically — a value offered to a playbook that does not collect that unit is
discarded, not refused — with a regression test in each direction.

**3. `outcome_reports.user_id` has no client SELECT grant, on purpose.** The RLS
test that asserted "a reader may correct their own number" could not be written as
`where user_id = auth.uid()`, because that predicate itself needs to read the
column. It is written as an id-keyed `update … returning`, which is also a truer
statement of what the reader is allowed to do.

### A test that was passing for the wrong reason

`me-and-report.spec.ts` asserted `me-card` had the right slug after clicking the
Tried tab. That assertion also passes on the Saved tab, which holds the same
playbook — so it was asserting nothing about the tab it named, and the real
failure underneath it (`me-report-cta` never appeared on mobile) was being
diagnosed as a database problem.

It was not a database problem. The copy button logs the try **without awaiting
it** — deliberately, so an analytics insert can never delay somebody taking their
prompt — and a request still in flight when the browser navigates is cancelled
with the page. On the slower viewport the test navigated before the insert
dispatched, and the try event was genuinely gone. Measured directly: leave the
page in place and the row lands within a second; navigate immediately and there is
no row at all, ever.

The fix is in the test, not the product: wait for the write, then navigate. Waiting
is now attributed to the reader (`copiedActionsFor(email, …)`) rather than to the
slug, because with the desktop and mobile projects running in parallel "somebody
logged a copy" is not "this reader logged a copy". The same race was later found
in the reminders switch — optimistic switch, immediate `reload()`, preference
silently back on — and fixed the same way, by waiting for the action's toast.

The behaviour itself is recorded as known rather than papered over: a reader who
copies a prompt and navigates away in the same instant is not logged as having
tried it, and so is not nudged to report. That is a trade, not an oversight.

### What to inspect in the browser

1. **`/login`** — three providers and an email field. Submit the email; Mailpit
   at `http://127.0.0.1:54324` receives the message within a second or two. The
   screen says "check your email" and names the address.
2. **Follow the link in Mailpit** — you land on `/me`, signed in. Reload: still
   signed in. `/me` before signing in redirects to `/login?next=%2Fme`.
3. **A refused provider** — visit `/auth/callback?error=access_denied&error_description=Email+link+is+invalid`.
   One sentence, and the parameters are gone from the address bar afterwards.
4. **`/p/lower-your-internet-bill`** — save it. The star fills; reload and it is
   still filled. `STAR` on the card should now read **Saved**.
5. **`/me`** — Saved 1. Then try the playbook from the card and copy the prompt.
   Back to `/me`, Tried tab: the same card, with a **Did it work? Report** button
   on it. That button is the whole point of the page.
6. **`/p/lower-your-internet-bill/report`** — press **It worked**, type `83`,
   submit. You must land on a confirmation, not a share sheet. The saved report is
   editable from `/me` for 24 hours and can be deleted at any time.
7. **Report again from the same account** — the CTA must be **gone** from the card,
   because the question now has an answer.
8. **Settings tab** — flip the reminders switch, reload. It must stay off. Turn it
   off and check `/api/cron/followups` with no `Authorization` header: 401 or 503,
   never a batch of mails.
9. **390×844** — the whole walk. The account menu is inside the sheet on a phone,
   not in the header.

### Deliberate deviations, stated

- **The amount cap is a moderation threshold, not a validation rule.** A reader
  who genuinely saved $700 on a $5,000/month playbook gets their report filed as
  `pending` + `is_outlier` for review. Refusing it would produce a smaller number
  that neither of them believes, which is worse for the median than a large one
  flagged.
- **`/me` tabs are links.** Client state would make the back button lie and the
  URL uncopyable, for a page whose entire value is "show me my things".
- **Deleting a report has no window; editing one does.** Editing is a correction
  to a number that is about to be published in a median, so it is bounded at 24
  hours by the database. Deletion is a withdrawal, and a countdown on it is a
  small cruelty.
- **The unsubscribe link is in the HTML alternative as well as the text part.**
  A one-click unsubscribe is a regulatory requirement, and a link only in the
  plain-text part does not count for every mail client.

### Blocks and unverified criteria

- **Email delivery has never actually sent a message.** Resend is called over its
  REST API with hand-written HTML, because `pnpm add resend @react-email/*` was
  refused by the tool classifier and AGENTS.md requires asking before adding a
  major dependency. That deviation is **owed a decision from the project owner**:
  either approve the three packages, or accept the hand-written templates as the
  shape of the thing. Everything is unit-tested against recorded fixtures; nothing
  has been through a real inbox.
- **The cron job has never run against a real queue.** It runs locally, produces
  signed links, and refuses to run without `FOLLOWUP_SECRET` — but "one email,
  once, and never again" has not been observed end to end through Resend.
- **`resend_enabled` is off unless `RESEND_API_KEY` is set**, so on a machine
  without it every mail is logged and dropped. That is the safe default and it
  also means a green local run says nothing about delivery.
- **`revalidate = 300` is still inert** (carried from P6).
- **`/api/revalidate` is still unauthenticated.** Deferred to P9.
- **The try event lost on immediate navigation is not fixed**, only recorded. See
  the section above.
- **The privacy test proves the two actions this milestone calls take no field
  values.** It cannot prove a future third action would not; nothing structural
  stops someone adding a parameter.

---

## P9 — Ranking and aggregation

### What was built

The scoring layer, from the constant that defines it to the query that reads it.

**The pure module** — [src/config/ranking.ts](src/config/ranking.ts) holds every
number the ranking rules depend on, so there is one place to change a weight and
one place to see what they are. [src/lib/ranking/](src/lib/ranking/) is everything
downstream of it:

| File | What it decides |
|---|---|
| `weight.ts` | Trust multiplier per report: 1.0 verified, 0.5 unverified, 1.5 with approved evidence, 0 for rejected / outlier / the author's own. Plus the 60-day decay. |
| `wilson.ts` | The lower bound of a weighted success rate. `n = 0` → 0, never NaN. |
| `outcome.ts` | Percentile of a playbook's median against its category. Monthly is annualised so `$40/mo` and `$480/yr` are the same claim; hours are never compared to dollars. |
| `usage.ts` | Logarithmic share of the busiest playbook on the site. |
| `trending.ts` | 7-day window, 48-hour half-life, tries weighted 1 and reports 3. |
| `outliers.ts` | R type-7 quantiles, Tukey's IQR fence at ≥10 amounts, and the cap rule at any n. |
| `aggregate.ts` | The two passes. Absolute terms first, then the peer-relative half. |
| `refresh.ts` | The only place that knows how a column in `outcome_reports` becomes a number in `playbook_stats`. |

`evidence_score = 0.55·wilson + 0.20·outcome + 0.15·recency + 0.10·usage`.

**The schema** — [20240101000011_stats_flags.sql](supabase/migrations/20240101000011_stats_flags.sql)
adds `weighted_success`, `evidence_approved`, `show_rate`, `show_median`,
`strongest_eligible` and `badges` to `playbook_stats`, plus `profiles.email_verified`
maintained by a trigger on `auth.users`. Three check constraints make the
withholding structural: a `show_rate` below 20 reports, a `show_median` below 10
amounts, or an unrecognised badge name are refused by the database rather than
by a comment.

**The job** — `refreshStats(supabase, playbookId?)` writes one row or the whole
catalogue. It is called from `submitReport`, `editReport` and `deleteReport`
(awaited, before the revalidation), and from `/api/cron/stats` on a 15-minute
schedule.

### Two bugs found by making the fixtures real

**The 1000-row cap.** PostgREST truncates a response at 1000 rows, silently — no
error. The seed asked for 1,180 devices and `tried_count` came back as exactly
1,000, with the two quieter playbooks at 0 because their rows sat past the cut.
A ranking job that quietly loses its busiest rows is the worst version of this
bug: the page renders "1,000 people tried this" and nothing anywhere is red. All
three bulk reads now page at 1,000 with a stable `order by id`; a stable order
matters because two pages of an unordered query can overlap or skip at the
boundary, which shows up as a median that wobbles between runs of the same data.
`readReporters` was the same hazard with worse consequences — every reporter past
the cut would be unknown, and an unknown reporter means no trust weight, so a
popular playbook would quietly lose trust it had earned.

**The seed was fabricating the ranking.** `scripts/seed-fixture-stats.ts` wrote
`playbook_stats` rows directly, with `evidence_score` invented as
`reportCount × rate × 10` — a plausible-looking number in the one column the
entire search order depends on, produced by arithmetic that appears nowhere else
in the codebase. It now calls the real job. The knock-on was that
`fixture.triedCount` had become dead (it was only ever written into the
fabricated row), so the seed now writes real `try_events` — one device each for
`started`, plus a slice of dated `copied` events, because trending is computed
from copies and seeding only starts would leave the trending sort untestable.

### A source-of-truth disagreement

`evidence_approved` was reading `report_evidence.review_status = 'approved'`.
Migration 06 added `outcome_reports.evidence_reviewed` for exactly this purpose,
and the moderation flow writes that column. So the two can disagree, and the
disagreement is invisible: a report whose evidence was approved would show the
"Evidence reviewed" tag from the column while contributing nothing to the count,
so "Proven to work" would demand three that the page insists exist. Ranking now
reads the column.

### A test that was passing for the wrong reason

The first version of the e2e criterion asserted only "the higher-scored playbook
comes first". That passes against a page that lists playbooks in slug order, or
in whatever order the database returned them — neither of which has ever heard
of `evidence_score`. There is now a second test that pins the scores the other
way round and asserts the reverse order, and a third that pins both ways under
`?sort=most_tried` and asserts the order does not move.

Pinning scores in a database means two projects writing the same rows, and
Playwright runs `desktop` and `mobile` concurrently in separate processes.
`mode: "serial"` only orders tests inside one worker. [e2e/support/lock.ts](e2e/support/lock.ts)
is a cross-process `mkdir` lock with stale reclamation; that is not flakiness to
retry, it is a test that could not pass and could not be made to.

### Checks and results

| Check | Result |
|---|---|
| `pnpm lint` | clean |
| `pnpm typecheck` | clean |
| `pnpm test` (vitest) | **500 passed**, 0 failed |
| `pnpm test:db` (pgTAP) | **92 passed** across 5 files (23 new in `005_p9_stats_flags.sql`) |
| `pnpm build` | success — 27 routes, `/api/cron/stats` registered, Proxy present |
| `pnpm exec playwright test` | **124 passed / 8 skipped** (6 new) |

The 8 skips are the `E2E_TARGET=prod`-only navigation-regression spec, unchanged
from P8.

### What to inspect in the browser

1. **`/playbooks`** — the order should be *Find cheaper car insurance* (score
   0.516), *Plan seven days in Japan* (0.442), *Lower your internet bill*
   (0.338). Check the evidence line on each.
2. **`/p/cheaper-car-insurance`** — 68% worked, `n = 40`; median $310/yr over
   20 amounts; "Proven to work" absent, because only 1 report has evidence
   approved and the rule needs 3.
3. **`/p/lower-your-internet-bill`** — "Early · 7 reports", no percentage, no
   median tile. The withholding working is the thing to look at.
4. **Badge chips** — the Japan card should carry *Most tried* and *Top saver*;
   the internet bill *Most tried* only.
5. **Filters → sort → `?sort=most_tried` then `?sort=highest_outcome`** — the
   order must change between them, and must *not* change when you go back to
   `best_evidence` and re-fetch.
6. **File a report** on any playbook, then reload the card. The evidence line
   and the tiles must already reflect it — the refresh is awaited before the
   revalidation, not left to the cron.
7. **Withdraw that report** (`/me` → Reported → delete). The numbers must go
   back, not linger.
8. **`curl -i localhost:3000/api/cron/stats`** with no header → 401. With
   `-H "Authorization: Bearer $CRON_SECRET"` from `.env.local` → 200 and a JSON
   body with `refreshed`, `changed` and `durationMs`.
9. **`pnpm db:seed-stats` twice in a row** — the second run must report the same
   tried counts, not doubled ones.

### Deliberate deviations, stated

- **`outcomeStrength` needs 3 comparable peers, not 1.** The brief says the
  percentile is 0.5 "if not computable". With one peer a percentile is 0, 0.5 or
  1, so the entire 0.20 outcome term would be decided by one other playbook's
  median. `MIN_OUTCOME_PEERS` is the documented departure.
- **An outlier's whole report is excluded, not just its amount.** There is a
  real argument the other way — the flag is a claim about the number, not about
  whether it worked. The brief says "author's own reports and outliers do not
  change stats", and a report that changes `report_count` changes a stat. The
  argument is recorded in `aggregate.ts` rather than acted on.
- **Badges are display-only and structurally so.** `search_playbooks_ranked`
  orders by text rank and nothing in it reads `evidence_score`; there is no code
  path from a badge to an `order by`, so AGENTS.md's rule cannot be violated by a
  later edit either. `badges`, `strongest_eligible` and `evidence_approved` are
  written by the job and read only by the card.
- **`refreshStats` takes a client rather than creating one.** `server-only`
  *throws* under plain Node, so a marked module is uncallable from the seed
  script — and a seed script that cannot call the real aggregation goes back to
  inventing `playbook_stats` rows, which is the bug above. The server boundary
  is now `refresh-after.ts`, which is the only thing that builds a service-role
  client.
- **The refresh is awaited in all three report actions, deliberately the
  opposite of the try-event case in P8.** There, fire-and-forget is right: the
  user has already taken their prompt and is gone. Here the user is waiting for
  a page about this report, and a refresh still in flight when `revalidatePath`
  runs would re-render against the *old* row and cache that render for its whole
  window.
- **`reportWeight` takes no `now`.** Trust is a property of a report and its
  author at the moment it was filed; the new-account rule measures account age
  against filing date. The parameter existed and was unused, and "for symmetry"
  with `weightedReport` is exactly how a two-year-old account gets treated as new.

### Blocks and unverified criteria

- **`/api/revalidate` is still unauthenticated.** Still deferred; nothing in P9
  calls it — the cron returns a `changed` slug list for a caller to use, and no
  such caller exists yet.
- **`strongest_eligible` is computed but nothing renders it.** The "Proven to
  work" row needs 20 reports *and* 3 evidence-approved; no fixture reaches it,
  and no seed creates `report_evidence` rows, so the one thing that would
  demonstrate it is not demonstrable yet. That is a P10/P11 gap, not a P9 one.
- **Evidence moderation does not exist.** `report_evidence.review_status` is
  never written to `approved` by anything in the codebase — there is no admin UI.
  `evidence_reviewed` is only ever set by the seed. The aggregation is correct
  against the column; nothing yet moves the column.
- **The trending numbers have only been observed from seeded data.** Copies are
  written by the seed with timestamps spread over 40 hours, which exercises the
  decay but is not a real traffic distribution.
- **Email delivery has still never sent a message**, and this is now **owed a
  decision twice**: `pnpm add resend @react-email/components @react-email/render`
  was refused again during P9. The owner has since answered "install the three
  packages"; the install itself is still blocked on the tool side and needs to be
  run by hand.
- **The cron has never run on a real scheduler.** It runs locally and refuses
  without `CRON_SECRET`. The `changed` list has never been consumed by anything.

---

## P10 — Admin area

### What was built

The founder's area: `/admin`, behind a 404 for anybody who is not an administrator.

**The gate** — [src/server/admin/session.ts](src/server/admin/session.ts) holds the
one definition of "is an administrator", and both halves of the area use it:
[src/app/admin/layout.tsx](src/app/admin/layout.tsx) calls `requireAdmin()` and
throws `notFound()` (so a non-admin gets the same answer as a URL that does not
exist, rather than a page confirming the area is there), and every server action
calls `adminSession()` first. Both are needed: a server action is a public HTTP
endpoint with its own auth, and a request that skips the layout still reaches it.

The admitted client is the **service-role** one, deliberately. RLS on these tables
says `is_admin()` and would work, but moderation writes columns no client role
holds a grant on at all (`status`, `is_verified`, `is_outlier`, `moderation_note`),
so going through RLS would mean granting the administrator's *browser* the
authority to change them — the authority a compromised admin session should not
have. The caller is verified first; the check the database would repeat is
redundant.

**The schema** — two migrations:

- [20240101000012_admin.sql](supabase/migrations/20240101000012_admin.sql): the
  `admin_actions` audit log (`admin_id`, `action`, `target`, `payload`,
  `created_at`), with **no INSERT grant to any client role** — append-only even to
  the admins reading it, because an admin who can write the log describing their
  own actions can edit what they did. Plus `playbook_requests.status` (`new` /
  `planned` / `done`) with `decided_at`, and the two private note columns
  (`outcome_reports.moderation_note`, `report_evidence.review_note`).
- [20240101000013_request_inbox.sql](supabase/migrations/20240101000013_request_inbox.sql):
  `admin_request_inbox(min_similarity)` — a `security definer` plpgsql function
  that groups requests by pg_trgm similarity and is granted to `service_role`
  alone. It re-checks `is_admin()` inside anyway.

**The pages** — eight: dashboard, reports queue, evidence viewer, playbooks list
and editor, starter kits, use cases, requests inbox, feedback queue.

**The actions** — [src/server/admin/actions/](src/server/admin/actions/):
`moderate-reports` (approve / reject with a reason / flag / unflag outlier, single
and bulk), `review-evidence` (approve / reject, plus the preview link),
`playbooks` (core fields, new version, mark verified), `arranged` (kits and use
cases: save, reorder, add/remove), `requests`, `feedback`. Every one writes an
audit row through `writeAdminAction`.

**The pure modules** — [src/lib/admin/](src/lib/admin/): `moderation.ts`,
`ordering.ts`, `prompt-refs.ts`, `playbook-schema.ts`. All four are unit-tested
without a database.

**The script** — `pnpm db:promote-admin [--revoke] you@example.com`. Refuses to
run against anything but a local host, because granting admin is a permanent,
non-self-service grant of access to every moderation queue.

### Three decisions worth stating

**Rejection asks for a reason; approval does not.** A rejection takes somebody's
report out of a published statistic and off a page they were proud of, so it is
the one that gets a mandatory, private reason. Approval demands no
justification: requiring one produces the phrase "looks fine" several hundred
times, and a queue full of "looks fine" is worse than no record. The quick
reasons are phrased about the data, because the honest failure here is a
moderator typing "spam" — a judgement on the reporter rather than on the report.

**There is no control anywhere in /admin that changes `result` or the amount.** A
number an administrator typed is a number nobody filed, and the site's claim is
that the statistics are what people reported. The queue can decide whether a
report *counts*; it can never say what the report *says*.

**Approving evidence marks the report verified.** They are the same claim — "this
result is checked" — and a report nobody has seen a file for is not a weaker
version of that claim, it is the absence of one. `last_verified_at` moves only when
`result = 'worked'`, because a screenshot of somebody's refund on a playbook that
did not work is evidence about their afternoon, not about the playbook. The
*rejection* path recomputes `evidence_reviewed` from the database after the
update rather than clearing it, so a report with two files cannot end up claiming
it has none.

### Three bugs of shape rather than syntax

**The select strings.** Supabase's generated types parse the select *string* at
the type level. A module-scope constant widened to `string` collapses every
column into `GenericStringError` — 16 errors that read like a database problem
and are really a missing `as const`. Four modules affected.

**The evidence preview took a path from the client.** `createSignedUrl` takes a
storage path, and the storage policy lets an admin read any object in the bucket
— so accepting one from the client would mint a bearer link to any file in it.
`previewEvidence` takes an `evidenceId` and resolves the path server-side, with a
300-second TTL, minted on click rather than rendered into the page.

**Two sources of truth for "has this report been verified".** P9 recorded the
disagreement between `report_evidence.review_status` and
`outcome_reports.evidence_reviewed`; the fix is that approval *sets* the
denormalised column and rejection *recounts* it, and ranking reads the column.

### Checks and results

| Check | Result |
|---|---|
| `pnpm lint` | Clean — 0 errors, 0 warnings |
| `pnpm typecheck` | Clean |
| `pnpm test` | **595 passed** (35 files) — 45 new |
| `pnpm test:db` | **112 passed** across 6 files — 20 new in `006_p10_admin.sql` |
| `pnpm build` | Succeeded — 12 `/admin` routes, all `ƒ` (dynamic), no static generation attempted |
| `pnpm exec playwright test e2e/admin.spec.ts` | **NOT RUN** — see blocks |
| `curl -o /dev/null -w %{http_code} localhost:3000/admin` (signed out) | **404**, body contains only Next's "Page could not be found" — no occurrence of "administrator" or "moderation" |

The pgTAP file asserts, among other things: `authenticated` cannot insert into
`admin_actions` **even when the claim is an admin's own** (42501, a privilege
failure rather than an RLS one); the log cannot be edited or deleted; a non-admin
cannot execute `admin_request_inbox` at all; the inbox files each row under the
*earliest* earlier match it resembles, so the group key is stable as copies
arrive; `playbook_requests.status` holds exactly three values; and neither private
note column is projected into `public_reports`.

`src/server/admin/actions/guard.test.ts` asserts every one of the **14** admin
actions returns the refusal *and* never constructs a database client — the mocks
throw rather than return a stub, so an action that guarded late would fail rather
than pass quietly.

### What to inspect in the browser

1. **`pnpm dev`, sign in with any address, then `pnpm db:promote-admin <that address>`.**
   Open `/admin`. The dashboard shows six counts and two top-five lists — and the
   two lists are *not* the same five, which is the point of showing both.
2. **`/admin` as a non-admin, and as nobody** — both must be a 404 whose body does
   not contain the word "administrator".
3. **`/admin/reports`** — filters are links, so filtering and then copying the URL
   gives somebody that exact view, and the back button undoes a filter. Select
   two rows, reject them, and the private reason is required and appears on the
   row. There is no control that edits a report's outcome.
4. **`/admin/evidence`** — "Open file" fetches a five-minute signed link and opens
   it in a new tab; nothing in the page source contains a signed URL. Rejecting
   one file does not reject its report.
5. **`/admin/playbooks/<id>`** — edit the prompt; the placeholder check is live
   while you type; "Publish version N" is refused without a changelog, and the
   previous version stays in the history with its own changelog intact.
6. **`/admin/requests`** — press "Regroup" with the threshold at 0.95 and the
   pairs separate. That control is why the grouping constant is inspectable.
7. **390×844 (mobile)** — the queue rows stack their action buttons; the rejection
   dialog stays within the viewport.

### Deliberate deviations, stated

- **Rejecting evidence requires a reason; the brief does not ask for one.** It is
  the same asymmetry as reports and for the same reason — a rejected file is a
  file a person chose to send.
- **Requests are fetched in one page and grouped in SQL.** The inbox is one
  unbounded select, unlike the reports queue which caps at 100 and says so. A
  founder inbox with tens of thousands of rows is a migration away from being a
  problem; a second similarity implementation disagreeing with the first is a
  problem now.
- **Ordering is up/down buttons, not drag-and-drop.** The whole list is written
  on every save and `normalizeOrder` refuses rather than repairs, so there is no
  drag state to desynchronise from the database and no way to express an order the
  server would reject. The brief asks for "reorder", which this is.
- **The playbook picker in /admin lists drafts as well as published ones.** A kit
  is usually arranged while the catalogue is still moving, and hiding drafts makes
  the playbook somebody had in mind simply absent. Rows are labelled with their
  status and the public pages still filter to published.

### Blocks and unverified criteria

- **`e2e/admin.spec.ts` now runs, and it found four real bugs.** See
  [P10 follow-up: the admin area in a browser](#p10-follow-up-the-admin-area-in-a-browser)
  below. The short version: two routes were returning 500 and one grant was far
  wider than intended. All are fixed; the suite is 16/16 across both viewports.
  What it has *not* done is look at the admin area the way a person would — no
  screenshot, no visual check of the version editor or the request inbox, only
  what an automated assertion can reach.
- **`e2e/support/admin.ts` promotes via a direct UPDATE**, which is the same one
  line `scripts/promote-admin.ts` runs. Shelling out to the script from the suite
  would put a subprocess and an env-file dependency in the path of every run to
  execute one line of SQL; the script itself is exercised by the documented manual
  flow.
- **`strongest_eligible` is still rendered by nothing.** P9 recorded this as a
  gap: "Proven to work" needs 20 reports *and* 3 evidence-approved, and no fixture
  reaches it because no seed creates `report_evidence` rows. The evidence queue
  can now create them — a human uploading one and approving it — but the gate
  cannot be demonstrated from fixtures, and no fixture does.
- **The submissions queue (P10b) is not here.** The brief defers it to the next
  prompt and nothing in this milestone reads `playbook_submissions`.
- **`/api/revalidate` is still unauthenticated**, as at P9.
- **Email has still never sent a message.** `pnpm add resend @react-email/components
  @react-email/render` remains unrun.

---

## P10 follow-up: the admin area in a browser

The owner authorised the suite explicitly — it may promote its own throwaway
`admin-*@example.test` accounts to `profiles.role = 'admin'` against the local
stack and demote them afterwards — and the suite ran.

### What was built

Nothing new in the admin area itself. This is what running it found.

**1. `/admin/evidence` returned 500.** `report_evidence` has exactly one foreign
key and it points at `outcome_reports`; the playbook is a second hop away.
`EVIDENCE_SELECT` asked PostgREST to embed `playbooks!inner(...)` from
`report_evidence`, which is `PGRST200 — no relationship found`. The queue was
never reachable by a browser at all. Fixed by nesting the embed inside
`outcome_reports!inner(...)`, which is the path that exists.

**2. `/admin/requests` returned 500.** `admin_request_inbox` raised
`42501: administrator access required` for the application itself. This one was
two defects that hid each other, and it is the most serious thing found:

- *The revoke did not revoke.* Migration 13 said
  `revoke all on function … from public; grant execute … to service_role` and
  recorded that it had narrowed the grant. It had not. Supabase sets
  `alter default privileges in schema public grant execute on functions to anon,
  authenticated, service_role` for the migration role, so *creating* the function
  wrote explicit `anon=X` and `authenticated=X` ACL entries. `revoke … from
  public` removed only the PUBLIC entry. **Every signed-out visitor and every
  signed-in reader could execute the function**, and the only thing between them
  and the request queue was the in-function check — which is exactly the
  single-sentence version of the argument migration 13 makes against granting
  it at all.
- *The guard refused the only caller with a grant.* It was
  `if not public.is_admin()`, and `is_admin()` resolves `auth.uid()`, which comes
  from the caller's JWT `sub`. A `service_role` key is not a user session and
  carries no `sub`, so `auth.uid()` is null and `is_admin()` is false — always,
  for every caller that had survived the first defect.

So the function was simultaneously open to the public and closed to its
intended caller. Neither half was reachable.

The pgTAP test sat in the middle of this and passed throughout. It ran as
`authenticated` and asserted only that the call *raised*, which it did — for the
privilege reason, not the reason it claimed. Its second assertion, `lives_ok`
"an admin session may execute the request inbox", was true and was **the
opposite of the design**: it was passing because `authenticated` could execute
the function.

**3. Migration 14 fixes both, and is honest about what the guard is.** The grant
is now `revoke … from public, anon, authenticated; grant … to service_role`, and
verified directly with `has_function_privilege` per role rather than inferred
from a call raising. The guard can no longer authenticate a `service_role`
caller, because `service_role` *is* the application and there is nothing behind
the question. It now takes `p_admin_id` and checks that row still says `admin` —
a much narrower claim, and the one that is true: it catches a call site passing
the wrong id, a session demoted since the page rendered, and a stale refetch. The
header says so in those words, because a guard whose comment overstates it is
worse than no guard.

**4. Three test-harness bugs, each wearing a product bug's clothes.**

- *`freshEmail` collided across processes.* It was `Date.now()` plus a
  module-level counter — unique inside a worker, and nothing like it across five.
  Two workers in the same millisecond produced the same address, both asked
  GoTrue to sign it up, and one got `500 duplicate key value violates unique
  constraint "users_email_partial_key"`. The rejected signup never reached the
  "check your email" screen, so the test timed out waiting for `check-email` and
  blamed the sign-in form. Now a `randomUUID`.
- *`beforeAll` runs per worker.* The sweep that demotes administrators left by a
  crashed run was in `test.beforeAll`, which Playwright invokes once per worker.
  A late-starting worker ran it while four siblings were mid-test, demoting the
  accounts they had just promoted. Moved to `globalSetup`, which runs once per
  run, before the first worker — the only hook with the right cardinality.
- *A locator is a query, not a reference.* The moderation test navigated to
  `/p/<slug>` and then clicked `report-approve` through a locator captured on the
  queue page. Playwright re-evaluates it against the current page, so it looked
  for the button on the public page, found nothing, and burned the whole 90s
  timeout. A failure that reads like the button is broken.

**5. The public page does not render report notes.** The moderation test asserted
that an approved report's note appeared on `/p/<slug>`. `ReportList` renders the
result, the amount, the agent and the date — it never renders the note, anywhere
outside `/admin`. The test was asserting that the site quotes a stranger's free
text, and the product was right and the test was wrong. The component's comment
claimed notes were "shown as plain text, never as HTML", describing an intention
the code never implemented; the comment now describes what the code does. The
test asserts the approved-report **count** on the public page instead, which is
computed from the same `public_reports` view the list is read from and is exactly
the acceptance criterion.

**6. The lock is now taken where the mutation is.** `withDbLock` guards the
suite's direct database writes. It was being applied at the *call site*, so each
one held a process-wide lock across a slow `listUsers` as well as the write, and
with ten workers that is where the time went — tests were giving up on the lock.
Each mutating helper in `e2e/support/admin.ts` now takes the lock itself, around
its write and not its reads, so a test cannot forget to.

**7. `supabase/config.toml` — local rate limits raised.** `email_sent` was **2**
per hour and the suite sends one magic link per test, eight in this spec alone.
GoTrue silently dropped the rest, and the symptom was a suite where a *different*
set of tests failed on every run — the tests that got through signed in, the rest
waited for a "check your email" screen that would never arrive. Raised to 1000,
with `sign_in_sign_ups` and `token_verifications` alongside it because those are
per-IP over a 5-minute window and a developer re-running a failing test spends
the budget the first run left behind. **This file configures the local stack and
is never read by a deployed project.**

**8. The admin spec runs last, and alone.** It moderates a real report on
`lower-your-internet-bill` through the UI, which recomputes that playbook's
statistics — and `playbook-detail.spec.ts` and `me-and-report.spec.ts` assert on
those exact figures. `withDbLock` cannot fix this: the mutation arrives through a
server action triggered by a click, never touches the lock, and there is nowhere
sensible to hold a process-wide lock around a page load. Playwright's project
`dependencies` is the mechanism that fits, so `admin-desktop` and `admin-mobile`
wait for `desktop` and `mobile` to finish.

**9. A pgTAP fixture measured the test runner.** "the server can write the log"
counted all of `admin_actions` and expected 1 — but every admin action writes an
audit row, so after the e2e suite had run there were 23. The assertions now
count *this fixture's* row, scoped on all three of `admin_id`, `action` and
`target`. That is both independent of history and a stronger claim: "this write
landed", not "the table has one row".

### Checks and results

| Check | Result |
|---|---|
| `pnpm lint` | clean |
| `pnpm typecheck` | clean |
| `pnpm test` | **595 passed** |
| `pnpm test:db` | **117 passed**, 6 files |
| `pnpm build` | success; 11 `/admin` routes, all `ƒ (Dynamic)` |
| `pnpm exec playwright test e2e/admin.spec.ts` | **16 passed** (8 tests × desktop + mobile) |

### What to inspect in a browser

1. **`pnpm dev`, sign in, `pnpm db:promote-admin <address>`, open `/admin`.**
2. **`/admin/evidence`** — this route returned 500 until this pass and has never
   been looked at. Confirm the queue renders and "Open file" still mints its
   signed URL on click.
3. **`/admin/requests`** — likewise 500 until now. Set the threshold to 0.95 and
   press "Regroup"; the pairs should separate.
4. **The `report-list.tsx` comment change** — a claim about privacy-adjacent
   behaviour was wrong in the code's favour. Confirm that showing no note on a
   public report page is what was wanted, not just what the component happens to
   do.

### Still unverified

- **No human has looked at any of it.** The suite asserts status codes, test ids
  and one text line. It does not know whether the admin area is pleasant to use,
  and nothing here has been checked at 390×844 by eye.
- **The other e2e specs remain flaky under full-suite load.** With the admin
  project isolated, `pnpm exec playwright test --project=desktop
  --project=mobile` still fails one or two tests per run, and *which* ones moves —
  observed in `home.spec.ts`, `sign-in.spec.ts`, `me-and-report.spec.ts` and
  `ranking.spec.ts` across runs. This predates P10: the same spec passes in
  isolation every time. It is dev-server latency with ten browser contexts, and
  reducing workers to 4 did not fix it. Left as-is and recorded rather than
  retried away, because a suite that passes on retry teaches nothing.
- **`strongest_eligible`, `/api/revalidate`, P10b and email are unchanged** from
  the list above.
- **`e2e/support/admin.ts` promotes via a direct UPDATE**, which is the same one
  line `scripts/promote-admin.ts` runs. Shelling out to the script from the suite
  would put a subprocess and an env-file dependency in the path of every run to
  execute one line of SQL; the script itself is exercised by the documented manual
  flow.
- **`strongest_eligible` is still rendered by nothing.** P9 recorded this as a
  gap: "Proven to work" needs 20 reports *and* 3 evidence-approved, and no fixture
  reaches it because no seed creates `report_evidence` rows. The evidence queue
  can now create them — a human uploading one and approving it — but the gate
  cannot be demonstrated from fixtures, and no fixture does.
- **The submissions queue (P10b) is not here.** The brief defers it to the next
  prompt and nothing in this milestone reads `playbook_submissions`.
- **`/api/revalidate` is still unauthenticated**, as at P9.
- **Email has still never sent a message.** `pnpm add resend @react-email/components
  @react-email/render` remains unrun.

---

## P10b — `/create`, the submissions queue, and the review round trip

**Status:** complete. Commit `49278e1`, branch `main`, 38 files. Not pushed.

### What was built

A creator can now write a playbook and put it in front of a reviewer. A
reviewer can approve it, ask for changes, or reject it from
`/admin/submissions`. Approving *is* publishing — there is deliberately no
separate publish button beside approve, because a submission is `in_review` and
RLS publishes nothing but `status = 'published'`, so a second button would be a
way to make something public without reviewing it.

**The create form** (`src/components/create/`) is six sections — outcome, who it
is for, inputs, prompt, steps, testing — with jump links, because on a 390-wide
screen the submit button is at the bottom of a long scroll. Autosave is a 1200ms
debounce with no save button. The prompt is *generated* from the title and inputs
until the creator edits it, and stops following the title after that: an insert
button copies each input's key rather than having it retyped, because
`{{input_1_provider}}` and `{{input_1_placeholder}}` both look right on screen
and only differ to whoever pastes the prompt into an agent. Preview renders the
prompt with a sample answer, templated client-side — no input value is ever sent
to the server or to analytics.

**`submit_playbook`** (migration 15) is the only writer of `playbooks.author_id`
and `playbooks.status`. Ownership is settled before any content is looked at, and
it writes the draft → playbook link *before* the submission row, which is what
makes resubmission possible at all: a creator sent back with "changes requested"
edits the same draft and submits again, keeping the slug and getting version *n+1*
rather than an orphan playbook.

**`playbooks.current_version_id` now points at the version that was just
inserted.** It did not, and nothing caught it because the column was nullable and
nothing read it.

### The composite foreign key

`playbooks` gained `foreign key (id, current_version_id) references
playbook_versions (playbook_id, id)`, replacing a plain `current_version_id`
foreign key. The plain version could not do the job: it constrains the version id
to *some* version, not to a version belonging to *this* playbook. The pgTAP test
for that wrote `throws_ok … 23503` and **passed without raising** against the
plain constraint. It now raises.

### Four defects, all found by running the flow rather than reading it

**1. Every autosave failed, with a blank error.** `update()` spread
`syncPrompt`'s result into the draft state. `syncPrompt` returns
`{ prompt, touched }` — `touched` is the flag's name in `example.ts` — so the
draft gained a `touched` key instead of setting `promptTouched`. The payload
schema is `.strict()`, so **every save was rejected**.

This is the `.strict()` design working as intended, and it is worth being precise
about that: `.strict()` is there so a hand-rolled request cannot smuggle `status`
or `author_id` into the draft. It also caught an internal field-name drift that
no type caught, because the spread widened the type without erroring. A schema
that stops an attacker and also stops a typo is the better schema.

**2. The error the creator saw was a field name, or nothing.**
`saveDraft` returned `error: firstError(errors)`. `firstError` returns the **key**
of the first bad field — it exists to drive focus — so a rejected save reported
`"title"`. And because `.strict()` reports an extra key against the *object*,
that issue's path was empty, `pathToKey([])` returned `""`, and the message
landed under a key no control has: the creator saw an empty error line. Two fixes:
`errorsFromIssues` now handles `unrecognized_keys` and names the offending fields
("This draft has a field it should not: touched."), and `saveDraft` looks the
message up by key, as the submit path already did.

**3. The autosave looped forever.** The effect's dependency list included
`persist`, which closes over `draftId` and `revision` — both of which a successful
save updates. So every save re-armed the 1200ms timer that produced the next one.
The status line sat on "Saving…" for as long as the form was open. The timer now
reads the latest `persist` through a ref and the effect depends only on the
content, which is what "there is something new to save" actually means. The ref
is assigned in an effect rather than during render, because writing a ref during
render is a side effect and React Compiler says so.

**4. Submitting created two drafts.** The debounce is 1200ms. A creator who reads
the form and presses submit inside that window has no draft id yet, so the
submission creates draft B while the timer goes on to create draft A. `/me`
then showed the same playbook twice — "With a reviewer" and "Draft, not
submitted" — and the creator could not delete the second. `submit` now cancels
the pending timer and awaits the flush, using the id that flush returned. That
needs a ref rather than state: `setDraftId` has not taken effect by the time the
code after `await` reads state, so a submit that flushed its own save would still
have submitted the previous id, or none.

### Checks

| Check | Result |
| --- | --- |
| `pnpm lint` | Clean |
| `pnpm typecheck` | Clean |
| `pnpm vitest run` | 676 passed |
| `pnpm exec supabase test db` | 152 passed across 7 files |
| `pnpm build` | Succeeds; `/create` and `/admin/submissions` both present |
| `e2e/create.spec.ts`, desktop + mobile | **20/20 passed**, twice in a row |
| Full non-admin e2e, both viewports | 144 passed / 0 failed on one run |
| Secret scan of the commit | `src`, `supabase`, `e2e`, `scripts` clean; `.env.local` ignored |
| `git status` after commit | Clean |

### What to look at in a browser

- `/create` **signed out** — the whole form renders, and it says *"Sign in to save
  your work as you go"* at the point where that becomes true rather than
  redirecting. Type into it: nothing errors, nothing is saved.
- `/create` **signed in** — type a title, wait ~1.5s, and watch the status line
  go Saving… → Draft saved. Submit an empty form: the first invalid field is
  focused and its message is next to it.
- Add three inputs, tick two **Required**, and try to tick the third — it is
  disabled and says why. Untick one and it becomes available again.
- `/admin/submissions` **as an administrator** — expand a row with **Read**:
  prompt, inputs, steps, who it is for, and the creator's own note are all there
  without leaving the page. Approve, and the page goes public. Ask for changes
  and it refuses without a note.
- The creator's own "what result did you got" is labelled *not a report, not
  counted anywhere* wherever it appears, and approving does not set
  `playbook_agents.tested`.

### Two timeouts I changed, and why it is not papering over a flake

The suite runs five browser contexts against one Postgres in Docker, and every
assertion waits on something the local stack has to do first — a GoTruth
`getUser()`, an RPC, a revalidation, a row becoming visible to a reader's RLS.
Three different tests failed on three different 5s timeouts in a single run, each
at a place that passes when the same file is run serially. `expect.timeout` is now
15s, and one hardcoded `toPass({ timeout: 5_000 })` in `playbook-detail.spec.ts`
was raised to match.

This does not weaken the assertions that are deliberately about a race. Those
expect a value to *stay* wrong, so they fail fast whichever way the timeout goes;
and an assertion that previously gave up early and saw the pre-write state could
pass for the wrong reason, so a longer window makes those stricter.

### Still unverified

- **The review round trip in `e2e/admin.spec.ts` is written and has never run.**
  It promotes a throwaway account to `profiles.role = 'admin'` and demotes it
  afterwards. A request to run it was **refused by the permission classifier** on
  the grounds that granting an administrator role was not something the owner had
  authorised. It was not worked around, and the tests are committed unrun. This
  is the one part of this milestone with no evidence behind it, and the two
  things it asserts that nothing else covers are: approving makes
  `/p/<slug>` return 200 (not just `status = 'published'` in the row), and a
  "changes requested" note reaches the creator's own session on `/me` and
  unlocks their draft.
- **No human has looked at any of it.** The suite asserts test ids, status
  codes, one or two text lines and the database rows. It does not know whether
  `/create` is pleasant to fill in over six sections.
- **The pre-existing load flakiness is reduced, not fixed.** See the P10
  follow-up entry, which recorded the same symptom in `home`, `sign-in`,
  `me-and-report` and `ranking`. `e2e/support/db.ts:authUserId` resolves an
  address by paging `auth.users` at 1000 per page and reading only page 1 — at
  229 local users that is one round trip, but it is called inside `toPass` retry
  loops and will silently start returning `null` once the local database passes
  1000 accounts, which repeated runs are heading towards. **That is the next thing
  to fix in the suite, and it is not fixed here** — the harness follow-up entry
  below takes the retry-loop half of it, and leaves the page-1 limit open.
- **8 e2e tests are skipped by design** — the four `navigation.spec.ts`
  "keeps the current page visible" tests per viewport, which measure mid-flight
  rendering and are meaningless against a dev server that compiles on demand. They
  require `E2E_TARGET=prod`.
- **`strongest_eligible` is still rendered by nothing**, as at P9.
- **`/api/revalidate` is still unauthenticated**, as at P9.
- **Email has still never sent a message.** `resend`, `@react-email/components`
  and `@react-email/render` are installed and unused; that is P11.

---

## Harness follow-up — the retry-loop load, and a toast that matched the wrong element

**Status:** complete. Commit `f56b915`, branch `main`, 2 files. Pushed.

Two fixes to `e2e/`, both items P10b named and left open. Neither touches `src/`
or `supabase/`; this is a test-infrastructure commit.

### `authUserId` re-paged the whole user table inside every retry

`e2e/support/db.ts:authUserId` resolves an address to its `auth.users` id by
listing users at 1000 per page and reading page 1. Its docstring has carried the
page-1 limit since P9: past 1000 accounts a freshly created address falls off the
end and resolves to `null`, which `copiedActionsFor` turns into an empty array, so
a test fails as "nothing was logged" when the copy *was* logged.

That limit is still there. What this commit fixes is the *cost* of the call, which
is what the flakiness actually came from. `copiedActionsFor` is called from inside
`toPass` retry loops, so before this every retry of "wait for the copy to be
logged" transferred the entire user table again — the mechanism the function's own
comment names as the suite's largest source of load under five workers against one
Postgres. It surfaced as those loops timing out, which in the failure output is
indistinguishable from a product bug.

The fix is a per-process `Map` of address → id. An id never changes, so once a
worker has resolved an address it never has to again. A miss still re-fetches, so
an account created after the first call is still found: nothing is cached
negatively, and the cache cannot go stale in the direction that matters.

The page-1 limit is left as a *stated* limit rather than implied to be fixed, and
the comment now says so. A cache that quietly hides a truncation bug would be
worse than the truncation bug.

### The "Reminders off" assertion was reading the previous toast

`e2e/me-and-report.spec.ts` asserted the reminders toast with
`page.locator("[data-sonner-toast]").first()`. Sonner stacks toasts rather than
replacing them, and the delete earlier in the same test still had its "Report
deleted." toast mounted, so `.first()` was resolving to *that* one. The assertion
was reading the previous toast's text — a test that is not a test of anything, and
one that under load could pass for the wrong reason as easily as it could fail. It
now matches by text.

This is the P8 and P9 pattern at its smallest: an assertion that is green against
the state it meant to check and was never exercised against a second toast.

### Checks

| Check | Result |
| --- | --- |
| `pnpm typecheck` | Clean |
| `pnpm exec eslint src e2e scripts` | Clean (exit 0, no output) |
| `pnpm lint` | **Failed on generated output at this commit** — fixed in the next entry. |
| e2e suite | **Not re-run** — see below |
| `git status` after commit | Clean |

### `pnpm lint` now fails on a generated directory, not on the code

The bare `pnpm lint` run reports 3054 problems — 259 errors, 2795 warnings — and
every one of them is in `playwright-report/trace/`, the Playwright HTML report's
own bundled JavaScript. `eslint.config.mjs` extends the Next.js config and adds
`globalIgnores` for `.next/**`, `out/**`, `build/**` and `next-env.d.ts`, but not
for `playwright-report/**` or `test-results/**`. Those two are gitignored, so
nothing generated has ever been committed; the failure only appears once a run has
written a report into the working tree, which is why the P10b record shows a clean
`pnpm lint` and this one does not.

`pnpm exec eslint src e2e scripts` is clean, so no source file is implicated. The
fix is more entries in `globalIgnores`; it is not done here — this commit is the
test fix, not the lint config — and is the next entry instead.

### Still unverified

- **The e2e suite was not re-run against these two changes.** They are harness
  fixes and the diff is small, but the load they target is only visible under a
  full five-worker run against the local stack, and no such run is recorded here.
  "This reduces the load" is the code's reasoning, not a measured before and after.
- **The page-1 truncation is still unfixed.** Past 1000 local accounts
  `authUserId` returns `null` for a real address. The fix is to resolve users by id
  — the sign-in helpers already have it — or to prune the table between runs. The
  cache does not address it and is not meant to.
- **The flakiness recorded by P10 and P10b is not claimed fixed.** This removes one
  source of load; whether the remaining failures go with it has not been measured.

---

## Lint config — stop linting Playwright's report

**Status:** complete. Commit `25b8cfc`, branch `main`, 1 file. Pushed.

The harness follow-up above recorded `pnpm lint` failing with 3054 problems, all
of them in the generated, gitignored `playwright-report/`. This is the config fix
it named.

`eslint.config.mjs`'s `globalIgnores` covered `.next/**`, `out/**`, `build/**` and
`next-env.d.ts` but none of the test output, even though `.gitignore` has ignored
it since P1. ESLint walks the working tree, not the index, so the moment a run
left a report behind, `pnpm lint` was linting Playwright's bundled trace viewer —
259 errors and 2795 warnings in third-party code that is not ours to fix.

The ignore list now mirrors the "Testing" block in `.gitignore`: `coverage/**`,
`playwright-report/**`, `test-results/**`, `blob-report/**`. `coverage/` and
`blob-report/` had the same hazard and no artifact on disk to expose it, which is
the argument for mirroring the list rather than adding only the one directory that
happened to be present.

### Checks

| Check | Result |
| --- | --- |
| `pnpm lint` | Clean, exit 0 — was 3054 problems at `f56b915` |
| `pnpm exec eslint src e2e scripts` | Clean, unchanged |
| `git status` after commit | Clean |

### Still unverified

- **Nothing.** This is a nine-line ignore list, and the command that found the
  problem is the command that proves it fixed. The one judgement in it — that no
  source finding is being hidden — is supported by `src`, `e2e` and `scripts`
  having been clean under their own invocation *before* the ignore existed.
