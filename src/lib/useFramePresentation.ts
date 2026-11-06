import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import type { AppState, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { useCallback, useEffect, useRef, useState } from "react";
import { presentationFrames, presentationPage, presentationZoom } from "./framePresentation";

type View = Pick<AppState, "scrollX" | "scrollY" | "zoom" | "viewModeEnabled" | "frameRendering">;

export function useFramePresentation(api: ExcalidrawImperativeAPI | null) {
  const [slides, setSlides] = useState<ReturnType<typeof presentationFrames>>([]);
  const [index, setIndex] = useState(0);
  const previous = useRef<View | null>(null);
  const fullscreenRequest = useRef<{ entered: boolean } | null>(null);
  const active = slides.length > 0;

  const leaveFullscreen = useCallback(() => {
    const request = fullscreenRequest.current;
    fullscreenRequest.current = null;
    if (request?.entered && document.fullscreenElement === document.documentElement) {
      void document.exitFullscreen().catch(() => {});
    }
  }, []);

  useEffect(() => leaveFullscreen, [leaveFullscreen]);

  const start = () => {
    if (!api || previous.current) return;
    const frames = presentationFrames(api.getSceneElements());
    if (!frames.length) {
      api.setToast({ message: "请先创建画框，再开始演示。", closable: true });
      return;
    }
    const { scrollX, scrollY, zoom, viewModeEnabled, frameRendering } = api.getAppState();
    previous.current = { scrollX, scrollY, zoom: { ...zoom }, viewModeEnabled, frameRendering: { ...frameRendering } };
    api.updateScene({
      appState: { viewModeEnabled: true, frameRendering: { ...frameRendering, outline: false, name: false } },
      captureUpdate: CaptureUpdateAction.NEVER,
    });
    setIndex(0);
    setSlides(frames);
    const root = document.documentElement;
    // Request directly from the click so the browser can use its user activation.
    if (!document.fullscreenElement && root.requestFullscreen) {
      const request = { entered: false };
      fullscreenRequest.current = request;
      void root.requestFullscreen().then(() => {
        if (fullscreenRequest.current === request) request.entered = true;
        else if (!fullscreenRequest.current && document.fullscreenElement === root) {
          return document.exitFullscreen();
        }
      }).catch(() => {
        if (fullscreenRequest.current === request) fullscreenRequest.current = null;
      });
    }
  };

  const exit = useCallback(() => {
    const view = previous.current;
    previous.current = null;
    if (api && view) {
      api.updateScene({ appState: view, captureUpdate: CaptureUpdateAction.NEVER });
    }
    setSlides([]);
    leaveFullscreen();
  }, [api, leaveFullscreen]);

  const move = useCallback((delta: number) => {
    setIndex((page) => presentationPage(page, delta, slides.length));
  }, [slides.length]);

  const zoom = useCallback((factor: number) => {
    if (!api || !previous.current) return;
    api.updateScene({
      appState: presentationZoom(api.getAppState(), factor),
      captureUpdate: CaptureUpdateAction.NEVER,
    });
  }, [api]);

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
      if (!previous.current) return;
      if (state.width === width && state.height === height) return;
      width = state.width;
      height = state.height;
      focus();
    });
  }, [api, active, slides, index]);

  useEffect(() => {
    if (!active) return;
    const fullscreenChanged = () => {
      const request = fullscreenRequest.current;
      if (!request) return;
      if (document.fullscreenElement === document.documentElement) request.entered = true;
      else if (request.entered) exit();
    };
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") exit();
      else if (["ArrowLeft", "ArrowUp", "PageUp"].includes(event.key)) move(-1);
      else if (["ArrowRight", "ArrowDown", "PageDown"].includes(event.key)) move(1);
      else if (event.key === "+" || event.key === "=") zoom(1.2);
      else if (event.key === "-") zoom(1 / 1.2);
      else if (event.key === "Tab" || ((event.key === "Enter" || event.key === " ") &&
        event.target instanceof Element && event.target.closest(".presentation-overlay"))) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    window.addEventListener("keydown", keyboard, true);
    document.addEventListener("fullscreenchange", fullscreenChanged);
    return () => {
      window.removeEventListener("keydown", keyboard, true);
      document.removeEventListener("fullscreenchange", fullscreenChanged);
    };
  }, [active, exit, move, zoom]);

  return { active, start, exit, move, zoom, index, count: slides.length };
}
