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
