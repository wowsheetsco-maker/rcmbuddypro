
-- Promote-to-super-admin RPC + audit log
CREATE TABLE IF NOT EXISTS public.platform_admin_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid,
  actor_email text,
  target_email text NOT NULL,
  target_user_id uuid,
  org_id uuid,
  action text NOT NULL,
  bootstrap boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.platform_admin_audit TO authenticated;
GRANT ALL ON public.platform_admin_audit TO service_role;

ALTER TABLE public.platform_admin_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins read audit"
  ON public.platform_admin_audit FOR SELECT TO authenticated
  USING (public.is_platform_admin());

CREATE OR REPLACE FUNCTION public.promote_to_super_admin(
  _target_email text,
  _org_id uuid DEFAULT NULL,
  _make_owner boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _caller_email text;
  _target_id uuid;
  _existing_admins int;
  _is_bootstrap boolean := false;
  _is_admin boolean;
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT email INTO _caller_email FROM auth.users WHERE id = _caller;
  SELECT count(*) INTO _existing_admins FROM public.platform_admins;
  _is_admin := public.is_platform_admin();

  IF _existing_admins = 0 THEN
    -- Bootstrap: any authenticated user may seed the FIRST super admin,
    -- but the target MUST be themselves. This prevents a random signed-in
    -- account from elevating someone else on an empty system.
    IF lower(_target_email) <> lower(_caller_email) THEN
      RAISE EXCEPTION 'Bootstrap: first super admin must promote themselves (target email must match your account email).';
    END IF;
    _is_bootstrap := true;
  ELSIF NOT _is_admin THEN
    RAISE EXCEPTION 'Forbidden: only existing platform super admins can promote users.';
  END IF;

  -- Resolve target auth user (must already exist - they must have signed up).
  SELECT id INTO _target_id FROM auth.users WHERE lower(email) = lower(_target_email);
  IF _target_id IS NULL THEN
    RAISE EXCEPTION 'No user found with email %. Ask them to sign up first.', _target_email;
  END IF;

  -- 1. Add to platform_admins (idempotent).
  INSERT INTO public.platform_admins (email)
  VALUES (lower(_target_email))
  ON CONFLICT (email) DO NOTHING;

  -- 2. Optionally set org owner role.
  IF _org_id IS NOT NULL AND _make_owner THEN
    INSERT INTO public.organization_members (org_id, user_id, role)
    VALUES (_org_id, _target_id, 'owner'::org_role)
    ON CONFLICT (org_id, user_id) DO UPDATE SET role = 'owner'::org_role;
  END IF;

  -- 3. Audit row.
  INSERT INTO public.platform_admin_audit
    (actor_user_id, actor_email, target_email, target_user_id, org_id, action, bootstrap)
  VALUES
    (_caller, _caller_email, lower(_target_email), _target_id, _org_id,
     CASE WHEN _make_owner AND _org_id IS NOT NULL THEN 'promote_super_admin+owner' ELSE 'promote_super_admin' END,
     _is_bootstrap);

  RETURN jsonb_build_object(
    'ok', true,
    'bootstrap', _is_bootstrap,
    'target_user_id', _target_id,
    'org_id', _org_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.promote_to_super_admin(text, uuid, boolean) TO authenticated;
