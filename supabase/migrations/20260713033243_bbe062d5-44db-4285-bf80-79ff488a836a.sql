
-- 1. Restrict smtp_password column reads: revoke SELECT on smtp_password from
--    the general authenticated role. Owners/self access continues via the
--    SECURITY DEFINER helper public.get_own_smtp_settings().
REVOKE SELECT (smtp_password) ON public.app_users FROM authenticated;
REVOKE SELECT (smtp_password) ON public.app_users FROM anon;
-- Also block admin writes to other users' smtp passwords via the API by
-- revoking column-level UPDATE/INSERT from authenticated (owners update
-- their own via app flows using the definer helper / self policies through
-- non-secret columns; SMTP fields should be managed through dedicated flows).
REVOKE UPDATE (smtp_password) ON public.app_users FROM authenticated;
REVOKE INSERT (smtp_password) ON public.app_users FROM authenticated;

-- 2. Enable RLS on private_cron_config and revoke any app-role privileges.
ALTER TABLE public.private_cron_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.private_cron_config FROM anon, authenticated;
GRANT ALL ON public.private_cron_config TO service_role;
-- No policies => deny all for non-service roles. Access continues via
-- SECURITY DEFINER helpers private_cron_get / private_cron_set.

-- 3. Fix claim-documents storage UPDATE policy: require org membership on
--    the corresponding claim_documents row (matching SELECT/DELETE).
DROP POLICY IF EXISTS claim_documents_update ON storage.objects;
CREATE POLICY claim_documents_update ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'claim-documents'
    AND EXISTS (
      SELECT 1 FROM public.claim_documents cd
      WHERE cd.file_path = storage.objects.name
        AND public.is_org_member(cd.org_id)
    )
  )
  WITH CHECK (
    bucket_id = 'claim-documents'
    AND EXISTS (
      SELECT 1 FROM public.claim_documents cd
      WHERE cd.file_path = storage.objects.name
        AND public.is_org_member(cd.org_id)
    )
  );
