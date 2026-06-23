import { useEffect, useRef } from "react";
import { useSearchParams } from "@/lib/router-compat";
import { useGlobalFilter } from "@/components/global-filter-context";
import { useTpaFilter } from "@/components/TpaInsurerFilter";

/**
 * Bi-directional sync between the URL query string and the global
 * date-range + TPA/insurer filter state. Mount once near the top of a
 * page so links can be shared and refreshes restore the filtered view.
 *
 * URL params: ?from=YYYY-MM-DD&to=YYYY-MM-DD&tpa=Name1,Name2
 */
function toYMD(d: Date | null): string | null {
  if (!d) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseYMD(s: string | null): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export default function FilterUrlSync() {
  const [params, setParams] = useSearchParams();
  const { from, to, setFrom, setTo } = useGlobalFilter();
  const { selected, setSelected } = useTpaFilter();
  const hydrated = useRef(false);

  // Hydrate from URL once on mount (URL wins over localStorage on first load).
  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    const urlFrom = parseYMD(params.get("from"));
    const urlTo = parseYMD(params.get("to"));
    const urlTpa = (params.get("tpa") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    if (params.has("from") || params.has("to")) {
      setFrom(urlFrom);
      setTo(urlTo);
    }
    if (params.has("tpa")) setSelected(urlTpa);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Write filter state back to URL whenever it changes.
  useEffect(() => {
    if (!hydrated.current) return;
    const next = new URLSearchParams(params);
    const f = toYMD(from);
    const t = toYMD(to);
    if (f) next.set("from", f); else next.delete("from");
    if (t) next.set("to", t); else next.delete("to");
    if (selected.length > 0) next.set("tpa", selected.join(","));
    else next.delete("tpa");
    if (next.toString() !== params.toString()) {
      setParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, selected]);

  return null;
}
