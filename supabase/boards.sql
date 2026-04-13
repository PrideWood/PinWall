create table if not exists public.boards (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'Main board',
  slug text not null unique,
  scene_json jsonb not null default '{
    "type": "excalidraw",
    "version": 2,
    "source": "pinwall",
    "elements": [],
    "appState": {},
    "files": {}
  }'::jsonb,
  is_public boolean not null default true,
  owner_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists boards_owner_id_idx on public.boards (owner_id);

alter table public.boards enable row level security;

grant select on table public.boards to anon, authenticated;
grant insert, update on table public.boards to authenticated;

drop policy if exists "Public can read public boards" on public.boards;
drop policy if exists "Anonymous MVP can create the main board" on public.boards;
drop policy if exists "Anonymous MVP can update the main board" on public.boards;
drop policy if exists "Authenticated owner can create boards" on public.boards;
drop policy if exists "Authenticated owner can update boards" on public.boards;

create policy "Public can read public boards"
on public.boards
for select
to anon, authenticated
using (is_public = true or owner_id = auth.uid());

create policy "Authenticated owner can create boards"
on public.boards
for insert
to authenticated
with check (owner_id = auth.uid());

create policy "Authenticated owner can update boards"
on public.boards
for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

-- Seed the main board after creating the owner Auth user:
-- insert into public.boards (slug, title, is_public, owner_id)
-- values ('main', 'Main board', true, 'YOUR_OWNER_AUTH_USER_ID')
-- on conflict (slug) do update set owner_id = excluded.owner_id;
