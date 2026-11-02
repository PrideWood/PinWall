import type { ExcalidrawElement, ExcalidrawFrameElement } from "@excalidraw/excalidraw/element/types";

// Column-first reading order: left to right, then top to bottom at the same x.
export function presentationFrames(elements: readonly ExcalidrawElement[]): ExcalidrawFrameElement[] {
  return elements
    .filter((element): element is ExcalidrawFrameElement => element.type === "frame" && !element.isDeleted)
    .sort((a, b) => a.x - b.x || a.y - b.y);
}

export function presentationPage(index: number, delta: number, count: number) {
  return Math.max(0, Math.min(count - 1, index + delta));
}
