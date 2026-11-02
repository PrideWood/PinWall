import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import type { AppState, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { useCallback, useEffect, useRef, useState } from "react";
import { presentationFrames, presentationPage } from "./framePresentation";

type View = Pick<AppState, "scrollX" | "scrollY" | "zoom" | "viewModeEnabled">;

export function useFramePresentation(api: ExcalidrawImperativeAPI | null) {
  const [slides, setSlides] = useState<ReturnType<typeof presentationFrames>>([]);
  const [index, setIndex] = useState(0);
  const previous = useRef<View | null>(null);
  const active = slides.length > 0;

  const start = () => {
    if (!api || previous.current) return;
    const frames = presentationFrames(api.getSceneElements());
    if (!frames.length) {
      api.setToast({ message: "请先创建画框，再开始演示。", closable: true });
      return;
    }
    const { scrollX, scrollY, zoom, viewModeEnabled } = api.getAppState();
    previous.current = { scrollX, scrollY, zoom: { ...zoom }, viewModeEnabled };
    api.updateScene({ appState: { viewModeEnabled: true }, captureUpdate: CaptureUpdateAction.NEVER });
    setIndex(0);
    setSlides(frames);
  };

  const exit = useCallback(() => {
    if (api && previous.current) {
      api.updateScene({ appState: previous.current, captureUpdate: CaptureUpdateAction.NEVER });
      previous.current = null;
    }
    setSlides([]);
  }, [api]);

  const move = useCallback((delta: number) => {
    setIndex((page) => presentationPage(page, delta, slides.length));
  }, [slides.length]);

  useEffect(() => {
    if (!api || !active) return;
    const focus = () => api.scrollToContent(slides[index], {
      fitToViewport: true,
      viewportZoomFactor: 0.95,
      animate: false,
      // Reserve the bottom strip for navigation without covering the frame.
      canvasOffsets: { top: 0, left: 0, right: 0, bottom: 64 },
    });
    focus();
    let { width, height } = api.getAppState();
    return api.onChange((_elements, state) => {
      if (state.width === width && state.height === height) return;
      width = state.width;
      height = state.height;
      focus();
    });
  }, [api, active, slides, index]);

  useEffect(() => {
    if (!active) return;
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") exit();
      else if (event.key === "ArrowLeft") move(-1);
      else if (event.key === "ArrowRight") move(1);
      else if (event.key === "Tab" || ((event.key === "Enter" || event.key === " ") &&
        event.target instanceof Element && event.target.closest(".presentation-controls"))) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    window.addEventListener("keydown", keyboard, true);
    return () => window.removeEventListener("keydown", keyboard, true);
  }, [active, exit, move]);

  return { active, start, exit, move, index, count: slides.length };
}
