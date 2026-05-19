create table if not exists public.app_state (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.app_state enable row level security;

drop policy if exists "matarina_read_state" on public.app_state;
drop policy if exists "matarina_insert_state" on public.app_state;
drop policy if exists "matarina_update_state" on public.app_state;

create policy "matarina_read_state"
on public.app_state
for select
to anon
using (id = 'matarina-burger');

create policy "matarina_insert_state"
on public.app_state
for insert
to anon
with check (id = 'matarina-burger');

create policy "matarina_update_state"
on public.app_state
for update
to anon
using (id = 'matarina-burger')
with check (id = 'matarina-burger');
