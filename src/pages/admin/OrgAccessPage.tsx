import { useMemo, useState } from "react";
import { Shield, Loader2, Search, Plus, Trash2, AlertTriangle } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useIsPlatformAdmin } from "@/hooks/useIsPlatformAdmin";
import { usePlatformApps, type PlatformApp } from "@/hooks/usePlatformApps";
import { useOrgAppAccess, type OrgAppAccessRow } from "@/hooks/useOrgAppAccess";
import { useEffect } from "react";

type Org = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
  mrr_inr: number;
};

export default function OrgAccessPage() {
  const { isAdmin, loading: adminLoading } = useIsPlatformAdmin();
  const { apps, loading: appsLoading } = usePlatformApps();
  const { rows: accessRows, loading: accessLoading, grant, update, revoke } = useOrgAppAccess(null);

  const [orgs, setOrgs] = useState<Org[]>([]);
  const [orgsLoading, setOrgsLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<{
    org: Org;
    app: PlatformApp;
    row: OrgAppAccessRow | null;
  } | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    (async () => {
      setOrgsLoading(true);
      const { data, error } = await supabase
        .from("organizations")
        .select("id,name,slug,plan,status,mrr_inr")
        .order("name");
      if (!cancelled) {
        if (error) console.error(error);
        setOrgs((data ?? []) as Org[]);
        setOrgsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isAdmin]);

  const accessByOrgApp = useMemo(() => {
    const m = new Map<string, OrgAppAccessRow>();
    accessRows.forEach((r) => m.set(`${r.org_id}::${r.app_id}`, r));
    return m;
  }, [accessRows]);

  const visibleApps = useMemo(
    () => apps.filter((a) => a.is_active && a.slug !== "admin"),
    [apps],
  );

  const filteredOrgs = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return orgs;
    return orgs.filter((o) => o.name.toLowerCase().includes(q) || o.slug.toLowerCase().includes(q));
  }, [orgs, query]);

  if (adminLoading) {
    return (
      <AppLayout>
        <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Checking permissions…
        </div>
      </AppLayout>
    );
  }

  if (!isAdmin) {
    return (
      <AppLayout>
        <Alert variant="destructive" className="m-6 max-w-lg">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>Platform admins only.</AlertDescription>
        </Alert>
      </AppLayout>
    );
  }

  const loading = appsLoading || accessLoading || orgsLoading;

  return (
    <AppLayout>
      <div className="space-y-4 p-4 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold">
              <Shield className="h-5 w-5 text-primary" /> Org Access
            </h1>
            <p className="text-sm text-muted-foreground">
              Grant hospitals access to Pro, Audit, Training and other products.
            </p>
          </div>
          <div className="relative w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search hospitals…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-8"
            />
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Hospital</th>
                    {visibleApps.map((a) => (
                      <th key={a.id} className="px-3 py-2 text-left">{a.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr>
                      <td colSpan={visibleApps.length + 1} className="px-3 py-8 text-center text-muted-foreground">
                        <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                      </td>
                    </tr>
                  )}
                  {!loading && filteredOrgs.length === 0 && (
                    <tr>
                      <td colSpan={visibleApps.length + 1} className="px-3 py-8 text-center text-muted-foreground">
                        No hospitals found.
                      </td>
                    </tr>
                  )}
                  {!loading && filteredOrgs.map((org) => (
                    <tr key={org.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-3 py-2">
                        <div className="font-medium">{org.name}</div>
                        <div className="text-xs text-muted-foreground">{org.slug} · {org.status}</div>
                      </td>
                      {visibleApps.map((app) => {
                        const row = accessByOrgApp.get(`${org.id}::${app.id}`) ?? null;
                        const granted = !!row && row.status === "active";
                        return (
                          <td key={app.id} className="px-3 py-2">
                            <button
                              type="button"
                              onClick={() => setEditing({ org, app, row })}
                              className={`inline-flex min-w-[88px] items-center justify-center gap-1.5 rounded-md border px-2 py-1 text-xs transition ${
                                granted
                                  ? "border-primary/40 bg-primary/10 text-primary hover:bg-primary/15"
                                  : "border-dashed border-muted-foreground/30 text-muted-foreground hover:bg-muted"
                              }`}
                            >
                              {granted ? (
                                <>
                                  <span className="capitalize">{row?.plan ?? "trial"}</span>
                                  {row?.mrr_inr ? <span className="opacity-70">· ₹{Number(row.mrr_inr).toLocaleString()}</span> : null}
                                </>
                              ) : (
                                <>
                                  <Plus className="h-3 w-3" /> Grant
                                </>
                              )}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground">
          Tip: click any chip to grant, edit, or revoke access. Status &amp; plan are stored in <code>org_app_access</code>.
        </p>
      </div>

      <AccessEditorSheet
        editing={editing}
        onClose={() => setEditing(null)}
        onGrant={grant}
        onUpdate={update}
        onRevoke={revoke}
      />
    </AppLayout>
  );
}

function AccessEditorSheet({
  editing,
  onClose,
  onGrant,
  onUpdate,
  onRevoke,
}: {
  editing: { org: Org; app: PlatformApp; row: OrgAppAccessRow | null } | null;
  onClose: () => void;
  onGrant: ReturnType<typeof useOrgAppAccess>["grant"];
  onUpdate: ReturnType<typeof useOrgAppAccess>["update"];
  onRevoke: ReturnType<typeof useOrgAppAccess>["revoke"];
}) {
  const [plan, setPlan] = useState("trial");
  const [status, setStatus] = useState("active");
  const [mrr, setMrr] = useState("0");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) return;
    const r = editing.row;
    setPlan(r?.plan ?? "trial");
    setStatus(r?.status ?? "active");
    setMrr(String(r?.mrr_inr ?? 0));
    setStart(r?.contract_start ?? "");
    setEnd(r?.contract_end ?? "");
  }, [editing]);

  if (!editing) return null;
  const { org, app, row } = editing;

  const save = async () => {
    setSaving(true);
    const payload = {
      plan,
      status,
      mrr_inr: Number(mrr) || 0,
      contract_start: start || null,
      contract_end: end || null,
    };
    const ok = row
      ? await onUpdate(row.id, payload)
      : await onGrant({ org_id: org.id, app_id: app.id, ...payload });
    setSaving(false);
    if (ok) onClose();
  };

  const handleRevoke = async () => {
    if (!row) return;
    if (!confirm(`Revoke ${app.name} for ${org.name}?`)) return;
    setSaving(true);
    const ok = await onRevoke(row.id);
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{app.name}</SheetTitle>
          <SheetDescription>
            Manage access for <span className="font-medium">{org.name}</span>.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 py-4">
          <div className="flex items-center gap-2">
            <Badge variant={row ? "default" : "secondary"}>
              {row ? "Granted" : "Not granted"}
            </Badge>
            {row && <Badge variant="outline" className="capitalize">{row.status}</Badge>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Plan</Label>
              <Select value={plan} onValueChange={setPlan}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="trial">Trial</SelectItem>
                  <SelectItem value="starter">Starter</SelectItem>
                  <SelectItem value="pro">Pro</SelectItem>
                  <SelectItem value="enterprise">Enterprise</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>MRR (₹)</Label>
            <Input type="number" min="0" value={mrr} onChange={(e) => setMrr(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Contract start</Label>
              <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Contract end</Label>
              <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
        </div>

        <SheetFooter className="flex-row justify-between gap-2 sm:justify-between">
          <div>
            {row && (
              <Button variant="ghost" size="sm" onClick={handleRevoke} disabled={saving} className="text-destructive">
                <Trash2 className="mr-1.5 h-4 w-4" /> Revoke
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {row ? "Save" : "Grant access"}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
