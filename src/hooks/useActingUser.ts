import { useEffect, useState, useCallback } from "react";

const KEY = "rcm-acting-user-id";
const EVENT = "rcm-acting-user-change";

export function getActingUserId(): string | null {
  try { return localStorage.getItem(KEY); } catch { return null; }
}

export function setActingUserId(id: string | null) {
  try {
    if (id) localStorage.setItem(KEY, id);
    else localStorage.removeItem(KEY);
    window.dispatchEvent(new Event(EVENT));
  } catch { /* ignore */ }
}

export function useActingUserId() {
  const [id, setId] = useState<string | null>(getActingUserId());
  useEffect(() => {
    const h = () => setId(getActingUserId());
    window.addEventListener(EVENT, h);
    return () => window.removeEventListener(EVENT, h);
  }, []);
  const update = useCallback((v: string | null) => setActingUserId(v), []);
  return [id, update] as const;
}
