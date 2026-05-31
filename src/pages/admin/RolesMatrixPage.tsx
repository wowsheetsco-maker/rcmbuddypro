import { useMemo } from "react";
import { ShieldCheck, Lock, Unlock, Loader2 } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ROUTE_ROLE_RULES } from "@/lib/routeAccess";
import { useRolePermissions, RESOURCES, ACTIONS } from "@/hooks/useRolePermissions";
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

export default function RolesMatrixPage() {
  const { lookup, loading } = useRolePermissions();

  const routeRows = useMemo(() => ROUTE_ROLE_RULES, []);

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
        </Tabs>
      </div>
    </AppLayout>
  );
}
