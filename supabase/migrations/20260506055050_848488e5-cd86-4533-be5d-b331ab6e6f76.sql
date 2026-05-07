
-- Threat reports (community intelligence)
create table public.threat_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  target text not null,
  threat_type text not null,
  category text not null default 'phishing',
  description text,
  severity text not null default 'medium',
  status text not null default 'pending',
  upvotes int not null default 0,
  downvotes int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.threat_reports enable row level security;
create policy "anyone authed reads reports" on public.threat_reports for select to authenticated using (true);
create policy "users insert own reports" on public.threat_reports for insert to authenticated with check (auth.uid() = user_id);
create policy "users update own reports" on public.threat_reports for update to authenticated using (auth.uid() = user_id);
create policy "users delete own reports" on public.threat_reports for delete to authenticated using (auth.uid() = user_id);
create index idx_threat_reports_created on public.threat_reports(created_at desc);
create index idx_threat_reports_target on public.threat_reports(target);

-- Votes
create table public.threat_report_votes (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.threat_reports(id) on delete cascade,
  user_id uuid not null,
  value smallint not null check (value in (-1, 1)),
  created_at timestamptz not null default now(),
  unique (report_id, user_id)
);
alter table public.threat_report_votes enable row level security;
create policy "authed read votes" on public.threat_report_votes for select to authenticated using (true);
create policy "users insert own vote" on public.threat_report_votes for insert to authenticated with check (auth.uid() = user_id);
create policy "users update own vote" on public.threat_report_votes for update to authenticated using (auth.uid() = user_id);
create policy "users delete own vote" on public.threat_report_votes for delete to authenticated using (auth.uid() = user_id);

-- Vote-aggregation trigger
create or replace function public.recompute_report_votes()
returns trigger language plpgsql security definer set search_path = public as $$
declare rid uuid;
begin
  rid := coalesce(new.report_id, old.report_id);
  update public.threat_reports tr set
    upvotes = (select count(*) from public.threat_report_votes where report_id = rid and value = 1),
    downvotes = (select count(*) from public.threat_report_votes where report_id = rid and value = -1)
  where tr.id = rid;
  return null;
end;$$;
create trigger trg_votes_aiud after insert or update or delete on public.threat_report_votes
for each row execute function public.recompute_report_votes();

-- Copilot conversations
create table public.copilot_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  title text not null default 'New conversation',
  mode text not null default 'beginner',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.copilot_conversations enable row level security;
create policy "own conv all" on public.copilot_conversations for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table public.copilot_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.copilot_conversations(id) on delete cascade,
  user_id uuid not null,
  role text not null,
  content text not null,
  created_at timestamptz not null default now()
);
alter table public.copilot_messages enable row level security;
create policy "own msg all" on public.copilot_messages for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index idx_copilot_msg_conv on public.copilot_messages(conversation_id, created_at);
