import { collectGarbage } from "../server/app.js";
import { db } from "../server/db.js";
try {
  await collectGarbage();
  console.log("Image deletion queue processed (up to 100 files).");
} finally {
  await db().end();
}
