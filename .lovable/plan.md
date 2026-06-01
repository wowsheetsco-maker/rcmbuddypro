## Goal

Lock down RCM Buddy for hospital deployment by adding branch-scoped data access, admin sub-roles, tenant-isolation tests, and patching all remaining unauthenticated server functions.

## Scope (4 work streams, executed in order)

### 1. Branch-scoped authorization (DB + UI)

**DB migration** — extend membership with optional branch scope:

```text
organization_members
  + branch_scope            uuid[]  NULL   -- NULL = all branches in org
  + branch_scope_mode       text    'all' | 'restricted' (default 'all')
```

- New SECURITY DEFINER helper `can_access_branch(_org_id uuid, _branch_id uuid)`:
  returns `is_platform_admin() OR (member of org AND (branch_scope_mode='all' OR _branch_id = ANY(branch_scope)))`.
- Add branch-scoped RLS policies on tables that carry `hospital_branch_id`:
  `claims`, `gov_claims`, `gov_empanelment`, `opd_corporates`, `ahc_bookings` (via package→branch is N/A; tables w/ branch column only).
- Policies stay org-scoped but add `AND (hospital_branch_id IS NULL OR can_access_branch(org_id, hospital_branch_id))` on SELECT/UPDATE/DELETE.
- Leave existing `is_org_member` SELECT policies intact for tables without `hospital_branch_id`.

**Frontend**
- New `useBranchScope()` hook reading from `organization_members` for current `auth.uid()` + current org.
- `BranchPicker` already exists — filter its options by `branch_scope` when `mode='restricted'`.
- Hide branch-switcher option in UI when user has only one allowed branch.

### 2. Admin sub-roles

**DB**

```text
CREATE TYPE admin_subrole AS ENUM (
  'super_admin',         -- platform-wide; matches existing platform_admins
  'org_owner',           -- maps from organization_members.role='owner'
  'org_admin',           -- maps from organization_members.role='admin'
  'billing_admin',       -- can manage claims + users in own branch scope
  'compliance_admin',    -- read-only across org for audit
  'tech_admin'           -- integrations, AI, webhooks, no PHI write
);

CREATE TABLE public.admin_role_assignments (
  id uuid pk,
  org_id uuid not null,
  user_id uuid not null,
  subrole admin_subrole not null,
  granted_by uuid,
  granted_at timestamptz default now(),
  UNIQUE (org_id, user_id, subrole)
);
```

- `has_admin_subrole(_user uuid, _org uuid, _subrole admin_subrole)` SECURITY DEFINER helper.
- GRANT block + RLS: only `org_owner`/`super_admin` can read/write assignments in their org.

**Frontend route gating** in `src/lib/routeAccess.ts`:

```text
/admin/control-panel       → super_admin | org_owner | tech_admin
/admin/promote             → super_admin only
/admin/org-access          → super_admin | org_owner
/admin/roles-matrix        → super_admin | org_owner | org_admin
/admin/access-checker      → any admin subrole
/settings/users            → org_owner | org_admin | billing_admin (scoped)
/settings/permissions      → super_admin | org_owner
/settings/ai-providers     → super_admin | tech_admin
/settings/integrations     → super_admin | tech_admin
```

Extend `_authenticated.tsx` `allowedRolesForPath` to call a new
`canAccessAdminPath(path, subroles)` and redirect to `/access-denied` otherwise.

### 3. Playwright tenant-isolation tests

`e2e/tenant-isolation.spec.ts` — seed two orgs via Supabase admin client in
`globalSetup`, then:

1. Log in as Org A user, fetch `/claims` API → assert 0 rows from Org B's claim IDs.
2. Attempt direct REST: `GET /rest/v1/claims?id=eq.<OrgB-claim-id>` with Org A bearer → expect empty.
3. Branch-restricted user inside Org A: assert `/claims` returns only own-branch claims.
4. Cross-org admin escalation attempt via `promote_to_super_admin` → expect 403.

`e2e/admin-subroles.spec.ts` — log in as each subrole, assert which `/admin/*` routes render vs redirect to `/access-denied`.

Add CI npm script `e2e:isolation`.

### 4. Server-function auth patches

Audit + fix:

- `src/lib/preflight.functions.ts` — `getPreflightStatus` needs `requireSupabaseAuth` + platform-admin gate.
- `src/lib/whatsapp.functions.ts` — `sendWhatsApp` needs `requireSupabaseAuth` + org-membership check.
- `src/lib/orgs.functions.ts` — verify each fn has middleware.
- `src/routes/api/public/hooks/dispatch-notifications.ts` — replace anon-key gate with `DISPATCH_WEBHOOK_SECRET` HMAC (add secret request).
- `src/routes/api/public/hooks/team-digests.ts` — make token check unconditional (no `if (process.env.NODE_ENV)` bypass).
- `src/routes/api/public/hooks/whatsapp-delivery.ts` — verify provider signature.
- Confirm `src/start.ts` registers `attachSupabaseAuth` as global `functionMiddleware`.

For each patched fn: keep behavior identical for happy path, return 401/403 for unauth.

## Out of scope (deferred to later sprint)

- Encrypting `ai_providers.api_key` with pgcrypto (separate DB task).
- Audit-log viewer UI (#18).
- Custom email domain (#22).
- Rate limiting (#10) — needs Cloudflare/edge config.

## Execution order

1. Submit DB migration for branch scope + admin subroles + helpers + RLS (one migration, requires user approval).
2. After approval: update `routeAccess.ts`, `_authenticated.tsx`, `BranchPicker`, add `useBranchScope`, `useAdminSubroles` hooks.
3. Patch server functions; request `DISPATCH_WEBHOOK_SECRET` if not present.
4. Add Playwright specs + globalSetup seed.
5. Run `bunx playwright test e2e/tenant-isolation.spec.ts` and report.

## Risk notes

- Branch RLS change can hide existing rows from current users — migration sets `branch_scope_mode='all'` for every existing member, so no regression on day one.
- Admin subrole migration is additive; existing `organization_members.role` continues to work as the primary gate. Subroles are *additional* grants.
- Tests rely on a service-role key being available to `globalSetup`; that's already present (`SUPABASE_SERVICE_ROLE_KEY`).
