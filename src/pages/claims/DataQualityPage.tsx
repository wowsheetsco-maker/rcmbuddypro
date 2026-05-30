// Standalone /claims/data-quality dashboard.
// - Loads existing claims from DB and re-scores them with the current rules
// - "Scan all claims" persists the freshly computed data_quality JSON back per row
// - Drill-down table of error / critical rows with their specific issues

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, ShieldCheck, RefreshCw, Search, Filter, Download, Trash2 } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useDqRules } from "@/hooks/useDqRules";
import {
  scoreMany,
  summarise,
  STATUS_BUCKET_LABELS,
  type DqResult,
  type DqTag,
  type DqClaim,
} from "@/lib/dataQualityEngine";
import DataQualitySummaryCard, { TAG_META } from "@/components/DataQualitySummaryCard";

const PAGE_SIZE = 50;
const SCAN_BATCH = 200;

interface ClaimRow extends DqClaim {
  id: string;
}

export default function DataQualityPage() {
  const { rules } = useDqRules();
  const [claims, setClaims] = useState<ClaimRow[]>([]);
  const [results, setResults] = useState<DqResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [filterTag, setFilterTag] = useState<DqTag | "all">("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [purgeOpen, setPurgeOpen] = useState(false);
  const [purging, setPurging] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    // pull a wide slice — DB capped at 1000 by default
    const { data, error } = await supabase
      .from("claims")
      .select(
        "id,claim_number,patient_name,tpa_name,insurance_company_name,claim_status,claim_creation_date,date_of_admission,date_of_discharge,doc_submission_date,payment_update_date,in_patient_number,policy_number,claimed_amount,approved_amount,settled_amount,outstanding_amount,treatment",
      )
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) {
      toast.error("Failed to load claims", { description: error.message });
      setLoading(false);
      return;
    }
    setClaims((data ?? []) as ClaimRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Re-score whenever claims OR rules change — pure client work
  useEffect(() => {
    if (claims.length === 0) {
      setResults([]);
      return;
    }
    setResults(scoreMany(claims, rules));
  }, [claims, rules]);

  const summary = useMemo(() => summarise(claims, results, rules), [claims, results, rules]);

  // Persist scored data_quality back to the DB for each row
  const runFullScan = async () => {
    if (claims.length === 0 || results.length === 0) return;
    setScanning(true);
    setScanProgress(0);
    let written = 0;
    let failed = 0;
    for (let i = 0; i < claims.length; i += SCAN_BATCH) {
      const slice = claims.slice(i, i + SCAN_BATCH);
      const sliceResults = results.slice(i, i + SCAN_BATCH);
      // Update one-by-one within the batch (no bulk JSONB update via supabase-js,
      // and we want per-row payloads anyway).
      const updates = slice.map((c, j) =>
        supabase
          .from("claims")
          .update({ data_quality: JSON.parse(JSON.stringify(sliceResults[j])) })
          .eq("id", c.id),
      );
      const settled = await Promise.allSettled(updates);
      settled.forEach((r) => {
        if (r.status === "fulfilled" && !r.value.error) written++;
        else failed++;
      });
      setScanProgress(Math.round(((i + slice.length) / claims.length) * 100));
    }
    setScanning(false);
    if (failed === 0) {
      toast.success(`Scan complete · ${written} claims tagged`);
    } else {
      toast.warning(`Scan finished with ${failed} failures (${written} updated)`);
    }
  };

  const removableIds = useMemo(
    () => results
      .map((r, i) => (r.removable ? claims[i].id : null))
      .filter((x): x is string => !!x),
    [results, claims],
  );

  const purgeRemovable = async () => {
    if (removableIds.length === 0) return;
    setPurging(true);
    let deleted = 0;
    let failed = 0;
    // Chunk into 100s to keep URLs sane
    for (let i = 0; i < removableIds.length; i += 100) {
      const chunk = removableIds.slice(i, i + 100);
      const { error } = await supabase.from("claims").delete().in("id", chunk);
      if (error) failed += chunk.length;
      else deleted += chunk.length;
    }
    setPurging(false);
    setPurgeOpen(false);
    if (failed === 0) {
      toast.success(`Removed ${deleted} empty rows`);
    } else {
      toast.warning(`Removed ${deleted} · ${failed} failed`);
    }
    void load();
  };

  const filteredIdx = useMemo(() => {
    const q = search.trim().toLowerCase();
    return results
      .map((_, i) => i)
      .filter((i) => {
        const r = results[i];
        if (filterTag !== "all" && r.tag !== filterTag) return false;
        if (!q) return true;
        const c = claims[i];
        return (
          c.claim_number?.toLowerCase().includes(q) ||
          (c.patient_name ?? "").toLowerCase().includes(q) ||
          (c.tpa_name ?? "").toLowerCase().includes(q)
        );
      });
  }, [results, claims, filterTag, search]);

  const pageRows = filteredIdx.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(filteredIdx.length / PAGE_SIZE));

  const exportErrorSheet = () => {
    const rows = filteredIdx
      .filter((i) => results[i].tag !== "clean")
      .map((i) => {
        const c = claims[i];
        const r = results[i];
        return {
          claim_number: c.claim_number,
          patient_name: c.patient_name ?? "",
          tpa_name: c.tpa_name ?? "",
          status: c.claim_status ?? "",
          tag: r.tag,
          issues: r.issues.map((x) => `[L${x.layer}/${x.severity}] ${x.code}: ${x.message}`).join(" | "),
        };
      });
    if (rows.length === 0) {
      toast.info("No issues to export in current filter");
      return;
    }
    const headers = Object.keys(rows[0]);
    const csv = [
      headers.join(","),
      ...rows.map((r) =>
        headers
          .map((h) => {
            const v = String(r[h as keyof typeof r] ?? "");
            return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
          })
          .join(","),
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `data-quality-issues-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${rows.length} flagged rows`);
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-display text-foreground flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Data Quality
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              4-layer RCM validation across {claims.length.toLocaleString("en-IN")} loaded claims
              {summary.includedCount !== claims.length && (
                <> · <span className="font-medium text-foreground">{summary.includedCount.toLocaleString("en-IN")} included</span> after the inclusion gate (claim no, status, approved &gt; 0, no duplicates)</>
              )}.
              Adjust thresholds in <span className="font-medium">Settings → DQ Rules</span>.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading || scanning}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Reload
            </Button>
            <Button variant="outline" size="sm" onClick={exportErrorSheet} disabled={loading}>
              <Download className="h-4 w-4" /> Export issues
            </Button>
            {removableIds.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPurgeOpen(true)}
                disabled={loading || scanning || purging}
                className="border-warning/40 text-warning hover:bg-warning/10"
              >
                <Trash2 className="h-4 w-4" /> Remove {removableIds.length} excluded
              </Button>
            )}
            <Button size="sm" onClick={runFullScan} disabled={loading || scanning || claims.length === 0}>
              {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              Scan all claims
            </Button>
          </div>
        </div>

        <AlertDialog open={purgeOpen} onOpenChange={setPurgeOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove {removableIds.length} excluded rows?</AlertDialogTitle>
              <AlertDialogDescription>
                These rows fail the inclusion gate: missing claim number, missing status,
                approved amount ≤ 0, or duplicate claim number. They are excluded from
                dashboards and analytics. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={purging}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => { e.preventDefault(); void purgeRemovable(); }}
                disabled={purging}
                className="bg-destructive hover:bg-destructive/90"
              >
                {purging ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                Remove rows
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {scanning && (
          <Card>
            <CardContent className="p-4 space-y-2">
              <div className="flex justify-between text-xs">
                <span>Scanning & persisting tags…</span>
                <span className="tabular-nums">{scanProgress}%</span>
              </div>
              <Progress value={scanProgress} />
            </CardContent>
          </Card>
        )}

        {loading ? (
          <Card>
            <CardContent className="py-16 text-center text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" /> Scoring claims…
            </CardContent>
          </Card>
        ) : (
          <>
            <DataQualitySummaryCard summary={summary} results={results} />

            <Card className="shadow-sm">
              <CardHeader className="pb-3 flex flex-row items-center justify-between gap-3 flex-wrap">
                <CardTitle className="text-base flex items-center gap-2">
                  <Filter className="h-4 w-4 text-primary" />
                  Flagged claims
                  <Badge variant="outline" className="ml-1 text-[10px]">
                    {filteredIdx.length.toLocaleString("en-IN")}
                  </Badge>
                </CardTitle>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(e) => {
                        setSearch(e.target.value);
                        setPage(0);
                      }}
                      placeholder="Search claim / patient / TPA…"
                      className="h-9 pl-8 w-64 text-xs"
                    />
                  </div>
                  <Select
                    value={filterTag}
                    onValueChange={(v) => {
                      setFilterTag(v as DqTag | "all");
                      setPage(0);
                    }}
                  >
                    <SelectTrigger className="h-9 w-36 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All tags</SelectItem>
                      <SelectItem value="clean">Clean</SelectItem>
                      <SelectItem value="warning">Warning</SelectItem>
                      <SelectItem value="error">Error</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <Table dense>
                  <TableHeader sticky>
                    <TableRow>
                      <TableHead>Tag</TableHead>
                      <TableHead>Claim #</TableHead>
                      <TableHead priority="secondary">Patient</TableHead>
                      <TableHead priority="secondary">TPA</TableHead>
                      <TableHead priority="tertiary">Status</TableHead>
                      <TableHead priority="tertiary">Bucket</TableHead>
                      <TableHead>Issues</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageRows.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                          No rows match the current filter.
                        </TableCell>
                      </TableRow>
                    )}
                    {pageRows.map((idx) => {
                      const c = claims[idx];
                      const r = results[idx];
                      const meta = TAG_META[r.tag];
                      const Icon = meta.icon;
                      const bucketLabel = r.statusBucket ? STATUS_BUCKET_LABELS[r.statusBucket] : "—";
                      return (
                        <TableRow key={c.id} className="align-top">
                          <TableCell>
                            <Badge className={`${meta.chipCls} text-[10px] gap-1`}>
                              <Icon className="h-3 w-3" /> {meta.label}
                            </Badge>
                            {r.removable && (
                              <Badge variant="outline" className="mt-1 text-[9px] gap-1 border-warning/40 text-warning">
                                <Trash2 className="h-2.5 w-2.5" /> Excluded
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="font-mono">{c.claim_number}</TableCell>
                          <TableCell priority="secondary">{c.patient_name}</TableCell>
                          <TableCell priority="secondary">{c.tpa_name ?? "—"}</TableCell>
                          <TableCell priority="tertiary">{c.claim_status ?? "—"}</TableCell>
                          <TableCell priority="tertiary">
                            <Badge
                              variant="outline"
                              className={`text-[10px] ${
                                r.statusBucket === "settled" ? "border-accent text-accent" :
                                r.statusBucket === "denial" || r.statusBucket === "cashless_denied" ? "border-destructive text-destructive" :
                                r.statusBucket === "unknown" ? "border-muted-foreground text-muted-foreground" : ""
                              }`}
                            >
                              {bucketLabel}
                            </Badge>
                            {r.imputedSubmissionDate && (
                              <div className="text-[9px] text-primary mt-0.5">
                                ✨ sub date imputed
                              </div>
                            )}
                            {r.bucketOverridden && (
                              <div className="text-[9px] text-warning mt-0.5">
                                ⚡ approved=0 override
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            {r.issues.length === 0 ? (
                              <span className="text-muted-foreground">—</span>
                            ) : (
                              <ul className="space-y-0.5">
                                {r.issues.slice(0, 4).map((i, k) => (
                                  <li key={k} className="text-[11px]">
                                    <span
                                      className={`mr-1 font-mono text-[9px] uppercase ${
                                        i.severity === "critical" || i.severity === "error"
                                          ? "text-destructive"
                                          : i.severity === "warning"
                                            ? "text-warning"
                                            : "text-muted-foreground"
                                      }`}
                                    >
                                      L{i.layer}
                                    </span>
                                    {i.message}
                                  </li>
                                ))}
                                {r.issues.length > 4 && (
                                  <li className="text-[10px] text-muted-foreground">
                                    +{r.issues.length - 4} more
                                  </li>
                                )}
                              </ul>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                {totalPages > 1 && (
                  <div className="flex items-center justify-between p-3 border-t text-xs">
                    <span className="text-muted-foreground">
                      Page {page + 1} of {totalPages}
                    </span>
                    <div className="flex gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage((p) => Math.max(0, p - 1))}
                        disabled={page === 0}
                      >
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                        disabled={page >= totalPages - 1}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppLayout>
  );
}
