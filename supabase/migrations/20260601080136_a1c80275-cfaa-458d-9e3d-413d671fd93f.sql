
-- 1. app_users: remove public-role write policies, restrict writes to org admins/owners
DROP POLICY IF EXISTS org_insert_app_users ON public.app_users;
DROP POLICY IF EXISTS org_update_app_users ON public.app_users;
DROP POLICY IF EXISTS org_delete_app_users ON public.app_users;

CREATE POLICY app_users_insert_admins ON public.app_users
  FOR INSERT TO authenticated
  WITH CHECK (has_org_role(org_id, ARRAY['owner'::org_role,'admin'::org_role]));

CREATE POLICY app_users_update_admins ON public.app_users
  FOR UPDATE TO authenticated
  USING (has_org_role(org_id, ARRAY['owner'::org_role,'admin'::org_role]))
  WITH CHECK (has_org_role(org_id, ARRAY['owner'::org_role,'admin'::org_role]));

-- Allow self-service update of own row (e.g. SMTP settings page, profile)
CREATE POLICY app_users_update_self ON public.app_users
  FOR UPDATE TO authenticated
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

CREATE POLICY app_users_delete_admins ON public.app_users
  FOR DELETE TO authenticated
  USING (has_org_role(org_id, ARRAY['owner'::org_role,'admin'::org_role]));

-- 2. ai_providers: tighten SELECT to owners only (api_key is plaintext; do not let plain admins read)
DROP POLICY IF EXISTS org_select_ai_providers ON public.ai_providers;
DROP POLICY IF EXISTS org_insert_ai_providers ON public.ai_providers;
DROP POLICY IF EXISTS org_update_ai_providers ON public.ai_providers;
DROP POLICY IF EXISTS org_delete_ai_providers ON public.ai_providers;

CREATE POLICY ai_providers_owner_all ON public.ai_providers
  FOR ALL TO authenticated
  USING (has_org_role(org_id, ARRAY['owner'::org_role]))
  WITH CHECK (has_org_role(org_id, ARRAY['owner'::org_role]));

-- 3. storage: add UPDATE policy for claim-documents bucket consistent with insert/delete
CREATE POLICY claim_documents_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'claim-documents')
  WITH CHECK (bucket_id = 'claim-documents');

-- 4. Lock down SECURITY DEFINER functions: revoke EXECUTE from public/anon
REVOKE EXECUTE ON FUNCTION public.promote_to_super_admin(text, uuid, boolean) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.seed_launch_checklist(uuid) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.get_own_smtp_settings() FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.has_admin_subrole(uuid, uuid, admin_subrole) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.has_org_role(uuid, org_role[]) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.is_org_member(uuid) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.is_platform_admin() FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.user_org_ids() FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.can_access_branch(uuid, uuid) FROM public, anon;

GRANT EXECUTE ON FUNCTION public.promote_to_super_admin(text, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.seed_launch_checklist(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_own_smtp_settings() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_admin_subrole(uuid, uuid, admin_subrole) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_org_role(uuid, org_role[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_org_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_org_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_branch(uuid, uuid) TO authenticated;
