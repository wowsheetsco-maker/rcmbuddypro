
-- 1. Bank statement imports
CREATE TABLE public.bank_statement_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  branch_id uuid REFERENCES public.hospital_branches(id) ON DELETE SET NULL,
  bank_name text,
  account_last4 text,
  period_from date,
  period_to date,
  file_name text NOT NULL,
  file_url text,
  total_rows int NOT NULL DEFAULT 0,
  matched_rows int NOT NULL DEFAULT 0,
  unmatched_rows int NOT NULL DEFAULT 0,
  uploaded_by uuid REFERENCES public.app_users(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_statement_imports TO authenticated;
GRANT ALL ON public.bank_statement_imports TO service_role;
ALTER TABLE public.bank_statement_imports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members read imports" ON public.bank_statement_imports FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY "org members write imports" ON public.bank_statement_imports FOR INSERT TO authenticated WITH CHECK (public.is_org_member(org_id));
CREATE POLICY "org members update imports" ON public.bank_statement_imports FOR UPDATE TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY "org members delete imports" ON public.bank_statement_imports FOR DELETE TO authenticated USING (public.is_org_member(org_id));
CREATE TRIGGER bsi_updated BEFORE UPDATE ON public.bank_statement_imports FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. Bank statement entries
CREATE TABLE public.bank_statement_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  import_id uuid NOT NULL REFERENCES public.bank_statement_imports(id) ON DELETE CASCADE,
  txn_date date,
  value_date date,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  txn_type text, -- credit/debit
  channel text, -- NEFT/RTGS/UPI/IMPS/CHQ
  utr_ref text,
  narration text,
  payer_hint text,
  balance numeric(14,2),
  raw jsonb,
  match_status text NOT NULL DEFAULT 'unmatched', -- unmatched | suggested | matched | ignored
  matched_claim_id uuid REFERENCES public.claims(id) ON DELETE SET NULL,
  match_confidence int NOT NULL DEFAULT 0,
  match_method text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_statement_entries TO authenticated;
GRANT ALL ON public.bank_statement_entries TO service_role;
ALTER TABLE public.bank_statement_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members read entries" ON public.bank_statement_entries FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY "org members write entries" ON public.bank_statement_entries FOR INSERT TO authenticated WITH CHECK (public.is_org_member(org_id));
CREATE POLICY "org members update entries" ON public.bank_statement_entries FOR UPDATE TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY "org members delete entries" ON public.bank_statement_entries FOR DELETE TO authenticated USING (public.is_org_member(org_id));
CREATE INDEX bse_import_idx ON public.bank_statement_entries(import_id);
CREATE INDEX bse_utr_idx ON public.bank_statement_entries(utr_ref);
CREATE INDEX bse_status_idx ON public.bank_statement_entries(match_status);
CREATE TRIGGER bse_updated BEFORE UPDATE ON public.bank_statement_entries FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. Bank reconciliation matches (audit log of matching decisions)
CREATE TABLE public.bank_reconciliation_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  entry_id uuid NOT NULL REFERENCES public.bank_statement_entries(id) ON DELETE CASCADE,
  claim_id uuid REFERENCES public.claims(id) ON DELETE SET NULL,
  method text NOT NULL, -- auto_utr | auto_amount_date | manual | ai_suggested
  confidence int NOT NULL DEFAULT 0,
  decided_by uuid REFERENCES public.app_users(id) ON DELETE SET NULL,
  decision text NOT NULL, -- confirmed | rejected | suggested
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_reconciliation_matches TO authenticated;
GRANT ALL ON public.bank_reconciliation_matches TO service_role;
ALTER TABLE public.bank_reconciliation_matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members read matches" ON public.bank_reconciliation_matches FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY "org members write matches" ON public.bank_reconciliation_matches FOR INSERT TO authenticated WITH CHECK (public.is_org_member(org_id));
CREATE POLICY "org members update matches" ON public.bank_reconciliation_matches FOR UPDATE TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY "org members delete matches" ON public.bank_reconciliation_matches FOR DELETE TO authenticated USING (public.is_org_member(org_id));
CREATE INDEX brm_entry_idx ON public.bank_reconciliation_matches(entry_id);

-- 4. Claim appeals (auto-generated drafts for short payments)
CREATE TABLE public.claim_appeals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  claim_id uuid NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
  gap_amount numeric(14,2) NOT NULL DEFAULT 0,
  gap_pct numeric(6,2) NOT NULL DEFAULT 0,
  band text, -- low | medium | high
  subject text NOT NULL,
  body text NOT NULL,
  recipient_email text,
  recipient_name text,
  status text NOT NULL DEFAULT 'draft', -- draft | approved | sent | dismissed
  generated_by text NOT NULL DEFAULT 'ai', -- ai | template | manual
  created_by uuid REFERENCES public.app_users(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES public.app_users(id) ON DELETE SET NULL,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.claim_appeals TO authenticated;
GRANT ALL ON public.claim_appeals TO service_role;
ALTER TABLE public.claim_appeals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members read appeals" ON public.claim_appeals FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY "org members write appeals" ON public.claim_appeals FOR INSERT TO authenticated WITH CHECK (public.is_org_member(org_id));
CREATE POLICY "org members update appeals" ON public.claim_appeals FOR UPDATE TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY "org members delete appeals" ON public.claim_appeals FOR DELETE TO authenticated USING (public.is_org_member(org_id));
CREATE INDEX ca_claim_idx ON public.claim_appeals(claim_id);
CREATE TRIGGER ca_updated BEFORE UPDATE ON public.claim_appeals FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5. Default-org trigger so insertions from authed users get org_id auto-set if omitted
CREATE TRIGGER bsi_default_org BEFORE INSERT ON public.bank_statement_imports FOR EACH ROW EXECUTE FUNCTION public.set_default_org_id();
CREATE TRIGGER bse_default_org BEFORE INSERT ON public.bank_statement_entries FOR EACH ROW EXECUTE FUNCTION public.set_default_org_id();
CREATE TRIGGER brm_default_org BEFORE INSERT ON public.bank_reconciliation_matches FOR EACH ROW EXECUTE FUNCTION public.set_default_org_id();
CREATE TRIGGER ca_default_org BEFORE INSERT ON public.claim_appeals FOR EACH ROW EXECUTE FUNCTION public.set_default_org_id();
