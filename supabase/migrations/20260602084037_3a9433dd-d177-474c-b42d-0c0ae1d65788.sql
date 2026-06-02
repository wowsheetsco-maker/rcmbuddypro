-- ============================================================
-- Wellness/OPD Phase 1: extend masters + add appointments, reports, invoices, tasks, dependents
-- ============================================================

-- 1. Extend opd_corporates with HR/billing contacts, package, employee limit, invoice cycle
ALTER TABLE public.opd_corporates
  ADD COLUMN IF NOT EXISTS hr_contact_name      text,
  ADD COLUMN IF NOT EXISTS hr_contact_email     text,
  ADD COLUMN IF NOT EXISTS hr_contact_phone     text,
  ADD COLUMN IF NOT EXISTS billing_contact_name  text,
  ADD COLUMN IF NOT EXISTS billing_contact_email text,
  ADD COLUMN IF NOT EXISTS billing_contact_phone text,
  ADD COLUMN IF NOT EXISTS employee_limit       integer,
  ADD COLUMN IF NOT EXISTS dependents_allowed   boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS invoice_cycle        text NOT NULL DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS default_package_id   uuid;

-- 2. Extend opd_employees with department + status
ALTER TABLE public.opd_employees
  ADD COLUMN IF NOT EXISTS department text,
  ADD COLUMN IF NOT EXISTS status     text NOT NULL DEFAULT 'active';

-- 3. opd_dependents
CREATE TABLE IF NOT EXISTS public.opd_dependents (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL,
  employee_id uuid NOT NULL REFERENCES public.opd_employees(id) ON DELETE CASCADE,
  relation    text NOT NULL,
  name        text NOT NULL,
  dob         date,
  gender      text,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.opd_dependents TO authenticated;
GRANT ALL ON public.opd_dependents TO service_role;
ALTER TABLE public.opd_dependents ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_select_opd_dependents ON public.opd_dependents FOR SELECT USING (is_org_member(org_id));
CREATE POLICY org_insert_opd_dependents ON public.opd_dependents FOR INSERT WITH CHECK (is_org_member(org_id));
CREATE POLICY org_update_opd_dependents ON public.opd_dependents FOR UPDATE USING (is_org_member(org_id)) WITH CHECK (is_org_member(org_id));
CREATE POLICY org_delete_opd_dependents ON public.opd_dependents FOR DELETE USING (is_org_member(org_id));
CREATE TRIGGER trg_opd_dependents_updated BEFORE UPDATE ON public.opd_dependents FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX IF NOT EXISTS idx_opd_dependents_employee ON public.opd_dependents(employee_id);

-- 4. opd_appointments
CREATE TABLE IF NOT EXISTS public.opd_appointments (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                     uuid NOT NULL,
  corporate_id               uuid REFERENCES public.opd_corporates(id),
  employee_id                uuid REFERENCES public.opd_employees(id),
  beneficiary_name           text NOT NULL,
  beneficiary_phone          text,
  provider                   text,
  specialty                  text,
  scheduled_at               timestamptz NOT NULL,
  status                     text NOT NULL DEFAULT 'booked', -- booked|confirmed|rescheduled|cancelled|completed|no_show
  provider_confirmed_at      timestamptz,
  reminder_24h_sent_at       timestamptz,
  reminder_same_day_sent_at  timestamptz,
  visit_id                   uuid,
  notes                      text,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.opd_appointments TO authenticated;
GRANT ALL ON public.opd_appointments TO service_role;
ALTER TABLE public.opd_appointments ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_select_opd_appointments ON public.opd_appointments FOR SELECT USING (is_org_member(org_id));
CREATE POLICY org_insert_opd_appointments ON public.opd_appointments FOR INSERT WITH CHECK (is_org_member(org_id));
CREATE POLICY org_update_opd_appointments ON public.opd_appointments FOR UPDATE USING (is_org_member(org_id)) WITH CHECK (is_org_member(org_id));
CREATE POLICY org_delete_opd_appointments ON public.opd_appointments FOR DELETE USING (is_org_member(org_id));
CREATE TRIGGER trg_opd_appointments_updated BEFORE UPDATE ON public.opd_appointments FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX IF NOT EXISTS idx_opd_appointments_org_date ON public.opd_appointments(org_id, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_opd_appointments_status   ON public.opd_appointments(org_id, status);

-- 5. opd_reports
CREATE TABLE IF NOT EXISTS public.opd_reports (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL,
  appointment_id      uuid REFERENCES public.opd_appointments(id) ON DELETE CASCADE,
  visit_id            uuid,
  corporate_id        uuid REFERENCES public.opd_corporates(id),
  employee_id         uuid REFERENCES public.opd_employees(id),
  beneficiary_name    text NOT NULL,
  stage               text NOT NULL DEFAULT 'awaiting_provider',
  -- awaiting_provider | received | qc | sent_employee | sent_corporate | closed
  awaiting_since      timestamptz NOT NULL DEFAULT now(),
  sla_target_at       timestamptz,
  received_at         timestamptz,
  qc_at               timestamptz,
  sent_employee_at    timestamptz,
  sent_corporate_at   timestamptz,
  closed_at           timestamptz,
  file_path           text,
  file_name           text,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.opd_reports TO authenticated;
GRANT ALL ON public.opd_reports TO service_role;
ALTER TABLE public.opd_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_select_opd_reports ON public.opd_reports FOR SELECT USING (is_org_member(org_id));
CREATE POLICY org_insert_opd_reports ON public.opd_reports FOR INSERT WITH CHECK (is_org_member(org_id));
CREATE POLICY org_update_opd_reports ON public.opd_reports FOR UPDATE USING (is_org_member(org_id)) WITH CHECK (is_org_member(org_id));
CREATE POLICY org_delete_opd_reports ON public.opd_reports FOR DELETE USING (is_org_member(org_id));
CREATE TRIGGER trg_opd_reports_updated BEFORE UPDATE ON public.opd_reports FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX IF NOT EXISTS idx_opd_reports_stage ON public.opd_reports(org_id, stage);

-- 6. opd_invoices
CREATE TABLE IF NOT EXISTS public.opd_invoices (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL,
  corporate_id  uuid NOT NULL REFERENCES public.opd_corporates(id),
  invoice_no    text NOT NULL,
  period_start  date NOT NULL,
  period_end    date NOT NULL,
  visit_count   integer NOT NULL DEFAULT 0,
  gross_amount  numeric NOT NULL DEFAULT 0,
  tax_amount    numeric NOT NULL DEFAULT 0,
  total_amount  numeric NOT NULL DEFAULT 0,
  paid_amount   numeric NOT NULL DEFAULT 0,
  due_date      date,
  status        text NOT NULL DEFAULT 'draft', -- draft|submitted|part_paid|paid|outstanding|cancelled
  generated_at  timestamptz NOT NULL DEFAULT now(),
  submitted_at  timestamptz,
  paid_at       timestamptz,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, invoice_no)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.opd_invoices TO authenticated;
GRANT ALL ON public.opd_invoices TO service_role;
ALTER TABLE public.opd_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_select_opd_invoices ON public.opd_invoices FOR SELECT USING (is_org_member(org_id));
CREATE POLICY org_insert_opd_invoices ON public.opd_invoices FOR INSERT WITH CHECK (is_org_member(org_id));
CREATE POLICY org_update_opd_invoices ON public.opd_invoices FOR UPDATE USING (is_org_member(org_id)) WITH CHECK (is_org_member(org_id));
CREATE POLICY org_delete_opd_invoices ON public.opd_invoices FOR DELETE USING (is_org_member(org_id));
CREATE TRIGGER trg_opd_invoices_updated BEFORE UPDATE ON public.opd_invoices FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX IF NOT EXISTS idx_opd_invoices_status ON public.opd_invoices(org_id, status);

-- 7. opd_invoice_items
CREATE TABLE IF NOT EXISTS public.opd_invoice_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL,
  invoice_id  uuid NOT NULL REFERENCES public.opd_invoices(id) ON DELETE CASCADE,
  visit_id    uuid,
  description text,
  amount      numeric NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.opd_invoice_items TO authenticated;
GRANT ALL ON public.opd_invoice_items TO service_role;
ALTER TABLE public.opd_invoice_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_select_opd_invoice_items ON public.opd_invoice_items FOR SELECT USING (is_org_member(org_id));
CREATE POLICY org_insert_opd_invoice_items ON public.opd_invoice_items FOR INSERT WITH CHECK (is_org_member(org_id));
CREATE POLICY org_update_opd_invoice_items ON public.opd_invoice_items FOR UPDATE USING (is_org_member(org_id)) WITH CHECK (is_org_member(org_id));
CREATE POLICY org_delete_opd_invoice_items ON public.opd_invoice_items FOR DELETE USING (is_org_member(org_id));
CREATE INDEX IF NOT EXISTS idx_opd_invoice_items_invoice ON public.opd_invoice_items(invoice_id);

-- 8. opd_followup_tasks
CREATE TABLE IF NOT EXISTS public.opd_followup_tasks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL,
  entity_type   text NOT NULL, -- appointment | report | invoice | payment | general
  entity_id     uuid,
  title         text NOT NULL,
  description   text,
  due_at        timestamptz,
  assigned_to   uuid, -- app_users.id
  status        text NOT NULL DEFAULT 'open', -- open | done | cancelled
  completed_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.opd_followup_tasks TO authenticated;
GRANT ALL ON public.opd_followup_tasks TO service_role;
ALTER TABLE public.opd_followup_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_select_opd_followup_tasks ON public.opd_followup_tasks FOR SELECT USING (is_org_member(org_id));
CREATE POLICY org_insert_opd_followup_tasks ON public.opd_followup_tasks FOR INSERT WITH CHECK (is_org_member(org_id));
CREATE POLICY org_update_opd_followup_tasks ON public.opd_followup_tasks FOR UPDATE USING (is_org_member(org_id)) WITH CHECK (is_org_member(org_id));
CREATE POLICY org_delete_opd_followup_tasks ON public.opd_followup_tasks FOR DELETE USING (is_org_member(org_id));
CREATE TRIGGER trg_opd_followup_tasks_updated BEFORE UPDATE ON public.opd_followup_tasks FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX IF NOT EXISTS idx_opd_followup_tasks_status ON public.opd_followup_tasks(org_id, status, due_at);
CREATE INDEX IF NOT EXISTS idx_opd_followup_tasks_assignee ON public.opd_followup_tasks(assigned_to, status);