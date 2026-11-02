import test from "node:test";
import assert from "node:assert/strict";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { presentationFrames, presentationPage, presentationZoom } from "../src/lib/framePresentation.js";
import type { AppState } from "@excalidraw/excalidraw/types";

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

test("presentation zoom preserves the center above navigation without changing the input", () => {
  const state = { width: 1200, height: 864, scrollX: -100, scrollY: 50, zoom: { value: 1 } } as AppState;
  const before = JSON.stringify(state);
  const next = presentationZoom(state, 2);
  assert.equal(next.zoom.value, 2);
  assert.equal(state.width / 2 / state.zoom.value - state.scrollX, state.width / 2 / next.zoom.value - next.scrollX);
  assert.equal((state.height - 64) / 2 / state.zoom.value - state.scrollY, (state.height - 64) / 2 / next.zoom.value - next.scrollY);
  assert.equal(JSON.stringify(state), before);
  assert.deepEqual(presentationZoom({ ...state, ...next }, 0.5), {
    scrollX: state.scrollX, scrollY: state.scrollY, zoom: state.zoom,
  });
});

test("presentation zoom respects Excalidraw limits", () => {
  const state = { width: 1200, height: 864, scrollX: 0, scrollY: 0, zoom: { value: 1 } } as AppState;
  assert.equal(presentationZoom(state, 100).zoom.value, 30);
  assert.equal(presentationZoom(state, 0.001).zoom.value, 0.1);
});
