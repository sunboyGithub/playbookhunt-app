/**
 * Per-agent brand marks for the "Works with" block.
 *
 * These are **not** the vendors' logos. They are distinct placeholder glyphs
 * drawn for this project — one shape per agent, in that agent's general colour
 * family — and they are drawn here rather than dropped in as SVG files because
 * shipping a competitor's trademark on a page that ranks against them needs a
 * decision nobody has made yet. Swapping in the real assets later is a change
 * to this one file.
 *
 * The shapes are decorative: the agent's name is always rendered beside or
 * inside the mark, so every mark here is `aria-hidden`. A logo that is the only
 * identification of a control is unusable with a screen reader, and a row of
 * six unlabelled glyphs is worse.
 */

type MarkProps = {
  className?: string;
};

/** Muse — a spark. The one agent with a brand colour, since it is the one the
 *  whole product is built around. */
function MuseMark({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden focusable="false">
      <path
        d="M12 2.5c.6 4.2 2.3 5.9 6.5 6.5-4.2.6-5.9 2.3-6.5 6.5-.6-4.2-2.3-5.9-6.5-6.5 4.2-.6 5.9-2.3 6.5-6.5Z"
        fill="currentColor"
      />
      <path d="M17.5 14c.3 2.1 1.2 3 3.3 3.3-2.1.3-3 1.2-3.3 3.3-.3-2.1-1.2-3-3.3-3.3 2.1-.3 3-1.2 3.3-3.3Z" fill="currentColor" opacity=".55" />
    </svg>
  );
}

/** ChatGPT — a hexagonal knot, six-fold like the vendor's own mark. */
function ChatGptMark({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden focusable="false">
      <path
        d="M12 2.6 19.4 7v10L12 21.4 4.6 17V7L12 2.6Zm0 4.5L7.3 9.7v6.6L12 18.9l4.7-2.6V9.7L12 7.1Z"
        fill="currentColor"
      />
    </svg>
  );
}

/** Grok — a diagonal slash through a ring. */
function GrokMark({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden focusable="false">
      <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="2.4" />
      <path d="M6.8 17.2 17.2 6.8" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

/** Manus — a rounded square with a rising stroke. */
function ManusMark({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden focusable="false">
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" fill="none" stroke="currentColor" strokeWidth="2.2" />
      <path d="M7.5 15.5 11 11l3 3 2.5-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Anything not listed — a neutral dot. New agents must render *something*
 *  rather than fall through to a broken image, but they should not silently
 *  borrow another agent's mark. */
function GenericMark({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden focusable="false">
      <circle cx="12" cy="12" r="6" fill="currentColor" />
    </svg>
  );
}

const MARKS: Record<string, (props: MarkProps) => React.ReactElement> = {
  muse: MuseMark,
  "chatgpt-dots": ChatGptMark,
  "grok-bot": GrokMark,
  manus: ManusMark,
};

/**
 * The mark for an agent slug. Slugs are the internal identifiers, which is why
 * `chatgpt-dots` and `grok-bot` read oddly here — they are legacy names kept for
 * compatibility, and the display names are what the UI shows.
 */
export function AgentMark({ slug, className = "size-5" }: { slug: string; className?: string }) {
  const Mark = MARKS[slug] ?? GenericMark;
  return <Mark className={className} />;
}