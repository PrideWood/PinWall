import test from "node:test";
import assert from "node:assert/strict";
import {
  imageMime,
  maxImageBytes,
  referencedImages,
  saveSchema,
  titleSchema,
} from "../server/validation.js";
import { handleRequest } from "../server/app.js";
test("images are recognized by bytes, not caller-provided MIME types", () => {
  assert.equal(imageMime(Buffer.from('<svg onload="alert(1)"></svg>')), null);
  assert.equal(
    imageMime(Buffer.from("\x89PNG\r\n\x1a\n0000", "binary")),
    "image/png",
  );
  assert.equal(imageMime(Buffer.alloc(maxImageBytes + 1)), null);
  assert.equal(
    imageMime(Buffer.from("not an image, but declared image/png")),
    null,
  );
});
test("save validation requires a version and image reference checks ignore deleted images", () => {
  assert.equal(
    saveSchema.safeParse({ scene: { elements: [], appState: {} } }).success,
    false,
  );
  assert.equal(titleSchema.safeParse({ title: "  " }).success, false);
  assert.deepEqual(
    referencedImages([
      { type: "image", fileId: "A" },
      { type: "image", fileId: "A" },
      { type: "image", fileId: "B", isDeleted: true },
    ]),
    ["A"],
  );
});
test("cross-origin mutations are rejected before authentication or database access", async () => {
  process.env.APP_URL = "https://whiteboard.example.com";
  const response = await handleRequest(
    new Request("https://whiteboard.example.com/api/boards", {
      method: "POST",
      headers: { Origin: "https://attacker.example.com" },
      body: "{}",
    }),
  );
  assert.equal(response.status, 403);
});
