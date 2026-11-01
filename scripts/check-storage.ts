import { randomUUID } from "node:crypto";
import { putImage, readImage, deleteImages } from "../server/storage.js";
const key = `_setup-checks/${randomUUID()}.png`;
const bytes = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1sAAAAASUVORK5CYII=",
  "base64",
);
let uploaded = false;
try {
  await putImage(key, bytes, "image/png");
  uploaded = true;
  const restored = await readImage(key);
  if (!bytes.equals(Buffer.from(restored)))
    throw new Error("Image bytes did not match");
  console.log("Private image upload and byte-for-byte restore verified.");
} finally {
  if (uploaded) {
    await deleteImages([key]);
    console.log("Temporary test image removed.");
  }
}
