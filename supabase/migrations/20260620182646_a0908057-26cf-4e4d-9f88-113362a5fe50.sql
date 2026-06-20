
-- ============================================================
-- 1. Canonical app_role enum
-- ============================================================
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM (
    'Super Admin',
    'Hospital Admin',
    'RCM Manager',
    'Billing Executive',
    'TPA Coordinator',
    'Front Office',
    'Finance',
    'Auditor',
    'Viewer'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- 2. user_roles table (capability layer)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_roles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id      uuid NOT NULL,
  role        public.app_role NOT NULL,
  granted_by  uuid,
  granted_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, org_id, role)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_roles read own org" ON public.user_roles;
CREATE POLICY "user_roles read own org"
  ON public.user_roles FOR SELECT
  USING (public.is_org_member(org_id) OR user_id = auth.uid());

DROP POLICY IF EXISTS "user_roles manage by org admin" ON public.user_roles;
CREATE POLICY "user_roles manage by org admin"
  ON public.user_roles FOR ALL
  USING (public.has_org_role(org_id, ARRAY['owner','admin']::org_role[]))
  WITH CHECK (public.has_org_role(org_id, ARRAY['owner','admin']::org_role[]));

CREATE INDEX IF NOT EXISTS user_roles_user_org_idx ON public.user_roles(user_id, org_id);

-- ============================================================
-- 3. has_app_role helper (no recursion, SECURITY DEFINER)
-- ============================================================
CREATE OR REPLACE FUNCTION public.has_app_role(_user_id uuid, _org_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.is_platform_admin()
      OR EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = _user_id AND org_id = _org_id AND role = _role
      );
$$;

CREATE OR REPLACE FUNCTION public.my_app_roles(_org_id uuid)
RETURNS SETOF public.app_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT role FROM public.user_roles
  WHERE user_id = auth.uid() AND org_id = _org_id
  ORDER BY role;
$$;

-- ============================================================
-- 4. Backfill from app_users.role
-- ============================================================
INSERT INTO public.user_roles (user_id, org_id, role)
SELECT au.auth_user_id, au.org_id, au.role::public.app_role
FROM public.app_users au
WHERE au.auth_user_id IS NOT NULL
  AND au.org_id IS NOT NULL
  AND au.role IS NOT NULL
  AND au.role IN (
    'Super Admin','Hospital Admin','RCM Manager','Billing Executive',
    'TPA Coordinator','Front Office','Finance','Auditor','Viewer'
  )
ON CONFLICT (user_id, org_id, role) DO NOTHING;

-- ============================================================
-- 5. Drop unused app_user_access (0 rows, no app code references)
-- ============================================================
DROP TABLE IF EXISTS public.app_user_access;

-- ============================================================
-- 6. Hospital KPI refresh function + nightly cron
-- ============================================================
CREATE OR REPLACE FUNCTION public.refresh_hospital_kpis()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _period text := to_char(date_trunc('month', now()), 'YYYY-MM');
  _n int := 0;
BEGIN
  -- Wipe this period's rows and recompute
  DELETE FROM public.hospital_kpis WHERE period = _period;

  INSERT INTO public.hospital_kpis (org_id, period, metric, value, recorded_at)
  SELECT c.org_id, _period, 'claims_total', count(*)::numeric, now()
  FROM public.claims c
  WHERE c.org_id IS NOT NULL
    AND to_char(coalesce(c.date_of_admission, c.created_at), 'YYYY-MM') = _period
  GROUP BY c.org_id;

  INSERT INTO public.hospital_kpis (org_id, period, metric, value, recorded_at)
  SELECT c.org_id, _period, 'claims_settled', count(*)::numeric, now()
  FROM public.claims c
  WHERE c.org_id IS NOT NULL
    AND c.claim_status_bucket = 'settled'
    AND to_char(coalesce(c.date_of_admission, c.created_at), 'YYYY-MM') = _period
  GROUP BY c.org_id;

  INSERT INTO public.hospital_kpis (org_id, period, metric, value, recorded_at)
  SELECT c.org_id, _period, 'claims_denied', count(*)::numeric, now()
  FROM public.claims c
  WHERE c.org_id IS NOT NULL
    AND c.claim_status_bucket = 'denied'
    AND to_char(coalesce(c.date_of_admission, c.created_at), 'YYYY-MM') = _period
  GROUP BY c.org_id;

  INSERT INTO public.hospital_kpis (org_id, period, metric, value, recorded_at)
  SELECT c.org_id, _period, 'amount_outstanding',
         coalesce(sum(coalesce(c.claim_amount,0) - coalesce(c.settled_amount,0)),0)::numeric, now()
  FROM public.claims c
  WHERE c.org_id IS NOT NULL
    AND c.claim_status_bucket NOT IN ('settled','closed')
    AND to_char(coalesce(c.date_of_admission, c.created_at), 'YYYY-MM') = _period
  GROUP BY c.org_id;

  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END $$;

-- Schedule (idempotent)
DO $$ BEGIN
  PERFORM cron.unschedule('refresh-hospital-kpis-nightly');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'refresh-hospital-kpis-nightly',
  '0 20 * * *', -- 20:00 UTC = 01:30 IST (approx)
  $$ SELECT public.refresh_hospital_kpis(); $$
);

-- ============================================================
-- 7. Documentation — codify the 3-layer permission model
-- ============================================================
COMMENT ON TABLE public.organization_members IS
'PERMISSION LAYER 1 — TENANCY. Source of truth for "is this user in this org?". Coarse org role (owner/admin/member) used by is_org_member()/has_org_role() in RLS on every tenant-scoped table.';

COMMENT ON TABLE public.admin_role_assignments IS
'PERMISSION LAYER 1b — ADMIN CONSOLE ACL. Which admin/settings screens an org member can open (org_owner, org_admin, billing, compliance, tech). Auto-synced from organization_members.role by sync_admin_subroles_from_membership().';

COMMENT ON TABLE public.user_roles IS
'PERMISSION LAYER 2 — CAPABILITY. Canonical user×org×role mapping. The ONLY source of truth for app capability roles. Checked via has_app_role() and joined to role_permissions for feature-matrix lookups.';

COMMENT ON TABLE public.role_permissions IS
'PERMISSION LAYER 2 — CAPABILITY MATRIX. Per-role × resource × action (view/create/edit/...). The "role" column matches public.app_role values. Read via useHasPermission() in the UI; the user''s active role comes from user_roles.';

COMMENT ON TABLE public.org_app_access IS
'PERMISSION LAYER 2b — MODULE FLAGS. Per-org product entitlement (claims / OPD / wellness / gov). Used to hide whole modules an org has not purchased.';

COMMENT ON TABLE public.user_tpa_allocations IS
'PERMISSION LAYER 3 — DATA SCOPE. NOT a capability. Filters which TPA/insurer rows a user is responsible for. Combined with branch scope on organization_members to scope row-level reads.';

COMMENT ON COLUMN public.app_users.role IS
'DEPRECATED: kept for display only. Authoritative roles live in public.user_roles. Do not gate features off this column.';

COMMENT ON TABLE public.private_cron_config IS
'CRON SECRETS — RLS intentionally OFF. Only accessed via SECURITY DEFINER helpers private_cron_get() / private_cron_set(). No direct grants to anon/authenticated; PostgREST cannot expose it.';

COMMENT ON TABLE public.hospital_kpis IS
'Pre-aggregated dashboard metrics per org × period × metric. Refreshed nightly at ~01:30 IST by cron job "refresh-hospital-kpis-nightly" calling refresh_hospital_kpis().';
