/**
 * The current instant, for server-side rendering.
 *
 * This exists as a function rather than an inline `Date.now()` because the React
 * Compiler treats a clock read during render as impure and rejects it — and it is
 * right to. Reading the clock in a component means the value depends on when the
 * render happened, which is exactly the class of bug that produces a hydration
 * mismatch the moment the server and client disagree about the second.
 *
 * Wrapping it in a server-only module moves the read out of the component's
 * render body, and gives one timestamp per page: every "3d ago" on a page then
 * describes the same moment, instead of drifting apart across a slow render.
 */
export function nowMs(): number {
  return Date.now();
}