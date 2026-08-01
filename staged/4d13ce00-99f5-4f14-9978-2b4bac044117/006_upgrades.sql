-- Migration 006: Upgrades tab - self-serve optimization proposals + research directive queue.
-- optimization_proposals rows are produced by internal/worker processes (analysis of usage,
-- bugs, etc.) and reviewed by the user in the Upgrades tab. research_directives lets the user
-- queue a research question for the same worker pipeline to look into later.

create table optimization_proposals (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) default auth.uid(),
  benefit_type        text not null check (benefit_type in
                        ('ui_improvement','efficiency_upgrade','feature_update','new_feature','bug_fix')),
  title               text not null,
  summary             text not null,
  functionality_score int not null check (functionality_score between 1 and 10),
  cost_score          int not null check (cost_score between 1 and 10),
  -- Computed once at write time from the two scores above; simple and stable to sort by.
  priority            int generated always as (functionality_score - cost_score) stored,
  status              text not null default 'proposed'
                        check (status in ('proposed','approved','building','done','rejected')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table research_directives (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) default auth.uid(),
  directive_text text not null,
  priority       int not null check (priority between 1 and 5),
  created_at     timestamptz not null default now()
);

create index optimization_proposals_priority_idx on optimization_proposals (priority desc);

create trigger optimization_proposals_set_updated_at
  before update on optimization_proposals
  for each row execute function set_updated_at();

alter table optimization_proposals enable row level security;
alter table research_directives enable row level security;

create policy "optimization_proposals_select_own" on optimization_proposals
  for select using (auth.uid() = user_id);
create policy "optimization_proposals_insert_own" on optimization_proposals
  for insert with check (auth.uid() = user_id);
create policy "optimization_proposals_update_own" on optimization_proposals
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "optimization_proposals_delete_own" on optimization_proposals
  for delete using (auth.uid() = user_id);

create policy "research_directives_select_own" on research_directives
  for select using (auth.uid() = user_id);
create policy "research_directives_insert_own" on research_directives
  for insert with check (auth.uid() = user_id);
create policy "research_directives_update_own" on research_directives
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "research_directives_delete_own" on research_directives
  for delete using (auth.uid() = user_id);
