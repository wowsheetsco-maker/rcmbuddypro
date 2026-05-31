-- 1. CRITICAL: Remove anonymous loophole in is_org_member
CREATE OR REPLACE FUNCTION public.is_org_member(_org_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE user_id = auth.uid() AND org_id = _org_id
    );
$$;

-- 2. CRITICAL: Restrict SMTP credentials on app_users
DROP POLICY IF EXISTS org_select_app_users ON public.app_users;

CREATE POLICY app_users_select_self ON public.app_users
FOR SELECT TO authenticated
USING (auth_user_id = auth.uid());

CREATE POLICY app_users_select_admins ON public.app_users
FOR SELECT TO authenticated
USING (public.has_org_role(org_id, ARRAY['owner','admin']::org_role[]));

CREATE OR REPLACE VIEW public.app_users_public AS
SELECT id, auth_user_id, org_id, name, email, role, status,
  smtp_from_email, smtp_from_name, smtp_verified_at,
  created_at, updated_at
FROM public.app_users;
GRANT SELECT ON public.app_users_public TO authenticated;

-- 3. Tighten claim-documents storage INSERT policy
DROP POLICY IF EXISTS claim_documents_insert ON storage.objects;
CREATE POLICY claim_documents_insert ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'claim-documents'
  AND auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.claim_documents cd
    WHERE cd.file_path = name AND public.is_org_member(cd.org_id)
  )
);

-- 4. Revoke EXECUTE from anon on SECURITY DEFINER helpers
REVOKE EXECUTE ON FUNCTION public.is_org_member(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_org_role(uuid, org_role[]) FROM anon;
REVOKE EXECUTE ON FUNCTION public.user_org_ids() FROM anon;
REVOKE EXECUTE ON FUNCTION public.seed_launch_checklist(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_own_smtp_settings() FROM anon;
REVOKE EXECUTE ON FUNCTION public.promote_to_super_admin(text, uuid, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_platform_admin() FROM anon;