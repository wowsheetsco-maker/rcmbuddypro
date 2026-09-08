CREATE OR REPLACE FUNCTION public.platform_access_overview()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _out jsonb;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Forbidden: platform owner only';
  END IF;

  SELECT coalesce(jsonb_agg(row_to_json(t) ORDER BY t.name), '[]'::jsonb)
  INTO _out
  FROM (
    SELECT
      o.id,
      o.name,
      o.status,
      o.plan,
      o.created_at,
      (SELECT count(*) FROM public.organization_members m WHERE m.org_id = o.id) AS members,
      (SELECT count(*) FROM public.organization_members m WHERE m.org_id = o.id AND m.role = 'owner') AS owners,
      (SELECT count(*) FROM public.organization_members m WHERE m.org_id = o.id AND m.role = 'admin') AS admins,
      (SELECT count(DISTINCT r.user_id) FROM public.user_roles r WHERE r.org_id = o.id) AS users_with_capability_role,
      (SELECT count(*) FROM public.organization_members m
         WHERE m.org_id = o.id AND m.branch_scope_mode IS DISTINCT FROM 'all') AS branch_limited_members,
      (SELECT count(DISTINCT a.user_id) FROM public.user_tpa_allocations a WHERE a.org_id = o.id) AS payer_limited_members,
      (SELECT count(*) FROM public.hospital_branches b WHERE b.org_id = o.id) AS branches,
      (SELECT count(*) FROM public.claims c WHERE c.org_id = o.id) AS claims,
      (SELECT count(*) FROM public.access_requests q WHERE q.org_id = o.id AND q.status = 'pending') AS pending_requests,
      (SELECT count(*) FROM public.access_audit_log l WHERE l.org_id = o.id AND l.created_at > now() - INTERVAL '30 days') AS access_changes_30d
    FROM public.organizations o
  ) t;

  RETURN _out;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_access_overview() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_access_overview() FROM anon;
GRANT EXECUTE ON FUNCTION public.platform_access_overview() TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_access_overview() TO service_role;

CREATE OR REPLACE FUNCTION public.platform_isolation_report()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _out jsonb;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Forbidden: platform owner only';
  END IF;

  SELECT jsonb_build_object(
    'generated_at', now(),
    'tables_total', (
      SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
    ),
    'tables_without_rls', (
      SELECT coalesce(jsonb_agg(c.relname ORDER BY c.relname), '[]'::jsonb)
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity
    ),
    'tables_rls_without_policy', (
      SELECT coalesce(jsonb_agg(c.relname ORDER BY c.relname), '[]'::jsonb)
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
        AND NOT EXISTS (
          SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid
        )
    ),
    'tables_without_org_scope', (
      SELECT coalesce(jsonb_agg(c.relname ORDER BY c.relname), '[]'::jsonb)
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
        AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns col
          WHERE col.table_schema = 'public' AND col.table_name = c.relname
            AND col.column_name = 'org_id'
        )
    ),
    'claims_without_org', (SELECT count(*) FROM public.claims WHERE org_id IS NULL),
    'orgs_without_owner', (
      SELECT coalesce(jsonb_agg(o.name ORDER BY o.name), '[]'::jsonb)
      FROM public.organizations o
      WHERE NOT EXISTS (
        SELECT 1 FROM public.organization_members m
        WHERE m.org_id = o.id AND m.role = 'owner'
      )
    ),
    'users_in_multiple_orgs', (
      SELECT count(*) FROM (
        SELECT m.user_id FROM public.organization_members m
        GROUP BY m.user_id HAVING count(DISTINCT m.org_id) > 1
      ) x
    ),
    'members_without_capability_role', (
      SELECT count(*) FROM public.organization_members m
      WHERE NOT EXISTS (
        SELECT 1 FROM public.user_roles r
        WHERE r.org_id = m.org_id AND r.user_id = m.user_id
      )
    ),
    'platform_owner_accounts', (SELECT count(*) FROM public.platform_admins),
    'pending_access_requests', (SELECT count(*) FROM public.access_requests WHERE status = 'pending')
  )
  INTO _out;

  RETURN _out;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_isolation_report() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_isolation_report() FROM anon;
GRANT EXECUTE ON FUNCTION public.platform_isolation_report() TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_isolation_report() TO service_role;