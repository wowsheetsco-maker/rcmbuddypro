
-- wellness_packages
CREATE TABLE public.wellness_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  corporate_id uuid NOT NULL REFERENCES public.opd_corporates(id) ON DELETE CASCADE,
  name text NOT NULL,
  service_type text NOT NULL DEFAULT 'consultation' CHECK (service_type IN ('consultation','health_check')),
  price numeric NOT NULL DEFAULT 0,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wellness_packages TO authenticated;
GRANT ALL ON public.wellness_packages TO service_role;
ALTER TABLE public.wellness_packages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wp_org_select" ON public.wellness_packages FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY "wp_org_insert" ON public.wellness_packages FOR INSERT TO authenticated WITH CHECK (public.is_org_member(org_id));
CREATE POLICY "wp_org_update" ON public.wellness_packages FOR UPDATE TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY "wp_org_delete" ON public.wellness_packages FOR DELETE TO authenticated USING (public.is_org_member(org_id));
CREATE TRIGGER trg_wp_updated BEFORE UPDATE ON public.wellness_packages FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- wellness_requests
CREATE TABLE public.wellness_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  corporate_id uuid REFERENCES public.opd_corporates(id) ON DELETE SET NULL,
  package_id uuid REFERENCES public.wellness_packages(id) ON DELETE SET NULL,
  client_name text NOT NULL,
  client_email text,
  client_phone text,
  service_type text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  scheduled_at timestamptz,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','confirmed','rescheduled','cancelled','completed')),
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','email','form')),
  source_message_id text,
  source_subject text,
  source_snippet text,
  report_url text,
  report_sent_at timestamptz,
  confirmation_sent_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, source_message_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wellness_requests TO authenticated;
GRANT ALL ON public.wellness_requests TO service_role;
ALTER TABLE public.wellness_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wr_org_select" ON public.wellness_requests FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY "wr_org_insert" ON public.wellness_requests FOR INSERT TO authenticated WITH CHECK (public.is_org_member(org_id));
CREATE POLICY "wr_org_update" ON public.wellness_requests FOR UPDATE TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY "wr_org_delete" ON public.wellness_requests FOR DELETE TO authenticated USING (public.is_org_member(org_id));
CREATE TRIGGER trg_wr_updated BEFORE UPDATE ON public.wellness_requests FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_wr_org_status ON public.wellness_requests(org_id, status);
CREATE INDEX idx_wr_org_corp ON public.wellness_requests(org_id, corporate_id);

-- wellness_gmail_sync
CREATE TABLE public.wellness_gmail_sync (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL UNIQUE,
  enabled boolean NOT NULL DEFAULT false,
  query_filter text NOT NULL DEFAULT 'label:wellness is:unread newer_than:7d',
  last_polled_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wellness_gmail_sync TO authenticated;
GRANT ALL ON public.wellness_gmail_sync TO service_role;
ALTER TABLE public.wellness_gmail_sync ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wgs_org_select" ON public.wellness_gmail_sync FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY "wgs_org_insert" ON public.wellness_gmail_sync FOR INSERT TO authenticated WITH CHECK (public.is_org_member(org_id));
CREATE POLICY "wgs_org_update" ON public.wellness_gmail_sync FOR UPDATE TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY "wgs_org_delete" ON public.wellness_gmail_sync FOR DELETE TO authenticated USING (public.is_org_member(org_id));
CREATE TRIGGER trg_wgs_updated BEFORE UPDATE ON public.wellness_gmail_sync FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
