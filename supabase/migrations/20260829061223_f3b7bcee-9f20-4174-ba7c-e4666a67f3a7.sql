-- 1. Signup trigger: never auto-join the shared demo org.
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _invited_org uuid;
  _app_user_id uuid;
BEGIN
  -- Only honour an explicit invitation. No implicit tenant membership.
  BEGIN
    _invited_org := nullif(NEW.raw_user_meta_data->>'invited_to_org','')::uuid;
  EXCEPTION WHEN others THEN
    _invited_org := NULL;
  END;

  IF _invited_org IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = _invited_org) THEN
    _invited_org := NULL;
  END IF;

  IF _invited_org IS NULL THEN
    -- No invitation: the account exists but belongs to no hospital yet.
    -- A super admin / hospital admin must invite them explicitly.
    RETURN NEW;
  END IF;

  INSERT INTO public.app_users (auth_user_id, name, email, role, status, org_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)),
    NEW.email,
    'Billing Executive',
    'active',
    _invited_org
  )
  ON CONFLICT (email) DO UPDATE
    SET auth_user_id = EXCLUDED.auth_user_id
  RETURNING id INTO _app_user_id;

  INSERT INTO public.organization_members (org_id, user_id, role)
  VALUES (_invited_org, NEW.id, 'member')
  ON CONFLICT (org_id, user_id) DO NOTHING;

  RETURN NEW;
END
$function$;

-- 2. Default org resolution: no demo-org fallback, no guessing across tenants.
CREATE OR REPLACE FUNCTION public.set_default_org_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _n int;
BEGIN
  IF NEW.org_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO _n
  FROM public.organization_members
  WHERE user_id = auth.uid();

  IF _n = 1 THEN
    SELECT org_id INTO NEW.org_id
    FROM public.organization_members
    WHERE user_id = auth.uid();
    RETURN NEW;
  END IF;

  IF _n = 0 THEN
    RAISE EXCEPTION 'No hospital assigned to this user: cannot create records without an organization.';
  END IF;

  RAISE EXCEPTION 'Ambiguous hospital: this user belongs to multiple hospitals, so org_id must be set explicitly.';
END $function$;

-- 3. Remove demo-org membership that was granted implicitly.
DELETE FROM public.organization_members dm
WHERE dm.org_id = '00000000-0000-0000-0000-000000000001'::uuid
  AND (
    EXISTS (
      SELECT 1 FROM public.organization_members other
      WHERE other.user_id = dm.user_id
        AND other.org_id <> dm.org_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.platform_admins pa
      JOIN auth.users u ON lower(u.email) = lower(pa.email)
      WHERE u.id = dm.user_id
    )
  );

-- 4. Keep app_users rows consistent with the surviving membership.
UPDATE public.app_users au
SET org_id = m.org_id
FROM public.organization_members m
WHERE m.user_id = au.auth_user_id
  AND au.org_id = '00000000-0000-0000-0000-000000000001'::uuid
  AND m.org_id <> '00000000-0000-0000-0000-000000000001'::uuid;