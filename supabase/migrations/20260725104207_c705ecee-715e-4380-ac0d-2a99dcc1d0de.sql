
-- 1) claim_events: require org membership on the parent claim
DROP POLICY IF EXISTS "Read events for accessible claims" ON public.claim_events;
DROP POLICY IF EXISTS "Insert events for accessible claims" ON public.claim_events;

CREATE POLICY "Read events for accessible claims"
ON public.claim_events
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.claims c
    WHERE c.id = claim_events.claim_id
      AND public.is_org_member(c.org_id)
  )
);

CREATE POLICY "Insert events for accessible claims"
ON public.claim_events
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.claims c
    WHERE c.id = claim_events.claim_id
      AND public.is_org_member(c.org_id)
  )
  AND (actor_id IS NULL OR actor_id = auth.uid())
);

-- 2) wellness_invoice_runs: no NULL org_id bypass
UPDATE public.wellness_invoice_runs SET org_id = NULL WHERE FALSE; -- noop guard
DROP POLICY IF EXISTS "org members read invoice runs" ON public.wellness_invoice_runs;
CREATE POLICY "org members read invoice runs"
ON public.wellness_invoice_runs
FOR SELECT
USING (org_id IS NOT NULL AND public.is_org_member(org_id));

-- 3) ar_writeoff_requests: enforce required_approver_role on approve/reject/post
CREATE OR REPLACE FUNCTION public.org_role_rank(_role public.org_role)
RETURNS int
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE _role
    WHEN 'owner'   THEN 4
    WHEN 'admin'   THEN 3
    WHEN 'manager' THEN 2
    WHEN 'member'  THEN 1
    WHEN 'viewer'  THEN 0
    ELSE 0
  END;
$$;

CREATE OR REPLACE FUNCTION public.required_role_rank(_required text)
RETURNS int
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE lower(coalesce(_required,''))
    WHEN 'owner'     THEN 4
    WHEN 'admin'     THEN 3
    WHEN 'manager'   THEN 2
    WHEN 'team_lead' THEN 2
    ELSE 3
  END;
$$;

CREATE OR REPLACE FUNCTION public.can_approve_writeoff(_org_id uuid, _required text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.is_platform_admin()
      OR EXISTS (
        SELECT 1 FROM public.organization_members om
        WHERE om.user_id = auth.uid()
          AND om.org_id  = _org_id
          AND public.org_role_rank(om.role) >= public.required_role_rank(_required)
      );
$$;

DROP POLICY IF EXISTS "org members update writeoffs" ON public.ar_writeoff_requests;

-- Requester (or any org member) may keep a request in 'pending' — e.g. edit notes —
-- but transitioning status to approved / rejected / posted requires an authorized
-- approver who is NOT the original requester.
CREATE POLICY "org members update writeoffs"
ON public.ar_writeoff_requests
FOR UPDATE
USING (public.is_org_member(org_id))
WITH CHECK (
  public.is_org_member(org_id)
  AND (
    -- No status change (or staying pending) is allowed for any org member.
    status = 'pending'
    OR (
      -- Any state transition out of pending requires the required approver role
      -- AND the caller must not be the original requester (segregation of duties).
      public.can_approve_writeoff(org_id, required_approver_role)
      AND (requested_by IS DISTINCT FROM auth.uid())
    )
  )
);
