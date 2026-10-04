-- Taxonomy seed.
--
-- A migration rather than a seed file so production gets the same rows. These
-- are lookups the whole UI depends on (every card shows a category icon, every
-- agent chip comes from the agents table), so they are not optional content.
--
-- Agent URLs are deliberately left null. AGENTS.md says to leave
-- launch_url_template null until prefill support is verified, and to copy the
-- prompt and open the home page instead. Only `muse` has a home_url, and that
-- is the one place Muse appears as an agent.

insert into public.categories (slug, name, emoji, description, sort) values
  ('personal-finance', 'Personal finance', '💰',
   'Bills, banking, insurance and getting a better rate.', 10),
  ('travel-booking', 'Travel booking', '✈️',
   'Flights, hotels and getting a trip booked for less.', 20),
  ('travel-planning', 'Travel planning', '🗺️',
   'Itineraries, packing and the logistics of a trip.', 30),
  ('shopping', 'Shopping', '🛍️',
   'Buying less, buying cheaper and returns.', 40),
  ('small-business', 'Small business', '🏢',
   'Running a small company: pricing, admin and getting clients.', 50),
  ('productivity', 'Productivity', '⚡',
   'Email, scheduling, notes and getting through the week.', 60),
  ('health', 'Health', '🏥',
   'Appointments, claims and admin around health.', 70),
  ('creativity', 'Creativity', '🎨',
   'Writing, images, music and making things.', 80)
on conflict (slug) do update
  set name = excluded.name,
      emoji = excluded.emoji,
      description = excluded.description,
      sort = excluded.sort;

-- muse: the only selectable agent in v1, and the preselected one.
insert into public.agents
  (slug, display_name, vendor, prompt_format, launch_url_template, home_url, capabilities, status, sort)
values
  ('muse', 'Muse', 'Muse', 'markdown', null, 'https://muse.ai',
   array['info', 'web_actions', 'phone_calls'], 'active', 10),
  -- The slugs are the legacy internal identifiers, retained for compatibility.
  -- Display names are what the UI shows.
  ('chatgpt-dots', 'ChatGPT', 'OpenAI', 'markdown', null, null, array['info'], 'coming_soon', 20),
  ('grok-bot', 'Grok', 'xAI', 'markdown', null, null, array['info'], 'coming_soon', 30),
  ('manus', 'Manus', 'Manus', 'markdown', null, null, array['info', 'web_actions'], 'coming_soon', 40),
  -- Hidden means not listed anywhere. Kept so a playbook authored against them
  -- does not break, and so phase 2 can reveal them without a migration.
  ('instinct', 'Instinct', 'Instinct', 'markdown', null, null, array['info'], 'hidden', 90),
  ('claude', 'Claude', 'Anthropic', 'markdown', null, null, array['info'], 'hidden', 91),
  ('gemini', 'Gemini', 'Google', 'markdown', null, null, array['info'], 'hidden', 92)
on conflict (slug) do update
  set display_name = excluded.display_name,
      vendor = excluded.vendor,
      prompt_format = excluded.prompt_format,
      capabilities = excluded.capabilities,
      status = excluded.status,
      sort = excluded.sort;

-- Guard the brief's rule from the data side: only an active agent may carry a
-- launch_url_template, so a half-verified integration cannot leak into v1.
create or replace function public.agents_require_active_for_launch_url()
returns trigger
language plpgsql
as $$
begin
  if new.launch_url_template is not null and new.status <> 'active' then
    raise exception
      'agent % has a launch_url_template but status %, which is not allowed in v1',
      new.slug, new.status
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger agents_require_active_for_launch_url
  before insert or update on public.agents
  for each row execute function public.agents_require_active_for_launch_url();