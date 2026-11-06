import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Minus, Plus, X } from "lucide-react";

type Props = {
  index: number;
  count: number;
  move: (delta: number) => void;
  zoom: (factor: number) => void;
  exit: () => void;
};

export function FramePresentation({ index, count, move, zoom, exit }: Props) {
  const [visible, setVisible] = useState(false);
  const controls = useRef<HTMLElement>(null);
  useEffect(() => {
    const previousFocus = document.activeElement;
    return () => {
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);

  useEffect(() => {
    if (!visible) return;
    controls.current?.focus({ preventScroll: true });
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !controls.current?.contains(event.target)) {
        setVisible(false);
      }
    };
    window.addEventListener("pointerdown", dismiss, true);
    return () => window.removeEventListener("pointerdown", dismiss, true);
  }, [visible]);

  return (
    <div className="presentation-overlay">
      {!visible ? (
        <button className="presentation-reveal" aria-label="显示演示控制栏" onClick={() => setVisible(true)} />
      ) : (
        <nav ref={controls} tabIndex={-1} className="presentation-controls" aria-label="画框演示">
          <button aria-label="上一页" title="上一页（←）" disabled={index === 0} onClick={() => move(-1)}><ChevronLeft size={18} /></button>
          <span role="status" aria-live="polite" aria-atomic="true">{index + 1}/{count}</span>
          <button aria-label="下一页" title="下一页（→）" disabled={index === count - 1} onClick={() => move(1)}><ChevronRight size={18} /></button>
          <button aria-label="缩小" title="缩小（−）" onClick={() => zoom(1 / 1.2)}><Minus size={18} /></button>
          <button aria-label="放大" title="放大（+）" onClick={() => zoom(1.2)}><Plus size={18} /></button>
          <button onClick={exit} aria-label="退出演示" title="退出演示（Esc）"><X size={18} /></button>
        </nav>
      )}
    </div>
  );
}
