import { supabase } from "@/integrations/supabase/client";
import { peekCurrentOrgId } from "@/lib/currentOrg";

/**
 * Access audit trail — every change to who can see or do what is appended
 * to `public.access_audit_log`. Rows are insert-only (no update/delete
 * policy), so the trail is safe to hand to a compliance reviewer.
 */

export type AccessAuditEntity =
  | "org_member"
  | "user_role"
  | "role_permission"
  | "branch_scope"
  | "tpa_allocation"
  | "invite"
  | "app_user";

export const ENTITY_LABELS: Record<AccessAuditEntity, string> = {
  org_member: "Org membership",
  user_role: "Capability role",
  role_permission: "Permission matrix",
  branch_scope: "Branch scope",
  tpa_allocation: "TPA allocation",
  invite: "Invite",
  app_user: "User profile",
};

export interface AccessAuditRow {
  id: string;
  org_id: string;
  branch_id: string | null;
  actor_user_id: string | null;
  actor_email: string | null;
  target_user_id: string | null;
  target_email: string | null;
  entity: AccessAuditEntity | string;
  action: string;
  summary: string;
  before_value: unknown;
  after_value: unknown;
  created_at: string;
}

export interface LogAccessChangeInput {
  entity: AccessAuditEntity;
  /** granted | revoked | updated | created | removed | invited */
  action: string;
  summary: string;
  branchId?: string | null;
  targetUserId?: string | null;
  targetEmail?: string | null;
  before?: unknown;
  after?: unknown;
  orgId?: string | null;
}

/**
 * Fire-and-forget audit write. Never throws — an audit failure must not
 * block the permission change the user just made (RLS still enforces the
 * real security boundary).
 */
export async function logAccessChange(input: LogAccessChangeInput): Promise<void> {
  try {
    const orgId = input.orgId ?? peekCurrentOrgId();
    if (!orgId) return;
    const { data: auth } = await supabase.auth.getUser();
    const user = auth?.user;
    if (!user) return;

    await supabase.from("access_audit_log").insert({
      org_id: orgId,
      branch_id: input.branchId ?? null,
      actor_user_id: user.id,
      actor_email: user.email ?? null,
      target_user_id: input.targetUserId ?? null,
      target_email: input.targetEmail ?? null,
      entity: input.entity,
      action: input.action,
      summary: input.summary,
      before_value: (input.before ?? null) as never,
      after_value: (input.after ?? null) as never,
    });
  } catch (err) {
    console.warn("[accessAudit] failed to write audit entry", err);
  }
}
