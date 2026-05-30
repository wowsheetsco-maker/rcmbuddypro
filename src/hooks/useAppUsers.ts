import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export type UserRole =
  | "Super Admin"
  | "Hospital Admin"
  | "RCM Manager"
  | "Billing Executive"
  | "Auditor"
  | "CFO View";

export type UserStatus = "active" | "inactive" | "invited";

export interface AppUser {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: UserRole;
  status: UserStatus;
  department: string | null;
  designation: string | null;
  notes: string | null;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
  // SMTP (per-user email sending)
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_username: string | null;
  smtp_password: string | null;
  smtp_use_tls: boolean;
  smtp_from_name: string | null;
  smtp_from_email: string | null;
  smtp_reply_to: string | null;
  smtp_verified_at: string | null;
}

export const ROLES: UserRole[] = [
  "Super Admin",
  "Hospital Admin",
  "RCM Manager",
  "Billing Executive",
  "Auditor",
  "CFO View",
];

export const STATUSES: UserStatus[] = ["active", "inactive", "invited"];

export function useAppUsers() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("app_users")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      toast({ title: "Failed to load users", description: error.message, variant: "destructive" });
    } else {
      setUsers((data ?? []) as AppUser[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const ch = supabase
      .channel(`app_users-changes-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "app_users" }, () => refresh())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [refresh]);

  const createUser = useCallback(async (input: Partial<AppUser> & Pick<AppUser, "name" | "email" | "role">) => {
    const { getCurrentOrgId } = await import("@/lib/currentOrg");
    const { inviteUserToOrg } = await import("@/lib/orgs.functions");
    const orgId = getCurrentOrgId();
    try {
      await inviteUserToOrg({
        data: {
          orgId,
          email: input.email,
          name: input.name,
          appRole: input.role,
          orgRole: input.role === "Hospital Admin" || input.role === "Super Admin" ? "admin" : "member",
          redirectTo: `${window.location.origin}/login`,
        },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to send invite";
      toast({ title: "Could not invite user", description: msg, variant: "destructive" });
      return false;
    }
    // Apply any extra profile fields (phone, department, notes, SMTP) the dialog provided.
    const { name: _n, email: _e, role: _r, ...extra } = input;
    if (Object.keys(extra).length > 0) {
      const emailLower = input.email.toLowerCase();
      await supabase.from("app_users").update(extra).eq("email", emailLower);
    }
    toast({ title: "Invite sent", description: `${input.name} will receive a sign-in email.` });
    return true;
  }, []);

  const updateUser = useCallback(async (id: string, patch: Partial<AppUser>) => {
    const { error } = await supabase.from("app_users").update(patch).eq("id", id);
    if (error) {
      toast({ title: "Could not update user", description: error.message, variant: "destructive" });
      return false;
    }
    toast({ title: "User updated" });
    return true;
  }, []);

  const deleteUser = useCallback(async (id: string, name: string) => {
    const { error } = await supabase.from("app_users").delete().eq("id", id);
    if (error) {
      toast({ title: "Could not delete user", description: error.message, variant: "destructive" });
      return false;
    }
    toast({ title: "User removed", description: `${name} has been removed.` });
    return true;
  }, []);

  return { users, loading, refresh, createUser, updateUser, deleteUser };
}
