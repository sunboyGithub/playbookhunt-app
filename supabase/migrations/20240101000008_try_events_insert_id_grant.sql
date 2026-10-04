-- Grant INSERT on try_events.id so a client can mint the row's id.
--
-- Why this is needed: `try_events` grants SELECT to admins only, so the server
-- action cannot ask PostgREST to return the inserted row — that re-reads it
-- under the SELECT policy and fails with a 42501 that reads like "you may not
-- log a try" when the insert itself was fine. The action needs the new row's id
-- to tie the follow-up to the try that caused it, so it mints the id itself and
-- supplies it.
--
-- Granting INSERT on the id column is safe on its own terms: this table has no
-- UPDATE grant for anyone, so a caller choosing an id can only affect the row it
-- is creating, and the primary key still rejects a collision. It adds no way to
-- write a row the existing `WITH CHECK (true)` policy would not have allowed.
--
-- The column keeps its `gen_random_uuid()` default for any caller that does not
-- care what the id is.

grant insert (id) on public.try_events to anon, authenticated;