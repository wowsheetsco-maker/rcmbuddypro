import * as React from "react";
import { ArrowUp, ArrowDown, ArrowUpDown, X as XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSearchParams } from "@/lib/router-compat";

/**
 * Reusable numeric primitives + sort utilities for list/table views.
 *
 * - <NumericCell>      → right-aligned, tabular-nums, renders "—" when empty
 * - <NumericTh>        → matching header cell
 * - <SortableTh>       → clickable header with sort indicator
 * - <SortStatusBar>    → "Sorted by X (desc) · Clear sorting" pill
 * - useTableSort()     → asc/desc/none toggle hook (in-memory)
 * - useUrlTableSort()  → same toggle, but persisted to a URL query param
 */

export interface NumericCellProps extends React.TdHTMLAttributes<HTMLTableCellElement> {
  emptyDash?: boolean;
  bold?: boolean;
  as?: "td" | "div";
  priority?: "primary" | "secondary" | "tertiary" | "supporting";
}

const NUMERIC_PRIORITY_CLS = {
  primary: "",
  secondary: "hidden sm:table-cell",
  tertiary: "hidden md:table-cell",
  supporting: "hidden lg:table-cell",
} as const;

function isEmpty(v: React.ReactNode): boolean {
  return v === null || v === undefined || v === "";
}

export const NumericCell = React.forwardRef<HTMLTableCellElement, NumericCellProps>(
  ({ className, children, emptyDash = true, bold = false, as = "td", priority = "primary", ...rest }, ref) => {
    const display = emptyDash && isEmpty(children) ? <span className="text-muted-foreground">—</span> : children;
    const cls = cn(
      "text-right tabular-nums whitespace-nowrap",
      bold && "font-semibold",
      className,
    );
    if (as === "div") {
      return (
        <div className={cls} {...(rest as unknown as React.HTMLAttributes<HTMLDivElement>)}>
          {display}
        </div>
      );
    }
    return (
      <td ref={ref} data-priority={priority} className={cn("py-2.5 px-3", NUMERIC_PRIORITY_CLS[priority], cls)} {...rest}>
        {display}
      </td>
    );
  },
);
NumericCell.displayName = "NumericCell";

export interface NumericThProps extends React.ThHTMLAttributes<HTMLTableCellElement> {}

export const NumericTh = React.forwardRef<HTMLTableCellElement, NumericThProps>(
  ({ className, children, ...rest }, ref) => (
    <th
      ref={ref}
      className={cn(
        "py-2.5 px-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap",
        className,
      )}
      {...rest}
    >
      {children}
    </th>
  ),
);
NumericTh.displayName = "NumericTh";

/* ---------- Sorting ---------- */

export type SortDir = "asc" | "desc" | null;

export interface SortState<K extends string> {
  key: K | null;
  dir: SortDir;
}

export interface UseTableSortReturn<K extends string> {
  sort: SortState<K>;
  setSort: (next: SortState<K>) => void;
  toggle: (key: K) => void;
  clear: () => void;
}

export function useTableSort<K extends string>(
  initial: SortState<K> = { key: null, dir: null },
): UseTableSortReturn<K> {
  const [sort, setSort] = React.useState<SortState<K>>(initial);
  const toggle = React.useCallback((key: K) => {
    setSort((prev) => {
      if (prev.key !== key) return { key, dir: "desc" };
      if (prev.dir === "desc") return { key, dir: "asc" };
      return { key: null, dir: null };
    });
  }, []);
  const clear = React.useCallback(() => setSort({ key: null, dir: null }), []);
  return { sort, setSort, toggle, clear };
}

/** Encode/decode sort state as `key:dir` for URLs. */
export function encodeSort<K extends string>(s: SortState<K>): string | null {
  if (!s.key || !s.dir) return null;
  return `${s.key}:${s.dir}`;
}
export function decodeSort<K extends string>(raw: string | null, allowed: readonly K[]): SortState<K> {
  if (!raw) return { key: null, dir: null };
  const [k, d] = raw.split(":");
  if (!k || (d !== "asc" && d !== "desc")) return { key: null, dir: null };
  if (!allowed.includes(k as K)) return { key: null, dir: null };
  return { key: k as K, dir: d };
}

/** URL-backed sort state. Defaults to query param `sort=<key>:<dir>`. */
export function useUrlTableSort<K extends string>(
  allowedKeys: readonly K[],
  options: { paramName?: string; initial?: SortState<K> } = {},
): UseTableSortReturn<K> {
  const paramName = options.paramName ?? "sort";
  const [params, setParams] = useSearchParams();
  const raw = params.get(paramName);
  const fromUrl = React.useMemo(() => decodeSort<K>(raw, allowedKeys), [raw, allowedKeys]);
  const sort = fromUrl.key ? fromUrl : options.initial ?? { key: null, dir: null };

  const writeSort = React.useCallback(
    (next: SortState<K>) => {
      const encoded = encodeSort(next);
      const usp = new URLSearchParams(params);
      if (encoded) usp.set(paramName, encoded);
      else usp.delete(paramName);
      setParams(usp, { replace: true });
    },
    [params, setParams, paramName],
  );

  const toggle = React.useCallback(
    (key: K) => {
      let next: SortState<K>;
      if (sort.key !== key) next = { key, dir: "desc" };
      else if (sort.dir === "desc") next = { key, dir: "asc" };
      else next = { key: null, dir: null };
      writeSort(next);
    },
    [sort, writeSort],
  );

  const clear = React.useCallback(() => writeSort({ key: null, dir: null }), [writeSort]);

  return { sort, setSort: writeSort, toggle, clear };
}

/** Sort an array by a numeric extractor according to the given sort state. */
export function applyNumericSort<T, K extends string>(
  items: T[],
  state: SortState<K>,
  extractors: Record<K, (item: T) => number>,
): T[] {
  if (!state.key || !state.dir) return items;
  const get = extractors[state.key];
  if (!get) return items;
  const dir = state.dir === "asc" ? 1 : -1;
  return [...items].sort((a, b) => (get(a) - get(b)) * dir);
}

export type SortableThPriority = "primary" | "secondary" | "tertiary" | "supporting";

const SORTABLE_PRIORITY_CLS: Record<SortableThPriority, string> = {
  primary: "",
  secondary: "hidden sm:table-cell",
  tertiary: "hidden md:table-cell",
  supporting: "hidden lg:table-cell",
};

export interface SortableThProps<K extends string> extends Omit<React.ThHTMLAttributes<HTMLTableCellElement>, "onClick"> {
  sortKey: K;
  sortState: SortState<K>;
  onSort: (key: K) => void;
  align?: "left" | "right";
  /** Hide column at smaller breakpoints (matches TableHead priority). */
  priority?: SortableThPriority;
}

export function SortableTh<K extends string>({
  sortKey,
  sortState,
  onSort,
  align = "right",
  className,
  children,
  priority = "primary",
  ...rest
}: SortableThProps<K>) {
  const active = sortState.key === sortKey;
  const dir = active ? sortState.dir : null;
  const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th
      data-priority={priority}
      className={cn(
        "py-2.5 px-3 text-xs font-semibold text-sidebar-foreground/90 uppercase tracking-wide whitespace-nowrap",
        align === "right" ? "text-right" : "text-left",
        SORTABLE_PRIORITY_CLS[priority],
        className,
      )}
      {...rest}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        aria-sort={dir === "asc" ? "ascending" : dir === "desc" ? "descending" : "none"}
        className={cn(
          "inline-flex items-center gap-1 hover:text-sidebar-primary transition-colors",
          active && "text-sidebar-primary",
          align === "right" && "ml-auto flex-row-reverse",
        )}
      >
        <Icon className={cn("h-3 w-3", active ? "opacity-100" : "opacity-60")} />
        <span>{children}</span>
      </button>
    </th>
  );
}

/* ---------- Status bar ---------- */

export interface SortStatusBarProps<K extends string> {
  sort: SortState<K>;
  onClear: () => void;
  labels: Record<K, string>;
  className?: string;
  /** Text to show when no sort is active. */
  emptyLabel?: string;
}

export function SortStatusBar<K extends string>({
  sort,
  onClear,
  labels,
  className,
  emptyLabel = "Default order",
}: SortStatusBarProps<K>) {
  const active = !!sort.key && !!sort.dir;
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 rounded-md border bg-muted/30 px-3 py-1.5 text-xs",
        className,
      )}
      data-testid="sort-status-bar"
    >
      <div className="text-muted-foreground">
        {active ? (
          <>
            Sorted by{" "}
            <span className="font-semibold text-foreground">{labels[sort.key as K]}</span>{" "}
            <span className="uppercase tracking-wide">({sort.dir})</span>
          </>
        ) : (
          <span>{emptyLabel}</span>
        )}
      </div>
      <button
        type="button"
        onClick={onClear}
        disabled={!active}
        className={cn(
          "inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors",
          active
            ? "text-foreground hover:bg-background"
            : "text-muted-foreground/50 cursor-not-allowed",
        )}
      >
        <XIcon className="h-3 w-3" /> Clear sorting
      </button>
    </div>
  );
}
