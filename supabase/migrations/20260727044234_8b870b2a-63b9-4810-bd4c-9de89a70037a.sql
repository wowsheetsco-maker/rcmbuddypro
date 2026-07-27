CREATE TABLE public.access_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  branch_id uuid,
  actor_user_id uuid,
  actor_email text,
  target_user_id uuid,
  target_email text,
  entity text NOT NULL,
  action text NOT NULL,
  summary text NOT NULL,
  before_value jsonb,
  after_value jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.access_audit_log TO authenticated;
GRANT ALL ON public.access_audit_log TO service_role;

ALTER TABLE public.access_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can read their access audit log"
  ON public.access_audit_log FOR SELECT TO authenticated
  USING (public.is_org_member(org_id));

CREATE POLICY "Org members can append audit entries"
  ON public.access_audit_log FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(org_id) AND actor_user_id = auth.uid());

CREATE INDEX idx_access_audit_log_org_created ON public.access_audit_log (org_id, created_at DESC);
CREATE INDEX idx_access_audit_log_branch ON public.access_audit_log (branch_id);
CREATE INDEX idx_access_audit_log_target ON public.access_audit_log (target_user_id);