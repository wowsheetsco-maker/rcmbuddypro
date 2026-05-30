import { useEffect, useState, useCallback } from "react";

const KEY = "rcm-buddy-view-mode"; // "mobile" | "desktop" | "" (auto)
type Mode = "mobile" | "desktop" | "";

function read(): Mode {
  if (typeof window === "undefined") return "";
  return (localStorage.getItem(KEY) as Mode) || "";
}

export function useViewMode() {
  const [override, setOverride] = useState<Mode>(read);
  const [isSmall, setIsSmall] = useState<boolean>(() =>
    typeof window === "undefined" ? false : window.innerWidth < 768,
  );

  useEffect(() => {
    const mql = window.matchMedia("(max-width: 767px)");
    const onChange = () => setIsSmall(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  const setMode = useCallback((m: Mode) => {
    setOverride(m);
    try {
      if (m) localStorage.setItem(KEY, m);
      else localStorage.removeItem(KEY);
    } catch { /* noop */ }
    window.dispatchEvent(new Event("rcm-view-mode-change"));
  }, []);

  // effective mode
  const isMobile = override ? override === "mobile" : isSmall;
  return { isMobile, isSmall, override, setMode };
}
