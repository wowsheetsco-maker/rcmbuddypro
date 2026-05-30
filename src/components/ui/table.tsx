import * as React from "react";
import { ChevronLeft, ChevronRight, Columns3 } from "lucide-react";

import { cn } from "@/lib/utils";

interface TableContextValue {
  dense: boolean;
}
const TableContext = React.createContext<TableContextValue>({ dense: false });

interface TableProps extends React.HTMLAttributes<HTMLTableElement> {
  /** Compact row density for AR/Excel-style scanning. */
  dense?: boolean;
  /** Wrapper behaviour. Pass `false` to skip the scroll wrapper. */
  wrapperClassName?: string;
  /** Show left/right scroll affordance buttons when the table overflows horizontally. Defaults to true. */
  showScrollButtons?: boolean;
}

/**
 * Scroll-aware wrapper around a horizontally scrollable table.
 * - Adds left/right buttons when content overflows (visible on mobile and on hover desktop).
 * - Hides them when scrolled to the corresponding edge.
 */
function ScrollWrapper({
  children,
  wrapperClassName,
  showScrollButtons = true,
}: {
  children: (ref: React.RefObject<HTMLDivElement | null>) => React.ReactNode;
  wrapperClassName?: string;
  showScrollButtons?: boolean;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [state, setState] = React.useState({ overflow: false, atStart: true, atEnd: false });
  const [hasHidden, setHasHidden] = React.useState(false);
  const [expanded, setExpanded] = React.useState(false);

  const update = React.useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const overflow = el.scrollWidth > el.clientWidth + 1;
    const atStart = el.scrollLeft <= 1;
    const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1;
    setState({ overflow, atStart, atEnd });
    // detect any hidden priority cells inside this table (mobile only matters)
    const root = el.parentElement; // the data-table-scroll-root
    const hidden = !!root?.querySelector(
      '[data-priority="secondary"],[data-priority="tertiary"],[data-priority="supporting"]',
    );
    setHasHidden(hidden);
  }, []);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [update]);

  const scrollBy = (delta: number) => {
    ref.current?.scrollBy({ left: delta, behavior: "smooth" });
  };

  const scrollAmount = () => Math.max(160, (ref.current?.clientWidth ?? 320) * 0.7);

  return (
    <div
      className="relative"
      data-table-scroll-root
      data-cols-expanded={expanded ? "true" : "false"}
    >
      {/* Mobile-only "More columns" toggle */}
      {hasHidden && (
        <div className="md:hidden flex justify-end mb-1">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-pressed={expanded}
            aria-label={expanded ? "Hide extra columns" : "Show more columns"}
            className="inline-flex items-center gap-1.5 h-7 px-2 rounded-md border bg-background text-xs font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Columns3 className="h-3.5 w-3.5" />
            {expanded ? "Fewer columns" : "More columns"}
          </button>
        </div>
      )}
      {children(ref)}
      {showScrollButtons && state.overflow && (
        <>
          <button
            type="button"
            aria-label="Scroll table left"
            aria-controls="table-scroll-region"
            disabled={state.atStart}
            onClick={() => scrollBy(-scrollAmount())}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                if (!state.atStart) scrollBy(-scrollAmount());
              }
            }}
            className={cn(
              "absolute left-1 top-1/2 -translate-y-1/2 z-30 h-8 w-8 rounded-full border bg-background/90 backdrop-blur shadow-md flex items-center justify-center text-foreground transition",
              "hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              "disabled:opacity-30 disabled:cursor-not-allowed disabled:pointer-events-none",
            )}
            data-testid="table-scroll-left"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Scroll table right"
            aria-controls="table-scroll-region"
            disabled={state.atEnd}
            onClick={() => scrollBy(scrollAmount())}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                if (!state.atEnd) scrollBy(scrollAmount());
              }
            }}
            className={cn(
              "absolute right-1 top-1/2 -translate-y-1/2 z-30 h-8 w-8 rounded-full border bg-background/90 backdrop-blur shadow-md flex items-center justify-center text-foreground transition",
              "hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              "disabled:opacity-30 disabled:cursor-not-allowed disabled:pointer-events-none",
            )}
            data-testid="table-scroll-right"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </>
      )}
    </div>
  );
}

const Table = React.forwardRef<HTMLTableElement, TableProps>(
  ({ className, dense = false, wrapperClassName, showScrollButtons = true, ...props }, ref) => (
    <TableContext.Provider value={{ dense }}>
      <ScrollWrapper wrapperClassName={wrapperClassName} showScrollButtons={showScrollButtons}>
        {(scrollRef) => (
          <div
            ref={scrollRef}
            className={cn(
              "relative w-full overflow-x-auto overflow-y-auto -mx-3 px-3 md:mx-0 md:px-0",
              "[-webkit-overflow-scrolling:touch]",
              wrapperClassName,
            )}
            id="table-scroll-region"
            role="region"
            aria-label="Table content (scroll)"
            tabIndex={0}
            data-table-scroll-container
          >
            <table
              ref={ref}
              data-density={dense ? "compact" : "default"}
              className={cn(
                "w-full caption-bottom text-sm min-w-[640px] md:min-w-0",
                className,
              )}
              {...props}
            />
          </div>
        )}
      </ScrollWrapper>
    </TableContext.Provider>
  ),
);
Table.displayName = "Table";

interface TableHeaderProps extends React.HTMLAttributes<HTMLTableSectionElement> {
  /** Pin header to top of scroll container. Defaults to true so column titles stay visible while scrolling. */
  sticky?: boolean;
}
const TableHeader = React.forwardRef<HTMLTableSectionElement, TableHeaderProps>(
  ({ className, sticky = true, ...props }, ref) => (
    <thead
      ref={ref}
      className={cn(
        "[&_tr]:border-b bg-sidebar text-sidebar-foreground [&_tr]:border-sidebar-border",
        sticky && "[&_th]:sticky [&_th]:top-0 [&_th]:z-30 [&_th]:bg-sidebar [&_th]:shadow-sm",
        className,
      )}
      {...props}
    />
  ),
);
TableHeader.displayName = "TableHeader";

const TableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tbody ref={ref} className={cn("[&_tr:last-child]:border-0", className)} {...props} />
  ),
);
TableBody.displayName = "TableBody";

interface TableFooterProps extends React.HTMLAttributes<HTMLTableSectionElement> {
  /** Pin totals row to bottom of scroll container. */
  sticky?: boolean;
}
const TableFooter = React.forwardRef<HTMLTableSectionElement, TableFooterProps>(
  ({ className, sticky, ...props }, ref) => (
    <tfoot
      ref={ref}
      className={cn(
        "border-t bg-muted/60 font-semibold [&>tr]:last:border-b-0",
        sticky && "sticky bottom-0 z-10 backdrop-blur supports-[backdrop-filter]:bg-muted/80",
        className,
      )}
      {...props}
    />
  ),
);
TableFooter.displayName = "TableFooter";

const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn("border-b transition-colors data-[state=selected]:bg-muted hover:bg-muted/40", className)}
      {...props}
    />
  ),
);
TableRow.displayName = "TableRow";

/**
 * Column priority controls when the column is hidden on small screens.
 * - "primary"    → always visible (default for first column / key identifier)
 * - "secondary"  → visible from sm (≥640px). Hidden on phones <640px.
 * - "tertiary"   → visible from md (≥768px). Hidden on small/medium phones.
 * - "supporting" → visible from lg (≥1024px). Reserved for low-priority metadata.
 */
export type ColumnPriority = "primary" | "secondary" | "tertiary" | "supporting";

const PRIORITY_CLS: Record<ColumnPriority, string> = {
  primary: "",
  secondary: "hidden sm:table-cell",
  tertiary: "hidden md:table-cell",
  supporting: "hidden lg:table-cell",
};

interface TableHeadProps extends React.ThHTMLAttributes<HTMLTableCellElement> {
  /** Freeze this column to the left edge while horizontally scrolling. */
  pinned?: boolean;
  align?: "left" | "right" | "center";
  /** Hide this column at smaller breakpoints based on priority. */
  priority?: ColumnPriority;
}
const TableHead = React.forwardRef<HTMLTableCellElement, TableHeadProps>(
  ({ className, pinned, align = "left", priority = "primary", ...props }, ref) => {
    const { dense } = React.useContext(TableContext);
    return (
      <th
        ref={ref}
        data-priority={priority}
        className={cn(
          "align-middle font-semibold uppercase tracking-wide text-[10px] text-sidebar-foreground/90 [&:has([role=checkbox])]:pr-0",
          dense ? "h-8 px-2" : "h-10 px-3",
          align === "right" && "text-right",
          align === "center" && "text-center",
          pinned && "sm:left-0 sm:z-50 text-sidebar-foreground",
          PRIORITY_CLS[priority],
          className,
        )}
        {...props}
      />
    );
  },
);
TableHead.displayName = "TableHead";

interface TableCellProps extends React.TdHTMLAttributes<HTMLTableCellElement> {
  pinned?: boolean;
  align?: "left" | "right" | "center";
  /** Right-align numbers + tabular figures (default for monetary cells). */
  numeric?: boolean;
  /** Hide this cell at smaller breakpoints based on priority. Match the matching <TableHead priority>. */
  priority?: ColumnPriority;
}
const TableCell = React.forwardRef<HTMLTableCellElement, TableCellProps>(
  ({ className, pinned, align, numeric, priority = "primary", ...props }, ref) => {
    const { dense } = React.useContext(TableContext);
    const a = align ?? (numeric ? "right" : "left");
    return (
      <td
        ref={ref}
        data-priority={priority}
        className={cn(
          "align-middle [&:has([role=checkbox])]:pr-0",
          dense ? "py-1.5 px-2 text-xs" : "py-2.5 px-3",
          a === "right" && "text-right",
          a === "center" && "text-center",
          numeric && "tabular-nums",
          pinned && "sm:sticky sm:left-0 sm:z-20 bg-card group-hover:bg-muted/40",
          PRIORITY_CLS[priority],
          className,
        )}
        {...props}
      />
    );
  },
);
TableCell.displayName = "TableCell";

const TableCaption = React.forwardRef<HTMLTableCaptionElement, React.HTMLAttributes<HTMLTableCaptionElement>>(
  ({ className, ...props }, ref) => (
    <caption ref={ref} className={cn("mt-4 text-sm text-muted-foreground", className)} {...props} />
  ),
);
TableCaption.displayName = "TableCaption";

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption };
