import type { Metadata } from "next";
import Link from "next/link";

import { listCategories } from "@/server/queries/taxonomy";

export const metadata: Metadata = {
  title: "Categories",
  description: "Browse AI playbooks by category: personal finance, travel, health, and more.",
};

export default async function CategoriesPage() {
  const categories = await listCategories();

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Categories</h1>
      <p className="mt-1 text-muted-foreground">
        Eight categories, each with the playbooks we have for it.
      </p>

      <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {categories.map((category) => (
          <li key={category.slug}>
            <Link
              href={`/c/${category.slug}`}
              className="flex h-full flex-col rounded-xl border border-border bg-card p-5 transition-colors hover:bg-accent"
            >
              <span aria-hidden className="text-2xl">
                {category.emoji}
              </span>
              <span className="mt-2 font-semibold">{category.name}</span>
              <span className="mt-1 line-clamp-3 text-sm text-muted-foreground">
                {category.description}
              </span>
              <span className="mt-3 text-sm text-muted-foreground">
                {category.playbook_count}{" "}
                {category.playbook_count === 1 ? "playbook" : "playbooks"}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}