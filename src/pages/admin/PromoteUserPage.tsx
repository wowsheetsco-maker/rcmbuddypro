import { useEffect, useState } from "react";
import { Shield, Loader2, AlertTriangle, CheckCircle2, Crown, History } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useIsPlatformAdmin } from "@/hooks/useIsPlatformAdmin";

type Org = { id: string; name: string; slug: string };
type Admin = { email: string; created_at: string | null };
type AuditRow = {
  id: string;
  actor_email: string | null;
  target_email: string;
  org_id: string | null;
  action: string;
  bootstrap: boolean;
  created_at: string;
};

export default function PromoteUserPage() {
  const { isAdmin, loading: adminLoading } = useIsPlatformAdmin();

  const [orgs, setOrgs] = useState<Org[]>([]);
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [email, setEmail] = useState("");
  const [orgId, setOrgId] = useState<string>("");
  const [makeOwner, setMakeOwner] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const isBootstrap = admins.length === 0;
  const canUse = isAdmin || isBootstrap;

  const refresh = async () => {
    setLoading(true);
    const [orgsRes, adminsRes, auditRes] = await Promise.all([
      supabase.from("organizations").select("id,name,slug").order("name"),
      supabase.from("platform_admins").select("email,created_at").order("email"),
      supabase
        .from("platform_admin_audit")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
    setOrgs((orgsRes.data ?? []) as Org[]);
    setAdmins((adminsRes.data ?? []) as Admin[]);
    setAudit((auditRes.data ?? []) as AuditRow[]);
    setLoading(false);
  };

  useEffect(() => { refresh(); }, []);

  const onPromote = async () => {
    if (!email.trim()) {
      toast.error("Enter an email");
      return;
    }
    setSubmitting(true);
    const { data, error } = await supabase.rpc("promote_to_super_admin", {
      _target_email: email.trim().toLowerCase(),
      _org_id: orgId || null,
      _make_owner: makeOwner,
    });
    setSubmitting(false);
    if (error) {
      toast.error("Promotion failed", { description: error.message });
      return;
    }
    const payload = data as { bootstrap?: boolean } | null;
    toast.success(payload?.bootstrap ? "Bootstrap complete — you are now Super Admin" : "User promoted");
    setEmail("");
    refresh();
  };

  return (
    <AppLayout>
      <div className="mx-auto max-w-4xl space-y-6 p-6">
        <header className="flex items-start gap-3">
          <Shield className="mt-1 h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Promote Platform Super Admin</h1>
            <p className="text-sm text-muted-foreground">
              Elevate an existing signed-up user to Platform Super Admin and (optionally) set them as Owner of an organisation.
            </p>
          </div>
        </header>

        {adminLoading || loading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <>
            {isBootstrap ? (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>First-time bootstrap</AlertTitle>
                <AlertDescription>
                  No super admin exists yet. For safety, the first promotion may only target <strong>your own account email</strong>. After that, only existing super admins can promote others.
                </AlertDescription>
              </Alert>
            ) : !isAdmin ? (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Access denied</AlertTitle>
                <AlertDescription>
                  Only existing Platform Super Admins can promote users.
                </AlertDescription>
              </Alert>
            ) : (
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertDescription>
                  Signed in as a Platform Super Admin. You can promote any user who has already signed up.
                </AlertDescription>
              </Alert>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Crown className="h-5 w-5" /> Promote a user</CardTitle>
                <CardDescription>Target user must have signed up at /login first.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">User email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="owner@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={!canUse || submitting}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="org">Organisation (optional — set as Owner)</Label>
                  <Select value={orgId} onValueChange={setOrgId} disabled={!canUse || submitting}>
                    <SelectTrigger id="org">
                      <SelectValue placeholder="— No org change —" />
                    </SelectTrigger>
                    <SelectContent>
                      {orgs.map((o) => (
                        <SelectItem key={o.id} value={o.id}>
                          {o.name} <span className="text-muted-foreground">({o.slug})</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between rounded-md border p-3">
                  <div>
                    <Label htmlFor="owner" className="cursor-pointer">Set as Org Owner</Label>
                    <p className="text-xs text-muted-foreground">Upserts organization_members.role = 'owner'.</p>
                  </div>
                  <Switch
                    id="owner"
                    checked={makeOwner}
                    onCheckedChange={setMakeOwner}
                    disabled={!canUse || submitting || !orgId}
                  />
                </div>
                <Button onClick={onPromote} disabled={!canUse || submitting || !email.trim()} className="w-full">
                  {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Shield className="mr-2 h-4 w-4" />}
                  Promote to Super Admin
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Current Platform Super Admins ({admins.length})</CardTitle>
              </CardHeader>
              <CardContent>
                {admins.length === 0 ? (
                  <p className="text-sm text-muted-foreground">None yet.</p>
                ) : (
                  <ul className="divide-y">
                    {admins.map((a) => (
                      <li key={a.email} className="flex items-center justify-between py-2">
                        <span className="font-mono text-sm">{a.email}</span>
                        <Badge variant="secondary">Super Admin</Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><History className="h-5 w-5" /> Recent promotions</CardTitle>
              </CardHeader>
              <CardContent>
                {audit.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No promotion history.</p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {audit.map((r) => (
                      <li key={r.id} className="flex flex-wrap items-center gap-2 rounded border p-2">
                        <Badge variant={r.bootstrap ? "default" : "outline"}>{r.bootstrap ? "bootstrap" : r.action}</Badge>
                        <span className="font-mono">{r.target_email}</span>
                        <span className="text-muted-foreground">by {r.actor_email ?? "—"}</span>
                        <span className="ml-auto text-xs text-muted-foreground">
                          {new Date(r.created_at).toLocaleString()}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppLayout>
  );
}
