"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { clearPendingAction } from "@/lib/auth/pending-action";

/**
 * Finishes the interrupted action, silently.
 *
 * `/auth/callback` already did the work; this tells the reader it happened,
 * puts them back at the scroll position they left, and takes the parameters out
 * of the address bar.
 *
 * Mounted once, in the root layout, rather than in each page: the callback can
 * land on any page in the app, so a component that lived on one of them would
 * silently do nothing for the rest.
 *
 * The parameters are stripped with `router.replace` rather than `push`, so the
 * reader's Back button returns to the page before the sign-in instead of to the
 * same page a second time.
 */
export function SignInResume() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const resume = params.get("ph_resume");
  const scrollY = Number(params.get("ph_scroll") ?? 0);
  const signInError = params.get("signin_error");

  // `useEffect` with an empty dependency list would run once per mount, and
  // this component remounts on every client navigation within the layout. The
  // ref makes "only the first time this URL had a resume" explicit rather than
  // dependent on how the layout happens to be structured.
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    if (signInError) {
      toast.error(signInError);
    }

    if (resume) {
      if (resume === "save") {
        toast.success("Saved", {
          description: "It's in My playbooks.",
          action: { label: "View saved", onClick: () => router.push("/me") },
        });
      } else {
        // `report` and `create` navigate rather than write, so landing on the
        // right route *is* the completion. Confirm it so the reader knows the
        // detour did something.
        toast.success("Signed in");
      }

      clearPendingAction();
    }

    // Strip both parameters whether or not they did anything, so a reload
    // cannot replay a toast or a scroll the reader has already seen.
    if (resume || signInError || params.has("ph_scroll")) {
      const next = new URLSearchParams(params.toString());
      next.delete("ph_resume");
      next.delete("ph_scroll");
      next.delete("signin_error");

      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    }

    if (Number.isFinite(scrollY) && scrollY > 0) {
      // Twice: once now, once after layout, because images and the stat tiles
      // settle below the fold and a single restore lands short of where the
      // reader was.
      window.scrollTo(0, scrollY);
      const timer = window.setTimeout(() => window.scrollTo(0, scrollY), 250);
      return () => window.clearTimeout(timer);
    }
  }, [params, pathname, resume, router, scrollY, signInError]);

  return null;
}