CREATE TABLE IF NOT EXISTS phone_pairings (
  token_hash text PRIMARY KEY,
  owner_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);
CREATE TABLE IF NOT EXISTS trusted_phones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS edit_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_hash text NOT NULL UNIQUE,
  secret_hash text NOT NULL,
  browser_hash text NOT NULL,
  check_code text NOT NULL,
  device_label text NOT NULL,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','approved','denied','consumed')),
  owner_id text REFERENCES "user"(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  next_poll_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS auth_throttles (
  bucket text PRIMARY KEY,
  count integer NOT NULL,
  resets_at timestamptz NOT NULL
);
