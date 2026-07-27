import { useEffect, useMemo, useState } from "react";
import { Eye, Loader2, ShieldAlert, Database } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useHospitals } from "@/hooks/useHospitals";
import { ROLES, type UserRole } from "@/hooks/useAppUsers";
import { useRolePermissions } from "@/hooks/useRolePermissions";

interface ClaimPreviewRow {
  id: string;
  patient_name: string;
  tpa_name: string;
  insurance_company_name: string | null;
  claim_status: string;
  claim_amount: number | null;
  hospital_branch_id: string | null;
}

export interface DataScopePreviewProps {
  /** Role being configured. When omitted the panel shows its own picker. */
  role?: UserRole;
  /** Branch scope currently staged in the form. */
  branchMode?: "all" | "restricted";
  branchIds?: string[];
  /** TPA/insurer allocations currently staged in the form. */
  providers?: string[];
  className?: string;
}

/**
 * "Data scope preview" — shows an admin exactly which claim rows a staff
 * member with the staged role + branch scope + TPA allocation would see,
 * before the change is saved. Read-only and advisory: RLS remains the
 * real boundary.
 */
export default function DataScopePreview({
  role: roleProp,
  branchMode: modeProp,
  branchIds: branchIdsProp,
  providers,
  className,
}: DataScopePreviewProps) {
  const { branches } = useHospitals();
  const { lookup } = useRolePermissions();
  const [role, setRole] = useState<UserRole>(roleProp ?? "Billing Executive");
  const [mode, setMode] = useState<"all" | "restricted">(modeProp ?? "all");
  const [branchIds, setBranchIds] = useState<string[]>(branchIdsProp ?? []);
  const [rows, setRows] = useState<ClaimPreviewRow[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (roleProp) setRole(roleProp); }, [roleProp]);
  useEffect(() => { if (modeProp) setMode(modeProp); }, [modeProp]);
  useEffect(() => { if (branchIdsProp) setBranchIds(branchIdsProp); }, [branchIdsProp]);

  const canViewClaims = Boolean(lookup.get(`${role}::claims`)?.can_view);
  const canExport = Boolean(lookup.get(`${role}::claims`)?.can_export);
  const canEdit = Boolean(lookup.get(`${role}::claims`)?.can_edit);

  const effectiveBranches = mode === "restricted" ? branchIds : [];
  const branchKey = effectiveBranches.slice().sort().join(",");
  const providerKey = (providers ?? []).slice().sort().join(",");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!canViewClaims) { setRows([]); setTotal(0); return; }
      setLoading(true);
      let q = supabase
        .from("claims")
        .select("id, patient_name, tpa_name, insurance_company_name, claim_status, claim_amount, hospital_branch_id", { count: "exact" })
        .order("created_at", { ascending: false })
        .limit(8);
      if (mode === "restricted") {
        if (effectiveBranches.length === 0) {
          if (!cancelled) { setRows([]); setTotal(0); setLoading(false); }
          return;
        }
        q = q.in("hospital_branch_id", effectiveBranches);
      }
      if ((providers ?? []).length > 0) q = q.in("tpa_name", providers as string[]);
      const { data, count } = await q;
      if (cancelled) return;
      setRows((data ?? []) as ClaimPreviewRow[]);
      setTotal(count ?? 0);
      setLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canViewClaims, mode, branchKey, providerKey]);

  const branchName = useMemo(() => {
    const map = new Map(branches.map((b) => [b.id, b.name]));
    return (id: string | null) => (id ? map.get(id) ?? "—" : "—");
  }, [branches]);

  return (
    <Card className={className}>
      <CardContent className="p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold flex items-center gap-2">
              <Eye className="h-4 w-4 text-primary" /> Data scope preview
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Exactly what claim rows this person will see once you save.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            {!roleProp && (
              <div className="min-w-[170px]">
                <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Role</label>
                <Select value={role} onValueChange={(v) => setRole(v as UserRole)}>
                  <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {!modeProp && (
              <div className="min-w-[170px]">
                <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Branch scope</label>
                <Select value={mode} onValueChange={(v) => setMode(v as "all" | "restricted")}>
                  <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All branches</SelectItem>
                    <SelectItem value="restricted">Selected branches</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </div>

        {!modeProp && mode === "restricted" && (
          <div className="flex flex-wrap gap-3 rounded-md border border-border bg-muted/30 p-3">
            {branches.length === 0 && <span className="text-xs text-muted-foreground">No branches yet.</span>}
            {branches.map((b) => (
              <label key={b.id} className="flex items-center gap-2 text-xs">
                <Checkbox
                  checked={branchIds.includes(b.id)}
                  onCheckedChange={(c) =>
                    setBranchIds((prev) => (c ? [...prev, b.id] : prev.filter((x) => x !== b.id)))
                  }
                />
                {b.name}
              </label>
            ))}
          </div>
        )}

        {!canViewClaims ? (
          <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs">
            <ShieldAlert className="h-4 w-4 text-destructive shrink-0" />
            <span>
              <strong>{role}</strong> has no <em>view</em> permission on Claims, so this person will see
              zero claim rows. Enable it on Settings → Permissions first.
            </span>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="outline" className="gap-1">
                <Database className="h-3 w-3" />
                {loading ? "counting…" : `${total.toLocaleString("en-IN")} claim rows visible`}
              </Badge>
              <Badge variant="outline">{mode === "all" ? "All branches" : `${effectiveBranches.length} branch(es)`}</Badge>
              <Badge variant="outline">
                {(providers ?? []).length > 0 ? `${providers!.length} payer(s) allocated` : "All payers"}
              </Badge>
              <Badge variant="outline">{canEdit ? "Can edit" : "Read-only"}</Badge>
              <Badge variant="outline">{canExport ? "Can export" : "No export"}</Badge>
            </div>

            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="text-left p-2 font-medium">Patient</th>
                    <th className="text-left p-2 font-medium">Payer</th>
                    <th className="text-left p-2 font-medium">Branch</th>
                    <th className="text-left p-2 font-medium">Status</th>
                    <th className="text-right p-2 font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin inline" /> Loading sample…
                    </td></tr>
                  )}
                  {!loading && rows.length === 0 && (
                    <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">
                      No claim rows match this scope.
                    </td></tr>
                  )}
                  {!loading && rows.map((r) => (
                    <tr key={r.id} className="border-t border-border">
                      <td className="p-2">{r.patient_name}</td>
                      <td className="p-2">{r.tpa_name || r.insurance_company_name || "—"}</td>
                      <td className="p-2">{branchName(r.hospital_branch_id)}</td>
                      <td className="p-2">{r.claim_status}</td>
                      <td className="p-2 text-right tabular-nums">
                        {r.claim_amount != null ? `₹${Number(r.claim_amount).toLocaleString("en-IN")}` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Showing up to 8 of {total.toLocaleString("en-IN")} rows. Preview is advisory — the database
              enforces the same branch and payer restrictions server-side.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
