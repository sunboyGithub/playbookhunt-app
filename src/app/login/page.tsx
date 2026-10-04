import type { Metadata } from "next";

import { SignInBody } from "@/components/auth/sign-in-body";
import { safeReturnTo } from "@/lib/auth/pending-action";

/**
 * Sign in as a page rather than only as a modal.
 *
 * The body is the same component the modal renders, so the two cannot drift —
 * which matters here because "sign up" and "sign in" are one step, and a reader
 * who lands on `/login` from the header has to be offered exactly what the
 * reader who tapped ★ on a playbook was offered.
 *
 * `?next=` carries the page to come back to. It goes through `safeReturnTo`,
 * because this value arrives in a query string and then becomes a redirect
 * target: an unvalidated `next` is an open redirect, and this route is the most
 * obvious place in the app to put one.
 */
export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const next = typeof query.next === "string" ? safeReturnTo(query.next, "/") : undefined;

  return (
    <main className="mx-auto w-full max-w-md px-4 py-10">
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <SignInBody returnTo={next} />
      </div>
    </main>
  );
}