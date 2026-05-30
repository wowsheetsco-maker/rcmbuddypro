-- Auto-onboard new auth users into Demo Hospital org and link app_users.auth_user_id
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _default_org uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  _app_user_id uuid;
BEGIN
  -- Create / link the app_users row for this auth user.
  INSERT INTO public.app_users (auth_user_id, name, email, role, status, org_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)),
    NEW.email,
    'Billing Executive',
    'active',
    _default_org
  )
  ON CONFLICT (email) DO UPDATE
    SET auth_user_id = EXCLUDED.auth_user_id
  RETURNING id INTO _app_user_id;

  -- Give the user membership in the Demo Hospital org (admin so they can see everything).
  INSERT INTO public.organization_members (org_id, user_id, role)
  VALUES (_default_org, NEW.id, 'admin')
  ON CONFLICT (org_id, user_id) DO NOTHING;

  RETURN NEW;
END
$function$;