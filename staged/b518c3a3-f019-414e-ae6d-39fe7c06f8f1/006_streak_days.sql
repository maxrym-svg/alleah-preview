-- Migration 006: daily streak tracking for the home header chip.
-- One row per user per calendar day they were active in the app (chat, capture, or
-- just opening the home view counts). Deliberately dumb/append-style like the other
-- activity logs (queries, screen_log) - the streak math itself stays client-side,
-- same convention as fmtAge()/the task meters in index.html.
--
-- Note: the chip's flame colour/label scale by streak length (see STREAK_TIERS in
-- index.html) - that's presentational only and needs no schema support here.

create table activity_days (
  user_id     uuid not null references auth.users(id) default auth.uid(),
  day         date not null default (now() at time zone 'utc')::date,
  created_at  timestamptz not null default now(),
  primary key (user_id, day)
);

alter table activity_days enable row level security;

create policy "activity_days_select_own" on activity_days
  for select using (auth.uid() = user_id);
create policy "activity_days_insert_own" on activity_days
  for insert with check (auth.uid() = user_id);
create policy "activity_days_update_own" on activity_days
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "activity_days_delete_own" on activity_days
  for delete using (auth.uid() = user_id);

-- Idempotent mark-active helper the client calls once per session on load.
-- security invoker (default) - RLS still applies, user_id defaults to auth.uid().
create or replace function mark_active_today()
returns void
language sql as $$
  insert into activity_days (user_id, day)
  values (auth.uid(), (now() at time zone 'utc')::date)
  on conflict (user_id, day) do nothing;
$$;

revoke all on function mark_active_today() from public;
grant execute on function mark_active_today() to authenticated;
