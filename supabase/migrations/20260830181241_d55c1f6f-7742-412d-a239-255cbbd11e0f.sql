CREATE TABLE public.access_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_user_id uuid NOT NULL,
  email text NOT NULL,
  name text,
  org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  requested_org_name text,
  message text,
  status text NOT NULL DEFAULT 'pending',
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX access_requests_one_pending
  ON public.access_requests (requester_user_id, coalesce(org_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE status = 'pending';

CREATE INDEX access_requests_org_status ON public.access_requests (org_id, status);

GRANT SELECT, INSERT ON public.access_requests TO authenticated;
GRANT UPDATE ON public.access_requests TO authenticated;
GRANT ALL ON public.access_requests TO service_role;

ALTER TABLE public.access_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Requesters can create their own request"
  ON public.access_requests FOR INSERT TO authenticated
  WITH CHECK (requester_user_id = auth.uid());

CREATE POLICY "Requesters can read their own requests"
  ON public.access_requests FOR SELECT TO authenticated
  USING (requester_user_id = auth.uid());

CREATE POLICY "Org admins can read requests for their hospital"
  ON public.access_requests FOR SELECT TO authenticated
  USING (org_id IS NOT NULL AND public.has_org_role(org_id, ARRAY['owner','admin']::org_role[]));

CREATE POLICY "Platform admins can read all requests"
  ON public.access_requests FOR SELECT TO authenticated
  USING (public.is_platform_admin());

CREATE POLICY "Org admins can update requests for their hospital"
  ON public.access_requests FOR UPDATE TO authenticated
  USING (public.is_platform_admin() OR (org_id IS NOT NULL AND public.has_org_role(org_id, ARRAY['owner','admin']::org_role[])))
  WITH CHECK (public.is_platform_admin() OR (org_id IS NOT NULL AND public.has_org_role(org_id, ARRAY['owner','admin']::org_role[])));

CREATE TRIGGER trg_access_requests_updated_at
  BEFORE UPDATE ON public.access_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Public-ish directory so a membership-less user can pick a hospital to join.
CREATE OR REPLACE FUNCTION public.list_joinable_organizations()
RETURNS TABLE(id uuid, name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.id, o.name FROM public.organizations o ORDER BY o.name
$$;

REVOKE ALL ON FUNCTION public.list_joinable_organizations() FROM public;
GRANT EXECUTE ON FUNCTION public.list_joinable_organizations() TO authenticated;

-- Approve: adds membership + staff profile, marks the request approved.
CREATE OR REPLACE FUNCTION public.approve_access_request(_request_id uuid, _org_role org_role DEFAULT 'member', _app_role app_role DEFAULT 'Billing Executive')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _req public.access_requests;
BEGIN
  SELECT * INTO _req FROM public.access_requests WHERE id = _request_id;
  IF _req.id IS NULL THEN
    RAISE EXCEPTION 'Request not found';
  END IF;
  IF _req.org_id IS NULL THEN
    RAISE EXCEPTION 'Request has no hospital to approve into';
  END IF;
  IF NOT (public.is_platform_admin() OR public.has_org_role(_req.org_id, ARRAY['owner','admin']::org_role[])) THEN
    RAISE EXCEPTION 'Forbidden: only hospital owners/admins can approve access requests';
  END IF;
  IF _req.status <> 'pending' THEN
    RAISE EXCEPTION 'Request already %', _req.status;
  END IF;

  INSERT INTO public.organization_members (org_id, user_id, role)
  VALUES (_req.org_id, _req.requester_user_id, _org_role)
  ON CONFLICT (org_id, user_id) DO UPDATE SET role = EXCLUDED.role;

  INSERT INTO public.app_users (auth_user_id, name, email, role, status, org_id)
  VALUES (_req.requester_user_id,
          COALESCE(_req.name, split_part(_req.email, '@', 1)),
          lower(_req.email), _app_role, 'active', _req.org_id)
  ON CONFLICT (email) DO UPDATE
    SET auth_user_id = EXCLUDED.auth_user_id,
        org_id = EXCLUDED.org_id,
        status = 'active';

  UPDATE public.access_requests
     SET status = 'approved', reviewed_by = auth.uid(), reviewed_at = now()
   WHERE id = _request_id;

  RETURN jsonb_build_object('ok', true, 'org_id', _req.org_id, 'user_id', _req.requester_user_id);
END $$;

REVOKE ALL ON FUNCTION public.approve_access_request(uuid, org_role, app_role) FROM public;
GRANT EXECUTE ON FUNCTION public.approve_access_request(uuid, org_role, app_role) TO authenticated;

CREATE OR REPLACE FUNCTION public.reject_access_request(_request_id uuid, _note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _req public.access_requests;
BEGIN
  SELECT * INTO _req FROM public.access_requests WHERE id = _request_id;
  IF _req.id IS NULL THEN
    RAISE EXCEPTION 'Request not found';
  END IF;
  IF NOT (public.is_platform_admin() OR (_req.org_id IS NOT NULL AND public.has_org_role(_req.org_id, ARRAY['owner','admin']::org_role[]))) THEN
    RAISE EXCEPTION 'Forbidden: only hospital owners/admins can reject access requests';
  END IF;
  UPDATE public.access_requests
     SET status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), review_note = _note
   WHERE id = _request_id;
  RETURN jsonb_build_object('ok', true);
END $$;

REVOKE ALL ON FUNCTION public.reject_access_request(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.reject_access_request(uuid, text) TO authenticated;