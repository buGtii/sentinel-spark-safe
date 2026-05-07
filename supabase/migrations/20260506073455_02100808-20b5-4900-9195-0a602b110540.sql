
create table if not exists public.vault_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  title text not null,
  ciphertext text not null,
  iv text not null,
  kind text not null default 'note',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.vault_items enable row level security;
create policy "vault own all" on public.vault_items for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.learning_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  lesson_id text not null,
  score int not null default 0,
  completed_at timestamptz not null default now(),
  unique(user_id, lesson_id)
);
alter table public.learning_progress enable row level security;
create policy "learn own all" on public.learning_progress for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.phishing_sim_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  scenario_id text not null,
  correct boolean not null,
  difficulty text not null default 'easy',
  created_at timestamptz not null default now()
);
alter table public.phishing_sim_results enable row level security;
create policy "sim own all" on public.phishing_sim_results for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.risk_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  delta int not null,
  reason text not null,
  created_at timestamptz not null default now()
);
alter table public.risk_events enable row level security;
create policy "risk own all" on public.risk_events for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
