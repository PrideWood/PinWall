import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir, userInfo } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createServer } from "node:net";
const directory = await mkdtemp(join(tmpdir(), "whiteboard-postgres-"));
function run(command: string, args: string[]) {
  const result = spawnSync(command, args, { stdio: "pipe", encoding: "utf8" });
  if (result.status !== 0)
    throw new Error(
      `${command} failed: ${result.stderr || result.error?.message}`,
    );
}
const listener = createServer();
await new Promise<void>((resolve) => listener.listen(0, "127.0.0.1", resolve));
const port = (listener.address() as { port: number }).port;
await new Promise<void>((resolve) => listener.close(() => resolve()));
let started = false;
try {
  run("initdb", [
    "-D",
    join(directory, "data"),
    "-A",
    "trust",
    "-U",
    userInfo().username,
    "--no-locale",
    "-E",
    "UTF8",
  ]);
  run("pg_ctl", [
    "-D",
    join(directory, "data"),
    "-l",
    join(directory, "postgres.log"),
    "-o",
    `-h 127.0.0.1 -p ${port} -k ${directory}`,
    "-w",
    "start",
  ]);
  started = true;
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "--test", "tests/integration.test.ts"],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        TEST_DATABASE_URL: `postgresql://${userInfo().username}@127.0.0.1:${port}/postgres`,
      },
    },
  );
  process.exitCode = result.status ?? 1;
} finally {
  if (started)
    run("pg_ctl", ["-D", join(directory, "data"), "-m", "fast", "-w", "stop"]);
  await rm(directory, { recursive: true, force: true });
}
