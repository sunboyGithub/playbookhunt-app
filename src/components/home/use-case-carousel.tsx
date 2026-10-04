"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import type { UseCaseWithItems } from "@/server/queries/taxonomy";

/**
 * The "Popular Use Cases" carousel.
 *
 * Native scroll plus `scroll-snap` rather than a transform-driven slider: the
 * browser already gets the momentum, the track position and the accessibility
 * behaviour right, and a keyboard user can scroll it with the arrow keys for
 * free. What is added on top is only the affordances the frame shows — arrows
 * that appear when there is somewhere to go, and dots that reflect the scroll
 * position.
 *
 * The next tile deliberately peeks past the right edge and fades out beneath the
 * arrow. That is what tells a reader there is more to the right; a carousel that
 * ends flush looks complete.
 */

/**
 * The tile shape is `UseCaseWithItems` rather than a local copy of the columns.
 * A hand-written duplicate declared `description: string` while the column is
 * nullable, which the compiler caught at the call site — the two have to be the
 * same type or the props lie about what the query returns.
 */
export function UseCaseCarousel({ useCases }: { useCases: UseCaseWithItems[] }) {
  const trackRef = useRef<HTMLUListElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);
  const [page, setPage] = useState(0);

  const sync = useCallback(() => {
    const track = trackRef.current;
    if (!track) {
      return;
    }

    const maxScroll = track.scrollWidth - track.clientWidth;
    // 2px of slack: fractional layout widths otherwise leave a scroll position
    // that is 0.3px short of the end and pins the "next" arrow on forever.
    setAtStart(track.scrollLeft <= 2);
    setAtEnd(track.scrollLeft >= maxScroll - 2);

    // A "page" of this carousel is exactly one client width — that is what
    // scrollBy and the dots both move by — so the page index is just the scroll
    // position in client widths, rounded.
    setPage(track.clientWidth > 0 ? Math.round(track.scrollLeft / track.clientWidth) : 0);
  }, []);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) {
      return;
    }
    sync();
    track.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", sync);
    return () => {
      track.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
    };
  }, [sync]);

  const scrollBy = (direction: 1 | -1) => {
    const track = trackRef.current;
    if (!track) {
      return;
    }
    track.scrollBy({ left: direction * track.clientWidth, behavior: "smooth" });
  };

  if (useCases.length === 0) {
    return null;
  }

  const pageCount = Math.max(1, Math.ceil(useCases.length / 4));

  return (
    <section aria-labelledby="use-cases-heading" className="mx-auto w-full max-w-6xl px-4">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 id="use-cases-heading" className="text-2xl font-semibold tracking-tight">
          Popular Use Cases
        </h2>
        <p className="text-sm text-muted-foreground">
          {Math.min(useCases.length, 4)} of {useCases.length}
        </p>
      </div>

      {/* `overflow-hidden` on the wrapper is what stops the peeking tile from
          rendering past the arrow; the track itself scrolls inside it. */}
      <div className="relative overflow-hidden">
        <ul
          ref={trackRef}
          className="flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {useCases.map((useCase) => (
            <li
              key={useCase.slug}
              className="w-[calc(50%-0.5rem)] shrink-0 snap-start sm:w-[calc(25%-0.75rem)]"
            >
              <Link
                href={`/use-cases/${useCase.slug}`}
                className="flex aspect-[16/7] items-center justify-center rounded-xl p-4 text-center text-base font-semibold text-white transition-transform hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                style={{
                  backgroundImage: `linear-gradient(135deg, ${useCase.gradient_from ?? "#6b7f74"}, ${useCase.gradient_to ?? "#4a5b52"})`,
                }}
              >
                {useCase.title}
              </Link>
            </li>
          ))}
        </ul>

        {/* The fade sits under the arrow so the peeking tile dissolves into the
            page rather than being cut off by it. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-background to-transparent"
        />

        <button
          type="button"
          onClick={() => scrollBy(-1)}
          aria-label="Previous use cases"
          disabled={atStart}
          className="absolute top-1/2 -left-4 hidden size-10 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card shadow-sm transition-opacity disabled:opacity-0 md:flex"
        >
          <ChevronLeft className="size-5" />
        </button>
        <button
          type="button"
          onClick={() => scrollBy(1)}
          aria-label="Next use cases"
          disabled={atEnd}
          className="absolute top-1/2 -right-4 flex size-10 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card shadow-sm transition-opacity disabled:opacity-0"
        >
          <ChevronRight className="size-5" />
        </button>
      </div>

      <div className="mt-4 flex justify-center gap-2">
        {Array.from({ length: pageCount }).map((_, index) => (
          <button
            key={index}
            type="button"
            aria-label={`Go to use cases page ${index + 1}`}
            aria-current={index === Math.min(page, pageCount - 1)}
            onClick={() => {
              const track = trackRef.current;
              if (track) {
                track.scrollTo({ left: index * track.clientWidth, behavior: "smooth" });
              }
            }}
            className={`size-2 rounded-full transition-colors ${
              index === Math.min(page, pageCount - 1) ? "bg-foreground" : "bg-border"
            }`}
          />
        ))}
      </div>
    </section>
  );
}