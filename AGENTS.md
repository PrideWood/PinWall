
## **Project: PinWall**

PinWall is now a lightweight owner-first workspace with two related surfaces:
1. **Wall** — a spatial sticky-note wall with structured notes
2. **Board** — a freeform drawing/sketch surface powered by Excalidraw
Both live inside the same app and share a unified entry experience, but they are **not the same product surface** and must not be forced into the same data model.
---

## **1. Core Product Philosophy**

PinWall is NOT:
- a traditional note-taking app
- a kanban board
- a CMS dashboard
- a document editor
- a whiteboard-only app
PinWall IS:
- a personal-first online workspace
- a unified entry to two complementary surfaces:
    - a structured sticky-note wall
    - a freeform sketch board
- owner-editable, visitor-readable where allowed
- spatial and tactile in feel
---

## **2. Product Surfaces**

### **2.1 Wall**

The Wall is a visual sticky-note wall.
It supports:
- fixed-position notes
- overlap and stacking
- slight rotation
- search
- expanded note reading/editing
- structured note data
The Wall must preserve the feeling of:
> “a real wall with notes pinned to it”
It must NOT degrade into:
- a list
- a masonry feed
- a dashboard
- a generic notes app
---

### **2.2 Board**

The Board is a freeform sketching/drawing surface powered by Excalidraw.
It supports:
- free drawing
- spatial composition
- Excalidraw scene editing
- later persistence of scene JSON
The Board must be integrated as a component dependency, not as a cloned nested project.
**Important constraint:**
- Do NOT clone the Excalidraw repository into this repo
- Use @excalidraw/excalidraw as an installed dependency
- Treat Board data separately from Wall notes
---

## **3. User Roles**

### **3.1 Visitor**

- Can view public Wall notes
- Can search public notes
- Can open expanded note view
- Can access public Board views if enabled
- Cannot edit Wall or Board content

### **3.2 Owner**

- Can create, edit, delete, move, rotate, and reorder Wall notes
- Can access and edit Board content
- Uses a lightweight owner login / owner mode
- Does not use a complex admin dashboard
All management should remain direct and lightweight.
---

## **4. Core UX Rule**

The app should feel like:
- a personal online workspace
- with two different but related surfaces
The app should NOT feel like:
- a backend admin panel
- a database UI
- a generic white-label productivity app
---

## **5. Navigation / Entry Structure**

The app now has a unified entry and multiple views.
Minimum structure:
- a simple entry/home/workspace view
- a **Wall** view
- a **Board** view
Navigation should stay lightweight and visually consistent.
Do not overbuild the navigation.
---

## **6. Wall Requirements**

### **6.1 Wall Canvas**

- Full-page or dominant wall surface
- Notes are absolutely positioned
- No list/grid/masonry layout allowed
- Notes must have:
    - x
    - y
    - z-index
    - rotation
- Overlap is allowed

### **6.2 Sticky Note Interaction**

Default:
- Click opens expanded note view
Owner mode:
- Drag to move
- Rotate
- Delete
- Edit only through expanded note modal

### **6.3 Expanded Note View**

- Modal / overlay
- Full note reading
- Basic Markdown rendering
- Owner editing lives here

### **6.4 Search**

Search matches:
- title
- content
- tags
Results should:
- highlight matching notes
- fade non-matching notes
- preserve wall feeling
---

## **7. Board Requirements**

### **7.1 Integration**

- Integrate Excalidraw via npm dependency
- Use Excalidraw as a React component inside this app
- Do not build a nested standalone Excalidraw app

### **7.2 Data Model Separation**

Board scene data must NOT be stored in the notes table.
Use a separate table for boards, e.g.:
- boards

### **7.3 Persistence Direction**

The Board should later be able to store:
- title
- slug
- scene JSON
- visibility/public status
- timestamps
But this persistence can be implemented after the basic Board view is working.
---

## **8. Data Model**

### **8.1 Notes table**

Canonical notes table fields:
- id
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
- linked_board_id (optional, future)

### **8.2 Boards table**

Canonical boards table fields:
- id
- title
- slug
- scene_json
- is_public
- created_at
- updated_at
Do not mix note rows and board rows in one table.
---

## **9. Architecture Constraints**

### **MUST**

- Keep using a frontend-first architecture
- Use BaaS such as Supabase
- Keep Wall and Board as separate surfaces
- Use separate data storage models for Wall and Board

### **MUST NOT**

- clone Excalidraw repo into this project
- create a nested app inside the repo
- merge Excalidraw scene JSON into notes
- create a heavy admin dashboard
---

## **10. UI / UX Guidelines**

### **Shared app feeling**

- coherent navigation
- coherent owner entry
- lightweight workspace feel

### **Wall feeling**

- tactile
- paper-like
- layered
- spatial

### **Board feeling**

- open
- flexible
- sketch-oriented
Do not force the Board to look like the Wall.
Do not force the Wall to behave like the Board.
---

## **11. Security / Access Rules**

- Visitor access should remain read-only where public
- Owner edit access should remain lightweight but protected
- No client-side secrets
- RLS and database policies should be respected once write access is connected
---

## **12. Development Priorities**

### **Current MVP Priority**

1. Stable Wall backed by Supabase
2. Lightweight owner workflow
3. Basic Board integration via Excalidraw package
4. Unified navigation between Wall and Board

### **Later**

- Board persistence to Supabase
- Link notes to boards
- Public/private board controls
---

## **13. Important Design Rule**

Always preserve this distinction:
- **Wall = structured note wall**
- **Board = freeform sketch surface**
They belong in the same workspace,
but they are not the same interface and not the same data model.
If a proposed change blurs them into one messy hybrid, reject or redesign it.