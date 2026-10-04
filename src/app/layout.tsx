import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { SignInResume } from "@/components/auth/sign-in-resume";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getViewer } from "@/lib/auth/viewer";
import { listCategories, type CategoryWithCount } from "@/server/queries/taxonomy";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Playbook Hunt — AI playbooks with real results",
    template: "%s | Playbook Hunt",
  },
  description:
    "Find AI-agent playbooks for a real task, try them in your agent, and report whether they worked.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Categories are fetched in the layout rather than in each page so the header
  // — and the ⌘K palette it opens — is identical everywhere, and so adding a
  // category does not mean editing a component. Eight rows; one query.
  //
  // This is caught rather than allowed to throw because it runs above every
  // route: `listCategories` throws on error, so an unguarded call here would turn
  // any database hiccup into a 500 on the sign-in page and the 404 alike. The
  // cost of the catch is an empty category list inside the palette, which is a
  // far smaller failure than the site being down.
  const categories: CategoryWithCount[] = await listCategories().catch(() => []);

  // Resolved alongside the categories, in the same pass, for the same reason:
  // this runs above every route and there is nothing to cache it into.
  const viewer = await getViewer();

  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <TooltipProvider>
          <SiteHeader
            categories={categories.map(({ slug, name, emoji }) => ({ slug, name, emoji }))}
            viewer={viewer}
          />
          {children}
          <SiteFooter />
          <Toaster />
          {/* Mounted here, not per page: `/auth/callback` can land the reader on
              any route, and a resume component that only existed on some of them
              would do nothing for the rest. `useSearchParams` needs a Suspense
              boundary to keep the rest of the tree renderable. */}
          <Suspense fallback={null}>
            <SignInResume />
          </Suspense>
        </TooltipProvider>
      </body>
    </html>
  );
}
