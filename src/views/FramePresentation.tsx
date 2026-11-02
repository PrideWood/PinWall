import { useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight, Minus, Plus, X } from "lucide-react";

type Props = {
  index: number;
  count: number;
  move: (delta: number) => void;
  zoom: (factor: number) => void;
  exit: () => void;
};

export function FramePresentation({ index, count, move, zoom, exit }: Props) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previousFocus = document.activeElement;
    close.current?.focus();
    return () => {
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);

  return (
    <div className="presentation-overlay">
      <nav className="presentation-controls" aria-label="画框演示">
        <button aria-label="上一页" title="上一页（←）" disabled={index === 0} onClick={() => move(-1)}><ChevronLeft size={18} /></button>
        <span role="status" aria-live="polite" aria-atomic="true">{index + 1}/{count}</span>
        <button aria-label="下一页" title="下一页（→）" disabled={index === count - 1} onClick={() => move(1)}><ChevronRight size={18} /></button>
        <button aria-label="缩小" title="缩小（−）" onClick={() => zoom(1 / 1.2)}><Minus size={18} /></button>
        <button aria-label="放大" title="放大（+）" onClick={() => zoom(1.2)}><Plus size={18} /></button>
        <button ref={close} onClick={exit} aria-label="退出演示" title="退出演示（Esc）"><X size={18} /></button>
      </nav>
    </div>
  );
}
