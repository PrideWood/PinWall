create extension if not exists pgcrypto;

-- If an existing imported notes table has the wrong columns, back it up first:
-- alter table public.notes rename to notes_legacy_backup;
-- Then run this file to create the canonical PinWall table.

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  title text,
  content text not null,
  tags text not null default '',
  x double precision not null,
  y double precision not null,
  z_index integer not null default 1,
  rotation double precision not null default 0,
  width double precision not null default 260,
  height double precision not null default 220,
  color text not null default '#fff2a8',
  is_public boolean not null default true,
  owner_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists notes_public_z_index_idx on public.notes (is_public, z_index);
create index if not exists notes_owner_id_idx on public.notes (owner_id);
create index if not exists notes_tags_idx on public.notes using gin (to_tsvector('simple', tags));

alter table public.notes enable row level security;

grant select on table public.notes to anon, authenticated;
grant insert, update, delete on table public.notes to authenticated;

drop policy if exists "Visitors can read public notes" on public.notes;
drop policy if exists "Authenticated owner can insert notes" on public.notes;
drop policy if exists "Authenticated owner can update notes" on public.notes;
drop policy if exists "Authenticated owner can delete notes" on public.notes;

create policy "Visitors can read public notes"
  on public.notes
  for select
  to anon, authenticated
  using (is_public = true or owner_id = auth.uid());

create policy "Authenticated owner can insert notes"
  on public.notes
  for insert
  to authenticated
  with check (owner_id = auth.uid());

create policy "Authenticated owner can update notes"
  on public.notes
  for update
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "Authenticated owner can delete notes"
  on public.notes
  for delete
  to authenticated
  using (owner_id = auth.uid());

create or replace function public.touch_note_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists notes_touch_updated_at on public.notes;

create trigger notes_touch_updated_at
before update on public.notes
for each row
execute function public.touch_note_updated_at();
