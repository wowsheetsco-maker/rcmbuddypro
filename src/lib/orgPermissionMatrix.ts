/**
 * Org-level (workspace) permissions used to render the interactive
 * "Org role × Hospital scenario" preview on the Permissions page.
 *
 * This complements the app-role × resource matrix stored in the database
 * (`role_permissions` table). The data below mirrors the published
 * Roles & Permissions Guide PDF.
 */

export type OrgRoleKey =
  | "platform_super_admin"
  | "org_owner"
  | "org_admin"
  | "manager"
  | "member"
  | "viewer"
  | "billing_contact";

export type ScenarioKey = "individual" | "group" | "rcm_internal";

export type OrgActionKey =
  | "create_org"
  | "add_branches"
  | "invite_members"
  | "assign_roles"
  | "view_settings"
  | "access_claims"
  | "access_finance"
  | "access_audit_logs";

export const ORG_ROLES: { key: OrgRoleKey; label: string; description: string }[] = [
  { key: "platform_super_admin", label: "Platform Super Admin", description: "RCM Buddy internal staff — creates organisations and onboards customers." },
  { key: "org_owner",            label: "Org Owner",            description: "Top-level admin of a hospital or hospital group. Full structural control." },
  { key: "org_admin",            label: "Org Admin",            description: "Manages members, branches, and settings on behalf of the Owner." },
  { key: "manager",              label: "Manager",              description: "Leads a team or branch — manages day-to-day claims operations." },
  { key: "member",               label: "Member",               description: "Operational user (Billing Executive, RCM Coordinator). Works on assigned claims." },
  { key: "viewer",               label: "Viewer",               description: "Read-only access — auditors, consultants, external reviewers." },
  { key: "billing_contact",      label: "Billing Contact",      description: "Receives invoices and finance correspondence. No operational access." },
];

export const HOSPITAL_SCENARIOS: { key: ScenarioKey; label: string; description: string; icon: "individual" | "group" | "internal" }[] = [
  { key: "individual",   label: "Individual Hospital",  description: "Single-site hospital running RCM Buddy for itself.", icon: "individual" },
  { key: "group",        label: "Hospital Group",       description: "Multi-branch hospital chain with centralised RCM.",   icon: "group" },
  { key: "rcm_internal", label: "RCM Buddy Internal",   description: "RCM Buddy's own team — onboarding & supporting clients.", icon: "internal" },
];

export const ORG_ACTIONS: { key: OrgActionKey; label: string; description: string }[] = [
  { key: "create_org",        label: "Create Hospital Org", description: "Provision a brand-new hospital workspace on the platform." },
  { key: "add_branches",      label: "Add Branches",        description: "Add or remove branches/units inside the workspace." },
  { key: "invite_members",    label: "Invite Members",      description: "Send invitations to new users to join the workspace." },
  { key: "assign_roles",      label: "Assign Roles",        description: "Change a user's org role or app role." },
  { key: "view_settings",     label: "View Settings",       description: "Open Settings → Permissions, Hospitals, Integrations, etc." },
  { key: "access_claims",     label: "Access Claims",       description: "Open Claims, Discrepancy, Denials and related modules." },
  { key: "access_finance",    label: "Access Finance",      description: "Open TDS, Cash-flow, payer revenue and finance reports." },
  { key: "access_audit_logs", label: "Audit Logs",          description: "View who changed what, when. Compliance reporting." },
];

/** Matrix: per scenario → per role → set of allowed actions. */
const MATRIX: Record<ScenarioKey, Partial<Record<OrgRoleKey, OrgActionKey[]>>> = {
  individual: {
    platform_super_admin: ["create_org", "add_branches", "invite_members", "assign_roles", "view_settings", "access_claims", "access_finance", "access_audit_logs"],
    org_owner:            ["add_branches", "invite_members", "assign_roles", "view_settings", "access_claims", "access_finance", "access_audit_logs"],
    org_admin:            ["add_branches", "invite_members", "assign_roles", "view_settings", "access_claims", "access_finance", "access_audit_logs"],
    manager:              ["invite_members", "view_settings", "access_claims", "access_finance"],
    member:               ["access_claims"],
    viewer:               ["view_settings", "access_claims", "access_finance"],
    billing_contact:      ["access_finance"],
  },
  group: {
    platform_super_admin: ["create_org", "add_branches", "invite_members", "assign_roles", "view_settings", "access_claims", "access_finance", "access_audit_logs"],
    org_owner:            ["add_branches", "invite_members", "assign_roles", "view_settings", "access_claims", "access_finance", "access_audit_logs"],
    org_admin:            ["add_branches", "invite_members", "assign_roles", "view_settings", "access_claims", "access_finance", "access_audit_logs"],
    manager:              ["invite_members", "view_settings", "access_claims", "access_finance"],
    member:               ["access_claims"],
    viewer:               ["view_settings", "access_claims", "access_finance"],
    billing_contact:      ["access_finance"],
  },
  rcm_internal: {
    platform_super_admin: ["create_org", "add_branches", "invite_members", "assign_roles", "view_settings", "access_claims", "access_finance", "access_audit_logs"],
    org_owner:            ["add_branches", "invite_members", "assign_roles", "view_settings", "access_claims", "access_finance", "access_audit_logs"],
    org_admin:            ["invite_members", "assign_roles", "view_settings", "access_claims", "access_audit_logs"],
    manager:              ["invite_members", "view_settings", "access_claims"],
    member:               ["access_claims"],
    viewer:               ["view_settings", "access_claims"],
    billing_contact:      ["access_finance"],
  },
};

export function orgPermissionAllowed(role: OrgRoleKey, scenario: ScenarioKey, action: OrgActionKey): boolean {
  return MATRIX[scenario]?.[role]?.includes(action) ?? false;
}

export function allowedActionsFor(role: OrgRoleKey, scenario: ScenarioKey): OrgActionKey[] {
  return MATRIX[scenario]?.[role] ?? [];
}
