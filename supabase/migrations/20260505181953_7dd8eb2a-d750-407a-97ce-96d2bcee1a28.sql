create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text, display_name text,
  created_at timestamptz default now()
);
alter table public.profiles enable row level security;
create policy "own profile select" on public.profiles for select using (auth.uid() = id);
create policy "own profile update" on public.profiles for update using (auth.uid() = id);
create policy "own profile insert" on public.profiles for insert with check (auth.uid() = id);

create type public.app_role as enum ('admin','user');
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null,
  unique(user_id, role)
);
alter table public.user_roles enable row level security;
create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.user_roles where user_id=_user_id and role=_role)
$$;
create policy "own roles read" on public.user_roles for select using (auth.uid() = user_id);

create table public.scans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  scan_type text not null check (scan_type in ('url','ip','file','message')),
  target text not null,
  verdict text not null check (verdict in ('safe','suspicious','malicious','unknown')),
  risk_score int not null default 0,
  details jsonb default '{}'::jsonb,
  blockchain_tx text,
  created_at timestamptz default now()
);
alter table public.scans enable row level security;
create policy "own scans select" on public.scans for select using (auth.uid() = user_id);
create policy "own scans insert" on public.scans for insert with check (auth.uid() = user_id);
create policy "own scans delete" on public.scans for delete using (auth.uid() = user_id);
create index on public.scans(user_id, created_at desc);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email,'@',1)));
  insert into public.user_roles (user_id, role) values (new.id, 'user');
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();