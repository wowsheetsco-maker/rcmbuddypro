import { useEffect, useState } from "react";

/**
 * Lightweight global counter so chrome (e.g. mobile bottom dock) can hide or
 * dim itself while overlays such as ClaimDrawer / Sheets / Dialogs are open.
 *
 * Usage:
 *   - In an overlay component: useRegisterOverlay(isOpen)
 *   - In chrome that should react: const count = useOverlayCount()
 */

const EVT = "rcm-overlay-count-change";
let overlayCount = 0;

function emit() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVT, { detail: overlayCount }));
}

export function registerOverlay(): () => void {
  overlayCount += 1;
  emit();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    overlayCount = Math.max(0, overlayCount - 1);
    emit();
  };
}

/** Mount-bound register: increments while `active` is true, releases on unmount/false. */
export function useRegisterOverlay(active: boolean = true) {
  useEffect(() => {
    if (!active) return;
    const release = registerOverlay();
    return release;
  }, [active]);
}

export function useOverlayCount(): number {
  const [n, setN] = useState<number>(() => overlayCount);
  useEffect(() => {
    const onChange = (e: Event) => {
      const ce = e as CustomEvent<number>;
      setN(typeof ce.detail === "number" ? ce.detail : overlayCount);
    };
    window.addEventListener(EVT, onChange as EventListener);
    setN(overlayCount);
    return () => window.removeEventListener(EVT, onChange as EventListener);
  }, []);
  return n;
}
