import { useMemo } from "react";
import { ShieldCheck, Lock, Unlock, Loader2, CheckCircle2, XCircle, ShieldAlert } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ROUTE_ROLE_RULES } from "@/lib/routeAccess";
import { useRolePermissions, RESOURCES, ACTIONS } from "@/hooks/useRolePermissions";
import { ADMIN_ROUTE_SUBROLE_RULES, type AdminSubrole } from "@/hooks/useAdminSubroles";
import type { OrgRole } from "@/contexts/AuthContext";
import type { UserRole } from "@/hooks/useAppUsers";

const ORG_ROLES: OrgRole[] = ["owner", "admin", "manager", "member", "viewer"];
const APP_ROLES: UserRole[] = [
  "Super Admin",
  "Hospital Admin",
  "RCM Manager",
  "Billing Executive",
  "Auditor",
  "CFO View",
];

const ADMIN_SUBROLES: AdminSubrole[] = [
  "super_admin",
  "org_owner",
  "org_admin",
  "billing_admin",
  "compliance_admin",
  "tech_admin",
];

const ADMIN_SUBROLE_LABELS: Record<AdminSubrole, string> = {
  super_admin: "Super Admin",
  org_owner: "Org Owner",
  org_admin: "Org Admin",
  billing_admin: "Billing Admin",
  compliance_admin: "Compliance Admin",
  tech_admin: "Tech Admin",
};

const ADMIN_ROUTE_LABELS: Record<string, string> = {
  "/admin/promote": "Promote User",
  "/admin/org-access": "Org Access",
  "/admin/roles-matrix": "Roles Matrix",
  "/admin/control-panel": "Control Panel",
  "/admin/access-checker": "Access Checker",
  "/admin/go-no-go": "Go / No-Go",
  "/admin": "Admin Dashboard",
  "/settings/permissions": "Settings — Permissions",
  "/settings/ai-providers": "Settings — AI Providers",
  "/settings/integrations": "Settings — Integrations",
  "/settings/users": "Settings — Users",
};

/** Simulate access-checker output for a given user profile against an admin route. */
function simulateAccessCheck(params: {
  userSubroles: AdminSubrole[];
  routePrefix: string;
  routeAllowed: AdminSubrole[];
}): { allowed: boolean; reason: string; missing: AdminSubrole[] } {
  const hasMatch = params.userSubroles.some((s) => params.routeAllowed.includes(s));
  const missing = params.routeAllowed.filter((s) => !params.userSubroles.includes(s));
  if (hasMatch) {
    return {
      allowed: true,
      reason: `Your sub-role "${params.userSubroles.find((s) => params.routeAllowed.includes(s))}" is in the allow-list [${params.routeAllowed.join(", ")}].`,
      missing: [],
    };
  }
  return {
    allowed: false,
    reason: `Your sub-roles [${params.userSubroles.join(", ") || "none"}] do NOT match the allow-list [${params.routeAllowed.join(", ")}] — router redirects to /admin/access-checker.`,
    missing,
  };
}

const EXAMPLE_PROFILES: { label: string; subroles: AdminSubrole[]; color: "emerald" | "amber" | "rose" }[] = [
  { label: "Org Owner (full admin)", subroles: ["org_owner"], color: "emerald" },
  { label: "Tech Admin only", subroles: ["tech_admin"], color: "amber" },
  { label: "Billing Admin only", subroles: ["billing_admin"], color: "amber" },
  { label: "Compliance Admin only", subroles: ["compliance_admin"], color: "amber" },
  { label: "Org Admin (no owner)", subroles: ["org_admin"], color: "amber" },
  { label: "Regular member (no admin sub-roles)", subroles: [], color: "rose" },
];

export default function RolesMatrixPage() {
  const { lookup, loading } = useRolePermissions();

  const routeRows = useMemo(() => ROUTE_ROLE_RULES, []);

  const adminRouteRows = useMemo(() => ADMIN_ROUTE_SUBROLE_RULES, []);

  return (
    <AppLayout>
      <div className="mx-auto max-w-7xl space-y-6 p-6">
        <header className="flex items-start gap-3">
          <ShieldCheck className="mt-1 h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Roles & Access Matrix</h1>
            <p className="text-sm text-muted-foreground">
              Verify which routes and modules each role can access. Read-only view sourced from the live gating rules.
            </p>
          </div>
        </header>

        <Tabs defaultValue="routes" className="space-y-4">
          <TabsList>
            <TabsTrigger value="routes">Route gates (Org roles)</TabsTrigger>
            <TabsTrigger value="modules">Module permissions (App roles)</TabsTrigger>
            <TabsTrigger value="admin-subroles">Admin sub-roles</TabsTrigger>
          </TabsList>

          {/* Route gates */}
          <TabsContent value="routes">
            <Card>
              <CardHeader>
                <CardTitle>Path prefix → allowed org roles</CardTitle>
                <CardDescription>
                  Mirrors <code className="rounded bg-muted px-1 text-xs">src/lib/routeAccess.ts</code> — first match wins.
                  Visitors without a matching role are bounced by the global router guard.
                </CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[280px]">Path prefix</TableHead>
                      {ORG_ROLES.map((r) => (
                        <TableHead key={r} className="text-center capitalize">{r}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {routeRows.map((rule) => (
                      <TableRow key={rule.prefix}>
                        <TableCell className="font-mono text-sm">{rule.prefix}</TableCell>
                        {ORG_ROLES.map((r) => {
                          const allowed = rule.allowedRoles.includes(r);
                          return (
                            <TableCell key={r} className="text-center">
                              {allowed ? (
                                <Unlock className="mx-auto h-4 w-4 text-emerald-600" aria-label="allowed" />
                              ) : (
                                <Lock className="mx-auto h-4 w-4 text-muted-foreground/50" aria-label="blocked" />
                              )}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/40">
                      <TableCell className="font-mono text-sm text-muted-foreground">
                        (any other path)
                      </TableCell>
                      {ORG_ROLES.map((r) => (
                        <TableCell key={r} className="text-center">
                          <Unlock className="mx-auto h-4 w-4 text-emerald-600/60" />
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableBody>
                </Table>
                <div className="mt-4 flex gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Unlock className="h-3 w-3 text-emerald-600" /> allowed</span>
                  <span className="flex items-center gap-1"><Lock className="h-3 w-3" /> blocked → redirected</span>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* App-role module permissions */}
          <TabsContent value="modules">
            <Card>
              <CardHeader>
                <CardTitle>Module × Action × App role</CardTitle>
                <CardDescription>
                  Live values from <code className="rounded bg-muted px-1 text-xs">role_permissions</code>.
                  Edit in Settings → Permissions; this page reflects the effective gate.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading permissions…
                  </div>
                ) : (
                  <div className="space-y-6">
                    {APP_ROLES.map((role) => (
                      <div key={role}>
                        <div className="mb-2 flex items-center gap-2">
                          <Badge variant="outline">{role}</Badge>
                        </div>
                        <div className="overflow-x-auto rounded border">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="w-[220px]">Module</TableHead>
                                {ACTIONS.map((a) => (
                                  <TableHead key={a.key} className="text-center capitalize">{a.label}</TableHead>
                                ))}
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {RESOURCES.map((res) => {
                                const row = lookup.get(`${role}::${res.key}`);
                                return (
                                  <TableRow key={res.key}>
                                    <TableCell>
                                      <div className="text-sm font-medium">{res.label}</div>
                                      <div className="text-xs text-muted-foreground">{res.group}</div>
                                    </TableCell>
                                    {ACTIONS.map((a) => {
                                      const allowed = row ? Boolean(row[a.col]) : false;
                                      return (
                                        <TableCell key={a.key} className="text-center">
                                          {allowed ? (
                                            <Unlock className="mx-auto h-4 w-4 text-emerald-600" />
                                          ) : (
                                            <Lock className="mx-auto h-4 w-4 text-muted-foreground/40" />
                                          )}
                                        </TableCell>
                                      );
                                    })}
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Admin sub-roles matrix */}
          <TabsContent value="admin-subroles">
            <div className="space-y-6">
              {/* Route × sub-role matrix */}
              <Card>
                <CardHeader>
                  <CardTitle>Admin route → required sub-roles</CardTitle>
                  <CardDescription>
                    Each <code className="rounded bg-muted px-1 text-xs">/admin/*</code> and{" "}
                    <code className="rounded bg-muted px-1 text-xs">/settings/*</code> route requires at least one of the listed admin sub-roles.
                    First match wins — more-specific prefixes are checked before broader ones.
                  </CardDescription>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[260px]">Route</TableHead>
                        {ADMIN_SUBROLES.map((s) => (
                          <TableHead key={s} className="text-center text-xs">
                            {ADMIN_SUBROLE_LABELS[s]}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {adminRouteRows.map((rule) => (
                        <TableRow key={rule.prefix}>
                          <TableCell>
                            <div className="font-mono text-sm">{rule.prefix}</div>
                            <div className="text-xs text-muted-foreground">
                              {ADMIN_ROUTE_LABELS[rule.prefix] ?? "—"}
                            </div>
                          </TableCell>
                          {ADMIN_SUBROLES.map((s) => {
                            const allowed = rule.allowed.includes(s);
                            return (
                              <TableCell key={s} className="text-center">
                                {allowed ? (
                                  <CheckCircle2 className="mx-auto h-4 w-4 text-emerald-600" aria-label="allowed" />
                                ) : (
                                  <XCircle className="mx-auto h-4 w-4 text-muted-foreground/30" aria-label="blocked" />
                                )}
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <div className="mt-4 flex gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-emerald-600" /> allowed</span>
                    <span className="flex items-center gap-1"><XCircle className="h-3 w-3" /> blocked → redirected to /admin/access-checker</span>
                  </div>
                </CardContent>
              </Card>

              {/* Example access-checker outputs */}
              <Card>
                <CardHeader>
                  <CardTitle>Example access-checker outputs</CardTitle>
                  <CardDescription>
                    Simulated results showing what each user profile sees when they try to open an admin route.
                    These match the live diagnostics shown on the{" "}
                    <code className="rounded bg-muted px-1 text-xs">/admin/access-checker</code> page.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {EXAMPLE_PROFILES.map((profile) => {
                    // Pick two representative routes: one they can access, one they cannot
                    const accessibleRoute = adminRouteRows.find((r) =>
                      profile.subroles.some((s) => r.allowed.includes(s)),
                    );
                    const blockedRoute = adminRouteRows.find((r) =>
                      !profile.subroles.some((s) => r.allowed.includes(s)),
                    );

                    return (
                      <div
                        key={profile.label}
                        className="rounded-lg border p-4"
                      >
                        <div className="mb-3 flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className={
                              profile.color === "emerald"
                                ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-100"
                                : profile.color === "amber"
                                  ? "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100"
                                  : "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-100"
                            }
                          >
                            {profile.label}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            Sub-roles: {profile.subroles.length > 0 ? profile.subroles.map((s) => ADMIN_SUBROLE_LABELS[s]).join(", ") : "none"}
                          </span>
                        </div>

                        <div className="space-y-2">
                          {accessibleRoute && (
                            <ExampleVerdict
                              allowed
                              route={accessibleRoute.prefix}
                              label={ADMIN_ROUTE_LABELS[accessibleRoute.prefix] ?? accessibleRoute.prefix}
                              reason={`Sub-role "${profile.subroles.find((s) => accessibleRoute.allowed.includes(s))}" matches the allow-list [${accessibleRoute.allowed.join(", ")}].`}
                            />
                          )}
                          {blockedRoute && (
                            <ExampleVerdict
                              allowed={false}
                              route={blockedRoute.prefix}
                              label={ADMIN_ROUTE_LABELS[blockedRoute.prefix] ?? blockedRoute.prefix}
                              reason={`Sub-roles [${profile.subroles.join(", ") || "none"}] do NOT match the allow-list [${blockedRoute.allowed.join(", ")}].`}
                              missing={blockedRoute.allowed}
                            />
                          )}
                          {!accessibleRoute && !blockedRoute && (
                            <p className="text-xs text-muted-foreground">No applicable routes for this profile.</p>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  <Alert variant="default" className="mt-2">
                    <ShieldAlert className="h-4 w-4" />
                    <AlertTitle>How to resolve a blocked route</AlertTitle>
                    <AlertDescription className="space-y-1 text-sm">
                      <p>
                        When a user is redirected to <code className="rounded bg-muted px-1 text-xs">/admin/access-checker</code>, the page shows exactly which sub-roles are missing.
                      </p>
                      <p>
                        An <strong>Org Owner</strong> or <strong>Super Admin</strong> can grant the required sub-role via the admin panel. The change takes effect immediately — no re-login required.
                      </p>
                    </AlertDescription>
                  </Alert>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}

function ExampleVerdict({
  allowed,
  route,
  label,
  reason,
  missing,
}: {
  allowed: boolean;
  route: string;
  label: string;
  reason: string;
  missing?: AdminSubrole[];
}) {
  return (
    <div
      className={
        "rounded-md border px-3 py-2 text-sm " +
        (allowed
          ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-100"
          : "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-100")
      }
    >
      <div className="flex items-center gap-2 font-medium">
        {allowed ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
        ) : (
          <XCircle className="h-4 w-4 text-rose-600" />
        )}
        <span className="font-mono text-xs">{route}</span>
        <span className="text-muted-foreground">—</span>
        <span>{label}</span>
      </div>
      <p className="mt-1 text-xs opacity-90">{reason}</p>
      {missing && missing.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          <span className="text-xs opacity-75">Missing sub-role(s):</span>
          {missing.map((s) => (
            <Badge key={s} variant="outline" className="h-5 text-[10px]">
              {ADMIN_SUBROLE_LABELS[s]}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
