-- Da incollare una volta in Supabase → SQL Editor → Run.
create table if not exists public.state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.state enable row level security;
drop policy if exists "solo i miei dati" on public.state;
create policy "solo i miei dati" on public.state
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
