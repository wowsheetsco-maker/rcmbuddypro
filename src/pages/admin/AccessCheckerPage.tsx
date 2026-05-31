import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ShieldCheck, CheckCircle2, XCircle, Search, User2, Building2, Loader2 } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ROUTE_ROLE_RULES, allowedRolesForPath } from "@/lib/routeAccess";
import { useAuth, type OrgRole } from "@/contexts/AuthContext";
import {
  useRolePermissions,
  RESOURCES,
  ACTIONS,
  getActingRole,
  type Action,
  type Resource,
} from "@/hooks/useRolePermissions";
import { supabase } from "@/integrations/supabase/client";
import type { UserRole } from "@/hooks/useAppUsers";

const APP_ROLES: UserRole[] = [
  "Super Admin",
  "Hospital Admin",
  "RCM Manager",
  "Billing Executive",
  "Auditor",
  "CFO View",
];

type RouteVerdict = {
  prefix: string | null;
  allowedRoles: OrgRole[] | null;
  allowed: boolean;
  reason: string;
};

function evaluateRoute(
  pathname: string,
  role: OrgRole | null,
  isPlatformAdmin: boolean,
): RouteVerdict {
  if (isPlatformAdmin) {
    return {
      prefix: null,
      allowedRoles: null,
      allowed: true,
      reason: "You are a Platform Super Admin — all routes bypass org-role gates.",
    };
  }
  const allowedRoles = allowedRolesForPath(pathname);
  if (!allowedRoles) {
    return {
      prefix: null,
      allowedRoles: null,
      allowed: Boolean(role),
      reason: role
        ? "No specific gate matched this path — any authenticated org member can access."
        : "Path is ungated but you have no resolved org membership.",
    };
  }
  const matchedRule = ROUTE_ROLE_RULES.find(
    (r) => pathname === r.prefix || pathname.startsWith(r.prefix + "/"),
  );
  if (!role) {
    return {
      prefix: matchedRule?.prefix ?? null,
      allowedRoles,
      allowed: false,
      reason: "No org role resolved — gate requires a member of this organization.",
    };
  }
  const allowed = allowedRoles.includes(role);
  return {
    prefix: matchedRule?.prefix ?? null,
    allowedRoles,
    allowed,
    reason: allowed
      ? `Your org role "${role}" is in the allow-list [${allowedRoles.join(", ")}].`
      : `Your org role "${role}" is NOT in the allow-list [${allowedRoles.join(", ")}] — router redirects to home.`,
  };
}

const SAMPLE_PATHS = [
  "/dashboard",
  "/dashboard/executive",
  "/claims",
  "/claims/priority",
  "/claims/denials",
  "/claims/data-quality",
  "/claims/import",
  "/claims/tds",
  "/analytics",
  "/settings",
  "/providers",
  "/opd",
  "/admin/roles-matrix",
];

export default function AccessCheckerPage() {
  const { userId, orgId, role, isLoading } = useAuth();
  const { lookup, loading: permsLoading } = useRolePermissions();
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [pathInput, setPathInput] = useState("/claims/priority");
  const [actingRole, setActing] = useState<UserRole>(getActingRole());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.rpc("is_platform_admin");
      if (!cancelled) setIsPlatformAdmin(Boolean(data));
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const routeVerdict = useMemo(
    () => evaluateRoute(pathInput.trim() || "/", role, isPlatformAdmin),
    [pathInput, role, isPlatformAdmin],
  );

  const routeMatrix = useMemo(
    () => SAMPLE_PATHS.map((p) => ({ path: p, verdict: evaluateRoute(p, role, isPlatformAdmin) })),
    [role, isPlatformAdmin],
  );

  const moduleVerdicts = useMemo(() => {
    return RESOURCES.map((res) => {
      const row = lookup.get(`${actingRole}::${res.key}`);
      const actionMap = ACTIONS.map((a) => {
        const allowed = row ? Boolean(row[a.col]) : false;
        return { key: a.key as Action, label: a.label, allowed };
      });
      const anyAllowed = actionMap.some((a) => a.allowed);
      return { resource: res, actions: actionMap, hasRow: Boolean(row), anyAllowed };
    });
  }, [lookup, actingRole]);

  return (
    <AppLayout>
      <div className="mx-auto max-w-7xl space-y-6 p-6">
        <header className="flex items-start gap-3">
          <ShieldCheck className="mt-1 h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Access Checker</h1>
            <p className="text-sm text-muted-foreground">
              Test what your current session can reach. Type a path or pick a module — we explain
              why access is granted or blocked.
            </p>
          </div>
        </header>

        {/* Current session summary */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your current session</CardTitle>
            <CardDescription>
              These values drive every gate evaluated below.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Resolving session…
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <SessionStat
                  icon={<User2 className="h-4 w-4" />}
                  label="Auth user"
                  value={userId ? userId.slice(0, 8) + "…" : "—"}
                  hint={userId ? "Signed in" : "Not signed in"}
                />
                <SessionStat
                  icon={<Building2 className="h-4 w-4" />}
                  label="Org"
                  value={orgId ? orgId.slice(0, 8) + "…" : "—"}
                  hint={orgId ? "Active organization" : "No org membership"}
                />
                <SessionStat
                  icon={<ShieldCheck className="h-4 w-4" />}
                  label="Org role"
                  value={role ?? "—"}
                  hint="Drives route gates"
                />
                <SessionStat
                  icon={<ShieldCheck className="h-4 w-4 text-primary" />}
                  label="Platform admin"
                  value={isPlatformAdmin ? "Yes" : "No"}
                  hint={isPlatformAdmin ? "Bypasses all org gates" : "Subject to org gates"}
                />
              </div>
            )}
          </CardContent>
        </Card>

        <Tabs defaultValue="route" className="space-y-4">
          <TabsList>
            <TabsTrigger value="route">Test a route</TabsTrigger>
            <TabsTrigger value="modules">Test modules (app role)</TabsTrigger>
            <TabsTrigger value="matrix">Common routes</TabsTrigger>
          </TabsList>

          {/* Route tester */}
          <TabsContent value="route">
            <Card>
              <CardHeader>
                <CardTitle>Will I be allowed to open this URL?</CardTitle>
                <CardDescription>
                  Evaluated against the live gates in{" "}
                  <code className="rounded bg-muted px-1 text-xs">src/lib/routeAccess.ts</code>.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={pathInput}
                      onChange={(e) => setPathInput(e.target.value)}
                      placeholder="/claims/priority"
                      className="pl-9 font-mono"
                      aria-label="Path to test"
                    />
                  </div>
                  {routeVerdict.allowed ? (
                    <Button asChild variant="outline">
                      <Link to={pathInput || "/"}>Open route →</Link>
                    </Button>
                  ) : (
                    <Button variant="outline" disabled>
                      Blocked
                    </Button>
                  )}
                </div>

                <Verdict
                  allowed={routeVerdict.allowed}
                  title={
                    routeVerdict.allowed
                      ? `Access ALLOWED for ${pathInput || "/"}`
                      : `Access DENIED for ${pathInput || "/"}`
                  }
                  reason={routeVerdict.reason}
                  meta={
                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                      {routeVerdict.prefix && (
                        <Badge variant="outline">
                          Matched rule: <span className="ml-1 font-mono">{routeVerdict.prefix}</span>
                        </Badge>
                      )}
                      {routeVerdict.allowedRoles && (
                        <Badge variant="outline">
                          Allowed roles: {routeVerdict.allowedRoles.join(", ")}
                        </Badge>
                      )}
                      <Badge variant="secondary">Your role: {role ?? "none"}</Badge>
                    </div>
                  }
                />

                <div>
                  <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Quick picks
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {SAMPLE_PATHS.map((p) => (
                      <Button
                        key={p}
                        size="sm"
                        variant={pathInput === p ? "default" : "outline"}
                        onClick={() => setPathInput(p)}
                        className="font-mono text-xs"
                      >
                        {p}
                      </Button>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Module tester */}
          <TabsContent value="modules">
            <Card>
              <CardHeader>
                <CardTitle>What can my app role do per module?</CardTitle>
                <CardDescription>
                  Module permissions come from <code className="rounded bg-muted px-1 text-xs">role_permissions</code>.
                  Change the role to preview another user's access.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <span className="text-sm text-muted-foreground">Acting as app role:</span>
                  <Select value={actingRole} onValueChange={(v) => setActing(v as UserRole)}>
                    <SelectTrigger className="w-[240px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {APP_ROLES.map((r) => (
                        <SelectItem key={r} value={r}>
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="text-xs text-muted-foreground">
                    (Preview only — does not change your real session.)
                  </span>
                </div>

                {permsLoading ? (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading permissions…
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[260px]">Module</TableHead>
                          {ACTIONS.map((a) => (
                            <TableHead key={a.key} className="text-center">
                              {a.label}
                            </TableHead>
                          ))}
                          <TableHead className="w-[120px]">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {moduleVerdicts.map(({ resource, actions, hasRow, anyAllowed }) => (
                          <TableRow key={resource.key}>
                            <TableCell>
                              <div className="text-sm font-medium">{resource.label}</div>
                              <div className="text-xs text-muted-foreground">{resource.group}</div>
                            </TableCell>
                            {actions.map((a) => (
                              <TableCell key={a.key} className="text-center">
                                {a.allowed ? (
                                  <CheckCircle2 className="mx-auto h-4 w-4 text-emerald-600" aria-label={`${a.label} allowed`} />
                                ) : (
                                  <XCircle className="mx-auto h-4 w-4 text-muted-foreground/40" aria-label={`${a.label} blocked`} />
                                )}
                              </TableCell>
                            ))}
                            <TableCell>
                              {!hasRow ? (
                                <Badge variant="outline" className="text-xs">No policy row</Badge>
                              ) : anyAllowed ? (
                                <Badge className="bg-emerald-600 text-xs hover:bg-emerald-600">Has access</Badge>
                              ) : (
                                <Badge variant="destructive" className="text-xs">No access</Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  "No policy row" means there is no entry for this role + module in{" "}
                  <code className="rounded bg-muted px-1">role_permissions</code> — default-deny applies.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Common-routes matrix */}
          <TabsContent value="matrix">
            <Card>
              <CardHeader>
                <CardTitle>Common routes for your current role</CardTitle>
                <CardDescription>
                  One-shot evaluation across frequently-used paths using your live session.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto rounded border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[240px]">Path</TableHead>
                        <TableHead>Allowed roles</TableHead>
                        <TableHead className="w-[120px]">You</TableHead>
                        <TableHead>Reason</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {routeMatrix.map(({ path, verdict }) => (
                        <TableRow key={path}>
                          <TableCell className="font-mono text-xs">{path}</TableCell>
                          <TableCell className="text-xs">
                            {verdict.allowedRoles?.join(", ") ?? (
                              <span className="text-muted-foreground">— (no gate)</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {verdict.allowed ? (
                              <Badge className="bg-emerald-600 hover:bg-emerald-600">Allowed</Badge>
                            ) : (
                              <Badge variant="destructive">Denied</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {verdict.reason}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}

function SessionStat({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1 truncate font-mono text-sm font-medium">{value}</div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

function Verdict({
  allowed,
  title,
  reason,
  meta,
}: {
  allowed: boolean;
  title: string;
  reason: string;
  meta?: React.ReactNode;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={
        "rounded-lg border p-4 " +
        (allowed
          ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-100"
          : "border-destructive/40 bg-destructive/5 text-destructive")
      }
    >
      <div className="flex items-center gap-2 font-medium">
        {allowed ? <CheckCircle2 className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
        {title}
      </div>
      <p className="mt-1 text-sm">{reason}</p>
      {meta}
    </div>
  );
}
