import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import type { UserRole } from "@/hooks/useAppUsers";

export type Resource =
  | "dashboard" | "claims" | "discrepancy" | "irdai" | "tds" | "denials"
  | "follow_ups" | "calendar" | "ai_center" | "hospitals" | "tpa_insurers"
  | "contacts" | "analytics" | "settings" | "users";

export type Action = "view" | "create" | "edit" | "delete" | "export" | "send" | "approve";

export interface RolePermission {
  id: string;
  role: UserRole;
  resource: Resource;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
  can_export: boolean;
  can_send: boolean;
  can_approve: boolean;
  updated_at: string;
}

export const RESOURCES: { key: Resource; label: string; group: string }[] = [
  { key: "dashboard",    label: "Dashboard",            group: "Workspace" },
  { key: "claims",       label: "Claims",               group: "Operations" },
  { key: "discrepancy",  label: "Discrepancy Tracker",  group: "Operations" },
  { key: "denials",      label: "Denials & Appeals",    group: "Operations" },
  { key: "irdai",        label: "SLA Tracker",        group: "Operations" },
  { key: "tds",          label: "TDS Report",           group: "Operations" },
  { key: "follow_ups",   label: "Follow-Ups",           group: "Communications" },
  { key: "calendar",     label: "Calendar",             group: "Communications" },
  { key: "ai_center",    label: "AI Center",            group: "Communications" },
  { key: "hospitals",    label: "Hospitals & Branches", group: "Directory" },
  { key: "tpa_insurers", label: "TPA / Insurers",       group: "Directory" },
  { key: "contacts",     label: "Contacts",             group: "Directory" },
  { key: "analytics",    label: "Analytics",            group: "Insights" },
  { key: "settings",     label: "Settings",             group: "Admin" },
  { key: "users",        label: "Users & Roles",        group: "Admin" },
];

export const ACTIONS: { key: Action; label: string; col: keyof RolePermission }[] = [
  { key: "view",    label: "View",    col: "can_view" },
  { key: "create",  label: "Create",  col: "can_create" },
  { key: "edit",    label: "Edit",    col: "can_edit" },
  { key: "delete",  label: "Delete",  col: "can_delete" },
  { key: "export",  label: "Export",  col: "can_export" },
  { key: "send",    label: "Send",    col: "can_send" },
  { key: "approve", label: "Approve", col: "can_approve" },
];

const ACTING_KEY = "rcm-acting-role";
export const DEFAULT_ACTING_ROLE: UserRole = "Super Admin";

export function getActingRole(): UserRole {
  if (typeof window === "undefined") return DEFAULT_ACTING_ROLE;
  return (localStorage.getItem(ACTING_KEY) as UserRole) || DEFAULT_ACTING_ROLE;
}
export function setActingRole(role: UserRole) {
  localStorage.setItem(ACTING_KEY, role);
  window.dispatchEvent(new CustomEvent("rcm-acting-role-change"));
}

export function useRolePermissions() {
  const [rows, setRows] = useState<RolePermission[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("role_permissions")
      .select("*")
      .order("role")
      .order("resource");
    if (error) {
      toast({ title: "Failed to load permissions", description: error.message, variant: "destructive" });
    } else {
      setRows((data ?? []) as RolePermission[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const ch = supabase
      .channel("role_permissions-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "role_permissions" }, () => refresh())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [refresh]);

  /** Map: `${role}::${resource}` → row */
  const lookup = useMemo(() => {
    const map = new Map<string, RolePermission>();
    rows.forEach((r) => map.set(`${r.role}::${r.resource}`, r));
    return map;
  }, [rows]);

  const updateCell = useCallback(async (id: string, col: keyof RolePermission, value: boolean) => {
    const patch = { [col]: value } as never;
    const { error } = await supabase.from("role_permissions").update(patch).eq("id", id);
    if (error) {
      toast({ title: "Could not update permission", description: error.message, variant: "destructive" });
      return false;
    }
    return true;
  }, []);

  const updateRow = useCallback(async (id: string, patch: Partial<RolePermission>) => {
    const { error } = await supabase.from("role_permissions").update(patch).eq("id", id);
    if (error) {
      toast({ title: "Could not update permission", description: error.message, variant: "destructive" });
      return false;
    }
    return true;
  }, []);

  return { rows, loading, refresh, lookup, updateCell, updateRow };
}

/** Check if the currently-acting role can perform an action on a resource. */
export function usePermission(resource: Resource, action: Action = "view"): boolean {
  const { lookup, loading } = useRolePermissions();
  const [acting, setActing] = useState<UserRole>(getActingRole());

  useEffect(() => {
    const handler = () => setActing(getActingRole());
    window.addEventListener("rcm-acting-role-change", handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener("rcm-acting-role-change", handler);
      window.removeEventListener("storage", handler);
    };
  }, []);

  if (loading) return true; // optimistic while loading
  const row = lookup.get(`${acting}::${resource}`);
  if (!row) return false;
  const colMap: Record<Action, keyof RolePermission> = {
    view: "can_view", create: "can_create", edit: "can_edit", delete: "can_delete",
    export: "can_export", send: "can_send", approve: "can_approve",
  };
  return Boolean(row[colMap[action]]);
}
