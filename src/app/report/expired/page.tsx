import Link from "next/link";

/**
 * Where a dead follow-up link goes.
 *
 * Its own page rather than the homepage, because the reader clicked something
 * specific and the honest answer is "that specific thing has expired" — not a
 * landing page that looks like nothing happened. It still offers the thing they
 * were trying to do.
 */
export default function ExpiredLinkPage() {
  return (
    <main className="mx-auto w-full max-w-lg px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">That reminder link has expired</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Reminder links last 14 days, so an old one from your inbox no longer works. If you still
        remember the playbook, you can report how it went — it takes about 30 seconds.
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/playbooks"
          className="inline-flex h-11 items-center rounded-full bg-brand px-6 text-white"
        >
          Browse playbooks
        </Link>
        <Link href="/me" className="text-sm underline">
          My playbooks
        </Link>
      </div>
    </main>
  );
}