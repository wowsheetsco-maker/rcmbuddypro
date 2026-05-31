
-- Eligibility sync audit log for OPD aggregators
CREATE TABLE public.opd_eligibility_sync_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL,
  corporate_id uuid REFERENCES public.opd_corporates(id) ON DELETE CASCADE,
  aggregator text,
  triggered_by text,
  status text NOT NULL DEFAULT 'pending',
  employees_synced integer NOT NULL DEFAULT 0,
  employees_activated integer NOT NULL DEFAULT 0,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.opd_eligibility_sync_log TO authenticated;
GRANT ALL ON public.opd_eligibility_sync_log TO service_role;

ALTER TABLE public.opd_eligibility_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_select_opd_eligibility_sync_log ON public.opd_eligibility_sync_log
  FOR SELECT USING (is_org_member(org_id));
CREATE POLICY org_insert_opd_eligibility_sync_log ON public.opd_eligibility_sync_log
  FOR INSERT WITH CHECK (is_org_member(org_id));
CREATE POLICY org_update_opd_eligibility_sync_log ON public.opd_eligibility_sync_log
  FOR UPDATE USING (is_org_member(org_id)) WITH CHECK (is_org_member(org_id));
CREATE POLICY org_delete_opd_eligibility_sync_log ON public.opd_eligibility_sync_log
  FOR DELETE USING (is_org_member(org_id));

CREATE INDEX idx_opd_eligibility_sync_log_org_started ON public.opd_eligibility_sync_log (org_id, started_at DESC);

-- Dedup index for corporates by lowered name within an org
CREATE UNIQUE INDEX IF NOT EXISTS uniq_opd_corporates_org_name
  ON public.opd_corporates (org_id, lower(name));

-- Add 'draft' to allowed visit statuses by ensuring index exists; status is text, no enum constraint to alter
-- (no-op SQL kept for clarity)
SELECT 1;
