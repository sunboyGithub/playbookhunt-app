-- Make `user_id` on a try event mean "the reader who did this", enforced.
--
-- Why: the previous policy was `WITH CHECK (true)`, which is correct for the
-- parts of the row nobody should control (playbook, device, action) but wrong
-- for `user_id`. Because the column is writable by anon and authenticated, any
-- caller could attribute a try event to any account — including attributing one
-- to a stranger while signed out entirely. That is not a cosmetic problem:
-- P8's "Tried" tab reads `try_events` by `user_id`, so a forged row puts a
-- stranger's activity in someone else's list, and the follow-up that P7
-- schedules off the event would then be sent to that stranger.
--
-- The rule: a signed-in caller's row may carry only their own id, and an
-- anonymous caller's row must carry none. `auth.uid()` is the only source of
-- truth for who is calling — it comes from the verified JWT, not the body — so
-- a caller that sends anything else is either corrected to their own id (when
-- signed in) or rejected (when signed out).
--
-- `security definer` is not used and is not needed: `auth.uid()` reads the
-- request's JWT claims, which any role can call.
--
-- No trigger is added alongside this. A trigger would also fire for the service
-- role, which legitimately writes rows for other users (admin tooling, and the
-- fixture seeder), so it would break exactly the paths that are allowed to do
-- this and buy nothing: RLS is the enforcement point, and it is already the only
-- thing standing between an anonymous request and this table.

drop policy if exists "Anyone may log a try event" on public.try_events;

create policy "Anyone may log a try event" on public.try_events
  for insert to anon, authenticated
  with check (
    -- Anonymous: no user may be claimed, and no user is implied.
    (auth.uid() is null and user_id is null)
    or
    -- Signed in: the row must belong to the caller.
    (auth.uid() is not null and user_id = auth.uid())
  );