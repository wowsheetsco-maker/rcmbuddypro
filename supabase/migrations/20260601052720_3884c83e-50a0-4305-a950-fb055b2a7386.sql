-- =========================================================
-- 1. Branch-scoped authorization
-- =========================================================

ALTER TABLE public.organization_members
  ADD COLUMN IF NOT EXISTS branch_scope uuid[] NULL,
  ADD COLUMN IF NOT EXISTS branch_scope_mode text NOT NULL DEFAULT 'all'
    CHECK (branch_scope_mode IN ('all','restricted'));

-- Helper: can the current auth user access this branch?
CREATE OR REPLACE FUNCTION public.can_access_branch(_org_id uuid, _branch_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_platform_admin()
    OR EXISTS (
      SELECT 1
      FROM public.organization_members om
      WHERE om.user_id = auth.uid()
        AND om.org_id  = _org_id
        AND (
          om.branch_scope_mode = 'all'
          OR _branch_id IS NULL
          OR _branch_id = ANY(om.branch_scope)
        )
    );
$$;

REVOKE EXECUTE ON FUNCTION public.can_access_branch(uuid, uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.can_access_branch(uuid, uuid) TO authenticated, service_role;

-- Replace SELECT/UPDATE/DELETE policies on branch-scoped tables.
-- Insert policies stay org-scoped (user picks branch in app).

-- claims
DROP POLICY IF EXISTS org_select_claims ON public.claims;
DROP POLICY IF EXISTS org_update_claims ON public.claims;
DROP POLICY IF EXISTS org_delete_claims ON public.claims;
CREATE POLICY org_select_claims ON public.claims FOR SELECT
  USING (public.is_org_member(org_id) AND public.can_access_branch(org_id, hospital_branch_id));
CREATE POLICY org_update_claims ON public.claims FOR UPDATE
  USING (public.is_org_member(org_id) AND public.can_access_branch(org_id, hospital_branch_id))
  WITH CHECK (public.is_org_member(org_id) AND public.can_access_branch(org_id, hospital_branch_id));
CREATE POLICY org_delete_claims ON public.claims FOR DELETE
  USING (public.is_org_member(org_id) AND public.can_access_branch(org_id, hospital_branch_id));

-- gov_claims
DROP POLICY IF EXISTS org_select_gov_claims ON public.gov_claims;
DROP POLICY IF EXISTS org_update_gov_claims ON public.gov_claims;
DROP POLICY IF EXISTS org_delete_gov_claims ON public.gov_claims;
CREATE POLICY org_select_gov_claims ON public.gov_claims FOR SELECT
  USING (public.is_org_member(org_id) AND public.can_access_branch(org_id, hospital_branch_id));
CREATE POLICY org_update_gov_claims ON public.gov_claims FOR UPDATE
  USING (public.is_org_member(org_id) AND public.can_access_branch(org_id, hospital_branch_id))
  WITH CHECK (public.is_org_member(org_id) AND public.can_access_branch(org_id, hospital_branch_id));
CREATE POLICY org_delete_gov_claims ON public.gov_claims FOR DELETE
  USING (public.is_org_member(org_id) AND public.can_access_branch(org_id, hospital_branch_id));

-- gov_empanelment
DROP POLICY IF EXISTS org_select_gov_empanelment ON public.gov_empanelment;
DROP POLICY IF EXISTS org_update_gov_empanelment ON public.gov_empanelment;
DROP POLICY IF EXISTS org_delete_gov_empanelment ON public.gov_empanelment;
CREATE POLICY org_select_gov_empanelment ON public.gov_empanelment FOR SELECT
  USING (public.is_org_member(org_id) AND public.can_access_branch(org_id, hospital_branch_id));
CREATE POLICY org_update_gov_empanelment ON public.gov_empanelment FOR UPDATE
  USING (public.is_org_member(org_id) AND public.can_access_branch(org_id, hospital_branch_id))
  WITH CHECK (public.is_org_member(org_id) AND public.can_access_branch(org_id, hospital_branch_id));
CREATE POLICY org_delete_gov_empanelment ON public.gov_empanelment FOR DELETE
  USING (public.is_org_member(org_id) AND public.can_access_branch(org_id, hospital_branch_id));

-- opd_corporates
DROP POLICY IF EXISTS org_select_opd_corporates ON public.opd_corporates;
DROP POLICY IF EXISTS org_update_opd_corporates ON public.opd_corporates;
DROP POLICY IF EXISTS org_delete_opd_corporates ON public.opd_corporates;
CREATE POLICY org_select_opd_corporates ON public.opd_corporates FOR SELECT
  USING (public.is_org_member(org_id) AND public.can_access_branch(org_id, hospital_branch_id));
CREATE POLICY org_update_opd_corporates ON public.opd_corporates FOR UPDATE
  USING (public.is_org_member(org_id) AND public.can_access_branch(org_id, hospital_branch_id))
  WITH CHECK (public.is_org_member(org_id) AND public.can_access_branch(org_id, hospital_branch_id));
CREATE POLICY org_delete_opd_corporates ON public.opd_corporates FOR DELETE
  USING (public.is_org_member(org_id) AND public.can_access_branch(org_id, hospital_branch_id));

-- hospital_branches itself: members can only see branches they're scoped to
DROP POLICY IF EXISTS org_select_hospital_branches ON public.hospital_branches;
CREATE POLICY org_select_hospital_branches ON public.hospital_branches FOR SELECT
  USING (public.is_org_member(org_id) AND public.can_access_branch(org_id, id));

-- =========================================================
-- 2. Admin sub-roles
-- =========================================================

DO $$ BEGIN
  CREATE TYPE public.admin_subrole AS ENUM (
    'super_admin',
    'org_owner',
    'org_admin',
    'billing_admin',
    'compliance_admin',
    'tech_admin'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.admin_role_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  user_id uuid NOT NULL,
  subrole public.admin_subrole NOT NULL,
  granted_by uuid,
  granted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id, subrole)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_role_assignments TO authenticated;
GRANT ALL ON public.admin_role_assignments TO service_role;

ALTER TABLE public.admin_role_assignments ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_admin_subrole(
  _user_id uuid, _org_id uuid, _subrole public.admin_subrole
)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM public.admin_role_assignments
      WHERE user_id = _user_id AND org_id = _org_id AND subrole = _subrole
    );
$$;

REVOKE EXECUTE ON FUNCTION public.has_admin_subrole(uuid, uuid, public.admin_subrole) FROM anon;
GRANT  EXECUTE ON FUNCTION public.has_admin_subrole(uuid, uuid, public.admin_subrole) TO authenticated, service_role;

-- RLS: self-read own assignments; org owners/super admins manage in their org
CREATE POLICY admin_role_select_self ON public.admin_role_assignments
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_org_role(org_id, ARRAY['owner'::org_role]) OR public.is_platform_admin());

CREATE POLICY admin_role_manage_owner ON public.admin_role_assignments
  FOR ALL TO authenticated
  USING (public.has_org_role(org_id, ARRAY['owner'::org_role]) OR public.is_platform_admin())
  WITH CHECK (public.has_org_role(org_id, ARRAY['owner'::org_role]) OR public.is_platform_admin());

-- Seed: backfill subroles from existing organization_members.role
INSERT INTO public.admin_role_assignments (org_id, user_id, subrole)
SELECT org_id, user_id,
  CASE role::text
    WHEN 'owner' THEN 'org_owner'::public.admin_subrole
    WHEN 'admin' THEN 'org_admin'::public.admin_subrole
  END
FROM public.organization_members
WHERE role::text IN ('owner','admin')
ON CONFLICT DO NOTHING;

-- Seed super_admins from platform_admins (one per existing org membership)
INSERT INTO public.admin_role_assignments (org_id, user_id, subrole)
SELECT DISTINCT om.org_id, u.id, 'super_admin'::public.admin_subrole
FROM public.platform_admins pa
JOIN auth.users u ON lower(u.email) = lower(pa.email)
JOIN public.organization_members om ON om.user_id = u.id
ON CONFLICT DO NOTHING;
