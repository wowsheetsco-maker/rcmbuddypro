import { useMemo } from "react";
import { Users, UserCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useAppUsers, type UserRole } from "@/hooks/useAppUsers";
import { ACTIONS, RESOURCES, type Resource, type RolePermission } from "@/hooks/useRolePermissions";

interface RoleAccessPreviewProps {
  role: UserRole;
  /** Resolves the (possibly unsaved) value of a matrix cell. */
  cellValue: (role: UserRole, resource: Resource, col: keyof RolePermission) => boolean;
}

/**
 * "Who gets this access?" — live list of the people who will be affected by
 * the capability toggles currently staged for `role`, plus a rollup of the
 * modules they can reach.
 */
export default function RoleAccessPreview({ role, cellValue }: RoleAccessPreviewProps) {
  const { users, loading } = useAppUsers();

  const affected = useMemo(
    () => users.filter((u) => u.role === role),
    [users, role],
  );

  const visibleModules = useMemo(
    () => RESOURCES.filter((r) => cellValue(role, r.key, "can_view")),
    [role, cellValue],
  );

  const actionCounts = useMemo(
    () =>
      ACTIONS.map((a) => ({
        label: a.label,
        count: RESOURCES.filter((r) => cellValue(role, r.key, a.col)).length,
      })),
    [role, cellValue],
  );

  return (
    <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          Who gets this access?
        </h3>
        <Badge variant="outline" className="text-[10px]">
          {loading ? "…" : `${affected.length} user(s) with role “${role}”`}
        </Badge>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {affected.length === 0 && !loading && (
          <span className="text-xs text-muted-foreground">
            Nobody holds this role yet — changes take effect the moment you assign it.
          </span>
        )}
        {affected.map((u) => (
          <Badge key={u.id} variant="secondary" className="gap-1 text-[11px] font-normal">
            <UserCheck className="h-3 w-3" />
            {u.name}
            <span className="text-muted-foreground">· {u.status}</span>
          </Badge>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-1">
            Modules they can open ({visibleModules.length}/{RESOURCES.length})
          </p>
          <div className="flex flex-wrap gap-1">
            {visibleModules.length === 0 && <span className="text-xs text-muted-foreground">None</span>}
            {visibleModules.map((m) => (
              <Badge key={m.key} variant="outline" className="text-[10px] font-normal">{m.label}</Badge>
            ))}
          </div>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-1">
            Capability rollup
          </p>
          <div className="flex flex-wrap gap-1">
            {actionCounts.map((a) => (
              <Badge key={a.label} variant="outline" className="text-[10px] font-normal">
                {a.label}: {a.count}
              </Badge>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
