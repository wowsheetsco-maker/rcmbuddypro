import { useEffect, useMemo, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, Clock, Download, Stethoscope, BedDouble, UserSquare2 } from "lucide-react";
import { toast } from "sonner";

type Dimension = "treating_doctor" | "ward" | "coder_name";

interface Row {
  discharge: string;
  submission: string | null;
  status: string;
  doctor: string | null;
  ward: string | null;
  coder: string | null;
}

interface AggRow {
  key: string;
  claims: number;
  pending: number;      // discharged but not submitted
  submitted: number;
  breaches: number;     // TAT > threshold
  avgTat: number;       // days
  maxTat: number;
  worstAge: number;     // pending oldest age
}

const SETTLED = new Set(["settled", "paid", "closed", "claim settled"]);
const THRESHOLD_KEY = "rcm-buddy-tat-threshold";

function daysBetween(a: string, b: string): number {
  const t1 = new Date(a).getTime();
  const t2 = new Date(b).getTime();
  if (Number.isNaN(t1) || Number.isNaN(t2)) return 0;
  return Math.max(0, Math.floor((t2 - t1) / 86_400_000));
}

function aggregate(rows: Row[], dim: Dimension, threshold: number): AggRow[] {
  const today = new Date().toISOString().slice(0, 10);
  const map = new Map<string, AggRow>();
  for (const r of rows) {
    const val = dim === "treating_doctor" ? r.doctor : dim === "ward" ? r.ward : r.coder;
    const key = (val || "").trim() || "— Unassigned —";
    let agg = map.get(key);
    if (!agg) {
      agg = { key, claims: 0, pending: 0, submitted: 0, breaches: 0, avgTat: 0, maxTat: 0, worstAge: 0 };
      map.set(key, agg);
    }
    agg.claims += 1;
    const status = (r.status || "").toLowerCase().trim();
    const isSettled = SETTLED.has(status);
    const hasSub = !!r.submission;
    const endDate = r.submission || today;
    const tat = daysBetween(r.discharge, endDate);
    if (hasSub) {
      agg.submitted += 1;
      agg.avgTat += tat;
      if (tat > agg.maxTat) agg.maxTat = tat;
      if (tat > threshold) agg.breaches += 1;
    } else if (!isSettled) {
      agg.pending += 1;
      if (tat > agg.worstAge) agg.worstAge = tat;
      if (tat > threshold) agg.breaches += 1;
    }
  }
  return Array.from(map.values()).map((a) => ({
    ...a,
    avgTat: a.submitted > 0 ? +(a.avgTat / a.submitted).toFixed(1) : 0,
  })).sort((a, b) => b.breaches - a.breaches || b.pending - a.pending);
}

function toCsv(rows: AggRow[], label: string): string {
  const header = [label, "Claims", "Submitted", "Pending", "Breaches", "Avg TAT (d)", "Max TAT (d)", "Oldest Pending (d)"].join(",");
  const body = rows.map((r) => [
    JSON.stringify(r.key), r.claims, r.submitted, r.pending, r.breaches, r.avgTat, r.maxTat, r.worstAge,
  ].join(","));
  return [header, ...body].join("\n");
}

function useRows() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data, error: err } = await supabase
        .from("claims")
        .select("date_of_discharge, doc_submission_date, claim_status, treating_doctor, ward, coder_name")
        .not("date_of_discharge", "is", null)
        .limit(10000);
      if (cancelled) return;
      if (err) { setError(err.message); setRows([]); return; }
      const mapped: Row[] = (data ?? []).map((r: Record<string, unknown>) => ({
        discharge: (r.date_of_discharge as string) ?? "",
        submission: (r.doc_submission_date as string) ?? null,
        status: (r.claim_status as string) ?? "",
        doctor: (r.treating_doctor as string) ?? null,
        ward: (r.ward as string) ?? null,
        coder: (r.coder_name as string) ?? null,
      })).filter((r) => r.discharge);
      setRows(mapped);
    };
    void load();
    const ch = supabase
      .channel("submission-tat-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "claims" }, () => void load())
      .subscribe();
    return () => { cancelled = true; void supabase.removeChannel(ch); };
  }, []);
  return { rows, error };
}

function BreachBadge({ n }: { n: number }) {
  if (n === 0) return <Badge variant="secondary">On track</Badge>;
  return (
    <Badge className="bg-red-100 text-red-800 hover:bg-red-100 border border-red-200">
      {n} breach{n === 1 ? "" : "es"}
    </Badge>
  );
}

function TatTable({ rows, threshold, label }: { rows: AggRow[]; threshold: number; label: string }) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? rows.filter((r) => r.key.toLowerCase().includes(needle)) : rows;
  }, [rows, q]);

  const handleExport = () => {
    const csv = toCsv(filtered, label);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `submission-tat-${label.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    toast.success("Exported");
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Input
          className="max-w-xs"
          placeholder={`Search ${label.toLowerCase()}…`}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download className="h-4 w-4 mr-1" /> Export CSV
        </Button>
      </div>
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{label}</TableHead>
              <TableHead className="text-right">Claims</TableHead>
              <TableHead className="text-right">Submitted</TableHead>
              <TableHead className="text-right">Pending</TableHead>
              <TableHead className="text-right">Avg TAT</TableHead>
              <TableHead className="text-right">Max TAT</TableHead>
              <TableHead className="text-right">Oldest pending</TableHead>
              <TableHead>Status (SLA {threshold}d)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No data yet. Ensure claims have {label.toLowerCase()} assigned.</TableCell></TableRow>
            ) : filtered.map((r) => (
              <TableRow key={r.key} className={r.breaches > 0 ? "bg-red-50/40" : ""}>
                <TableCell className="font-medium">{r.key}</TableCell>
                <TableCell className="text-right">{r.claims}</TableCell>
                <TableCell className="text-right">{r.submitted}</TableCell>
                <TableCell className="text-right">{r.pending}</TableCell>
                <TableCell className="text-right">{r.avgTat} d</TableCell>
                <TableCell className={`text-right ${r.maxTat > threshold ? "text-red-600 font-medium" : ""}`}>{r.maxTat} d</TableCell>
                <TableCell className={`text-right ${r.worstAge > threshold ? "text-red-600 font-medium" : ""}`}>{r.worstAge} d</TableCell>
                <TableCell><BreachBadge n={r.breaches} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export default function SubmissionTatPage() {
  const { rows, error } = useRows();
  const [threshold, setThreshold] = useState<number>(() => {
    if (typeof window === "undefined") return 7;
    const raw = localStorage.getItem(THRESHOLD_KEY);
    const n = raw ? Number(raw) : 7;
    return Number.isFinite(n) && n > 0 ? n : 7;
  });
  useEffect(() => {
    try { localStorage.setItem(THRESHOLD_KEY, String(threshold)); } catch { /* ignore */ }
  }, [threshold]);

  const byDoctor = useMemo(() => rows ? aggregate(rows, "treating_doctor", threshold) : [], [rows, threshold]);
  const byWard   = useMemo(() => rows ? aggregate(rows, "ward", threshold) : [], [rows, threshold]);
  const byCoder  = useMemo(() => rows ? aggregate(rows, "coder_name", threshold) : [], [rows, threshold]);

  const totalBreaches = useMemo(() => {
    if (!rows) return 0;
    const today = new Date().toISOString().slice(0, 10);
    let n = 0;
    for (const r of rows) {
      const status = (r.status || "").toLowerCase().trim();
      const isSettled = SETTLED.has(status);
      const end = r.submission || today;
      if (!r.submission && isSettled) continue;
      if (daysBetween(r.discharge, end) > threshold) n += 1;
    }
    return n;
  }, [rows, threshold]);

  const totalPending = useMemo(() => {
    if (!rows) return 0;
    return rows.filter((r) => !r.submission && !SETTLED.has((r.status || "").toLowerCase().trim())).length;
  }, [rows]);

  const loading = rows === null;

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <Clock className="h-6 w-6 text-primary" /> Submission TAT
            </h1>
            <p className="text-sm text-muted-foreground">
              Discharge → document-submission turnaround by doctor, ward and coder. 70% of denials trace back to submission delay — fix the top of the funnel first.
            </p>
          </div>
          <div className="flex items-end gap-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">SLA breach threshold (days)</label>
              <Input
                type="number"
                min={1}
                max={60}
                className="w-28"
                value={threshold}
                onChange={(e) => setThreshold(Math.max(1, Math.min(60, Number(e.target.value) || 7)))}
              />
            </div>
          </div>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Couldn't load claims</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {totalBreaches > 0 && !loading && (
          <Alert className="border-red-200 bg-red-50">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <AlertTitle className="text-red-900">
              {totalBreaches} claim{totalBreaches === 1 ? "" : "s"} past the {threshold}-day submission SLA
            </AlertTitle>
            <AlertDescription className="text-red-800">
              {totalPending} still un-submitted. Every extra day past discharge lifts denial probability ~2-3%.
              Drill into the tabs below to see who's driving the breach.
            </AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Discharged claims tracked</CardTitle></CardHeader>
            <CardContent className="text-2xl font-semibold">{loading ? <Skeleton className="h-8 w-16" /> : rows.length}</CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Pending submission</CardTitle></CardHeader>
            <CardContent className="text-2xl font-semibold text-amber-700">{loading ? <Skeleton className="h-8 w-16" /> : totalPending}</CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">SLA breaches</CardTitle></CardHeader>
            <CardContent className="text-2xl font-semibold text-red-700">{loading ? <Skeleton className="h-8 w-16" /> : totalBreaches}</CardContent></Card>
        </div>

        <Tabs defaultValue="doctor" className="w-full">
          <TabsList>
            <TabsTrigger value="doctor"><Stethoscope className="h-4 w-4 mr-1" /> Doctor</TabsTrigger>
            <TabsTrigger value="ward"><BedDouble className="h-4 w-4 mr-1" /> Ward</TabsTrigger>
            <TabsTrigger value="coder"><UserSquare2 className="h-4 w-4 mr-1" /> Coder</TabsTrigger>
          </TabsList>
          <TabsContent value="doctor" className="mt-4">
            {loading ? <Skeleton className="h-64 w-full" /> : <TatTable rows={byDoctor} threshold={threshold} label="Doctor" />}
          </TabsContent>
          <TabsContent value="ward" className="mt-4">
            {loading ? <Skeleton className="h-64 w-full" /> : <TatTable rows={byWard} threshold={threshold} label="Ward" />}
          </TabsContent>
          <TabsContent value="coder" className="mt-4">
            {loading ? <Skeleton className="h-64 w-full" /> : <TatTable rows={byCoder} threshold={threshold} label="Coder" />}
          </TabsContent>
        </Tabs>

        <p className="text-xs text-muted-foreground">
          TAT is computed as days between discharge date and document submission date; un-submitted (and not-yet-settled) claims use today's date so ageing is always visible.
        </p>
      </div>
    </AppLayout>
  );
}
