import { useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

type Props = {
  index: number;
  count: number;
  move: (delta: number) => void;
  exit: () => void;
};

export function FramePresentation({ index, count, move, exit }: Props) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previousFocus = document.activeElement;
    close.current?.focus();
    return () => {
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);

  return (
    <div className="presentation-overlay" onWheel={(event) => event.preventDefault()}>
      <nav className="presentation-controls" aria-label="画框演示">
        <button aria-label="上一页" title="上一页（←）" disabled={index === 0} onClick={() => move(-1)}><ChevronLeft size={18} /></button>
        <span role="status" aria-live="polite" aria-atomic="true">{index + 1}/{count}</span>
        <button aria-label="下一页" title="下一页（→）" disabled={index === count - 1} onClick={() => move(1)}><ChevronRight size={18} /></button>
        <button ref={close} onClick={exit} title="退出演示（Esc）"><X size={16} />退出</button>
      </nav>
    </div>
  );
}
