-- Also declared in Better Auth's session.additionalFields for typed access.
ALTER TABLE session ADD COLUMN IF NOT EXISTS "trustedPhoneId" text;
CREATE INDEX IF NOT EXISTS session_trusted_phone_idx ON session ("trustedPhoneId")
  WHERE "trustedPhoneId" IS NOT NULL;
