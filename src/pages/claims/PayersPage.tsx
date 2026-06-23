import { useMemo, useState } from "react";
import { useNavigate } from "@/lib/router-compat";
import { Building2, IndianRupee, FileText, AlertTriangle, Inbox, ChevronRight, Loader2 } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { KpiCard, KpiGrid } from "@/components/ui/kpi-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useLiveClaims } from "@/hooks/useLiveClaims";
import { formatInr } from "@/data/mockClaims";
import { classifyPayer, PAYER_CATEGORY_LABELS, type PayerCategory } from "@/lib/payerCategory";

type CategoryFilter = PayerCategory | "all";

interface PayerRow {
  name: string;
  category: PayerCategory;
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

export default function PayersPage() {
  const { claims, loading, isMock } = useLiveClaims();
  const navigate = useNavigate();
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [search, setSearch] = useState("");

  const rows = useMemo<PayerRow[]>(() => {
    const map = new Map<string, PayerRow>();
    for (const c of claims) {
      const name = (c.tpa_name || c.insurance_company_name || "Unknown").trim() || "Unknown";
      let r = map.get(name);
      if (!r) {
        r = {
          name,
          category: classifyPayer(name),
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
  }, [claims]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (category !== "all" && r.category !== category) return false;
      if (q && !r.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, category, search]);

  const kpis = useMemo(() => {
    return {
      payers: filtered.length,
      claims: filtered.reduce((s, r) => s + r.claims, 0),
      outstanding: filtered.reduce((s, r) => s + r.outstanding, 0),
      breaches: filtered.reduce((s, r) => s + r.breaches, 0),
    };
  }, [filtered]);

  const categoryCounts = useMemo(() => {
    const c: Record<CategoryFilter, number> = {
      all: rows.length, government: 0, psu: 0, tpa: 0, insurer: 0, aggregator: 0,
    };
    for (const r of rows) c[r.category] += 1;
    return c;
  }, [rows]);

  const openPayer = (name: string) => {
    navigate(`/claims?insurer=${encodeURIComponent(name)}`);
  };

  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-display text-foreground">Payers</h1>
            <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-2">
              {kpis.payers} payer{kpis.payers === 1 ? "" : "s"} • {kpis.claims} claim{kpis.claims === 1 ? "" : "s"}
              {loading && <Loader2 className="h-3 w-3 animate-spin" />}
              {isMock && !loading && <Badge variant="outline" className="text-[9px] py-0">Sample data</Badge>}
            </p>
          </div>
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
                {(["all", "government", "psu", "tpa", "insurer", "aggregator"] as CategoryFilter[]).map((c) => (
                  <SelectItem key={c} value={c}>
                    {PAYER_CATEGORY_LABELS[c]} ({categoryCounts[c]})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="ml-auto flex flex-wrap gap-1">
              {(["government", "psu", "tpa", "insurer", "aggregator"] as PayerCategory[]).map((c) => (
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
                      <p className="text-xs">Try clearing the category filter or search.</p>
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
                      <Badge variant="outline" className={CATEGORY_TONE[r.category]}>
                        {PAYER_CATEGORY_LABELS[r.category]}
                      </Badge>
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
    </AppLayout>
  );
}
