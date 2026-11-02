import test from "node:test";
import assert from "node:assert/strict";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { presentationFrames, presentationPage } from "../src/lib/framePresentation.js";

test("presentation uses live frames in position order without changing the scene", () => {
  const elements = [
    { id: "right", type: "frame", x: 600, y: -200, isDeleted: false },
    { id: "left-bottom", type: "frame", x: -100, y: 300, isDeleted: false },
    { id: "deleted", type: "frame", x: -300, y: 0, isDeleted: true },
    { id: "left-top", type: "frame", x: -100, y: -100, isDeleted: false },
    { id: "child", type: "rectangle", frameId: "left-top", x: -90, y: -90, isDeleted: false },
    { id: "magic", type: "magicframe", x: -500, y: 0, isDeleted: false },
  ] as unknown as readonly ExcalidrawElement[];
  const original = JSON.stringify(elements);
  elements.forEach(Object.freeze);
  Object.freeze(elements);
  assert.deepEqual(presentationFrames(elements).map((frame) => frame.id), ["left-top", "left-bottom", "right"]);
  assert.equal(JSON.stringify(elements), original);
});

test("a canvas without frames has no slides", () => {
  assert.deepEqual(presentationFrames([]), []);
  assert.deepEqual(presentationFrames([
    { type: "frame", isDeleted: true },
    { type: "rectangle", isDeleted: false },
  ] as ExcalidrawElement[]), []);
});

test("navigation stops at the first and last slide, including a single frame", () => {
  assert.equal(presentationPage(0, -1, 5), 0);
  assert.equal(presentationPage(0, 1, 5), 1);
  assert.equal(presentationPage(2, -1, 5), 1);
  assert.equal(presentationPage(4, 1, 5), 4);
  assert.equal(presentationPage(0, -1, 1), 0);
  assert.equal(presentationPage(0, 1, 1), 0);
});
