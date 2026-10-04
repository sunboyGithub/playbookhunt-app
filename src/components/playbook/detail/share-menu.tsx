"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Link2, Share2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { trackShare } from "@/lib/analytics";
import { canShareNatively, shareTargets, type ShareChannel } from "@/lib/share";

/**
 * The share control: a popover of targets on desktop, the platform's own sheet
 * on a device that has one.
 *
 * The two are not styled variants of the same thing — they are different
 * platforms with different affordances, and picking by `navigator.share`
 * rather than by screen size gets both directions right. A desktop Safari that
 * can share natively should; a phone whose browser somehow cannot should still
 * get copy-link.
 *
 * The two platforms with no web share URL (Instagram, TikTok) therefore have no
 * `href` at all in `shareTargets`. On a device with the native sheet they hand
 * the whole choice to the reader; on desktop they copy the link, which is the
 * only thing that can actually work there. Rendering a link to a platform's
 * non-existent endpoint would open a composer with nothing in it.
 */
export function ShareMenu({
  slug,
  url,
  title,
}: {
  slug: string;
  url: string;
  /** The promise, not the page title — see `lib/share`. */
  title: string;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const container = useRef<HTMLDivElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const targets = shareTargets(url, title);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  // Click-away, and Escape. A popover with no way out is a trap on a keyboard.
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!container.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const copyLink = useCallback(async () => {
    const ok = await writeClipboard(url);
    if (!ok) {
      toast.error("Couldn't copy the link");
      return;
    }

    trackShare(slug, "copy");
    setCopied(true);
    setOpen(false);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 3000);
    toast.success("Link copied");
  }, [slug, url]);

  const openNative = useCallback(async () => {
    try {
      await navigator.share({ title, text: title, url });
      // Only logged on success. A reader who dismisses the platform sheet has
      // not shared anything, and counting that as a share would inflate the one
      // number this component exists to produce.
      trackShare(slug, "native");
    } catch {
      // Dismissed, or the platform refused. Nothing to report and nothing to
      // apologise for — the reader cancelled.
    }
  }, [slug, title, url]);

  const onSelect = useCallback(
    (channel: ShareChannel, href: string | null) => {
      if (channel === "copy") {
        void copyLink();
        return;
      }

      if (href === null) {
        // Instagram or TikTok: no web intent exists.
        if (canShareNatively(navigator)) {
          void openNative();
        } else {
          void copyLink();
        }
        return;
      }

      trackShare(slug, channel);
      setOpen(false);
      window.open(href, "_blank", "noopener,noreferrer");
    },
    [copyLink, openNative, slug],
  );

  const canNative = typeof navigator !== "undefined" && canShareNatively(navigator);

  return (
    <div className="relative" ref={container}>
      <Button
        variant="outline"
        size="sm"
        aria-expanded={open}
        aria-haspopup="menu"
        data-testid="share-button"
        onClick={() => {
          // A device with the platform's own sheet gets that instead of ours —
          // it knows which apps are installed, which this page cannot know.
          if (canNative) {
            void openNative();
            return;
          }
          setOpen((value) => !value);
        }}
      >
        <Share2 aria-hidden />
        Share
      </Button>

      {open ? (
        <div
          role="menu"
          aria-label="Share this playbook"
          className="absolute right-0 z-20 mt-2 w-44 rounded-xl border border-border bg-popover p-1 shadow-lg"
        >
          {targets
            .filter((target) => target.channel !== "copy")
            .map((target) => (
              <button
                key={target.channel}
                type="button"
                role="menuitem"
                onClick={() => onSelect(target.channel, target.href)}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-accent"
              >
                {target.label}
                {target.nativeOnly ? (
                  <span className="ml-auto text-[11px] text-muted-foreground">copies link</span>
                ) : null}
              </button>
            ))}

          <button
            type="button"
            role="menuitem"
            onClick={() => void copyLink()}
            data-testid="share-copy"
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-accent"
          >
            {copied ? <Check aria-hidden className="text-worked" /> : <Link2 aria-hidden />}
            {copied ? "✓ Copied" : "Copy link"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

async function writeClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to the legacy path.
    }
  }

  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}