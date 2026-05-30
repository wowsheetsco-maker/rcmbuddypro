import { useEffect, useMemo, useState } from "react";
import {
  Shield, Building2, Users, Layers, KeyRound, BarChart3,
  Plus, Trash2, Loader2, Copy, Check, AlertTriangle, RefreshCw,
} from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useIsPlatformAdmin } from "@/hooks/useIsPlatformAdmin";

// ---------- Types ----------

type PlatformApp = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  is_active: boolean;
};

type Organization = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
  billing_email: string | null;
  mrr_inr: number;
  created_at: string;
};

type OrgAppAccess = {
  id: string;
  org_id: string;
  app_id: string;
  plan: string;
  status: string;
  mrr_inr: number;
  contract_start: string | null;
  contract_end: string | null;
};

type AppUser = {
  id: string;
  org_id: string;
  name: string;
  email: string;
  role: string;
  status: string;
};

type ApiToken = {
  id: string;
  org_id: string;
  name: string;
  prefix: string;
  scopes: string[];
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
};

type TokenUsageDaily = {
  org_id: string;
  app_id: string;
  day: string;
  calls: number;
  tokens_in: number;
  tokens_out: number;
  cost_inr: number;
};

type HospitalKpi = {
  org_id: string;
  app_id: string;
  period: string;
  metric: string;
  value: number;
};

const PLAN_OPTIONS = ["trial", "starter", "pro", "enterprise"] as const;
const STATUS_OPTIONS = ["active", "paused", "cancelled"] as const;

// ---------- Helpers ----------

function fmtInr(n: number) {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n);
}

async function sha256Hex(input: string) {
  const enc = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function generateApiToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const body = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  const prefix = `rcm_${body.slice(0, 6)}`;
  return { token: `${prefix}_${body.slice(6)}`, prefix };
}

// ---------- Page ----------

export default function ControlPanelPage() {
  const { isAdmin, loading: adminLoading } = useIsPlatformAdmin();

  if (adminLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-24 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Checking access…
        </div>
      </AppLayout>
    );
  }

  if (!isAdmin) {
    return (
      <AppLayout>
        <div className="max-w-2xl mx-auto py-16">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              The Control Panel is restricted to platform administrators.
              Your account is not listed in <code>platform_admins</code>.
            </AlertDescription>
          </Alert>
        </div>
      </AppLayout>
    );
  }

  return <ControlPanelInner />;
}

function ControlPanelInner() {
  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-primary to-primary/70 grid place-items-center text-primary-foreground">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Control Panel</h1>
              <p className="text-sm text-muted-foreground">
                Manage hospitals, users, plans, API tokens & performance across all RCM platforms.
              </p>
            </div>
          </div>
        </header>

        <Tabs defaultValue="hospitals" className="space-y-4">
          <TabsList className="grid grid-cols-2 md:grid-cols-5 w-full">
            <TabsTrigger value="hospitals"><Building2 className="h-4 w-4 mr-1.5" />Hospitals</TabsTrigger>
            <TabsTrigger value="users"><Users className="h-4 w-4 mr-1.5" />Users</TabsTrigger>
            <TabsTrigger value="plans"><Layers className="h-4 w-4 mr-1.5" />App Access</TabsTrigger>
            <TabsTrigger value="tokens"><KeyRound className="h-4 w-4 mr-1.5" />API Tokens</TabsTrigger>
            <TabsTrigger value="performance"><BarChart3 className="h-4 w-4 mr-1.5" />Performance</TabsTrigger>
          </TabsList>

          <TabsContent value="hospitals"><HospitalsTab /></TabsContent>
          <TabsContent value="users"><UsersTab /></TabsContent>
          <TabsContent value="plans"><AppAccessTab /></TabsContent>
          <TabsContent value="tokens"><TokensTab /></TabsContent>
          <TabsContent value="performance"><PerformanceTab /></TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}

// ---------- Shared loader ----------

function useOrgs() {
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("organizations")
        .select("id,name,slug,plan,status,billing_email,mrr_inr,created_at")
        .order("name");
      if (!cancelled) {
        if (error) toast.error(`Failed to load hospitals: ${error.message}`);
        setOrgs((data ?? []) as Organization[]);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [version]);

  return { orgs, loading, refresh: () => setVersion((v) => v + 1) };
}

function usePlatformApps() {
  const [apps, setApps] = useState<PlatformApp[]>([]);
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("platform_apps")
        .select("id,slug,name,description,is_active")
        .order("name");
      if (error) toast.error(`Failed to load apps: ${error.message}`);
      setApps((data ?? []) as PlatformApp[]);
    })();
  }, []);
  return apps;
}

// ---------- Hospitals tab ----------

function HospitalsTab() {
  const { orgs, loading, refresh } = useOrgs();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [billingEmail, setBillingEmail] = useState("");
  const [plan, setPlan] = useState<string>("trial");
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setStep(1); setName(""); setSlug(""); setBillingEmail("");
    setPlan("trial"); setOwnerName(""); setOwnerEmail("");
  };

  const handleCreate = async () => {
    if (!name.trim() || !ownerName.trim() || !ownerEmail.trim()) {
      return toast.error("Hospital name, owner name, and owner email are required.");
    }
    setSaving(true);
    try {
      const { createHospitalWithOwner } = await import("@/lib/orgs.functions");
      const res = await createHospitalWithOwner({
        data: {
          name: name.trim(),
          slug: slug.trim() || undefined,
          plan: plan as "trial" | "starter" | "pro" | "enterprise",
          billingEmail: billingEmail.trim() || undefined,
          ownerName: ownerName.trim(),
          ownerEmail: ownerEmail.trim().toLowerCase(),
          redirectTo: `${window.location.origin}/login`,
        },
      });
      toast.success(
        res.ownerInvited
          ? `Hospital created. Invite email sent to ${ownerEmail}.`
          : "Hospital created (owner invite could not be sent — check email).",
      );
      setOpen(false); reset(); refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Create failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete hospital "${name}"? This will not cascade-delete user data.`)) return;
    const { error } = await supabase.from("organizations").delete().eq("id", id);
    if (error) return toast.error(`Delete failed: ${error.message}`);
    toast.success("Hospital deleted");
    refresh();
  };

  const canAdvance = name.trim().length >= 2;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Hospitals (Branches)</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">{orgs.length} hospital branch{orgs.length === 1 ? "" : "es"}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={refresh}><RefreshCw className="h-4 w-4" /></Button>
          <Button size="sm" onClick={() => { reset(); setOpen(true); }}><Plus className="h-4 w-4 mr-1" />Create Hospital</Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="py-12 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline" /></div>
        ) : orgs.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">No hospitals yet. Add your first one.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr className="border-b">
                  <th className="py-2 pr-3">Name</th>
                  <th className="py-2 pr-3">Slug</th>
                  <th className="py-2 pr-3">Billing email</th>
                  <th className="py-2 pr-3">Plan</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3 text-right">MRR (₹)</th>
                  <th className="py-2 pr-3"></th>
                </tr>
              </thead>
              <tbody>
                {orgs.map((o) => (
                  <tr key={o.id} className="border-b hover:bg-muted/40">
                    <td className="py-2 pr-3 font-medium">{o.name}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{o.slug}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{o.billing_email ?? "—"}</td>
                    <td className="py-2 pr-3"><Badge variant="secondary">{o.plan}</Badge></td>
                    <td className="py-2 pr-3">
                      <Badge variant={o.status === "active" ? "default" : "outline"}>{o.status}</Badge>
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{fmtInr(Number(o.mrr_inr ?? 0))}</td>
                    <td className="py-2 pr-3 text-right">
                      <Button size="sm" variant="ghost" onClick={() => handleDelete(o.id, o.name)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Hospital · Step {step} of 2</DialogTitle>
            <DialogDescription>
              {step === 1
                ? "Hospital details — these become the tenant for all claims, users, and reports."
                : "Owner contact — they will receive a sign-in email and become the first Hospital Admin."}
            </DialogDescription>
          </DialogHeader>

          {step === 1 ? (
            <div className="space-y-3">
              <div>
                <Label>Hospital name *</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Apollo Bannerghatta" autoFocus />
              </div>
              <div>
                <Label>Slug</Label>
                <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="auto from name" />
                <p className="text-xs text-muted-foreground mt-1">Lowercase, hyphen-separated. Used in URLs & API.</p>
              </div>
              <div>
                <Label>Billing email</Label>
                <Input value={billingEmail} onChange={(e) => setBillingEmail(e.target.value)} placeholder="billing@hospital.com" />
              </div>
              <div>
                <Label>Plan</Label>
                <Select value={plan} onValueChange={setPlan}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PLAN_OPTIONS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <Label>Owner full name *</Label>
                <Input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="Dr. Priya Mehta" autoFocus />
              </div>
              <div>
                <Label>Owner email *</Label>
                <Input type="email" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} placeholder="priya@hospital.com" />
                <p className="text-xs text-muted-foreground mt-1">A magic-link invite email will be sent here. They'll join as <span className="font-medium">Hospital Admin / Owner</span>.</p>
              </div>
              <Alert>
                <AlertDescription className="text-xs">
                  We'll create the organization, seed the launch checklist, and link the owner. You can invite more users from <code>/settings/users</code> inside the hospital workspace.
                </AlertDescription>
              </Alert>
            </div>
          )}

          <DialogFooter>
            {step === 2 && (
              <Button variant="ghost" onClick={() => setStep(1)} disabled={saving}>Back</Button>
            )}
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
            {step === 1 ? (
              <Button onClick={() => setStep(2)} disabled={!canAdvance}>Next</Button>
            ) : (
              <Button onClick={handleCreate} disabled={saving || !ownerName.trim() || !ownerEmail.trim()}>
                {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Create & Invite Owner
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ---------- Users tab ----------

function UsersTab() {
  const { orgs } = useOrgs();
  const [orgId, setOrgId] = useState<string>("");
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [version, setVersion] = useState(0);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("Billing Executive");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!orgId) { setUsers([]); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("app_users")
        .select("id,org_id,name,email,role,status")
        .eq("org_id", orgId)
        .order("name");
      if (!cancelled) {
        if (error) toast.error(`Load users failed: ${error.message}`);
        setUsers((data ?? []) as AppUser[]);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [orgId, version]);

  const handleAdd = async () => {
    if (!orgId) return toast.error("Pick a hospital first");
    if (!name.trim() || !email.trim()) return toast.error("Name and email required");
    setSaving(true);
    const { error } = await supabase.from("app_users").insert({
      org_id: orgId, name: name.trim(), email: email.trim().toLowerCase(), role, status: "active",
    });
    setSaving(false);
    if (error) return toast.error(`Add failed: ${error.message}`);
    toast.success("User added");
    setOpen(false); setName(""); setEmail(""); setRole("Billing Executive");
    setVersion((v) => v + 1);
  };

  const handleRemove = async (id: string, name: string) => {
    if (!confirm(`Remove user "${name}"?`)) return;
    const { error } = await supabase.from("app_users").delete().eq("id", id);
    if (error) return toast.error(`Remove failed: ${error.message}`);
    toast.success("User removed");
    setVersion((v) => v + 1);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
        <div>
          <CardTitle>Users per Hospital</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">Pick a hospital to manage its users.</p>
        </div>
        <div className="flex gap-2 items-center">
          <Select value={orgId} onValueChange={setOrgId}>
            <SelectTrigger className="w-[260px]"><SelectValue placeholder="Select hospital" /></SelectTrigger>
            <SelectContent>
              {orgs.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={() => setOpen(true)} disabled={!orgId}>
            <Plus className="h-4 w-4 mr-1" />Add User
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {!orgId ? (
          <div className="py-12 text-center text-muted-foreground">Select a hospital to see users.</div>
        ) : loading ? (
          <div className="py-12 text-center"><Loader2 className="h-5 w-5 animate-spin inline" /></div>
        ) : users.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">No users in this hospital yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr className="border-b">
                <th className="py-2 pr-3">Name</th>
                <th className="py-2 pr-3">Email</th>
                <th className="py-2 pr-3">Role</th>
                <th className="py-2 pr-3">Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b hover:bg-muted/40">
                  <td className="py-2 pr-3 font-medium">{u.name}</td>
                  <td className="py-2 pr-3 text-muted-foreground">{u.email}</td>
                  <td className="py-2 pr-3"><Badge variant="secondary">{u.role}</Badge></td>
                  <td className="py-2 pr-3"><Badge variant={u.status === "active" ? "default" : "outline"}>{u.status}</Badge></td>
                  <td className="py-2 pr-3 text-right">
                    <Button size="sm" variant="ghost" onClick={() => handleRemove(u.id, u.name)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add User</DialogTitle>
            <DialogDescription>The user will be added to the selected hospital.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label>Name *</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div><Label>Email *</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div>
              <Label>Role</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Owner", "Admin", "Billing Manager", "Billing Executive", "Viewer"].map((r) =>
                    <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ---------- App Access tab (per-hospital, per-app plans) ----------

function AppAccessTab() {
  const { orgs } = useOrgs();
  const apps = usePlatformApps();
  const [orgId, setOrgId] = useState<string>("");
  const [rows, setRows] = useState<OrgAppAccess[]>([]);
  const [loading, setLoading] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!orgId) { setRows([]); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("org_app_access")
        .select("id,org_id,app_id,plan,status,mrr_inr,contract_start,contract_end")
        .eq("org_id", orgId);
      if (!cancelled) {
        if (error) toast.error(error.message);
        setRows((data ?? []) as OrgAppAccess[]);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [orgId, version]);

  const upsert = async (appId: string, patch: Partial<OrgAppAccess>) => {
    const existing = rows.find((r) => r.app_id === appId);
    if (existing) {
      const { error } = await supabase.from("org_app_access")
        .update(patch).eq("id", existing.id);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from("org_app_access").insert({
        org_id: orgId, app_id: appId,
        plan: patch.plan ?? "trial",
        status: patch.status ?? "active",
        mrr_inr: patch.mrr_inr ?? 0,
      });
      if (error) return toast.error(error.message);
    }
    setVersion((v) => v + 1);
  };

  const getRow = (appId: string) => rows.find((r) => r.app_id === appId);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-3">
        <div>
          <CardTitle>App Access & Plans</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">Grant a hospital access to specific RCM products with its own plan & MRR.</p>
        </div>
        <Select value={orgId} onValueChange={setOrgId}>
          <SelectTrigger className="w-[260px]"><SelectValue placeholder="Select hospital" /></SelectTrigger>
          <SelectContent>
            {orgs.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        {!orgId ? (
          <div className="py-12 text-center text-muted-foreground">Select a hospital to manage its app access.</div>
        ) : loading ? (
          <div className="py-12 text-center"><Loader2 className="h-5 w-5 animate-spin inline" /></div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {apps.map((app) => {
              const row = getRow(app.id);
              const enabled = Boolean(row);
              return (
                <Card key={app.id} className={enabled ? "border-primary/40" : ""}>
                  <CardContent className="pt-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-medium">{app.name}</div>
                        <div className="text-xs text-muted-foreground">{app.description}</div>
                      </div>
                      {enabled
                        ? <Badge>{row!.status}</Badge>
                        : <Badge variant="outline">Not enabled</Badge>}
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <Label className="text-xs">Plan</Label>
                        <Select value={row?.plan ?? "trial"} onValueChange={(v) => upsert(app.id, { plan: v })}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {PLAN_OPTIONS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">Status</Label>
                        <Select value={row?.status ?? "active"} onValueChange={(v) => upsert(app.id, { status: v })}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">MRR (₹)</Label>
                        <Input
                          className="h-8 text-xs"
                          type="number"
                          defaultValue={row?.mrr_inr ?? 0}
                          onBlur={(e) => upsert(app.id, { mrr_inr: Number(e.target.value) || 0 })}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- API Tokens tab ----------

function TokensTab() {
  const { orgs } = useOrgs();
  const apps = usePlatformApps();
  const [orgId, setOrgId] = useState<string>("");
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [usage, setUsage] = useState<TokenUsageDaily[]>([]);
  const [loading, setLoading] = useState(false);
  const [version, setVersion] = useState(0);
  const [open, setOpen] = useState(false);
  const [tokenName, setTokenName] = useState("");
  const [scopeSlugs, setScopeSlugs] = useState<string[]>([]);
  const [newPlaintext, setNewPlaintext] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!orgId) { setTokens([]); setUsage([]); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [t, u] = await Promise.all([
        supabase.from("api_tokens").select("*").eq("org_id", orgId).order("created_at", { ascending: false }),
        supabase.from("api_token_usage").select("*").eq("org_id", orgId).gte("day", new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)),
      ]);
      if (!cancelled) {
        if (t.error) toast.error(t.error.message);
        if (u.error) toast.error(u.error.message);
        setTokens((t.data ?? []) as ApiToken[]);
        setUsage((u.data ?? []) as TokenUsageDaily[]);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [orgId, version]);

  const handleCreate = async () => {
    if (!orgId || !tokenName.trim()) return toast.error("Name + hospital required");
    const { token, prefix } = generateApiToken();
    const token_hash = await sha256Hex(token);
    const { error } = await supabase.from("api_tokens").insert({
      org_id: orgId, name: tokenName.trim(), prefix, token_hash, scopes: scopeSlugs,
    });
    if (error) return toast.error(error.message);
    setNewPlaintext(token);
    setTokenName(""); setScopeSlugs([]);
    setVersion((v) => v + 1);
  };

  const handleRevoke = async (id: string) => {
    if (!confirm("Revoke this token? Calls will start failing immediately.")) return;
    const { error } = await supabase.from("api_tokens")
      .update({ revoked_at: new Date().toISOString() }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Token revoked");
    setVersion((v) => v + 1);
  };

  const totalsByToken = useMemo(() => {
    const map = new Map<string, { calls: number; cost: number }>();
    // usage table has token_id but our local query didn't include — re-shape if needed.
    return map;
  }, [usage]);
  void totalsByToken;

  const usageTotals = useMemo(() => {
    const totals = { calls: 0, tokens_in: 0, tokens_out: 0, cost_inr: 0 };
    for (const u of usage) {
      totals.calls += u.calls; totals.tokens_in += u.tokens_in;
      totals.tokens_out += u.tokens_out; totals.cost_inr += Number(u.cost_inr);
    }
    return totals;
  }, [usage]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-3">
        <div>
          <CardTitle>API Tokens & Usage</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">Issue scoped API tokens per hospital. Usage is rolled up daily.</p>
        </div>
        <div className="flex gap-2 items-center">
          <Select value={orgId} onValueChange={setOrgId}>
            <SelectTrigger className="w-[260px]"><SelectValue placeholder="Select hospital" /></SelectTrigger>
            <SelectContent>
              {orgs.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={() => setOpen(true)} disabled={!orgId}>
            <Plus className="h-4 w-4 mr-1" />New Token
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {orgId && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Calls (30d)" value={usageTotals.calls.toLocaleString()} />
            <Stat label="Tokens in" value={usageTotals.tokens_in.toLocaleString()} />
            <Stat label="Tokens out" value={usageTotals.tokens_out.toLocaleString()} />
            <Stat label="Cost ₹ (30d)" value={fmtInr(usageTotals.cost_inr)} />
          </div>
        )}

        {!orgId ? (
          <div className="py-12 text-center text-muted-foreground">Select a hospital.</div>
        ) : loading ? (
          <div className="py-12 text-center"><Loader2 className="h-5 w-5 animate-spin inline" /></div>
        ) : tokens.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">No tokens yet for this hospital.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr className="border-b">
                <th className="py-2 pr-3">Name</th>
                <th className="py-2 pr-3">Prefix</th>
                <th className="py-2 pr-3">Scopes</th>
                <th className="py-2 pr-3">Created</th>
                <th className="py-2 pr-3">Last used</th>
                <th className="py-2 pr-3">Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {tokens.map((t) => (
                <tr key={t.id} className="border-b hover:bg-muted/40">
                  <td className="py-2 pr-3 font-medium">{t.name}</td>
                  <td className="py-2 pr-3 font-mono text-xs">{t.prefix}…</td>
                  <td className="py-2 pr-3">
                    {t.scopes.length === 0
                      ? <span className="text-muted-foreground">all</span>
                      : t.scopes.map((s) => <Badge key={s} variant="secondary" className="mr-1">{s}</Badge>)}
                  </td>
                  <td className="py-2 pr-3 text-muted-foreground">{new Date(t.created_at).toLocaleDateString()}</td>
                  <td className="py-2 pr-3 text-muted-foreground">{t.last_used_at ? new Date(t.last_used_at).toLocaleDateString() : "—"}</td>
                  <td className="py-2 pr-3">
                    {t.revoked_at
                      ? <Badge variant="destructive">revoked</Badge>
                      : <Badge>active</Badge>}
                  </td>
                  <td className="py-2 pr-3 text-right">
                    {!t.revoked_at && (
                      <Button size="sm" variant="ghost" onClick={() => handleRevoke(t.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setNewPlaintext(null); setCopied(false); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{newPlaintext ? "Token created — copy now" : "Create API Token"}</DialogTitle>
            <DialogDescription>
              {newPlaintext
                ? "This is the only time the full token is shown. Store it securely."
                : "Tokens are scoped to one hospital. Leave scopes empty to allow all 4 apps."}
            </DialogDescription>
          </DialogHeader>

          {newPlaintext ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 p-3 rounded-md bg-muted font-mono text-xs break-all">
                {newPlaintext}
              </div>
              <Button variant="outline" size="sm" onClick={async () => {
                await navigator.clipboard.writeText(newPlaintext);
                setCopied(true);
                toast.success("Copied to clipboard");
              }}>
                {copied ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
                {copied ? "Copied" : "Copy token"}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div><Label>Token name *</Label><Input value={tokenName} onChange={(e) => setTokenName(e.target.value)} placeholder="Audit nightly sync" /></div>
              <div>
                <Label>App scopes (empty = all)</Label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {apps.map((a) => {
                    const active = scopeSlugs.includes(a.slug);
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => setScopeSlugs((prev) =>
                          prev.includes(a.slug) ? prev.filter((s) => s !== a.slug) : [...prev, a.slug])}
                        className={`text-xs px-2 py-1 rounded border transition-colors ${
                          active ? "bg-primary text-primary-foreground border-primary" : "bg-background"
                        }`}
                      >
                        {a.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            {newPlaintext ? (
              <Button onClick={() => setOpen(false)}>Done</Button>
            ) : (
              <>
                <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={handleCreate}>Create</Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3 bg-card">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular-nums mt-0.5">{value}</div>
    </div>
  );
}

// ---------- Performance tab ----------

function PerformanceTab() {
  const { orgs } = useOrgs();
  const apps = usePlatformApps();
  const [orgId, setOrgId] = useState<string>("");
  const [kpis, setKpis] = useState<HospitalKpi[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!orgId) { setKpis([]); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("hospital_kpis")
        .select("org_id,app_id,period,metric,value")
        .eq("org_id", orgId)
        .order("period", { ascending: false })
        .limit(200);
      if (!cancelled) {
        if (error) toast.error(error.message);
        setKpis((data ?? []) as HospitalKpi[]);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [orgId]);

  const byApp = useMemo(() => {
    const map = new Map<string, HospitalKpi[]>();
    for (const k of kpis) {
      const arr = map.get(k.app_id) ?? [];
      arr.push(k);
      map.set(k.app_id, arr);
    }
    return map;
  }, [kpis]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-3">
        <div>
          <CardTitle>Cross-Platform Performance</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            KPI snapshots written by each platform into <code>hospital_kpis</code>.
          </p>
        </div>
        <Select value={orgId} onValueChange={setOrgId}>
          <SelectTrigger className="w-[260px]"><SelectValue placeholder="Select hospital" /></SelectTrigger>
          <SelectContent>
            {orgs.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        {!orgId ? (
          <div className="py-12 text-center text-muted-foreground">Select a hospital to view its KPIs across all 4 apps.</div>
        ) : loading ? (
          <div className="py-12 text-center"><Loader2 className="h-5 w-5 animate-spin inline" /></div>
        ) : kpis.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            No KPI snapshots yet. The other apps will push to <code>/api/public/kpi-ingest</code> (Phase 2+) — or you can insert rows manually in the database for testing.
          </div>
        ) : (
          <div className="space-y-4">
            {apps.map((app) => {
              const rows = byApp.get(app.id) ?? [];
              if (rows.length === 0) return null;
              const latestByMetric = new Map<string, HospitalKpi>();
              for (const r of rows) {
                if (!latestByMetric.has(r.metric)) latestByMetric.set(r.metric, r);
              }
              return (
                <Card key={app.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{app.name}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {Array.from(latestByMetric.values()).map((k) => (
                        <Stat key={k.metric} label={`${k.metric} (${k.period})`} value={Number(k.value).toLocaleString("en-IN")} />
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
