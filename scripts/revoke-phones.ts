import { db } from "../server/db.js";
import { ownerEmail } from "../server/config.js";
const client = await db().connect();
try {
  await client.query("BEGIN");
  const { rows } = await client.query(
    'SELECT id FROM "user" WHERE lower(email)=$1',
    [ownerEmail()],
  );
  if (rows[0]) {
    await client.query(
      "UPDATE trusted_phones SET revoked_at=now() WHERE owner_id=$1",
      [rows[0].id],
    );
    await client.query("DELETE FROM phone_pairings WHERE owner_id=$1", [
      rows[0].id,
    ]);
    await client.query("DELETE FROM edit_requests");
    await client.query('DELETE FROM session WHERE "userId"=$1', [rows[0].id]);
  }
  await client.query("COMMIT");
  console.log("手机绑定及所有编辑会话已撤销。请重新运行 phone:pair。");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await db().end();
}
