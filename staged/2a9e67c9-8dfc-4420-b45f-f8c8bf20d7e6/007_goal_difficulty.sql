-- Migration 007: goals.difficulty — lets the Goals map order easier goals first and
-- harder goals as you scroll down, matching the scavenger-hunt-trail layout in the UI.
-- 1 = warm-up, 2 = steady, 3 = challenging, 4 = expedition (hardest).

alter table goals
  add column difficulty smallint not null default 1 check (difficulty between 1 and 4);
