CREATE TABLE IF NOT EXISTS boards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
  scene_json jsonb NOT NULL DEFAULT '{"elements":[],"appState":{"viewBackgroundColor":"#ffffff"}}',
  version integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS boards_owner_updated ON boards(owner_id, updated_at DESC);
CREATE TABLE IF NOT EXISTS board_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id uuid NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  owner_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  file_id text NOT NULL,
  storage_key text NOT NULL UNIQUE,
  mime_type text NOT NULL,
  file_size integer NOT NULL CHECK (file_size > 0 AND file_size <= 3145728),
  content_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(board_id, file_id)
);
CREATE TABLE IF NOT EXISTS storage_garbage (
  storage_key text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- No browser-facing database credentials. API queries always constrain owner_id.
-- Tables are accessed only by the trusted server database role.
