# Playbook Hunt

Search-first website for AI-agent "playbooks" (prompt + inputs + steps) for a
real task, where the differentiator is real-world outcome data rather than a
large prompt library.

Read [AGENTS.md](./AGENTS.md) for the project brief and the non-negotiable
rules — ranking, privacy and data integrity all live there.

## Prerequisites

- Node.js 20+ (developed on 26.10.0)
- pnpm
- Docker Desktop (running) for the local Supabase stack
- Supabase CLI

## Setup

### 1. Install dependencies

```bash
pnpm install
```

`sharp` and `unrs-resolver` build scripts are allowlisted in
`pnpm-workspace.yaml`. Without that, `next build` fails on image optimization.

### 2. Start local Supabase

```bash
supabase start
```

This pulls Postgres, Kong, PostgREST, GoTrue, Storage and Mailpit, then prints
the local keys. Supabase Studio opens at <http://127.0.0.1:54323> and Mailpit
(catches outgoing email) at <http://127.0.0.1:54324>.

### 3. Environment

```bash
cp .env.example .env.local
```

Then fill in the Supabase values from `supabase start` output. Only three are
required to boot:

| Variable | Required |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | yes |
| `NEXT_PUBLIC_SUPABASE_URL` | yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes |
| `SUPABASE_SERVICE_ROLE_KEY` | server-only; needed from P2 |
| `RESEND_API_KEY` | P8 |
| `NEXT_PUBLIC_POSTHOG_KEY` | P11 |
| `SENTRY_DSN` | P11 |

`.env.local` is gitignored. Never commit keys — `SUPABASE_SERVICE_ROLE_KEY`
bypasses RLS entirely.

Missing required variables fail fast at startup via `src/lib/env.ts`, with an
error naming each absent key.

### 4. Dev server

```bash
pnpm dev
```

Open <http://localhost:3000>.

## Scripts

| Script | Purpose |
|---|---|
| `pnpm dev` | Development server |
| `pnpm build` | Production build |
| `pnpm start` | Serve the production build |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | Vitest unit tests |
| `pnpm test:watch` | Vitest in watch mode |
| `pnpm test:e2e` | Playwright, desktop + 390x844 mobile |

Playwright needs browsers once: `pnpm exec playwright install chromium`.

## Layout

```
src/app/            routes (App Router)
src/components/     shared components; ui/ is shadcn
src/lib/            env, supabase clients, utils
supabase/           local development config and migrations
content/playbooks/  authored playbook YAML (P3)
docs/design/        design frames and CURRENT_DESIGN.md
```

Conventions in short: server-side data access goes through typed query
functions in `src/server`; no Supabase calls from client components except
auth; every table has RLS and admin checks happen server-side.

## Status

Built so far: **P0** (project brief) and **P1** (this scaffold). Every route is
a placeholder. See [build_history.md](./build_history.md) for what exists and
what has actually been verified, and [token_history.md](./token_history.md) for
the per-milestone record.
