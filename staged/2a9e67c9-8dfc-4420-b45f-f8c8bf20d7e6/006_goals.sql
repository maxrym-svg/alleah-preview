-- Migration 006: goals — user-defined goals with ordered steps.
-- Dashboard progress and per-goal progress are both derived client-side from
-- goal_steps.completed; goals.status is kept in sync server-side by trigger so
-- "all steps done" always means the goal reads as completed, even from other clients.

create table goals (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) default auth.uid(),
  title       text not null,
  description text,
  status      text not null default 'active' check (status in ('active','completed','archived')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table goal_steps (
  id           uuid primary key default gen_random_uuid(),
  goal_id      uuid not null references goals(id) on delete cascade,
  user_id      uuid not null references auth.users(id) default auth.uid(),
  title        text not null,
  position     int not null default 0,
  completed    boolean not null default false,
  completed_at timestamptz,
  created_at   timestamptz not null default now()
);

create index goal_steps_goal_id_idx on goal_steps (goal_id, position);

-- ============================================================
-- updated_at maintenance (reuses set_updated_at() from migration 001)
-- ============================================================
create trigger goals_set_updated_at
  before update on goals
  for each row execute function set_updated_at();

-- ============================================================
-- keep goal_steps.completed_at honest, and roll goal.status up
-- automatically from step completion (archived goals are left alone)
-- ============================================================
create or replace function set_step_completed_at()
returns trigger language plpgsql as $$
begin
  if new.completed and not old.completed then
    new.completed_at = now();
  elsif not new.completed then
    new.completed_at = null;
  end if;
  return new;
end $$;

create trigger goal_steps_set_completed_at
  before update of completed on goal_steps
  for each row execute function set_step_completed_at();

create or replace function sync_goal_status()
returns trigger language plpgsql as $$
declare
  v_goal_id uuid := coalesce(new.goal_id, old.goal_id);
  v_total   int;
  v_done    int;
  v_status  text;
begin
  select status into v_status from goals where id = v_goal_id;
  if v_status is null or v_status = 'archived' then
    return coalesce(new, old);
  end if;

  select count(*), count(*) filter (where completed)
    into v_total, v_done
    from goal_steps where goal_id = v_goal_id;

  if v_total > 0 and v_done = v_total then
    update goals set status = 'completed' where id = v_goal_id and status <> 'completed';
  elsif v_status = 'completed' then
    update goals set status = 'active' where id = v_goal_id;
  end if;
  return coalesce(new, old);
end $$;

create trigger goal_steps_sync_goal_status
  after insert or update of completed or delete on goal_steps
  for each row execute function sync_goal_status();

-- ============================================================
-- Row Level Security — same explicit per-user pattern as every other table.
-- ============================================================
alter table goals enable row level security;
alter table goal_steps enable row level security;

create policy "goals_select_own" on goals
  for select using (auth.uid() = user_id);
create policy "goals_insert_own" on goals
  for insert with check (auth.uid() = user_id);
create policy "goals_update_own" on goals
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "goals_delete_own" on goals
  for delete using (auth.uid() = user_id);

create policy "goal_steps_select_own" on goal_steps
  for select using (auth.uid() = user_id);
create policy "goal_steps_insert_own" on goal_steps
  for insert with check (auth.uid() = user_id);
create policy "goal_steps_update_own" on goal_steps
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "goal_steps_delete_own" on goal_steps
  for delete using (auth.uid() = user_id);
