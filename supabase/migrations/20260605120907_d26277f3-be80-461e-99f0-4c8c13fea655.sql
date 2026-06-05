
-- 1. Branch-level submission officer
ALTER TABLE public.hospital_branches
  ADD COLUMN IF NOT EXISTS submission_officer_id uuid REFERENCES public.app_users(id) ON DELETE SET NULL;

-- 2. Claim submission tracker table
CREATE TABLE IF NOT EXISTS public.claim_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  claim_id uuid NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.hospital_branches(id) ON DELETE SET NULL,
  assignee_id uuid REFERENCES public.app_users(id) ON DELETE SET NULL,
  assigned_by uuid REFERENCES public.app_users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','in_progress','submitted','acknowledged','cancelled')),
  submission_mode text CHECK (submission_mode IN ('portal','courier','email','hand_delivery')),
  portal_ref text,
  courier_awb text,
  courier_partner text,
  submitted_at timestamptz,
  ack_received_at timestamptz,
  ack_doc_url text,
  ack_doc_path text,
  notes text,
  due_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (claim_id)
);

CREATE INDEX IF NOT EXISTS idx_claim_submissions_org ON public.claim_submissions(org_id);
CREATE INDEX IF NOT EXISTS idx_claim_submissions_assignee ON public.claim_submissions(assignee_id);
CREATE INDEX IF NOT EXISTS idx_claim_submissions_status ON public.claim_submissions(status);
CREATE INDEX IF NOT EXISTS idx_claim_submissions_branch ON public.claim_submissions(branch_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.claim_submissions TO authenticated;
GRANT ALL ON public.claim_submissions TO service_role;

ALTER TABLE public.claim_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can read submissions"
  ON public.claim_submissions FOR SELECT TO authenticated
  USING (public.is_org_member(org_id));

CREATE POLICY "Org members can insert submissions"
  ON public.claim_submissions FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(org_id));

CREATE POLICY "Org members can update submissions"
  ON public.claim_submissions FOR UPDATE TO authenticated
  USING (public.is_org_member(org_id))
  WITH CHECK (public.is_org_member(org_id));

CREATE POLICY "Org admins can delete submissions"
  ON public.claim_submissions FOR DELETE TO authenticated
  USING (public.has_org_role(org_id, ARRAY['owner','admin']::org_role[]));

CREATE TRIGGER trg_claim_submissions_updated_at
  BEFORE UPDATE ON public.claim_submissions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_claim_submissions_default_org
  BEFORE INSERT ON public.claim_submissions
  FOR EACH ROW EXECUTE FUNCTION public.set_default_org_id();
