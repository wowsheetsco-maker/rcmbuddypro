
-- Write-off requests
CREATE TABLE public.ar_writeoff_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  claim_id uuid NOT NULL,
  reason text NOT NULL CHECK (reason IN ('small_balance','bad_debt','contractual','timely_filing','duplicate','other')),
  amount numeric(14,2) NOT NULL CHECK (amount >= 0),
  justification text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','posted')),
  required_approver_role text NOT NULL DEFAULT 'admin',
  requested_by uuid,
  approved_by uuid,
  approved_at timestamptz,
  rejected_reason text,
  posted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ar_writeoff_requests TO authenticated;
GRANT ALL ON public.ar_writeoff_requests TO service_role;

ALTER TABLE public.ar_writeoff_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read writeoffs" ON public.ar_writeoff_requests
  FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY "org members create writeoffs" ON public.ar_writeoff_requests
  FOR INSERT TO authenticated WITH CHECK (public.is_org_member(org_id));
CREATE POLICY "org members update writeoffs" ON public.ar_writeoff_requests
  FOR UPDATE TO authenticated USING (public.is_org_member(org_id)) WITH CHECK (public.is_org_member(org_id));
CREATE POLICY "org members delete writeoffs" ON public.ar_writeoff_requests
  FOR DELETE TO authenticated USING (public.is_org_member(org_id));

CREATE TRIGGER ar_writeoff_set_updated_at
  BEFORE UPDATE ON public.ar_writeoff_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER ar_writeoff_set_org
  BEFORE INSERT ON public.ar_writeoff_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_default_org_id();

CREATE INDEX idx_ar_writeoff_claim ON public.ar_writeoff_requests(claim_id);
CREATE INDEX idx_ar_writeoff_status ON public.ar_writeoff_requests(org_id, status);


-- Collections placements
CREATE TABLE public.ar_collections_placements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  claim_id uuid NOT NULL,
  agency_name text NOT NULL,
  agency_contact text,
  placed_at timestamptz NOT NULL DEFAULT now(),
  placed_by uuid,
  handoff_packet jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'placed' CHECK (status IN ('pending','placed','recovered','partially_recovered','closed','recalled')),
  recovered_amount numeric(14,2) NOT NULL DEFAULT 0,
  notes text,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ar_collections_placements TO authenticated;
GRANT ALL ON public.ar_collections_placements TO service_role;

ALTER TABLE public.ar_collections_placements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read placements" ON public.ar_collections_placements
  FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY "org members create placements" ON public.ar_collections_placements
  FOR INSERT TO authenticated WITH CHECK (public.is_org_member(org_id));
CREATE POLICY "org members update placements" ON public.ar_collections_placements
  FOR UPDATE TO authenticated USING (public.is_org_member(org_id)) WITH CHECK (public.is_org_member(org_id));
CREATE POLICY "org members delete placements" ON public.ar_collections_placements
  FOR DELETE TO authenticated USING (public.is_org_member(org_id));

CREATE TRIGGER ar_placement_set_updated_at
  BEFORE UPDATE ON public.ar_collections_placements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER ar_placement_set_org
  BEFORE INSERT ON public.ar_collections_placements
  FOR EACH ROW EXECUTE FUNCTION public.set_default_org_id();

CREATE INDEX idx_ar_placement_claim ON public.ar_collections_placements(claim_id);
CREATE INDEX idx_ar_placement_status ON public.ar_collections_placements(org_id, status);
