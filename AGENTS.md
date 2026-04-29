# AGENTS.md

## Project: PinWall

PinWall is a lightweight owner-first workspace with three layers:

- **Capture**: fast note capture, especially on mobile
- **Wall**: a spatial sticky-note wall with structured notes
- **Board**: a freeform Excalidraw canvas with cloud persistence

These layers belong to the same product, but they serve different purposes and must not be collapsed into one messy interface.

---

## Core Product Philosophy

PinWall is not:
- a dashboard
- a CMS
- a kanban board
- a generic notes app
- an infinite whiteboard
- a nested Excalidraw fork

PinWall is:
- a personal online workspace
- a capture → display → organize flow
- owner-editable, visitor-readable where allowed
- spatial, lightweight, and practical

---

## Product Layers

### 1. Capture
Capture is the fast-entry layer.

Purpose:
- record fleeting thoughts quickly
- reduce friction, especially on mobile
- send notes into the system without requiring full organization first

Requirements:
- quick entry point
- minimal input friction
- fast save
- new captured notes go to a predictable landing zone on the Wall

Capture should feel:
- immediate
- lightweight
- mobile-friendly

Capture is not:
- a full editor
- a complex AI workflow
- a management page

---

### 2. Wall
Wall is the visual sticky-note surface.

Requirements:
- fixed-position notes
- overlap, stacking, slight rotation
- note modal for viewing/editing
- search
- owner can create, edit, delete, move, rotate, reorder notes
- visitors can read public notes
- finite wall with bounded pan/zoom

Wall must feel like:
> a real wall with pinned notes

Wall must not become:
- a list
- a grid
- masonry
- a heavy admin interface

---

### 3. Board
Board is the Excalidraw-based sketch surface.

Requirements:
- Excalidraw integrated as an npm dependency
- scene persisted to Supabase
- images uploaded to Supabase Storage
- image metadata stored separately
- owner can edit
- visitors can view public boards if enabled

Do not clone the Excalidraw repo into this project.

---

## User Roles

### Visitor
- can read public Wall notes
- can search notes
- can open note details
- can read public boards if enabled
- cannot edit Wall or Board
- cannot use owner-only capture actions if restricted

### Owner
- authenticated via real Supabase Auth
- can use Capture
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
- note_source (optional: e.g. `capture`, `manual`)
- inbox_state (optional, future)

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

### Capture
- captured notes must persist immediately
- keep save flow simple
- do not require full note editing before save
- captured notes should land in a predictable Inbox/Quick Capture area on the Wall

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
- no bulky admin panel
- prefer low-friction interactions

### Capture
- must be fast to open
- must be comfortable on mobile
- should not require many decisions
- should not interrupt the rest of the app unnecessarily

### Wall
- sticky controls may appear on hover/focus
- note action clicks must not trigger note open
- note body click still opens note
- sticky note text uses handwritten-style font
- wall view should open centered

### Board
- preserve Excalidraw usability
- keep overlays unobtrusive
- do not break Excalidraw controls

---

## Architecture Constraints

Must:
- use Vite frontend
- use Supabase for auth + DB + storage
- keep Capture, Wall, and Board conceptually distinct
- keep implementation small and practical

Must not:
- clone Excalidraw repo
- create nested apps
- merge Board JSON into `notes`
- overengineer media management
- redesign the product into a dashboard

---

## Current Priorities

1. Fast Capture MVP
2. Stable Wall editing and persistence
3. Stable Board persistence
4. Stable Board image upload + restore flow
5. Clean owner auth flow
6. Deployment-ready Vercel setup
7. Small UI polish only

---

## Design Rule

Always preserve this distinction:

- **Capture = fast input**
- **Wall = structured sticky-note display**
- **Board = freeform sketch canvas**

Same workspace, different layers, different responsibilities.

If a change blurs these into one cluttered hybrid, reject or redesign it.