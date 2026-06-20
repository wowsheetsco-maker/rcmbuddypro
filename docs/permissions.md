# RCMBuddy Permission Model

Three layers. Every access decision in the app maps to exactly one of them.
When debugging "why can't this user see this claim?" walk down the layers in
order — the first one that says **no** is your answer.

## Layer 1 — Tenancy (am I in this org?)

| Table | Owns |
|---|---|
| `organization_members` | The single source of truth for "user X is in org Y". Coarse role: `owner` / `admin` / `member`. Read by `is_org_member()` and `has_org_role()` in almost every RLS policy. |
| `admin_role_assignments` | Which **admin/settings screens** an org member can open (`org_owner`, `org_admin`, `billing`, `compliance`, `tech`). Auto-synced from `organization_members.role`. Used only by admin pages. |

If a user has no row in `organization_members` for the target org, nothing
else matters.

## Layer 2 — Capability (can my role do X?)

| Table | Owns |
|---|---|
| `user_roles` | **Canonical** user × org × capability-role mapping. Roles come from the `public.app_role` enum (Super Admin, Hospital Admin, RCM Manager, Billing Executive, TPA Coordinator, Front Office, Finance, Auditor, Viewer). A user may hold multiple roles in one org. |
| `role_permissions` | Per-role × resource × action matrix (`can_view`, `can_create`, `can_edit`, `can_delete`, `can_export`, `can_send`, `can_approve`). |
| `org_app_access` | **Module flags** — which products (claims / OPD / wellness / gov) this org has purchased. Hides whole modules an org has not bought. |

The frontend `useHasPermission(resource, action)` does:

```
acting role ← user_roles for current user × current org
              ↓
              role_permissions[acting_role][resource][action]
```

`app_users.role` is **deprecated** and kept only for display in user-management
tables. Do not gate features off it.

`app_user_access` was a per-user module override. It was empty and unreferenced
in app code, so it has been dropped.

## Layer 3 — Data scope (which rows can I see?)

| Table | Owns |
|---|---|
| `user_tpa_allocations` | Which TPAs / insurers a user is responsible for. **Not** a capability — it filters rows, it does not grant or deny actions. |
| `organization_members.branch_scope` + `branch_scope_mode` | Which hospital branches a user's data is scoped to. Combined with `can_access_branch()` in RLS. |

A user may have the `claims:view` permission (Layer 2) but still see zero
claims because their TPA allocations or branch scope filter them out.

## Debug checklist

1. **Layer 1** — `SELECT * FROM organization_members WHERE user_id = … AND org_id = …;`
   No row → user is not in the org.
2. **Layer 2a** — `SELECT * FROM user_roles WHERE user_id = … AND org_id = …;`
   No row → user has no capability role.
3. **Layer 2b** — `SELECT * FROM role_permissions WHERE role = '<their role>' AND resource = '<feature>';`
   `can_view = false` → role lacks the action.
4. **Layer 2c** — `SELECT app_id, … FROM org_app_access WHERE org_id = …;`
   Module disabled → whole feature is hidden.
5. **Layer 3** — `SELECT * FROM user_tpa_allocations WHERE user_id = …;` plus
   `organization_members.branch_scope` for the user. Restrictive scope can
   filter the row even when permissions are correct.

## Cron / config tables

- `private_cron_config` — RLS intentionally OFF. Accessed only via
  `SECURITY DEFINER` helpers `private_cron_get()` / `private_cron_set()`.
  No grants to `anon`/`authenticated`, so PostgREST cannot read it.
- `hospital_kpis` — pre-aggregated dashboard metrics. Refreshed nightly at
  ~01:30 IST by the `refresh-hospital-kpis-nightly` cron job calling
  `public.refresh_hospital_kpis()`.
