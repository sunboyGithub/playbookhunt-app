-- One open follow-up per user per playbook.
--
-- P7 creates a follow-up row when a signed-in reader opens the try flow, so the
-- "did it work?" email has something to send. Reopening the sheet, switching
-- agents, or coming back tomorrow must not stack a second row on top of the
-- first: the reader would then get two emails for one try, which is the fastest
-- way to make someone turn reminders off.
--
-- Partial, and that is the point. Once a follow-up is `sent_at` or
-- `completed_at` it is closed, and a later try of the same playbook is allowed
-- to schedule a fresh one. A unique index on (user_id, playbook_id) alone would
-- forbid that forever, so a reader could only ever be reminded about a playbook
-- once in the life of their account.
create unique index followups_one_open_per_user_playbook
  on public.followups (user_id, playbook_id)
  where completed_at is null and sent_at is null;