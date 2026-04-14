# AGENTS.md

## Project: PinWall

PinWall is a lightweight owner-first workspace with two surfaces:

- **Wall**: a spatial sticky-note wall with structured notes
- **Board**: a freeform Excalidraw canvas with cloud persistence

Both live in the same app, but they are **separate surfaces** and **must not share one data model**.

---

## Core Principles

PinWall is **not**:
- a dashboard
- a CMS
- a kanban board
- a generic notes app
- a nested Excalidraw fork

PinWall **is**:
- a personal online workspace
- a minimal public/private publishing surface
- spatial, tactile, lightweight
- owner-editable, visitor-readable where allowed

---

## Surfaces

### Wall
Wall is a sticky-note wall.

Requirements:
- fixed-position notes
- overlap, stacking, slight rotation
- note modal for reading/editing
- search
- owner can create, edit, delete, move, rotate, reorder notes
- visitors can only view public notes

Wall must feel like:
> a real wall with pinned notes

Do not turn Wall into:
- a list
- a grid
- masonry
- a management dashboard

---

### Board
Board is an Excalidraw-based drawing surface.

Requirements:
- Excalidraw integrated as an npm dependency
- board scene persisted to Supabase
- images uploaded to Supabase Storage
- image metadata stored separately
- owner can edit
- visitors can view public boards if enabled

Do not clone the Excalidraw repo into this project.

---

## Roles

### Visitor
- can read public Wall notes
- can search notes
- can open note modal
- can read public boards if allowed
- cannot edit Wall or Board

### Owner
- authenticated via real Supabase Auth
- can edit Wall and Board
- can upload board images
- no fake local admin-key auth

---

## Data Model

### `notes`
Canonical fields:
- id
- owner_id
- title
- content
- tags
- x
- y
- z_index
- rotation
- width
- height
- color
- is_public
- created_at
- updated_at
- linked_board_id (optional)

### `boards`
Canonical fields:
- id
- owner_id
- title
- slug
- scene_json
- is_public
- created_at
- updated_at

### `board_images`
Canonical fields:
- id
- board_id
- owner_id
- storage_path
- public_url
- mime_type
- file_size
- excalidraw_file_id (if used)
- created_at

Do not mix note rows, board rows, and image metadata in one table.

---

## Persistence Rules

### Wall
- local drag should feel smooth
- final position must persist on drag end
- persist only needed DB fields
- use DB column names, not UI camelCase names

### Board
- scene autosaves with debounce
- image files must not live only in memory
- uploaded images must go to Supabase Storage
- metadata must be written to `board_images`
- board reload must restore actual image content, not placeholder boxes

---

## Auth and Security

- use real Supabase Auth
- owner rights come from authenticated session + RLS
- do not rely on fake frontend-only owner state
- use `owner_id = auth.uid()` style ownership rules
- public users may read only public rows
- do not expose server-only secrets
- public/publishable frontend keys are allowed

---

## UI Rules

### Shared
- minimal, tidy, lightweight
- floating controls preferred over heavy nav
- no bulky admin panel

### Wall
- sticky controls may appear on hover/focus
- note action clicks must not trigger note open
- note body click still opens note
- sticky note text uses handwritten-style font

### Board
- preserve Excalidraw usability
- keep overlays unobtrusive
- do not break bottom-left Excalidraw controls

---

## Architecture Constraints

Must:
- use Vite frontend
- use Supabase for auth + DB + storage
- keep Wall and Board separate
- keep implementation small and practical

Must not:
- clone Excalidraw repo
- create nested apps
- merge Board JSON into `notes`
- overengineer media management
- redesign the product into a dashboard

---

## Current Priorities

1. Stable Wall editing and persistence
2. Stable Board persistence
3. Stable Board image upload + restore flow
4. Clean owner auth flow
5. Deployment-ready Vercel setup
6. Small UI polish only

---

## Design Rule

Always preserve this distinction:

- **Wall = structured sticky-note wall**
- **Board = freeform sketch canvas**

Same workspace, different surfaces, different data.
If a change blurs them into one messy hybrid, reject or redesign it.