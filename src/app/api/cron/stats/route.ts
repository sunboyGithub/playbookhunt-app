import { NextResponse, type NextRequest } from "next/server";

import { getEnv } from "@/lib/env";
import { refreshAllStats } from "@/lib/ranking/refresh-after";
import { nowMs } from "@/server/clock";

/**
 * The statistics refresh job.
 *
 * Fifteen minutes, where the follow-up job runs hourly. The difference is what
 * each one is for: a follow-up email has a due date and nothing to say before
 * it, while `trending_score` decays continuously — half of every score's weight
 * is gone after 48 hours — so the "Trending" quick link on the homepage is only
 * true if something recomputes it while nobody is filing anything. No report is
 * filed, no cron runs, and the trending order silently becomes history.
 *
 * Reports themselves do not wait for this job. `submitReport` recomputes the one
 * playbook it touched, so the page a reader lands on is already current; this
 * exists for the terms that move on their own.
 *
 * ## Same secret discipline as the follow-up job
 *
 * `CRON_SECRET` is checked here rather than trusted from configuration, and
 * absent it means nothing runs. An open cron route here is a public endpoint
 * that makes the site's most expensive query — a full-catalogue recompute — run
 * on demand, which is both a cost attack and a way to hammer the database.
 */
export const dynamic = "force-dynamic";

/** Vercel Cron sends GET. POST is accepted so a manual trigger is easy. */
export async function GET(request: NextRequest) {
  return run(request);
}

export async function POST(request: NextRequest) {
  return run(request);
}

async function run(request: NextRequest): Promise<NextResponse> {
  const secret = getEnv().CRON_SECRET;

  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not set; the stats job is disabled." },
      { status: 503 },
    );
  }

  const provided = request.headers.get("authorization") ?? "";
  if (provided !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = nowMs();

  try {
    const result = await refreshAllStats();
    return NextResponse.json({
      ...result,
      durationMs: nowMs() - startedAt,
      // A score that moved is a page whose numbers moved. A caller can hand
      // this to `/api/revalidate` rather than revalidating everything, which is
      // the difference between a job that costs a query and a job that costs a
      // full re-render.
      changedCount: result.changed.length,
    });
  } catch (error) {
    // A 500 rather than a 200 with `ok: false`. This route's caller is a cron
    // scheduler, and the only signal it gets about a broken job is a non-2xx;
    // a 200 it ignores is a job that failed silently for a week.
    return NextResponse.json(
      {
        error: "stats refresh failed",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}