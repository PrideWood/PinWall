import test from "node:test";
import assert from "node:assert/strict";
import { SaveQueue } from "../src/lib/saveQueue.js";
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
test("edits during a save are serialized with the new acknowledged version", async () => {
  const first = deferred<number>();
  const calls: [string, number][] = [];
  const checkpoints: [string, number, boolean][] = [];
  const queue = new SaveQueue(
    "initial",
    7,
    async (snapshot, version) => {
      calls.push([snapshot, version]);
      return calls.length === 1 ? first.promise : version + 1;
    },
    () => {},
    (...args) => checkpoints.push(args),
  );
  queue.enqueue("A");
  const flushing = queue.flush();
  queue.enqueue("B");
  assert.equal(queue.status, "saving");
  first.resolve(8);
  assert.equal(await flushing, true);
  assert.deepEqual(calls, [
    ["A", 7],
    ["B", 8],
  ]);
  assert.equal(queue.version, 9);
  assert.equal(queue.status, "saved");
  assert.deepEqual(checkpoints.at(-1), ["B", 9, true]);
  queue.dispose();
});
test("a failed save retains the latest edit and retry uses the same version", async () => {
  let fail = true;
  const calls: [string, number][] = [];
  const queue = new SaveQueue(
    "initial",
    2,
    async (value, version) => {
      calls.push([value, version]);
      if (fail) throw new Error("offline");
      return 3;
    },
    () => {},
    () => {},
  );
  queue.enqueue("draft");
  assert.equal(await queue.flush(), false);
  assert.equal(queue.status, "failed");
  assert.equal(queue.latest, "draft");
  assert.equal(queue.version, 2);
  fail = false;
  assert.equal(await queue.flush(), true);
  assert.deepEqual(calls, [
    ["draft", 2],
    ["draft", 2],
  ]);
  queue.dispose();
});
test("a conflict blocks all further saves instead of overwriting cloud changes", async () => {
  let calls = 0;
  const queue = new SaveQueue(
    "initial",
    0,
    async () => {
      calls++;
      throw Object.assign(new Error("conflict"), { status: 409 });
    },
    () => {},
    () => {},
  );
  queue.enqueue("old-device");
  await queue.flush();
  queue.enqueue("another edit");
  assert.equal(await queue.flush(), false);
  assert.equal(queue.status, "conflict");
  assert.equal(calls, 1);
  assert.equal(queue.latest, "another edit");
  queue.dispose();
});
test("unmount prevents completion from recreating private drafts after logout", async () => {
  const response = deferred<number>();
  let checkpoints = 0;
  const queue = new SaveQueue(
    "initial",
    0,
    () => response.promise,
    () => {},
    () => {
      checkpoints++;
    },
  );
  queue.enqueue("private");
  const saving = queue.flush();
  queue.dispose();
  response.resolve(1);
  await saving;
  assert.equal(checkpoints, 1);
});
