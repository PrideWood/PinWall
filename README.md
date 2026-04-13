# PinWall

PinWall is a spatial sticky-note wall. Notes live at fixed x/y positions on a wall canvas, can overlap, and keep their own rotation and stacking order. The MVP intentionally avoids dashboards, kanban columns, document editing surfaces, feeds, and dense management screens.

## Key AGENTS.md Constraints

- Preserve the feeling of a real wall with notes on it.
- Render notes on a fixed-position canvas, never as a list, grid, masonry layout, or board columns.
- Visitors can view, search, and open notes, but cannot edit.
- Admin mode happens in the same frontend wall experience.
- Content editing happens only in the expanded note modal.
- Notes must store position, rotation, z-index, dimensions, color, visibility, and timestamps.
- Markdown support is basic and sanitized; raw HTML and embeds are not part of the MVP.
- Production persistence uses a BaaS, with Supabase as the default target.
- Deploy the frontend to Vercel or Cloudflare Pages; do not add a self-hosted backend.

## MVP Architecture

- **Frontend:** Vite, React, TypeScript.
- **Persistence:** public note reads from a Supabase table named `notes`; Board scenes read/write a separate `boards` table.
- **Security:** Supabase Auth email/password controls owner mode. Notes and boards use RLS so visitors can read public rows, while authenticated owners can write only rows where `owner_id = auth.uid()`.
- **Rendering:** The Wall uses one fixed-size wall canvas with absolutely positioned notes. The Board uses Excalidraw as an npm package inside this app.
- **Markdown:** `react-markdown` with `rehype-sanitize` and `remark-gfm`.
- **Deployment:** Static Vite build from `npm run build`, deployable to Vercel with `dist` as the output directory.

## Folder Structure

```text
src/
  App.tsx                 # Lightweight Wall/Board navigation
  App.css                 # Shared layout, wall texture, note styling, board shell
  index.css               # Global reset and accessibility focus styles
  lib/
    boardsRepository.ts   # Supabase Board scene loading/saving
    notesRepository.ts    # Supabase note loading and owner-protected mutations
    supabase.ts           # Supabase client setup
  types/
    board.ts              # Board scene and row types
  types.ts                # Shared Wall note and interaction types
  views/
    BoardView.tsx         # Excalidraw Board surface
    WallView.tsx          # Wall, modal, search, admin interaction flow
supabase/
  boards.sql              # Board table and owner-based RLS policies
  boards_owner_auth_migration.sql
  notes.sql               # Table, indexes, and RLS starter schema
  notes_owner_auth_migration.sql
vercel.json               # SPA rewrite fallback for /wall and /board refreshes
```

## Note Data Model

Each note uses this shape:

```ts
type PinNote = {
  id: string
  title: string | null
  content: string
  tags: string[]
  x: number
  y: number
  z_index: number
  rotation: number
  width: number
  height: number
  color: string
  is_public: boolean
  owner_id: string
  created_at: string
  updated_at: string
}
```

## Admin Mode

The MVP keeps admin actions on the wall:

- unlock admin mode from the top control strip
- sign in with the owner Supabase Auth email/password
- create a note directly into the wall flow
- drag notes to move them
- rotate notes from small note controls
- bring notes forward by increasing `z_index`
- open a note and edit content only inside the modal
- delete only from the expanded modal

Wall owner/admin actions are written to Supabase and protected by `owner_id = auth.uid()` RLS. The UI stays lightweight: login opens a small modal, then editing continues directly on the wall.

## Interaction Flow

- **Wall browsing:** visitors pan the wall, click notes, and read the expanded modal.
- **Search:** the search box matches title, content, and tags. Matching notes stay bright while non-matches fade into the wall.
- **Expanded note modal:** visitors read sanitized Markdown. Admins can switch the modal into edit mode.
- **Admin editing:** admins create notes, save modal edits, drag notes, rotate notes, reorder notes, and delete notes without leaving the wall.

## Supabase Setup

1. Create a Supabase project.
2. Run `supabase/notes.sql` and `supabase/boards.sql` in the SQL editor. For existing tables, run `supabase/notes_owner_auth_migration.sql` and `supabase/boards_owner_auth_migration.sql` after replacing the placeholder owner UUID.
3. Add environment variables:

```text
VITE_SUPABASE_URL=your-project-url
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

4. Restart the Vite dev server after changing `.env`; Vite reads these values at startup/build time.
5. Make sure public Wall reads are allowed only for rows where `is_public = true`.
6. Make sure the `boards` table has a `main` row for the Board scene and that its `owner_id` is the owner Auth user id.
7. Do not add service-role keys or other server-only secrets to Vite environment variables.

Required public-read policy:

```sql
alter table public.notes enable row level security;

create policy "Visitors can read public notes"
  on public.notes
  for select
  to anon, authenticated
  using (is_public = true or owner_id = auth.uid());
```

Owner write policies:

```sql
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
```

Board read/write policies follow the same pattern:

```sql
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
```

If an imported `notes` table has the wrong shape, prefer backing it up and rebuilding the canonical table instead of patching column-by-column:

```sql
alter table public.notes rename to notes_legacy_backup;
```

Then run `supabase/notes.sql`.

## Vercel Deployment

PinWall is a Vite app. Use the Vercel Vite defaults unless you have a specific reason to override them.

- **Build command:** `npm run build`
- **Output directory:** `dist`
- **Install command:** `npm install`
- **Framework preset:** Vite

Set these Vercel environment variables:

```text
VITE_SUPABASE_URL=your-project-url
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

Do not add Supabase service-role keys to Vercel for this frontend app.

`vercel.json` rewrites all app paths to `index.html` so direct refreshes on `/wall` and `/board` load the Vite app before React chooses the surface.

## Local Development

```bash
npm install
npm run dev
```

The Wall expects Supabase env vars for note loading. The Board uses the same Supabase client for the `boards` table. Without env vars, the app shows visible error states instead of silently falling back to mock data.
