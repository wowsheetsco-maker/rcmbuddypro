import { useMemo, useState } from "react";
import { Shield, Check, X, AlertTriangle, Info, ExternalLink } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Link } from "@/lib/router-compat";
import { ROLES, type UserRole } from "@/hooks/useAppUsers";
import {
  ACTIONS,
  RESOURCES,
  useRolePermissions,
  type Action,
  type Resource,
  type RolePermission,
} from "@/hooks/useRolePermissions";

/**
 * Static map of (resource, action) cells that the runtime currently enforces.
 * Keep this in sync with the audit findings — see prior permissions audit.
 *
 * Each entry documents WHERE the gate lives so engineers can trust the badge.
 */
type EnforcementInfo = { where: string };
const ENFORCED: Partial<Record<Resource, Partial<Record<Action, EnforcementInfo>>>> = {
  analytics: {
    view: { where: "Route gate (_LegacyApp.tsx → /analytics/*)" },
  },
  users: {
    edit: { where: "Route gate (_LegacyApp.tsx → /settings/users)" },
  },
  claims: {
    export: { where: "Button gate (ClaimsPage.tsx Export button)" },
  },
};

function isEnforced(resource: Resource, action: Action): EnforcementInfo | null {
  return ENFORCED[resource]?.[action] ?? null;
}

const ACTION_COL_KEYS: Record<Action, keyof RolePermission> = ACTIONS.reduce(
  (acc, a) => ({ ...acc, [a.key]: a.col }),
  {} as Record<Action, keyof RolePermission>,
);

export default function EffectivePermissionsPage() {
  const { rows, loading } = useRolePermissions();
  const [activeRole, setActiveRole] = useState<UserRole>("Hospital Admin");

  const matrix = useMemo(() => {
    const m = new Map<string, RolePermission>();
    rows.forEach((r) => m.set(`${r.role}::${r.resource}`, r));
    return m;
  }, [rows]);

  const groupedResources = useMemo(() => {
    const m = new Map<string, typeof RESOURCES>();
    RESOURCES.forEach((r) => {
      const arr = m.get(r.group) ?? [];
      arr.push(r);
      m.set(r.group, arr);
    });
    return Array.from(m.entries());
  }, []);

  const stats = useMemo(() => {
    let allowed = 0;
    let allowedEnforced = 0;
    let allowedUnenforced = 0;
    RESOURCES.forEach((res) => {
      ACTIONS.forEach((act) => {
        const row = matrix.get(`${activeRole}::${res.key}`);
        if (!row) return;
        const granted = Boolean(row[ACTION_COL_KEYS[act.key]]);
        if (granted) {
          allowed += 1;
          if (isEnforced(res.key, act.key)) allowedEnforced += 1;
          else allowedUnenforced += 1;
        }
      });
    });
    return { allowed, allowedEnforced, allowedUnenforced };
  }, [matrix, activeRole]);

  return (
    <AppLayout>
      <TooltipProvider delayDuration={150}>
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-primary/10 p-2.5">
                <Shield className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">Effective Permissions</h1>
                <p className="text-sm text-muted-foreground max-w-2xl mt-1">
                  Read-only view of what each role can actually do at runtime. Cells reflect the
                  permissions matrix; badges show whether the UI enforces the rule today.
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link to="/settings/permissions">
                Edit matrix <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
              </Link>
            </Button>
          </div>


          {/* Role tabs */}
          <Tabs value={activeRole} onValueChange={(v) => setActiveRole(v as UserRole)}>
            <TabsList className="flex-wrap h-auto">
              {ROLES.map((r) => (
                <TabsTrigger key={r} value={r} className="text-xs sm:text-sm">
                  {r}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {/* Summary chips */}
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="secondary">
              {stats.allowed} permissions granted
            </Badge>
            <Badge variant="outline" className="border-emerald-500/50 text-emerald-700 dark:text-emerald-400">
              <Check className="h-3 w-3 mr-1" />
              {stats.allowedEnforced} enforced
            </Badge>
            <Badge variant="outline" className="border-amber-500/50 text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-3 w-3 mr-1" />
              {stats.allowedUnenforced} advisory only
            </Badge>
          </div>

          {/* Matrix */}
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              {loading ? (
                <div className="p-8 text-sm text-muted-foreground">Loading matrix…</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 border-b">
                    <tr>
                      <th className="text-left font-medium px-4 py-3 sticky left-0 bg-muted/50 z-10 min-w-[200px]">
                        Resource
                      </th>
                      {ACTIONS.map((a) => (
                        <th key={a.key} className="text-center font-medium px-3 py-3 min-w-[90px]">
                          {a.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {groupedResources.map(([group, items]) => (
                      <>
                        <tr key={`g-${group}`} className="bg-muted/20">
                          <td colSpan={ACTIONS.length + 1} className="px-4 py-1.5 text-[11px] uppercase tracking-wider font-medium text-muted-foreground">
                            {group}
                          </td>
                        </tr>
                        {items.map((res) => {
                          const row = matrix.get(`${activeRole}::${res.key}`);
                          return (
                            <tr key={res.key} className="border-b last:border-0 hover:bg-muted/30">
                              <td className="px-4 py-2.5 font-medium sticky left-0 bg-background z-10">
                                {res.label}
                              </td>
                              {ACTIONS.map((act) => {
                                const granted = Boolean(row?.[ACTION_COL_KEYS[act.key]]);
                                const enforcement = isEnforced(res.key, act.key);
                                return (
                                  <td key={act.key} className="px-3 py-2.5 text-center">
                                    <Cell granted={granted} enforcement={enforcement} />
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </div>
      </TooltipProvider>
    </AppLayout>
  );
}

function Cell({ granted, enforcement }: { granted: boolean; enforcement: EnforcementInfo | null }) {
  if (!granted) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center justify-center text-muted-foreground/50">
            <X className="h-4 w-4" />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          Denied by matrix
        </TooltipContent>
      </Tooltip>
    );
  }
  if (enforcement) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center justify-center gap-1 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 px-1.5 py-0.5">
            <Check className="h-3.5 w-3.5" />
            <span className="text-[10px] font-medium">Enforced</span>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs max-w-xs">
          <div className="font-medium mb-0.5">Runtime-enforced</div>
          <div className="text-muted-foreground">{enforcement.where}</div>
        </TooltipContent>
      </Tooltip>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center justify-center gap-1 rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-400 px-1.5 py-0.5">
          <AlertTriangle className="h-3.5 w-3.5" />
          <span className="text-[10px] font-medium">Advisory</span>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs max-w-xs">
        <div className="font-medium mb-0.5">Allowed by matrix</div>
        <div className="text-muted-foreground">No UI gate today — action is not actually blocked at runtime.</div>
      </TooltipContent>
    </Tooltip>
  );
}
