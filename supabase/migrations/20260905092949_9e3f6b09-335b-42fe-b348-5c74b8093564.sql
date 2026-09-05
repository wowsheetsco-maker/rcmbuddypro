CREATE OR REPLACE FUNCTION public.clear_organization_claims(_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _deleted_count integer := 0;
  _remaining_count integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT (
    public.is_platform_admin()
    OR public.has_org_role(_org_id, ARRAY['owner','admin']::public.org_role[])
  ) THEN
    RAISE EXCEPTION 'Only a hospital owner or administrator can clear claims';
  END IF;

  DELETE FROM public.claims
  WHERE org_id = _org_id;

  GET DIAGNOSTICS _deleted_count = ROW_COUNT;

  SELECT count(*)::integer
  INTO _remaining_count
  FROM public.claims
  WHERE org_id = _org_id;

  RETURN jsonb_build_object(
    'deleted_count', _deleted_count,
    'remaining_count', _remaining_count,
    'org_id', _org_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.clear_organization_claims(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.clear_organization_claims(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.clear_organization_claims(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_organization_claims(uuid) TO service_role;