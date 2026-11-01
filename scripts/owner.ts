import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { createAuth } from "../server/auth.js";
import { ownerEmail } from "../server/config.js";
import { db } from "../server/db.js";
import { hashPassword } from "better-auth/crypto";
const terminal = createInterface({
  input: process.stdin,
  output: new Writable({
    write(_chunk, _encoding, done) {
      done();
    },
  }),
  terminal: Boolean(process.stdin.isTTY),
});
try {
  console.log(
    "Enter a unique password (6+ characters). Input is hidden; do not pass it as a command argument.",
  );
  // Readline normally echoes characters itself; a muted output hides them on all terminals.
  process.stdout.write("Password: ");
  const password = await terminal.question("");
  console.log();
  if (password.length < 6) throw new Error("Use at least 6 characters.");
  if (process.argv.includes("--reset")) {
    const hash = await hashPassword(password);
    const client = await db().connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        'UPDATE account SET password=$1 WHERE "providerId"=\'credential\' AND "userId" IN (SELECT id FROM "user" WHERE lower(email)=$2) RETURNING id',
        [hash, ownerEmail()],
      );
      if (!result.rowCount)
        throw new Error("Owner does not exist; run owner:create first.");
      await client.query(
        'DELETE FROM session WHERE "userId" IN (SELECT id FROM "user" WHERE lower(email)=$1)',
        [ownerEmail()],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    console.log("Password reset; existing sessions revoked.");
  } else {
    await createAuth(true).api.signUpEmail({
      body: { email: ownerEmail(), password, name: "Owner" },
    });
    console.log("Owner created. Public signup remains disabled.");
  }
} finally {
  terminal.close();
  await db().end();
}
