# Personal Whiteboard

This repository replaces PinWall with a single-owner cloud whiteboard with public read-only access.
The user's new requirements supersede the former Capture/Wall/Supabase design.

- React + TypeScript + Vite; Excalidraw as an npm dependency. No nested apps or Excalidraw fork.
- Neon Postgres stores accounts, sessions, boards, and image metadata in separate tables.
- Better Auth provides real server-verified authentication. Public signup is disabled.
- Private S3-compatible object storage stores images; the current deployment uses Neon Object Storage (private whiteboard-images bucket); R2 is an alternative.
- Visitors can list and read the owner’s saved boards and their referenced images; all mutations verify the real owner session and ownership. Never ship secrets in VITE_* variables.
- Owner UI uses phone QR approval, with no email or password entry. A one-time CLI pairing link binds a trusted phone for up to 180 days; desktop edit sessions last up to 12 hours. Public signup stays disabled.
- Approval requests expire after three minutes, are browser-bound and single-use. Require explicit phone approval and matching displayed code; never expose pairing secrets in API responses or logs.
- Keep the whiteboard UI small: board list and native Excalidraw canvas.
- Autosave with debounce, accurate status, retry, local recovery drafts and optimistic concurrency.
- Restore real image bytes across devices. Export portable .excalidraw files with embedded images.
- Logout on shared computers clears private local drafts and canvas state.
- Do not claim cloud or cross-device validation without real configured services.
- Preserve .legacy/pinwall-before-rebuild.tar.gz and the original working-tree patch (ignored).
- Run npm run check, npm test and npm run build for substantive changes.
