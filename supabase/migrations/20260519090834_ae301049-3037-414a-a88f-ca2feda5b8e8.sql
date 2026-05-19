-- devices
create table public.devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  device_uid text not null,
  name text not null default 'My device',
  platform text not null default 'android',
  push_token text,
  last_seen timestamptz not null default now(),
  stolen_mode boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, device_uid)
);
alter table public.devices enable row level security;
create policy "devices own all" on public.devices for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- device_pairings (QR codes)
create table public.device_pairings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  code text not null unique,
  initiator_device uuid not null references public.devices(id) on delete cascade,
  claimed_by_device uuid references public.devices(id) on delete cascade,
  claimed_at timestamptz,
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  created_at timestamptz not null default now()
);
alter table public.device_pairings enable row level security;
create policy "pairings own all" on public.device_pairings for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- device_links (confirmed pair)
create table public.device_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  device_a uuid not null references public.devices(id) on delete cascade,
  device_b uuid not null references public.devices(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (device_a, device_b)
);
alter table public.device_links enable row level security;
create policy "links own all" on public.device_links for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- locations
create table public.locations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  device_id uuid not null references public.devices(id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  accuracy double precision,
  captured_at timestamptz not null default now()
);
create index on public.locations (device_id, captured_at desc);
alter table public.locations enable row level security;
create policy "locations own all" on public.locations for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- intruder_events
create table public.intruder_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  device_id uuid not null references public.devices(id) on delete cascade,
  image_path text,
  failed_attempts int not null default 1,
  lat double precision,
  lng double precision,
  device_info jsonb not null default '{}'::jsonb,
  captured_at timestamptz not null default now()
);
create index on public.intruder_events (user_id, captured_at desc);
alter table public.intruder_events enable row level security;
create policy "intruder own all" on public.intruder_events for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- realtime
alter publication supabase_realtime add table public.locations;
alter publication supabase_realtime add table public.intruder_events;
alter publication supabase_realtime add table public.devices;

-- storage bucket
insert into storage.buckets (id, name, public) values ('intruder-selfies','intruder-selfies', false)
on conflict (id) do nothing;

create policy "intruder read own"
on storage.objects for select to authenticated
using (bucket_id = 'intruder-selfies' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "intruder write own"
on storage.objects for insert to authenticated
with check (bucket_id = 'intruder-selfies' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "intruder delete own"
on storage.objects for delete to authenticated
using (bucket_id = 'intruder-selfies' and auth.uid()::text = (storage.foldername(name))[1]);