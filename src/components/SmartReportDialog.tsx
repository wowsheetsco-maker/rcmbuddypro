import { useMemo, useState } from "react";
import { format } from "date-fns";
import {
  X, Trophy, TrendingUp, XCircle, Building2, Lightbulb, Download,
  CalendarIcon, FileSpreadsheet, FilesIcon, Check, ChevronsUpDown,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { useLiveClaims } from "@/hooks/useLiveClaims";
import { useGlobalFilter } from "@/components/global-filter-context";
import {
  openReportInNewTab, openCombinedReportInNewTab, type ReportKind,
} from "@/lib/smartReports";
import { downloadReportExcel, downloadCombinedReportExcel } from "@/lib/smartReportExcel";
import { cn } from "@/lib/utils";

interface ReportOption {
  kind: ReportKind;
  title: string;
  desc: string;
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
}

const REPORTS: ReportOption[] = [
  {
    kind: "ceo",
    title: "CEO / CFO Dashboard",
    desc: "Full financial scorecard, funnel, leakage, top TPA AR, action plan",
    icon: Trophy,
    iconBg: "bg-amber-100",
    iconColor: "text-amber-600",
  },
  {
    kind: "ar",
    title: "AR Aging Report",
    desc: "Aging buckets, TPA-wise aging breakdown, optional SLA breach list",
    icon: TrendingUp,
    iconBg: "bg-sky-100",
    iconColor: "text-sky-600",
  },
  {
    kind: "denial",
    title: "Denial & Appeal Report",
    desc: "All denials, categories, appeal status, recovery opportunity",
    icon: XCircle,
    iconBg: "bg-rose-100",
    iconColor: "text-rose-600",
  },
  {
    kind: "corporate",
    title: "Corporate Performance",
    desc: "Employer-wise billed, settled, NCR, denial rate, breach count",
    icon: Building2,
    iconBg: "bg-violet-100",
    iconColor: "text-violet-600",
  },
];

const PERIODS = [
  "All Time", "Today", "Last 7 Days", "Last 30 Days", "Last 90 Days",
  "This Month", "Last Month", "This Quarter", "This Year", "Custom Range",
] as const;

const ALL_TPAS = "__all__";

type Mode = "single" | "combined";

export default function SmartReportDialog({
  open, onOpenChange,
}: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [mode, setMode] = useState<Mode>("single");
  const [selected, setSelected] = useState<ReportKind>("ceo");
  const [combinedKinds, setCombinedKinds] = useState<ReportKind[]>(["ceo", "ar", "denial", "corporate"]);
  const [period, setPeriod] = useState<string>("All Time");
  const [hospital, setHospital] = useState<string>("Aster Prime Hospital");
  const [includeIrdaiBreachList, setIncludeIrdaiBreachList] = useState<boolean>(false);
  const [tpa, setTpa] = useState<string>(ALL_TPAS);
  const [tpaPickerOpen, setTpaPickerOpen] = useState(false);

  // Local custom range — only used when period === "Custom Range"
  const [customFrom, setCustomFrom] = useState<Date | undefined>(undefined);
  const [customTo, setCustomTo] = useState<Date | undefined>(undefined);
  const [fromOpen, setFromOpen] = useState(false);
  const [toOpen, setToOpen] = useState(false);

  const { claims } = useLiveClaims();
  const { from: globalFrom, to: globalTo } = useGlobalFilter();

  // Sorted unique TPA list
  const tpaList = useMemo(() => {
    const set = new Set<string>();
    claims.forEach((c) => { if (c.tpa_name) set.add(c.tpa_name); });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [claims]);

  // Effective from/to dates: when Custom Range, use the local pickers (falling
  // back to the global filter for any unset side); otherwise compute from period.
  const filtered = useMemo(() => {
    const now = new Date();
    let startMs = -Infinity;
    let endMs = Infinity;
    let useAll = false;

    switch (period) {
      case "All Time": useAll = true; break;
      case "Today": {
        const s = new Date(now); s.setHours(0, 0, 0, 0); startMs = s.getTime(); endMs = now.getTime(); break;
      }
      case "Last 7 Days": startMs = now.getTime() - 7 * 86_400_000; endMs = now.getTime(); break;
      case "Last 30 Days": startMs = now.getTime() - 30 * 86_400_000; endMs = now.getTime(); break;
      case "Last 90 Days": startMs = now.getTime() - 90 * 86_400_000; endMs = now.getTime(); break;
      case "This Month": {
        const s = new Date(now.getFullYear(), now.getMonth(), 1); startMs = s.getTime(); endMs = now.getTime(); break;
      }
      case "Last Month": {
        const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const e = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
        startMs = s.getTime(); endMs = e.getTime(); break;
      }
      case "This Quarter": {
        const q = Math.floor(now.getMonth() / 3) * 3;
        const s = new Date(now.getFullYear(), q, 1); startMs = s.getTime(); endMs = now.getTime(); break;
      }
      case "This Year": {
        const s = new Date(now.getFullYear(), 0, 1); startMs = s.getTime(); endMs = now.getTime(); break;
      }
      case "Custom Range": {
        const f = customFrom ?? globalFrom ?? null;
        const t = customTo ?? globalTo ?? null;
        startMs = f ? new Date(f.setHours(0, 0, 0, 0)).getTime() : -Infinity;
        endMs = t ? new Date(t.setHours(23, 59, 59, 999)).getTime() : Infinity;
        break;
      }
    }

    return claims.filter((c) => {
      if (tpa !== ALL_TPAS && c.tpa_name !== tpa) return false;
      if (useAll) return true;
      const t = new Date(c.claim_creation_date).getTime();
      if (Number.isNaN(t)) return false;
      return t >= startMs && t <= endMs;
    });
  }, [claims, period, customFrom, customTo, globalFrom, globalTo, tpa]);

  const periodLabel = useMemo(() => {
    if (period === "Custom Range") {
      const f = customFrom ?? globalFrom ?? null;
      const t = customTo ?? globalTo ?? null;
      return `${f ? format(f, "dd MMM yyyy") : "—"} to ${t ? format(t, "dd MMM yyyy") : "—"}`;
    }
    return period;
  }, [period, customFrom, customTo, globalFrom, globalTo]);

  const fullPeriodLabel = tpa === ALL_TPAS ? periodLabel : `${periodLabel} · TPA: ${tpa}`;

  const buildCtx = () => ({
    claims: filtered,
    hospitalName: hospital.trim() || "Hospital",
    periodLabel: fullPeriodLabel,
    fromDate: customFrom ?? globalFrom ?? null,
    toDate: customTo ?? globalTo ?? null,
    includeIrdaiBreachList,
  });

  const handleGeneratePdf = () => {
    if (mode === "combined") {
      if (combinedKinds.length === 0) return;
      openCombinedReportInNewTab(combinedKinds, buildCtx());
    } else {
      openReportInNewTab(selected, buildCtx());
    }
    onOpenChange(false);
  };

  const handleDownloadExcel = () => {
    const common = {
      claims: filtered,
      hospitalName: hospital.trim() || "Hospital",
      periodLabel: fullPeriodLabel,
    };
    if (mode === "combined") {
      if (combinedKinds.length === 0) return;
      // Combined mode → multi-sheet workbook covering every selected report.
      downloadCombinedReportExcel({ kinds: combinedKinds, ...common });
    } else {
      downloadReportExcel({ kind: selected, ...common });
    }
    onOpenChange(false);
  };

  const toggleCombined = (k: ReportKind) => {
    setCombinedKinds((prev) =>
      prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k],
    );
  };

  const isCustom = period === "Custom Range";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl p-0 gap-0 overflow-hidden border-0 bg-card"
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        {/* Purple gradient header */}
        <div className="relative bg-gradient-to-r from-[hsl(258_50%_18%)] via-[hsl(264_55%_22%)] to-[hsl(270_60%_28%)] px-6 py-5 text-white">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-md bg-white/15 backdrop-blur-sm shrink-0">
              <span className="text-lg" role="img" aria-label="report">📊</span>
            </div>
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-lg font-bold leading-tight">Smart Report</DialogTitle>
              <p className="text-[12px] text-white/70 mt-0.5 leading-snug">
                Generates a print-ready PDF with live dashboard data, insights &amp; action plan
              </p>
            </div>
            <button
              onClick={() => onOpenChange(false)}
              className="grid h-8 w-8 place-items-center rounded-md bg-white/10 hover:bg-white/20 transition-colors shrink-0"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Mode toggle */}
          <div className="mt-4 inline-flex rounded-md bg-white/10 p-0.5 text-[12px] font-semibold">
            <button
              type="button"
              onClick={() => setMode("single")}
              className={cn(
                "px-3 py-1.5 rounded-[5px] transition-colors",
                mode === "single" ? "bg-white text-violet-900" : "text-white/80 hover:text-white",
              )}
            >
              Single Report
            </button>
            <button
              type="button"
              onClick={() => setMode("combined")}
              className={cn(
                "px-3 py-1.5 rounded-[5px] transition-colors flex items-center gap-1.5",
                mode === "combined" ? "bg-white text-violet-900" : "text-white/80 hover:text-white",
              )}
            >
              <FilesIcon className="h-3.5 w-3.5" />
              Combined PDF
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* Report Type */}
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground mb-2.5">
              {mode === "combined" ? "Reports to include in PDF" : "Report Type"}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {REPORTS.map((r) => {
                const isSel = mode === "single"
                  ? selected === r.kind
                  : combinedKinds.includes(r.kind);
                const Icon = r.icon;
                return (
                  <button
                    key={r.kind}
                    type="button"
                    onClick={() =>
                      mode === "single" ? setSelected(r.kind) : toggleCombined(r.kind)
                    }
                    className={cn(
                      "relative flex items-start gap-3 rounded-lg border p-3 text-left transition-all",
                      isSel
                        ? "border-violet-500 bg-violet-50 ring-2 ring-violet-200 dark:bg-violet-500/10 dark:ring-violet-500/20"
                        : "border-border bg-card hover:border-border/80 hover:shadow-sm",
                    )}
                  >
                    {mode === "combined" && isSel && (
                      <div className="absolute top-2 right-2 grid h-4 w-4 place-items-center rounded-full bg-violet-600 text-white">
                        <Check className="h-3 w-3" />
                      </div>
                    )}
                    <div className={cn("grid h-9 w-9 place-items-center rounded-md shrink-0", r.iconBg)}>
                      <Icon className={cn("h-5 w-5", r.iconColor)} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-semibold leading-tight text-foreground">
                        {r.title}
                      </div>
                      <div className="mt-1 text-[11px] text-muted-foreground leading-snug">
                        {r.desc}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            {mode === "combined" && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                {combinedKinds.length} report{combinedKinds.length === 1 ? "" : "s"} selected — they will be merged into a single PDF with a cover page.
              </p>
            )}
          </div>

          {/* Period + Hospital */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground block mb-1.5">
                Period
              </label>
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger className="h-10 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PERIODS.map((p) => (
                    <SelectItem key={p} value={p} className="text-sm">{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground block mb-1.5">
                Hospital Name (for header)
              </label>
              <Input
                value={hospital}
                onChange={(e) => setHospital(e.target.value)}
                className="h-10 text-sm"
                placeholder="Hospital name"
              />
            </div>
          </div>

          {/* Custom date range — only on Custom Range */}
          {isCustom && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground block mb-1.5">
                  From Date
                </label>
                <Popover open={fromOpen} onOpenChange={setFromOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full h-10 justify-start text-left font-normal text-sm",
                        !customFrom && "text-muted-foreground",
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {customFrom ? format(customFrom, "dd MMM yyyy") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={customFrom}
                      onSelect={(d) => { setCustomFrom(d); setFromOpen(false); }}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground block mb-1.5">
                  To Date
                </label>
                <Popover open={toOpen} onOpenChange={setToOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full h-10 justify-start text-left font-normal text-sm",
                        !customTo && "text-muted-foreground",
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {customTo ? format(customTo, "dd MMM yyyy") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={customTo}
                      onSelect={(d) => { setCustomTo(d); setToOpen(false); }}
                      disabled={(date) => (customFrom ? date < customFrom : false)}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          )}

          {/* TPA / Insurer searchable single-select */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground block mb-1.5">
              TPA / Insurer
            </label>
            <Popover open={tpaPickerOpen} onOpenChange={setTpaPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  className="w-full h-10 justify-between text-sm font-normal"
                >
                  <span className={cn(tpa === ALL_TPAS && "text-muted-foreground")}>
                    {tpa === ALL_TPAS ? "All TPAs / Insurers" : tpa}
                  </span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search TPA or insurer…" className="text-sm" />
                  <CommandList>
                    <CommandEmpty>No TPA found.</CommandEmpty>
                    <CommandGroup>
                      <CommandItem
                        value="All TPAs / Insurers"
                        onSelect={() => { setTpa(ALL_TPAS); setTpaPickerOpen(false); }}
                      >
                        <Check className={cn("mr-2 h-4 w-4", tpa === ALL_TPAS ? "opacity-100" : "opacity-0")} />
                        All TPAs / Insurers
                      </CommandItem>
                      {tpaList.map((t) => (
                        <CommandItem
                          key={t}
                          value={t}
                          onSelect={() => { setTpa(t); setTpaPickerOpen(false); }}
                        >
                          <Check className={cn("mr-2 h-4 w-4", tpa === t ? "opacity-100" : "opacity-0")} />
                          {t}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              {filtered.length.toLocaleString("en-IN")} claim{filtered.length === 1 ? "" : "s"} match the current filters.
            </p>
          </div>

          {/* AR-only option */}
          {((mode === "single" && selected === "ar") || (mode === "combined" && combinedKinds.includes("ar"))) && (
            <label className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/30 px-3.5 py-2.5 cursor-pointer hover:bg-muted/50 transition-colors">
              <input
                type="checkbox"
                checked={includeIrdaiBreachList}
                onChange={(e) => setIncludeIrdaiBreachList(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-border accent-violet-600 cursor-pointer"
              />
              <div className="flex-1">
                <div className="text-[12px] font-semibold text-foreground leading-tight">
                  Include SLA 30-day breach list (Top 25)
                </div>
                <div className="mt-0.5 text-[11px] text-muted-foreground leading-snug">
                  Optional appendix listing the 25 oldest unpaid claims breaching SLA TAT.
                </div>
              </div>
            </label>
          )}

          {/* Info banner */}
          <div className="rounded-lg bg-violet-50 border border-violet-200 px-3.5 py-2.5 dark:bg-violet-500/10 dark:border-violet-500/20">
            <div className="flex items-start gap-2">
              <Lightbulb className="h-4 w-4 text-violet-600 dark:text-violet-400 shrink-0 mt-0.5" />
              <div className="text-[11.5px] text-violet-900 dark:text-violet-200 leading-relaxed">
                <span className="font-semibold">How to get your PDF:</span>{" "}
                Click <em>Generate PDF</em> → a print-ready page opens in a new tab →
                press <kbd className="px-1 py-0.5 rounded bg-white/70 dark:bg-white/10 border border-violet-300/50 text-[10px] font-mono">Ctrl+P</kbd> (or <kbd className="px-1 py-0.5 rounded bg-white/70 dark:bg-white/10 border border-violet-300/50 text-[10px] font-mono">Cmd+P</kbd> on Mac) → choose <em>Save as PDF</em> → click Save.
                Use <em>Download Excel</em> for the underlying claim data.
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-end gap-2.5 px-6 py-3.5 border-t bg-muted/20">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="h-9 px-5"
          >
            Cancel
          </Button>
          <Button
            variant="outline"
            onClick={handleDownloadExcel}
            disabled={filtered.length === 0 || (mode === "combined" && combinedKinds.length === 0)}
            className="h-9 px-5 gap-2"
          >
            <FileSpreadsheet className="h-4 w-4" />
            {mode === "combined" ? `Download Excel (${combinedKinds.length})` : "Download Excel"}
          </Button>
          <Button
            onClick={handleGeneratePdf}
            disabled={mode === "combined" && combinedKinds.length === 0}
            className="h-9 px-5 gap-2 bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
          >
            <Download className="h-4 w-4" />
            {mode === "combined" ? `Generate PDF (${combinedKinds.length})` : "Generate PDF Report"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
