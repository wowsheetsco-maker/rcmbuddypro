import { useRef, useState, ReactNode, PointerEvent as ReactPointerEvent } from "react";
import { CheckCircle2, CalendarClock } from "lucide-react";

interface SwipeableCardProps {
  children: ReactNode;
  onSwipeRight?: () => void; // e.g. quick-log Reached SPOC
  onSwipeLeft?: () => void;  // e.g. open date picker
  disabled?: boolean;
  rightLabel?: string;
  leftLabel?: string;
}

const ACTION_THRESHOLD = 90; // px to trigger
const MAX_OFFSET = 140;

export default function SwipeableCard({
  children,
  onSwipeRight,
  onSwipeLeft,
  disabled,
  rightLabel = "Reached SPOC",
  leftLabel = "Set next date",
}: SwipeableCardProps) {
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  const lockedAxis = useRef<"x" | "y" | null>(null);
  const [offset, setOffset] = useState(0);
  const [animating, setAnimating] = useState(false);

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (disabled) return;
    startX.current = e.clientX;
    startY.current = e.clientY;
    lockedAxis.current = null;
    setAnimating(false);
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (disabled || startX.current === null || startY.current === null) return;
    const dx = e.clientX - startX.current;
    const dy = e.clientY - startY.current;
    if (lockedAxis.current === null) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      lockedAxis.current = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
    }
    if (lockedAxis.current === "y") return;
    e.preventDefault();
    const clamped = Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, dx));
    setOffset(clamped);
  }

  function reset() {
    setAnimating(true);
    setOffset(0);
    startX.current = null;
    startY.current = null;
    lockedAxis.current = null;
  }

  function onPointerUp() {
    if (disabled) return reset();
    if (offset >= ACTION_THRESHOLD && onSwipeRight) {
      setAnimating(true);
      setOffset(MAX_OFFSET);
      onSwipeRight();
      window.setTimeout(reset, 180);
      return;
    }
    if (offset <= -ACTION_THRESHOLD && onSwipeLeft) {
      setAnimating(true);
      setOffset(-MAX_OFFSET);
      onSwipeLeft();
      window.setTimeout(reset, 180);
      return;
    }
    reset();
  }

  const showRight = offset > 8;
  const showLeft = offset < -8;
  const intensity = Math.min(1, Math.abs(offset) / ACTION_THRESHOLD);

  return (
    <div className="relative overflow-hidden rounded-lg touch-pan-y select-none">
      {/* Right reveal (swipe right) */}
      {showRight && (
        <div
          className="absolute inset-y-0 left-0 flex items-center pl-4 bg-success text-success-foreground"
          style={{ width: Math.max(0, offset), opacity: intensity }}
        >
          <CheckCircle2 className="h-5 w-5 mr-2" />
          <span className="text-xs font-semibold whitespace-nowrap">{rightLabel}</span>
        </div>
      )}
      {/* Left reveal (swipe left) */}
      {showLeft && (
        <div
          className="absolute inset-y-0 right-0 flex items-center justify-end pr-4 bg-secondary text-secondary-foreground"
          style={{ width: Math.max(0, -offset), opacity: intensity }}
        >
          <span className="text-xs font-semibold whitespace-nowrap">{leftLabel}</span>
          <CalendarClock className="h-5 w-5 ml-2" />
        </div>
      )}

      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={reset}
        style={{
          transform: `translateX(${offset}px)`,
          transition: animating ? "transform 180ms ease-out" : "none",
          touchAction: "pan-y",
        }}
      >
        {children}
      </div>
    </div>
  );
}
