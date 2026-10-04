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
