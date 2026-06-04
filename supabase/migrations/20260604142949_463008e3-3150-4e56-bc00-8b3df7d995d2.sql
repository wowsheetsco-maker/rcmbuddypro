
-- Customizable message templates per wellness request action + channel
CREATE TABLE public.wellness_message_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('confirm','reschedule','cancel','report')),
  channel text NOT NULL CHECK (channel IN ('email','whatsapp')),
  subject text,
  body text NOT NULL,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, kind, channel)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wellness_message_templates TO authenticated;
GRANT ALL ON public.wellness_message_templates TO service_role;
ALTER TABLE public.wellness_message_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members manage wellness message templates"
  ON public.wellness_message_templates FOR ALL
  USING (public.is_org_member(org_id)) WITH CHECK (public.is_org_member(org_id));
CREATE TRIGGER trg_wmt_updated BEFORE UPDATE ON public.wellness_message_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Audit timeline of every action taken on a request, with delivery/open status
CREATE TABLE public.wellness_request_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  request_id uuid NOT NULL REFERENCES public.wellness_requests(id) ON DELETE CASCADE,
  action text NOT NULL, -- confirmed | rescheduled | cancelled | report_sent | created | note | invoice_generated | email_sent
  channel text,         -- email | whatsapp | call | system
  status text NOT NULL DEFAULT 'logged', -- logged | drafted | sent | delivered | opened | failed
  message text,
  recipient text,
  meta jsonb DEFAULT '{}'::jsonb,
  delivered_at timestamptz,
  opened_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.wellness_request_events TO authenticated;
GRANT ALL ON public.wellness_request_events TO service_role;
ALTER TABLE public.wellness_request_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members read wellness events"
  ON public.wellness_request_events FOR SELECT
  USING (public.is_org_member(org_id));
CREATE POLICY "org members insert wellness events"
  ON public.wellness_request_events FOR INSERT
  WITH CHECK (public.is_org_member(org_id));
CREATE POLICY "org members update wellness events"
  ON public.wellness_request_events FOR UPDATE
  USING (public.is_org_member(org_id)) WITH CHECK (public.is_org_member(org_id));
CREATE INDEX idx_wre_request ON public.wellness_request_events(request_id, created_at DESC);
CREATE INDEX idx_wre_org ON public.wellness_request_events(org_id, created_at DESC);

-- Track auto-generated monthly invoice runs (for the cron job log)
CREATE TABLE public.wellness_invoice_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid,
  period_start date NOT NULL,
  period_end date NOT NULL,
  providers_total int NOT NULL DEFAULT 0,
  invoices_created int NOT NULL DEFAULT 0,
  emails_sent int NOT NULL DEFAULT 0,
  errors jsonb DEFAULT '[]'::jsonb,
  ran_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.wellness_invoice_runs TO authenticated;
GRANT ALL ON public.wellness_invoice_runs TO service_role;
ALTER TABLE public.wellness_invoice_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members read invoice runs"
  ON public.wellness_invoice_runs FOR SELECT
  USING (org_id IS NULL OR public.is_org_member(org_id));
