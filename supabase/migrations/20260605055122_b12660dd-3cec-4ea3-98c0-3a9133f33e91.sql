
-- 1. Saved filter views for All Cases page (per-user, optionally shared org-wide)
CREATE TABLE public.wellness_saved_views (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  name text NOT NULL,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_shared boolean NOT NULL DEFAULT false,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wellness_saved_views TO authenticated;
GRANT ALL ON public.wellness_saved_views TO service_role;
ALTER TABLE public.wellness_saved_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wsv_select" ON public.wellness_saved_views FOR SELECT TO authenticated
  USING (is_org_member(org_id) AND (user_id = auth.uid() OR is_shared));
CREATE POLICY "wsv_insert" ON public.wellness_saved_views FOR INSERT TO authenticated
  WITH CHECK (is_org_member(org_id) AND user_id = auth.uid());
CREATE POLICY "wsv_update" ON public.wellness_saved_views FOR UPDATE TO authenticated
  USING (is_org_member(org_id) AND user_id = auth.uid())
  WITH CHECK (is_org_member(org_id) AND user_id = auth.uid());
CREATE POLICY "wsv_delete" ON public.wellness_saved_views FOR DELETE TO authenticated
  USING (is_org_member(org_id) AND user_id = auth.uid());

CREATE TRIGGER trg_wsv_updated BEFORE UPDATE ON public.wellness_saved_views
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_wsv_org_user ON public.wellness_saved_views(org_id, user_id);

-- 2. Explicit link table: wellness case ↔ monthly invoice
CREATE TABLE public.wellness_case_invoices (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL,
  request_id uuid NOT NULL REFERENCES public.wellness_requests(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES public.opd_invoices(id) ON DELETE CASCADE,
  period_month date NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','invoiced','submitted','paid','disputed','cancelled')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(request_id, invoice_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wellness_case_invoices TO authenticated;
GRANT ALL ON public.wellness_case_invoices TO service_role;
ALTER TABLE public.wellness_case_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wci_select" ON public.wellness_case_invoices FOR SELECT TO authenticated
  USING (is_org_member(org_id));
CREATE POLICY "wci_insert" ON public.wellness_case_invoices FOR INSERT TO authenticated
  WITH CHECK (is_org_member(org_id));
CREATE POLICY "wci_update" ON public.wellness_case_invoices FOR UPDATE TO authenticated
  USING (is_org_member(org_id)) WITH CHECK (is_org_member(org_id));
CREATE POLICY "wci_delete" ON public.wellness_case_invoices FOR DELETE TO authenticated
  USING (is_org_member(org_id));

CREATE TRIGGER trg_wci_updated BEFORE UPDATE ON public.wellness_case_invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_wci_org_month ON public.wellness_case_invoices(org_id, period_month);
CREATE INDEX idx_wci_invoice ON public.wellness_case_invoices(invoice_id);
CREATE INDEX idx_wci_request ON public.wellness_case_invoices(request_id);
