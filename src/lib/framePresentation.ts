import type { ExcalidrawElement, ExcalidrawFrameElement } from "@excalidraw/excalidraw/element/types";
import type { AppState } from "@excalidraw/excalidraw/types";

// Column-first reading order: left to right, then top to bottom at the same x.
export function presentationFrames(elements: readonly ExcalidrawElement[]): ExcalidrawFrameElement[] {
  return elements
    .filter((element): element is ExcalidrawFrameElement => element.type === "frame" && !element.isDeleted)
    .sort((a, b) => a.x - b.x || a.y - b.y);
}

export function presentationPage(index: number, delta: number, count: number) {
  return Math.max(0, Math.min(count - 1, index + delta));
}

export function presentationZoom(
  state: Pick<AppState, "width" | "height" | "zoom" | "scrollX" | "scrollY">,
  factor: number,
) {
  // Match Excalidraw's zoom limits and keep the slide area's center fixed.
  const value = Math.max(0.1, Math.min(30, state.zoom.value * factor)) as AppState["zoom"]["value"];
  const shift = 1 / value - 1 / state.zoom.value;
  return {
    zoom: { value },
    scrollX: state.scrollX + state.width / 2 * shift,
    scrollY: state.scrollY + Math.max(0, state.height - 64) / 2 * shift,
  };
}
