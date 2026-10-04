/**
 * The signed-in reader's shape, and how to abbreviate their name.
 *
 * Split from `viewer.ts` because that module is `server-only` and a client
 * component may not import from one: the header's avatar menu renders on the
 * client and needs both the type and the initials, and reaching into the server
 * module for them throws in development and silently bundles a server import in
 * a production build. The same trap P7 hit with `toTryFields`.
 *
 * No directive on this file, deliberately, so both sides can use it.
 */

export type Viewer = {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: "user" | "admin";
};

/**
 * Two letters for the avatar.
 *
 * Falls through display name, then the local part of the address, then a
 * generic mark — because "JD" from `Jane Doe` and "J" from `jane@example.com`
 * are both better than an empty circle, and an empty circle reads as a failed
 * image rather than as a person.
 */
export function viewerInitials(viewer: Pick<Viewer, "displayName" | "email">): string {
  const source = viewer.displayName?.trim() || viewer.email.split("@")[0] || "";
  const words = source.split(/[\s._-]+/).filter(Boolean);

  if (words.length >= 2) {
    return `${words[0]![0]!}${words[1]![0]!}`.toUpperCase();
  }

  return (source[0] ?? "?").toUpperCase();
}