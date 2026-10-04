import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function HomePage() {
  return (
    <main className="flex-1">
      {/* Hero — the real headline, search and rotating placeholders arrive in P4. */}
      <section className="mx-auto w-full max-w-6xl px-4 py-20">
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
          What do you want{" "}
          <span className="text-muse">Muse</span> to do?
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">Proven playbooks with real results.</p>

        <form action="/search" className="mt-8 flex max-w-xl gap-2">
          <input
            type="search"
            name="q"
            aria-label="Search playbooks"
            placeholder="Save $100 on internet bill"
            className="h-12 flex-1 rounded-lg border border-input bg-card px-4 text-base outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Button type="submit" size="lg" className="h-12">
            Search
          </Button>
        </form>

        <p className="mt-4 text-sm text-muted-foreground">
          Popular use cases, categories and starter kits arrive in P4.
        </p>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 pb-20">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { href: "/playbooks", title: "All playbooks", body: "Every published playbook, sorted by best evidence." },
            { href: "/kits", title: "Starter kits", body: "Curated bundles for a goal, ordered for you." },
            { href: "/categories", title: "Categories", body: "Eight categories, from personal finance to creativity." },
          ].map((item) => (
            <Card key={item.href} className="transition-colors hover:bg-accent/40">
              <CardContent>
                <Link href={item.href} className="block">
                  <h2 className="font-medium">{item.title}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{item.body}</p>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>

        <p className="mt-10 inline-flex rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground">
          Placeholder — homepage built in P4.
        </p>
      </section>
    </main>
  );
}
