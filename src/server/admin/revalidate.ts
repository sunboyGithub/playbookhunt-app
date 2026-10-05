import "server-only";

import { revalidatePath } from "next/cache";

/**
 * The four paths that can show a number a moderation decision just changed.
 *
 * Written once because the set is easy to get subtly wrong: revalidating only the
 * playbook page leaves the results page showing a success rate computed from
 * reports that are no longer approved, which is precisely the number this site
 * exists to be trustworthy about.
 *
 * `/p/[slug]` is revalidated as a *page type* rather than only for this slug, so
 * the brief's "last verified 3 days ago" and any other slug whose cache entry
 * mentions this playbook stop being stale.
 */
export function revalidatePublicPlaybook(slug: string): void {
  revalidatePath(`/p/${slug}`);
  revalidatePath("/p/[slug]", "page");
  revalidatePath("/playbooks");
  revalidatePath("/");
}