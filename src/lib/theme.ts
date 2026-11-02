import { useSyncExternalStore } from "react";

type Theme = "light" | "dark";
const key = "whiteboard-theme";
const listeners = new Set<() => void>();
function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem(key);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    /* Storage may be disabled in a private browser. */
  }
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
let theme = initialTheme();

export function applyTheme() {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", theme === "dark" ? "#121212" : "#ffffff");
  document
    .querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')
    ?.setAttribute(
      "content",
      theme === "dark" ? "black-translucent" : "default",
    );
}
function setTheme(next: Theme) {
  if (theme === next) return;
  theme = next;
  try {
    localStorage.setItem(key, theme);
  } catch {
    /* Keep in-memory preference. */
  }
  applyTheme();
  listeners.forEach((listener) => listener());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function useCanvasTheme() {
  return [useSyncExternalStore(subscribe, () => theme), setTheme] as const;
}
