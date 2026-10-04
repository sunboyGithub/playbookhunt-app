"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

/**
 * Sign out.
 *
 * A server action rather than a client-side `signOut()`: the session cookie has
 * to go, and only the server can clear it. Calling the browser client here would
 * leave the cookie in place until the next request happened to overwrite it,
 * which on a shared computer means the next person is still signed in.
 *
 * Redirecting home afterwards is not decoration. The reader is on a page whose
 * server render was for *them* — `/me`, a report, a starred card — and leaving
 * them there would show one account's page to the next person who opens the
 * laptop. A client-side sign-out without a navigation does exactly that.
 */
export async function signOut(): Promise<never> {
  const supabase = await createClient();
  await supabase.auth.signOut();

  revalidatePath("/", "layout");
  redirect("/");
}