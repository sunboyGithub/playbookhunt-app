# Playbook Hunt — Project Brief

Name: Playbook Hunt. Domain: playbookhunt.com (NEXT_PUBLIC_SITE_URL=https://playbookhunt.com). Social handle: @playbookhunt. The brand is agent-neutral; the product is Muse-first for launch.

## What we are building

A search-first website where people find AI-agent "playbooks" (prompt + inputs + steps) for a real task, try them in their AI agent, and report whether they worked. The differentiator is REAL-WORLD OUTCOME DATA, not a big prompt library.

Core loop: Task → Discover → Try → Report → Aggregate → Rank → Discover again.

Example card: "Lower your internet bill — 1,247 tried · 68% worked (n=412) · Median $18/mo · Verified 3 days ago · Tested with Muse".

## v1 scope

In: target ~48 curated playbooks across 8 categories (the shared starter pack currently contains 3 authored, untested examples); homepage; search/filters; /playbooks, /categories + category pages, /kits + starter kit pages, /use-cases/[slug] pages (homepage Popular Use Cases); playbook detail with Save and Share; try flow with agent picker; sign-in (Google, Facebook, email link) with pending-action resume; Save + My playbooks (/me: Saved / Tried / Reported); outcome reports with optional evidence and optional Muse referral code; follow-up emails; stats & ranking; admin/moderation; playbook requests; Create a playbook form that goes to admin review; analytics; SEO; /how-we-verify page; private tester feedback via footer/report-success, with an admin Feedback queue.

Out (phase 2): public creator profiles, Inspired-by claims/thanks, creator referral links on playbooks, comments, votes.

## Stack

Next.js (App Router, RSC, Server Actions, TypeScript strict), Tailwind CSS + shadcn/ui, Supabase (Postgres, Auth, Storage, RLS), Resend (email), PostHog (analytics), Sentry, Vercel. pnpm. Vitest + Playwright. zod for validation. cmdk for the ⌘K palette.

## Categories

personal-finance 💰, travel-booking ✈️, travel-planning 🗺️, shopping 🛍️, small-business 🏢, productivity ⚡, health 🏥, creativity 🎨.

## Agents

Data-driven (agents table) with capabilities (info, web_actions, phone_calls) and status (active / coming_soon / hidden):

- muse: active, primary, recommended, preselected.
- chatgpt-dots: display name "ChatGPT"; legacy internal identifier retained for compatibility. Status coming_soon (greyed), not selectable in v1.
- grok-bot: display name "Grok"; legacy internal identifier retained for compatibility. coming_soon (greyed).
- manus: coming_soon (greyed).
- instinct, Claude and Gemini: not listed (status hidden).

In the UI, Muse is the only selectable agent for now; all coming_soon agents render as greyed, disabled chips with no extra labels or explanations. "Open in <agent>" URL templates are config; if prefill support is not verified, copy the prompt and open the agent's home page instead.

## Design system

- Light theme. Background #FAF9F6, cards white, border #E7E5E0, radius 12–16px, generous whitespace.
- Accent (primary CTA) #FF5A1F. Outcome colors: worked #16A34A, partly #F59E0B, didn't #DC2626.
- Muse blue #2A66DE (soft #E8EFFC, dark text #1D4FB8, line #C3D4F5), sampled from the Muse logo. Use it for everything Muse: the word "Muse" in the hero headline, the Muse agent chip, and the "Open in Muse" button. Wherever Muse appears as an agent, show the official Muse avatar (/public/brand/muse-avatar.png, the fluffy character, circular crop) inside a Meta-blue ring (#0081FB, ~14% of the radius).
- Font: Inter or Geist; monospace for prompt blocks.
- One PlaybookCard component in three densities: rich (preview image, category tag top-left, badge, title, promise, evidence lines, agent chips, creator avatar, hover "Try"), compact (title, agent icons +N, evidence line, avatar), row (rank #, icon, title+promise, tags, right-side evidence box).
- Below the report threshold, show "Early · N reports" instead of a percentage.

## Ranking rules (non-negotiable)

- Evidence score = 0.55·WilsonLowerBound(success) + 0.20·outcomeStrength + 0.15·recency + 0.10·usage. Weights in config.
- Success: worked=1, partly=0.5, didn't=0. Reports weighted by trust (email verified, evidence approved, account age) and decayed with a 60-day half-life. Author's own, rejected and outlier reports weigh 0.
- Show % only when report_count >= 20; show median only when amount_n >= 10.
- "Proven to work" requires >= 20 reports and >= 3 evidence-approved reports.
- Trending is a separate score from recent tries/reports (48h half-life over 7 days).
- Votes, referral links, referral codes, credits and follower counts NEVER affect ranking.
- Optional Muse referral codes on reports are displayed only on verified reports, one per user, labeled as a referral, with a link to Muse's official referral terms.

## Creation and requests

Keep creation focused on the task: no public creator-name field or live attribution line in the form. Retain existing P10b author credit; public profiles and further attribution work are deferred. /request is a public, dedicated task-request page using the same protected submission flow as empty search results. The dedicated page requires Topic (an icon grid with two columns on mobile and naturally wrapping chips on wider screens), Goal (a matching-purpose dropdown), and a task; every goal list includes Something else. Use the form heading “What would you like AI to help with?” without a separate introductory paragraph. Omit the privacy helper on this page; show concise send errors only after failure and dismiss them when editing. Email remains optional. Topic changes clear the purpose but preserve typed text. Store readable topic/purpose context with the request for admin review; no sign-in required. Keep compact empty-search requests working.

## Data integrity

Never fabricate stats. Seed data has empty stats. Numbers in wireframes are illustrative only.

## Privacy

Evidence uploads go to a private bucket, visible only to the uploader and admins. Encourage redaction. No PII in analytics events. Tester feedback and optional reply emails are admin-only; store pathname context without query strings/fragments. Feedback uses rate limiting, Turnstile, and idempotent server submissions, and never affects ranking.

## Footer

Keep the shared footer compact: How we verify / Request / Create / Privacy / Terms / Feedback. Three columns and two rows on mobile, one wrapping row on desktop; preserve 44px touch targets and omit the tagline. Mobile-menu labels and report-success Send feedback remain descriptive.

## Conventions

- src/app for routes, src/components (ui/ = shadcn), src/lib (supabase, ranking, analytics, validation), src/server (server actions/queries), supabase/migrations, content/playbooks/*.yaml, scripts/.
- Server-side data access through typed query functions in src/server; no Supabase calls from client components except auth.
- All tables have RLS. Admin checks happen server-side.
- Accessible (keyboard, labels, contrast AA), responsive down to 360px.
- Mobile parity (match Frames 7a/7b): every desktop feature exists on mobile with the same copy, rules and states. Header → logo, search icon, ☰ menu (Sign in or avatar, Playbooks, Starter kits, Categories, + Create a playbook, Report a result, footer links). Popular Use Cases shows 2 tiles + peek + arrow. Detail: Save ☆ and Share ↗ icon buttons in the top bar, Works with (Muse + greyed agents), copy toast above a sticky "Try this playbook / Report" bar. Try, Report, Sign-in and Share open as bottom sheets; My playbooks uses stacked cards. Every UI prompt must ship desktop and mobile together and include a Playwright check at 390×844.
- Keep dependencies minimal; ask before adding a major one.

## Build-package references

This parent folder is a standalone specification and content package; the existing app repository is not required or included in the handoff. Read BUILD_HANDOFF.md first. Run the prompts in playbookhunt_prompt/playbookhunt_coding_agent_prompts.md in order in your own new app workspace.

Use playbookhunt_design/CURRENT_DESIGN.md for current UI decisions; older PNG/HTML frames illustrate the original design and do not override this brief or the updated prompts. Use playbookhunt_content_templates/playbooks/ for the three authored starter playbooks, and its README for template and catalog instructions. Never treat the planned catalog as finished or tested content.

For installed Next.js versions, read the relevant framework documentation before implementation. Use client navigation for internal links, including the home logo; avoid blank-page/full-page skeleton flashes, and verify delayed transitions in a production build on desktop and mobile.
