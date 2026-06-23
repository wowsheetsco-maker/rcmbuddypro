import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@/lib/router-compat";
import { Building2, IndianRupee, FileText, AlertTriangle, Inbox, ChevronRight, Loader2, Pencil, RotateCcw } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { KpiCard, KpiGrid } from "@/components/ui/kpi-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useLiveClaims } from "@/hooks/useLiveClaims";
import { formatInr } from "@/data/mockClaims";
import { autoClassifyPayer, classifyPayer, getPayerOverrides, PAYER_CATEGORY_LABELS, setPayerOverride, type PayerCategory } from "@/lib/payerCategory";
import DateRangeQuickPicker from "@/components/DateRangeQuickPicker";
import { useGlobalFilter } from "@/components/global-filter-context";

type CategoryFilter = PayerCategory | "all";

interface PayerRow {
  name: string;
  category: PayerCategory;
  autoCategory: PayerCategory;
  isOverridden: boolean;
  claims: number;
  claimed: number;
  approved: number;
  settled: number;
  outstanding: number;
  breaches: number;
}

const CATEGORY_TONE: Record<PayerCategory, string> = {
  government: "bg-info/10 text-info border-info/30",
  psu: "bg-secondary/10 text-secondary border-secondary/30",
  tpa: "bg-warning/10 text-warning border-warning/30",
  insurer: "bg-primary/10 text-primary border-primary/30",
  aggregator: "bg-muted text-muted-foreground border-border",
};

const ALL_CATEGORIES: PayerCategory[] = ["government", "psu", "tpa", "insurer", "aggregator"];

export default function PayersPage() {
  const { claims, loading, isMock } = useLiveClaims();
  const { from, to, isWithin } = useGlobalFilter();
  const navigate = useNavigate();
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<{ name: string; category: PayerCategory } | null>(null);
  // Re-render trigger when overrides change
  const [overridesVersion, setOverridesVersion] = useState(0);

  useEffect(() => {
    const handler = () => setOverridesVersion((v) => v + 1);
    window.addEventListener("rcm-payer-overrides-changed", handler);
    return () => window.removeEventListener("rcm-payer-overrides-changed", handler);
  }, []);

  const durationDays = useMemo(() => {
    if (!from || !to) return null;
    return Math.max(1, Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1);
  }, [from, to]);

  const rows = useMemo<PayerRow[]>(() => {
    // intentionally include overridesVersion in deps
    void overridesVersion;
    const map = new Map<string, PayerRow>();
    for (const c of claims) {
      if (!isWithin(c.claim_creation_date)) continue;
      const name = (c.tpa_name || c.insurance_company_name || "Unknown").trim() || "Unknown";
      let r = map.get(name);
      if (!r) {
        const auto = autoClassifyPayer(name);
        const cat = classifyPayer(name);
        r = {
          name,
          category: cat,
          autoCategory: auto,
          isOverridden: cat !== auto,
          claims: 0,
          claimed: 0,
          approved: 0,
          settled: 0,
          outstanding: 0,
          breaches: 0,
        };
        map.set(name, r);
      }
      r.claims += 1;
      r.claimed += c.claimed_amount ?? 0;
      r.approved += c.approved_amount ?? 0;
      r.settled += c.settled_amount ?? 0;
      r.outstanding += c.outstanding_amount ?? 0;
      if (c.is_irdai_breach) r.breaches += 1;
    }
    return Array.from(map.values()).sort((a, b) => b.outstanding - a.outstanding);
  }, [claims, isWithin, overridesVersion]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (category !== "all" && r.category !== category) return false;
      if (q && !r.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, category, search]);

  const kpis = useMemo(() => ({
    payers: filtered.length,
    claims: filtered.reduce((s, r) => s + r.claims, 0),
    outstanding: filtered.reduce((s, r) => s + r.outstanding, 0),
    breaches: filtered.reduce((s, r) => s + r.breaches, 0),
  }), [filtered]);

  const categoryCounts = useMemo(() => {
    const c: Record<CategoryFilter, number> = {
      all: rows.length, government: 0, psu: 0, tpa: 0, insurer: 0, aggregator: 0,
    };
    for (const r of rows) c[r.category] += 1;
    return c;
  }, [rows]);

  const overrideCount = useMemo(() => Object.keys(getPayerOverrides()).length, [overridesVersion]);

  const openPayer = (name: string) => {
    navigate(`/claims?insurer=${encodeURIComponent(name)}`);
  };

  const saveOverride = () => {
    if (!editing) return;
    const auto = autoClassifyPayer(editing.name);
    setPayerOverride(editing.name, editing.category === auto ? null : editing.category);
    setEditing(null);
  };

  const clearOverride = () => {
    if (!editing) return;
    setPayerOverride(editing.name, null);
    setEditing(null);
  };

  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-display text-foreground">Payers</h1>
            <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-2">
              {kpis.payers} payer{kpis.payers === 1 ? "" : "s"} • {kpis.claims} claim{kpis.claims === 1 ? "" : "s"}
              {durationDays != null && <span className="text-muted-foreground">• {durationDays}d window</span>}
              {loading && <Loader2 className="h-3 w-3 animate-spin" />}
              {isMock && !loading && <Badge variant="outline" className="text-[9px] py-0">Sample data</Badge>}
              {overrideCount > 0 && (
                <Badge variant="outline" className="text-[9px] py-0">{overrideCount} custom type{overrideCount === 1 ? "" : "s"}</Badge>
              )}
            </p>
          </div>
          <DateRangeQuickPicker />
        </div>

        <KpiGrid cols={4}>
          <KpiCard label="Total Payers" value={kpis.payers} loading={loading} icon={<Building2 className="h-3.5 w-3.5 text-primary" />} caption={category === "all" ? "All categories" : PAYER_CATEGORY_LABELS[category]} />
          <KpiCard label="Total Claims" value={kpis.claims} loading={loading} icon={<FileText className="h-3.5 w-3.5 text-secondary" />} />
          <KpiCard label="Outstanding" value={formatInr(kpis.outstanding)} loading={loading} icon={<IndianRupee className="h-3.5 w-3.5 text-warning" />} />
          <KpiCard label="SLA Breaches" tone="denial" value={kpis.breaches} loading={loading} icon={<AlertTriangle className="h-3.5 w-3.5 text-destructive" />} />
        </KpiGrid>

        <Card className="shadow-sm">
          <CardContent className="py-3 px-4 flex flex-wrap items-center gap-2">
            <Input
              placeholder="Search payer…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 text-sm max-w-xs"
            />
            <Select value={category} onValueChange={(v) => setCategory(v as CategoryFilter)}>
              <SelectTrigger className="w-48 h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["all", ...ALL_CATEGORIES] as CategoryFilter[]).map((c) => (
                  <SelectItem key={c} value={c}>
                    {PAYER_CATEGORY_LABELS[c]} ({categoryCounts[c]})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="ml-auto flex flex-wrap gap-1">
              {ALL_CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(category === c ? "all" : c)}
                  className={`text-[11px] px-2 py-0.5 rounded-full border transition ${
                    category === c ? CATEGORY_TONE[c] + " ring-2 ring-offset-1 ring-offset-background" : "bg-background text-muted-foreground border-border hover:border-foreground/30"
                  }`}
                >
                  {PAYER_CATEGORY_LABELS[c]} · {categoryCounts[c]}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card variant="flat" className="overflow-hidden">
          <Table wrapperClassName="max-h-[calc(100vh-380px)] min-h-[240px]">
            <TableHeader sticky>
              <TableRow>
                <TableHead>Payer</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Claims</TableHead>
                <TableHead className="text-right">Claimed</TableHead>
                <TableHead className="text-right">Approved</TableHead>
                <TableHead className="text-right">Settled</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
                <TableHead className="text-right">Breaches</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && filtered.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="py-10 text-center text-sm text-muted-foreground">Loading payers…</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-14">
                    <div className="flex flex-col items-center justify-center gap-2 text-center text-muted-foreground">
                      <Inbox className="h-7 w-7 opacity-60" />
                      <p className="text-sm font-medium text-foreground">No payers match this view</p>
                      <p className="text-xs">Try clearing the category filter, search, or date range.</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((r) => (
                  <TableRow
                    key={r.name}
                    className="cursor-pointer hover:bg-muted/40"
                    onClick={() => openPayer(r.name)}
                  >
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className={CATEGORY_TONE[r.category]}>
                          {PAYER_CATEGORY_LABELS[r.category]}
                        </Badge>
                        {r.isOverridden && (
                          <span className="text-[9px] text-muted-foreground" title={`Auto: ${PAYER_CATEGORY_LABELS[r.autoCategory]}`}>
                            edited
                          </span>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          title="Edit payer type"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditing({ name: r.name, category: r.category });
                          }}
                        >
                          <Pencil className="h-3 w-3 text-muted-foreground" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.claims}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatInr(r.claimed)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatInr(r.approved)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatInr(r.settled)}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{formatInr(r.outstanding)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.breaches > 0 ? <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">{r.breaches}</Badge> : <span className="text-muted-foreground">0</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={(e) => { e.stopPropagation(); openPayer(r.name); }}>
                        View claims <ChevronRight className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit payer type</DialogTitle>
            <DialogDescription>
              {editing && (
                <>Set the correct category for <span className="font-medium text-foreground">{editing.name}</span>. This applies across the dashboard and is saved on this device.</>
              )}
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="space-y-3 py-2">
              <div className="text-xs text-muted-foreground">
                Auto-detected: <span className="font-medium text-foreground">{PAYER_CATEGORY_LABELS[autoClassifyPayer(editing.name)]}</span>
              </div>
              <Select value={editing.category} onValueChange={(v) => setEditing({ ...editing, category: v as PayerCategory })}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALL_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{PAYER_CATEGORY_LABELS[c]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="ghost" size="sm" onClick={clearOverride} className="gap-1.5 mr-auto">
              <RotateCcw className="h-3.5 w-3.5" /> Reset to auto
            </Button>
            <Button variant="outline" size="sm" onClick={() => setEditing(null)}>Cancel</Button>
            <Button size="sm" onClick={saveOverride}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
