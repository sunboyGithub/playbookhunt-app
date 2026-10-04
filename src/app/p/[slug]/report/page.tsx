import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { getPublishedPlaybookBySlug } from "@/server/queries/playbooks";

/**
 * A placeholder, and I want to be explicit that it is one rather than a thin
 * report form.
 *
 * P7 ends the try flow with "Did it work? Come back and report your result" and
 * a Report button, because the prompt is what sends someone here. The form
 * itself is P8: it needs sign-in, a result, an amount, optional evidence upload
 * and a Muse referral code, and none of that belongs in this prompt.
 *
 * What this page must not be is a 404. The try flow's last act is a button, and a
 * button that 404s is worse than one that does less — the same reasoning that
 * put a placeholder on the try page in P6.
 */
export default async function ReportPlaceholderPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const playbook = await getPublishedPlaybookBySlug(slug);

  if (!playbook) {
    notFound();
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10">
      <Link
        href={`/p/${playbook.slug}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft aria-hidden className="size-4" />
        Back to {playbook.title}
      </Link>

      <h1 className="mt-4 text-2xl font-semibold tracking-tight">Report your result</h1>

      <p className="mt-2 text-muted-foreground">
        Reporting opens in the next build. It will ask one required question — did it work? — and leave
        everything else optional.
      </p>

      <p className="mt-4 text-sm text-muted-foreground">
        In the meantime, the prompt is still one copy away:{" "}
        <Link href={`/p/${playbook.slug}/try`} className="underline">
          open the try flow
        </Link>
        .
      </p>
    </div>
  );
}