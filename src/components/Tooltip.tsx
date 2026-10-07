import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

export interface TooltipState {
  x: number;
  y: number;
  content: ReactNode;
}

/** Shared hover-tooltip state: call show() from pointer/focus handlers and render <Tooltip state={…} />. */
export function useTooltip() {
  const [state, setState] = useState<TooltipState | null>(null);
  const show = useCallback((x: number, y: number, content: ReactNode) => setState({ x, y, content }), []);
  const hide = useCallback(() => setState(null), []);
  return { state, show, hide };
}

/** Position for a tooltip anchored to an element (keyboard focus). */
export function anchorOf(el: Element): { x: number; y: number } {
  const rect = el.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top };
}

export function Tooltip({ state }: { state: TooltipState | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: 0, top: 0 });

  useLayoutEffect(() => {
    if (!state || !ref.current) return;
    const { width, height } = ref.current.getBoundingClientRect();
    const margin = 12;
    let left = state.x + 14;
    if (left + width > window.innerWidth - margin) left = state.x - width - 14;
    left = Math.max(margin, left);
    let top = state.y - height - 12;
    if (top < margin) top = state.y + 18;
    setPos({ left, top });
  }, [state]);

  if (!state) return null;
  return (
    <div ref={ref} className="tooltip" role="tooltip" style={pos}>
      {state.content}
    </div>
  );
}
