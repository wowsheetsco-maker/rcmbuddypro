import { useMemo, useState } from "react";
import {
  Landmark, Search, RefreshCw, Download, ShieldCheck, Clock, User, ArrowRight,
} from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAccessAuditLog } from "@/hooks/useAccessAuditLog";
import { ENTITY_LABELS, type AccessAuditEntity } from "@/lib/accessAudit";
import { useHospitals } from "@/hooks/useHospitals";

const ENTITY_OPTIONS = Object.keys(ENTITY_LABELS) as AccessAuditEntity[];

function fmt(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

function preview(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export default function AccessAuditLogPage() {
  const [entity, setEntity] = useState<string>("all");
  const [branchId, setBranchId] = useState<string>("all");
  const [days, setDays] = useState<number>(90);
  const [query, setQuery] = useState("");
  const { branches } = useHospitals();
  const { rows, loading, refresh } = useAccessAuditLog({ entity, branchId, days });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.summary, r.actor_email, r.target_email, r.action, r.entity]
        .some((f) => (f ?? "").toLowerCase().includes(q)),
    );
  }, [rows, query]);

  const branchName = useMemo(() => {
    const map = new Map(branches.map((b) => [b.id, b.name]));
    return (id: string | null) => (id ? map.get(id) ?? "Unknown branch" : "All branches");
  }, [branches]);

  const exportCsv = () => {
    const head = ["When", "Actor", "Area", "Action", "Target", "Branch", "Summary", "Before", "After"];
    const body = filtered.map((r) => [
      fmt(r.created_at), r.actor_email ?? "", ENTITY_LABELS[r.entity as AccessAuditEntity] ?? r.entity,
      r.action, r.target_email ?? "", branchName(r.branch_id), r.summary,
      preview(r.before_value), preview(r.after_value),
    ]);
    const csv = [head, ...body]
      .map((line) => line.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `access-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AppLayout>
      <div className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-display text-foreground flex items-center gap-2">
              <Landmark className="h-5 w-5 text-primary" />
              Access Audit Log
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Every role change, permission toggle and scope update — per hospital and branch. Entries are
              append-only and cannot be edited or deleted.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void refresh()}>
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={exportCsv} disabled={filtered.length === 0}>
              <Download className="h-3.5 w-3.5" /> Export CSV
            </Button>
          </div>
        </div>

        <Card>
          <CardContent className="p-4 flex flex-wrap items-end gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8 h-9"
                placeholder="Search person, action or summary…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="min-w-[170px]">
              <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Area</label>
              <Select value={entity} onValueChange={setEntity}>
                <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All areas</SelectItem>
                  {ENTITY_OPTIONS.map((e) => (
                    <SelectItem key={e} value={e}>{ENTITY_LABELS[e]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[180px]">
              <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Branch</label>
              <Select value={branchId} onValueChange={setBranchId}>
                <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All branches</SelectItem>
                  {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[150px]">
              <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Period</label>
              <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
                <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Last 7 days</SelectItem>
                  <SelectItem value="30">Last 30 days</SelectItem>
                  <SelectItem value="90">Last 90 days</SelectItem>
                  <SelectItem value="365">Last 12 months</SelectItem>
                  <SelectItem value="0">All time</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Badge variant="outline" className="h-9 px-3 flex items-center">
              {loading ? "…" : `${filtered.length} entr${filtered.length === 1 ? "y" : "ies"}`}
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="text-left p-3 font-medium whitespace-nowrap">When</th>
                    <th className="text-left p-3 font-medium">Who changed it</th>
                    <th className="text-left p-3 font-medium">Area</th>
                    <th className="text-left p-3 font-medium">Affected</th>
                    <th className="text-left p-3 font-medium">Branch</th>
                    <th className="text-left p-3 font-medium">What changed</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Loading audit trail…</td></tr>
                  )}
                  {!loading && filtered.length === 0 && (
                    <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">
                      No access changes recorded for this filter yet.
                    </td></tr>
                  )}
                  {!loading && filtered.map((r) => (
                    <tr key={r.id} className="border-t border-border align-top">
                      <td className="p-3 whitespace-nowrap text-muted-foreground">
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{fmt(r.created_at)}</span>
                      </td>
                      <td className="p-3">
                        <span className="flex items-center gap-1"><User className="h-3 w-3 text-muted-foreground" />{r.actor_email ?? "—"}</span>
                      </td>
                      <td className="p-3">
                        <Badge variant="outline" className="text-[10px] font-normal">
                          {ENTITY_LABELS[r.entity as AccessAuditEntity] ?? r.entity}
                        </Badge>
                        <span className="block text-[10px] text-muted-foreground mt-1">{r.action}</span>
                      </td>
                      <td className="p-3">{r.target_email ?? "—"}</td>
                      <td className="p-3">{branchName(r.branch_id)}</td>
                      <td className="p-3">
                        <span className="block">{r.summary}</span>
                        {(r.before_value != null || r.after_value != null) && (
                          <span className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                            <code className="rounded bg-muted px-1">{preview(r.before_value)}</code>
                            <ArrowRight className="h-3 w-3" />
                            <code className="rounded bg-muted px-1">{preview(r.after_value)}</code>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <p className="text-[11px] text-muted-foreground flex items-center gap-1">
          <ShieldCheck className="h-3.5 w-3.5" />
          Only members of your hospital can read this log, and no one can alter past entries.
        </p>
      </div>
    </AppLayout>
  );
}
