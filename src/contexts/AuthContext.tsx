import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import { setCurrentOrgId } from "@/lib/currentOrg";

export type OrgRole = "owner" | "admin" | "member" | string;

export interface AuthContextValue {
  /** Supabase auth user id, or null if signed out. */
  userId: string | null;
  /** The user's primary organization id (from organization_members), or null. */
  orgId: string | null;
  /** The user's role within that organization, or null. */
  role: OrgRole | null;
  /** True while either the session or the org membership is being resolved. */
  isLoading: boolean;
  /** Force a refresh of org membership (e.g. after switching orgs). */
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

interface AuthContextProviderProps {
  children: ReactNode;
}

async function resolveMembership(userId: string): Promise<{
  orgId: string | null;
  role: OrgRole | null;
}> {
  // `organization_members.user_id` references auth.users(id) — i.e.
  // the Supabase auth user id. RLS scopes the read to the caller's own
  // memberships. We pick the most recent membership as the "primary" org.
  const { data, error } = await supabase
    .from("organization_members")
    .select("org_id, role, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn("[AuthContext] failed to load organization membership", error);
  }

  if (data?.org_id) {
    return {
      orgId: data.org_id,
      role: (data.role as OrgRole | undefined) ?? null,
    };
  }

  // No explicit membership. ONLY platform (super) admins may fall back to an
  // arbitrary organization — for every other user, having no membership means
  // having no tenant, and therefore no data. Never guess a tenant here: doing
  // so used to hand brand-new accounts another hospital's workspace.
  const { data: isPlatformAdmin } = await supabase.rpc("is_platform_admin");
  if (isPlatformAdmin === true) {
    const { data: fallback } = await supabase
      .from("organizations")
      .select("id")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (fallback?.id) {
      return { orgId: fallback.id, role: "admin" };
    }
  }

  return { orgId: null, role: null };
}


export function AuthContextProvider({ children }: AuthContextProviderProps) {
  const [userId, setUserId] = useState<string | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [role, setRole] = useState<OrgRole | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const applySession = async (nextUserId: string | null) => {
      if (cancelled) return;
      setUserId(nextUserId);

      if (!nextUserId) {
        setOrgId(null);
        setRole(null);
        setCurrentOrgId(null);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      const { orgId: nextOrgId, role: nextRole } = await resolveMembership(nextUserId);
      if (cancelled) return;
      setOrgId(nextOrgId);
      setRole(nextRole);
      setCurrentOrgId(nextOrgId);
      setIsLoading(false);
    };

    // Initial session lookup.
    void supabase.auth.getSession().then(({ data }) => {
      void applySession(data.session?.user.id ?? null);
    });

    // Keep state in sync with login / logout / token refresh.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      void applySession(session?.user.id ?? null);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      userId,
      orgId,
      role,
      isLoading,
      refresh: async () => {
        if (!userId) return;
        const { orgId: nextOrgId, role: nextRole } = await resolveMembership(userId);
        setOrgId(nextOrgId);
        setRole(nextRole);
        setCurrentOrgId(nextOrgId);
      },
    }),
    [userId, orgId, role, isLoading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth() must be used inside <AuthContextProvider>");
  }
  return ctx;
}
