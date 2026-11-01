import { readFile, readdir } from "node:fs/promises";
import { getMigrations } from "better-auth/db/migration";
import { auth } from "../server/auth.js";
import { db } from "../server/db.js";
try {
  const migration = await getMigrations(auth().options);
  await migration.runMigrations();
  const directory = new URL("../migrations/", import.meta.url);
  for (const file of (await readdir(directory))
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    await db().query(await readFile(new URL(file, directory), "utf8"));
  }
  console.log("Auth and whiteboard schemas are ready.");
} finally {
  await db().end();
}
