import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@/lib/router-compat";
import { Loader2, ArrowRight, Shield, Stethoscope, ClipboardCheck, GraduationCap, LayoutGrid, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { useIsPlatformAdmin } from "@/hooks/useIsPlatformAdmin";
import { usePlatformApps, type PlatformApp } from "@/hooks/usePlatformApps";
import { useOrgAppAccess } from "@/hooks/useOrgAppAccess";

const APP_META: Record<string, { path: string; icon: typeof Stethoscope; tagline: string; color: string }> = {
  pro:      { path: "/",                icon: Stethoscope,     tagline: "Recover claims faster — TPA follow-ups, denials, payer scorecards.", color: "from-primary/15 to-primary/5" },
  audit:    { path: "/admin/go-no-go",  icon: ClipboardCheck,  tagline: "Go / No-Go launch readiness audit.",                                  color: "from-amber-500/15 to-amber-500/5" },
  training: { path: "/training",        icon: GraduationCap,   tagline: "RCM Buddy Learning — courses & certifications.",                      color: "from-emerald-500/15 to-emerald-500/5" },
  admin:    { path: "/admin",           icon: Shield,          tagline: "Platform control plane — hospitals, access, billing.",                color: "from-violet-500/15 to-violet-500/5" },
};

export default function LaunchPage() {
  const navigate = useNavigate();
  const { orgId, isLoading: authLoading } = useAuth();
  const { isAdmin, loading: adminLoading } = useIsPlatformAdmin();
  const { apps, loading: appsLoading } = usePlatformApps();
  const { rows, loading: accessLoading } = useOrgAppAccess(isAdmin ? null : orgId);
  const [orgName, setOrgName] = useState<string>("");

  useEffect(() => {
    if (!orgId) return;
    supabase.from("organizations").select("name").eq("id", orgId).maybeSingle()
      .then(({ data }) => setOrgName(data?.name ?? ""));
  }, [orgId]);

  const loading = authLoading || adminLoading || appsLoading || accessLoading;

  const visible = useMemo(() => {
    const activeApps = apps.filter((a) => a.is_active);
    if (isAdmin) {
      // Platform admins see everything (including the admin tile).
      return activeApps.map((app) => ({ app, plan: "admin", status: "active" }));
    }
    // Hospital users: only apps their org has active access to. Exclude `admin`.
    const accessMap = new Map(rows.filter((r) => r.status === "active").map((r) => [r.app_id, r]));
    return activeApps
      .filter((a) => a.slug !== "admin" && accessMap.has(a.id))
      .map((app) => {
        const row = accessMap.get(app.id)!;
        return { app, plan: row.plan, status: row.status };
      });
  }, [apps, rows, isAdmin]);

  // Single-app users skip the launcher.
  useEffect(() => {
    if (loading) return;
    if (visible.length === 1 && !isAdmin) {
      const meta = APP_META[visible[0].app.slug];
      if (meta) navigate(meta.path, { replace: true });
    }
  }, [loading, visible, isAdmin, navigate]);

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate("/login", { replace: true });
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      <header className="border-b border-border/60 bg-card/40 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <LayoutGrid className="h-5 w-5 text-primary" />
            <div>
              <div className="text-sm font-semibold leading-tight">RCM Buddy</div>
              <div className="text-xs text-muted-foreground">{orgName || (isAdmin ? "Platform admin" : "Your workspace")}</div>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={signOut}>
            <LogOut className="mr-1.5 h-4 w-4" /> Sign out
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-8">
          <h1 className="font-display text-3xl tracking-tight">Choose an app</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isAdmin
              ? "You have platform access to every product."
              : "Open one of the products your hospital is subscribed to."}
          </p>
        </div>

        {visible.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map(({ app, plan }) => (
              <AppTile key={app.id} app={app} plan={plan} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function AppTile({ app, plan }: { app: PlatformApp; plan: string }) {
  const meta = APP_META[app.slug] ?? { path: "/", icon: LayoutGrid, tagline: app.description ?? "", color: "from-muted/40 to-muted/10" };
  const Icon = meta.icon;
  return (
    <Link to={meta.path} className="group">
      <Card className={`relative overflow-hidden border-border/60 bg-gradient-to-br ${meta.color} p-5 transition hover:border-primary/40 hover:shadow-md`}>
        <div className="flex items-start justify-between">
          <div className="rounded-xl bg-background/80 p-2.5 ring-1 ring-border/60">
            <Icon className="h-5 w-5 text-foreground" />
          </div>
          <Badge variant="secondary" className="capitalize">{plan}</Badge>
        </div>
        <div className="mt-5">
          <div className="font-display text-lg leading-tight">{app.name}</div>
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{meta.tagline || app.description}</p>
        </div>
        <div className="mt-6 flex items-center text-sm font-medium text-primary opacity-80 transition group-hover:opacity-100">
          Open <ArrowRight className="ml-1 h-4 w-4 transition group-hover:translate-x-0.5" />
        </div>
      </Card>
    </Link>
  );
}

function EmptyState() {
  return (
    <Card className="p-10 text-center">
      <Shield className="mx-auto h-8 w-8 text-muted-foreground" />
      <h2 className="mt-3 font-display text-lg">No apps available yet</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Your hospital doesn't have access to any products yet. Ask your platform admin to grant access.
      </p>
    </Card>
  );
}
