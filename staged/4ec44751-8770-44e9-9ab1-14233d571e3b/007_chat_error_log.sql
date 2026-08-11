-- Migration 007 — chat_error_log
-- Backs the "specific, actionable error states for chat failures" feature.
-- Every classified chat failure (network drop, rate limit, context-window
-- exceeded, model timeout, or unknown) gets one row here - client-detected
-- failures (the fetch never got a response at all) are inserted directly by
-- the client; failures the ask Edge Function itself hits (auth, retrieval,
-- the Claude call) are inserted server-side in its catch blocks. Purely a
-- frequency log to inform future prioritization (surfaced as a small summary
-- card in the Upgrades tab) - never read back into chat context, never
-- shown to the model.

create table chat_error_log (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) default auth.uid(),
  error_type text not null check (error_type in ('network', 'rate_limit', 'context_window', 'model_timeout', 'unknown')),
  detail     text,                -- short, truncated raw reason; never shown to Max verbatim
  created_at timestamptz not null default now()
);

create index chat_error_log_user_created_idx on chat_error_log (user_id, created_at desc);

alter table chat_error_log enable row level security;

create policy "chat_error_log_select_own" on chat_error_log
  for select using (auth.uid() = user_id);
create policy "chat_error_log_insert_own" on chat_error_log
  for insert with check (auth.uid() = user_id);
-- No update/delete policies: append-only log by design.
