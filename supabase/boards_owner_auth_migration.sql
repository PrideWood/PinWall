alter table public.boards
add column if not exists owner_id uuid references auth.users(id) on delete restrict;

-- Replace this UUID with the Supabase Auth user id for the PinWall owner.
update public.boards
set owner_id = '00000000-0000-0000-0000-000000000000'
where owner_id is null;

alter table public.boards
alter column owner_id set not null;

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
