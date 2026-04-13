alter table public.notes
add column if not exists owner_id uuid references auth.users(id) on delete restrict;

-- Replace this UUID with the Supabase Auth user id for the PinWall owner.
update public.notes
set owner_id = '00000000-0000-0000-0000-000000000000'
where owner_id is null;

alter table public.notes
alter column owner_id set not null;

create index if not exists notes_owner_id_idx on public.notes (owner_id);

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
