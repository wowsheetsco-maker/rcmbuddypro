-- ====== outstanding_reminders ======
CREATE TABLE public.outstanding_reminders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  insurer_id INTEGER NOT NULL,
  insurer_name TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  cc_emails TEXT[],
  scheduled_at TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','sent','failed','cancelled')),
  claim_count INTEGER NOT NULL DEFAULT 0,
  total_outstanding NUMERIC NOT NULL DEFAULT 0,
  oldest_claim_days INTEGER,
  payload JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_outstanding_reminders_status_scheduled ON public.outstanding_reminders (status, scheduled_at);
CREATE INDEX idx_outstanding_reminders_insurer ON public.outstanding_reminders (insurer_id);
ALTER TABLE public.outstanding_reminders ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER outstanding_reminders_updated_at
BEFORE UPDATE ON public.outstanding_reminders
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ====== claims & follow_ups ======
CREATE TABLE public.claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id text UNIQUE,
  ihx_ref_id text,
  hospital_name text,
  patient_name text NOT NULL,
  patient_contact text,
  in_patient_number text,
  member_customer_id text,
  date_of_admission date,
  date_of_discharge date,
  tpa_name text NOT NULL,
  insurance_company_name text,
  policy_number text,
  claim_number text NOT NULL,
  initial_claim_number text,
  claim_creation_date date NOT NULL,
  claimed_amount numeric NOT NULL DEFAULT 0,
  approved_amount numeric NOT NULL DEFAULT 0,
  copay numeric NOT NULL DEFAULT 0,
  shortfall_amount numeric NOT NULL DEFAULT 0,
  hospital_discount numeric NOT NULL DEFAULT 0,
  patient_paid_amount numeric NOT NULL DEFAULT 0,
  settled_amount numeric NOT NULL DEFAULT 0,
  tds_amount numeric NOT NULL DEFAULT 0,
  cheque_neft_utr_no text,
  cheque_neft_utr_date date,
  receipt_no text,
  claim_status text NOT NULL,
  doc_submission_date date,
  payment_update_date date,
  treatment text,
  diagnosis text,
  policy_type text,
  policy_holder_name text,
  employee_code text,
  insurer_comments text,
  outstanding_amount numeric NOT NULL DEFAULT 0,
  is_irdai_breach boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.claims ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER claims_set_updated_at BEFORE UPDATE ON public.claims FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_claims_status ON public.claims(claim_status);
CREATE INDEX idx_claims_outstanding ON public.claims(outstanding_amount DESC);
CREATE INDEX idx_claims_breach ON public.claims(is_irdai_breach) WHERE is_irdai_breach = true;

CREATE TABLE public.follow_ups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id uuid NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
  outcome text NOT NULL,
  ref_number text,
  notes text,
  promised_date date,
  next_action_date date NOT NULL,
  logged_by text,
  logged_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.follow_ups ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER follow_ups_set_updated_at BEFORE UPDATE ON public.follow_ups FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_follow_ups_claim ON public.follow_ups(claim_id, logged_at DESC);
CREATE INDEX idx_follow_ups_next ON public.follow_ups(next_action_date);

ALTER PUBLICATION supabase_realtime ADD TABLE public.follow_ups;
ALTER TABLE public.follow_ups REPLICA IDENTITY FULL;

-- ====== import_history ======
CREATE TABLE public.import_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  file_name TEXT NOT NULL,
  total_rows INTEGER NOT NULL DEFAULT 0,
  success_rows INTEGER NOT NULL DEFAULT 0,
  failed_rows INTEGER NOT NULL DEFAULT 0,
  inserted_rows INTEGER NOT NULL DEFAULT 0,
  updated_rows INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'completed',
  error_summary TEXT,
  snapshot jsonb,
  reverted_at timestamptz,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.import_history ENABLE ROW LEVEL SECURITY;

-- ====== insurer_contacts ======
CREATE TABLE public.insurer_contacts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  designation TEXT,
  email TEXT NOT NULL,
  cc_emails TEXT,
  phone TEXT,
  whatsapp TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  contract_expiry_date date,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_insurer_contacts_provider ON public.insurer_contacts (lower(provider));
ALTER TABLE public.insurer_contacts ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_insurer_contacts_updated_at BEFORE UPDATE ON public.insurer_contacts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ====== data_quality + dq_rules ======
ALTER TABLE public.claims ADD COLUMN data_quality jsonb NOT NULL DEFAULT '{"tag":"clean","issues":[]}'::jsonb;
CREATE INDEX idx_claims_dq_tag ON public.claims ((data_quality->>'tag'));

CREATE TABLE public.dq_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.dq_rules ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER dq_rules_updated_at BEFORE UPDATE ON public.dq_rules FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.dq_rules (name, config) VALUES (
  'default',
  jsonb_build_object(
    'submission_warn_days', 3,
    'approval_escalate_days', 10,
    'settlement_critical_days', 30,
    'zero_approval_risk_days', 7,
    'high_value_claim_inr', 1000000,
    'min_approval_rate_pct', 70,
    'max_denial_rate_pct', 15,
    'max_avg_tat_days', 30
  )
) ON CONFLICT (name) DO NOTHING;

-- ====== spoc/comm columns on claims ======
ALTER TABLE public.claims
  ADD COLUMN tpa_spoc text,
  ADD COLUMN hospital_spoc text,
  ADD COLUMN last_communication_at timestamptz,
  ADD COLUMN last_communication_note text,
  ADD COLUMN remarks text,
  ADD COLUMN action_plan text;

-- ====== discrepancy_actions + log ======
CREATE TABLE public.discrepancy_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id uuid NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
  stage text NOT NULL DEFAULT 'discrepancy',
  status text NOT NULL DEFAULT 'unreviewed',
  flagged_amount numeric NOT NULL DEFAULT 0,
  flagged_pct numeric NOT NULL DEFAULT 0,
  flag_severity text NOT NULL DEFAULT 'low',
  remarks text,
  last_action_type text,
  last_action_at timestamptz,
  last_action_by text,
  email_sent_count integer NOT NULL DEFAULT 0,
  pushed_to_appeal_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(claim_id)
);
CREATE INDEX idx_discrepancy_actions_stage ON public.discrepancy_actions(stage);
CREATE INDEX idx_discrepancy_actions_status ON public.discrepancy_actions(status);
CREATE INDEX idx_discrepancy_actions_severity ON public.discrepancy_actions(flag_severity);
ALTER TABLE public.discrepancy_actions ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_discrepancy_actions_updated_at BEFORE UPDATE ON public.discrepancy_actions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.discrepancy_action_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id uuid NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
  action_type text NOT NULL,
  channel text,
  recipient text,
  tone text,
  subject text,
  body_preview text,
  scheduled_for timestamptz,
  bulk_batch_id uuid,
  notes text,
  performed_by text,
  performed_at timestamptz NOT NULL DEFAULT now(),
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  cc_emails text[] NOT NULL DEFAULT '{}'::text[],
  ai_generation_id uuid,
  status text NOT NULL DEFAULT 'sent',
  provider_message_id text,
  delivered_at timestamptz,
  failed_at timestamptz,
  error_message text
);
CREATE INDEX idx_discrepancy_log_claim ON public.discrepancy_action_log(claim_id);
CREATE INDEX idx_discrepancy_log_batch ON public.discrepancy_action_log(bulk_batch_id);
CREATE INDEX idx_discrepancy_action_log_provider_message_id ON public.discrepancy_action_log (provider_message_id) WHERE provider_message_id IS NOT NULL;
ALTER TABLE public.discrepancy_action_log ENABLE ROW LEVEL SECURITY;

-- ====== ai_providers + ai_generations + storage ======
CREATE TABLE public.ai_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  display_name text NOT NULL,
  api_key text NOT NULL,
  default_model text,
  is_active boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  notes text,
  last_used_at timestamptz,
  total_calls integer NOT NULL DEFAULT 0,
  total_tokens integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ai_providers ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER ai_providers_set_updated_at BEFORE UPDATE ON public.ai_providers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.ai_generations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tool text NOT NULL,
  provider text NOT NULL,
  model text NOT NULL,
  claim_id uuid REFERENCES public.claims(id) ON DELETE SET NULL,
  input_summary text,
  attachments_count integer NOT NULL DEFAULT 0,
  output text,
  prompt_tokens integer,
  completion_tokens integer,
  status text NOT NULL DEFAULT 'success',
  error_message text,
  duration_ms integer,
  created_by text,
  ocr_text text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ai_generations ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_ai_generations_created ON public.ai_generations(created_at DESC);
CREATE INDEX idx_ai_generations_tool ON public.ai_generations(tool);
CREATE INDEX idx_ai_generations_claim ON public.ai_generations(claim_id);

INSERT INTO storage.buckets (id, name, public) VALUES ('ai-attachments', 'ai-attachments', false) ON CONFLICT (id) DO NOTHING;

-- ====== app_settings ======
CREATE TABLE public.app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER app_settings_set_updated_at BEFORE UPDATE ON public.app_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.app_settings (key, value) VALUES
  ('subject_templates', jsonb_build_object(
    'appeal_letter', 'Appeal against denial{reason_paren}{amount_dash} · {claim_ref}{patient_dot}',
    'query_reply',   'Reply to query · {claim_ref}{patient_dot}{insurer_dot}',
    'discharge_summary', 'Discharge Summary · {patient_or_ref}',
    'insurer_email', '{purpose} · Claim {claim_ref}{patient_dot}'
  ))
ON CONFLICT (key) DO NOTHING;

-- ====== hospital groups & branches ======
CREATE TABLE public.hospital_groups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.hospital_groups ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER hospital_groups_set_updated_at BEFORE UPDATE ON public.hospital_groups FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.hospital_branches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.hospital_groups(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  city TEXT,
  raw_name TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (group_id, name)
);
CREATE INDEX idx_hospital_branches_group ON public.hospital_branches(group_id);
CREATE INDEX idx_hospital_branches_raw_name ON public.hospital_branches(lower(raw_name));
ALTER TABLE public.hospital_branches ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER hospital_branches_set_updated_at BEFORE UPDATE ON public.hospital_branches FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.claims
  ADD COLUMN hospital_group_id UUID REFERENCES public.hospital_groups(id) ON DELETE SET NULL,
  ADD COLUMN hospital_branch_id UUID REFERENCES public.hospital_branches(id) ON DELETE SET NULL;
CREATE INDEX idx_claims_hospital_group ON public.claims(hospital_group_id);
CREATE INDEX idx_claims_hospital_branch ON public.claims(hospital_branch_id);

-- ====== app_users ======
CREATE TABLE public.app_users (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  phone text,
  role text NOT NULL DEFAULT 'Billing Executive',
  status text NOT NULL DEFAULT 'active',
  department text,
  designation text,
  notes text,
  last_login_at timestamptz,
  smtp_host text,
  smtp_port integer,
  smtp_username text,
  smtp_password text,
  smtp_use_tls boolean NOT NULL DEFAULT true,
  smtp_from_name text,
  smtp_from_email text,
  smtp_reply_to text,
  smtp_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_app_users_updated_at BEFORE UPDATE ON public.app_users FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_app_users_role ON public.app_users(role);
CREATE INDEX idx_app_users_status ON public.app_users(status);

-- ====== role_permissions ======
CREATE TABLE public.role_permissions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  role text NOT NULL,
  resource text NOT NULL,
  can_view boolean NOT NULL DEFAULT false,
  can_create boolean NOT NULL DEFAULT false,
  can_edit boolean NOT NULL DEFAULT false,
  can_delete boolean NOT NULL DEFAULT false,
  can_export boolean NOT NULL DEFAULT false,
  can_send boolean NOT NULL DEFAULT false,
  can_approve boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (role, resource)
);
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_role_permissions_updated_at BEFORE UPDATE ON public.role_permissions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_role_permissions_role ON public.role_permissions(role);

-- ====== whatsapp_templates ======
CREATE TABLE public.whatsapp_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'tpa',
  audience_role text NOT NULL DEFAULT 'any',
  subject_hint text,
  body text NOT NULL,
  sort_order integer NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER set_whatsapp_templates_updated_at BEFORE UPDATE ON public.whatsapp_templates FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_whatsapp_templates_active ON public.whatsapp_templates (is_active, sort_order);

-- ====== reminder_schedules + runs ======
CREATE TABLE public.reminder_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'tpa',
  tpa_name TEXT,
  aging_bucket TEXT,
  cadence TEXT NOT NULL DEFAULT 'weekly',
  every_n_days INTEGER,
  day_of_week INTEGER,
  day_of_month INTEGER,
  send_hour INTEGER NOT NULL DEFAULT 10,
  send_minute INTEGER NOT NULL DEFAULT 0,
  include_pending BOOLEAN NOT NULL DEFAULT true,
  include_discrepancies BOOLEAN NOT NULL DEFAULT false,
  include_irdai_breaches BOOLEAN NOT NULL DEFAULT false,
  include_denied BOOLEAN NOT NULL DEFAULT false,
  include_aging_summary BOOLEAN NOT NULL DEFAULT true,
  min_outstanding NUMERIC NOT NULL DEFAULT 0,
  recipient_email_override TEXT,
  cc_emails_override TEXT,
  subject_template TEXT,
  body_template TEXT,
  attach_excel BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  created_by TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_reminder_schedules_active_next ON public.reminder_schedules(is_active, next_run_at);
CREATE INDEX idx_reminder_schedules_tpa ON public.reminder_schedules(tpa_name);
ALTER TABLE public.reminder_schedules ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER reminder_schedules_set_updated_at BEFORE UPDATE ON public.reminder_schedules FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.reminder_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID REFERENCES public.reminder_schedules(id) ON DELETE SET NULL,
  schedule_name TEXT,
  tpa_name TEXT,
  recipient_email TEXT,
  cc_emails TEXT[],
  trigger_kind TEXT NOT NULL DEFAULT 'auto',
  claim_count INTEGER NOT NULL DEFAULT 0,
  discrepancy_count INTEGER NOT NULL DEFAULT 0,
  irdai_breach_count INTEGER NOT NULL DEFAULT 0,
  total_outstanding NUMERIC NOT NULL DEFAULT 0,
  oldest_claim_days INTEGER,
  status TEXT NOT NULL DEFAULT 'queued',
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_reminder_runs_schedule ON public.reminder_runs(schedule_id, created_at DESC);
CREATE INDEX idx_reminder_runs_tpa ON public.reminder_runs(tpa_name, created_at DESC);
ALTER TABLE public.reminder_runs ENABLE ROW LEVEL SECURITY;

-- ====== user_tpa_allocations ======
CREATE TABLE public.user_tpa_allocations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  provider text NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider)
);
CREATE INDEX idx_user_tpa_allocations_user ON public.user_tpa_allocations(user_id);
CREATE INDEX idx_user_tpa_allocations_provider ON public.user_tpa_allocations(provider);
ALTER TABLE public.user_tpa_allocations ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER set_user_tpa_allocations_updated_at BEFORE UPDATE ON public.user_tpa_allocations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ====== organizations ======
CREATE TABLE public.organizations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  slug            text NOT NULL UNIQUE,
  plan            text NOT NULL DEFAULT 'trial',
  status          text NOT NULL DEFAULT 'active',
  billing_email   text,
  billing_phone   text,
  gstin           text,
  address         text,
  trial_ends_at   timestamptz,
  mrr_inr         numeric NOT NULL DEFAULT 0,
  settings        jsonb NOT NULL DEFAULT '{}'::jsonb,
  first_run_completed boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TYPE public.org_role AS ENUM ('owner','admin','manager','member','viewer');

CREATE TABLE public.organization_members (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        public.org_role NOT NULL DEFAULT 'member',
  last_seen_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id)
);
CREATE INDEX idx_org_members_user ON public.organization_members(user_id);
CREATE INDEX idx_org_members_org  ON public.organization_members(org_id);
CREATE INDEX organization_members_user_last_seen_idx ON public.organization_members (user_id, last_seen_at DESC NULLS LAST);

CREATE TABLE public.platform_admins (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text NOT NULL UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_admins pa
    JOIN auth.users u ON lower(u.email) = lower(pa.email)
    WHERE u.id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.user_org_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT org_id FROM public.organization_members WHERE user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_org_member(_org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT
    (auth.uid() IS NULL AND _org_id = '00000000-0000-0000-0000-000000000001'::uuid)
    OR public.is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE user_id = auth.uid() AND org_id = _org_id
    );
$$;

CREATE OR REPLACE FUNCTION public.has_org_role(_org_id uuid, _roles public.org_role[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT public.is_platform_admin()
      OR EXISTS (
        SELECT 1 FROM public.organization_members
        WHERE user_id = auth.uid() AND org_id = _org_id AND role = ANY(_roles)
      );
$$;

CREATE OR REPLACE FUNCTION public.set_default_org_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.org_id IS NULL THEN
    SELECT org_id INTO NEW.org_id FROM public.organization_members WHERE user_id = auth.uid() LIMIT 1;
    IF NEW.org_id IS NULL THEN
      NEW.org_id := '00000000-0000-0000-0000-000000000001'::uuid;
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  INSERT INTO public.app_users (name, email, role, status)
  VALUES (
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)),
    NEW.email, 'Billing Executive', 'active'
  )
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

INSERT INTO public.organizations (id, name, slug, plan, status)
VALUES ('00000000-0000-0000-0000-000000000001','Demo Hospital','demo','trial','active');

-- org_id on all tenant tables
ALTER TABLE public.claims                  ADD COLUMN org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.follow_ups              ADD COLUMN org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.hospital_groups         ADD COLUMN org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.hospital_branches       ADD COLUMN org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.insurer_contacts        ADD COLUMN org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.app_users               ADD COLUMN org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.app_users               ADD COLUMN auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.discrepancy_actions     ADD COLUMN org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.discrepancy_action_log  ADD COLUMN org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.outstanding_reminders   ADD COLUMN org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.reminder_schedules      ADD COLUMN org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.reminder_runs           ADD COLUMN org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.ai_generations          ADD COLUMN org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.ai_providers            ADD COLUMN org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.dq_rules                ADD COLUMN org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.import_history          ADD COLUMN org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.role_permissions        ADD COLUMN org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.user_tpa_allocations    ADD COLUMN org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.whatsapp_templates      ADD COLUMN org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.app_settings            ADD COLUMN org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

UPDATE public.app_users              SET org_id='00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE public.insurer_contacts       SET org_id='00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE public.dq_rules               SET org_id='00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE public.role_permissions       SET org_id='00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE public.whatsapp_templates     SET org_id='00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE public.app_settings           SET org_id='00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;

ALTER TABLE public.claims                 ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.follow_ups             ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.hospital_groups        ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.hospital_branches      ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.insurer_contacts       ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.app_users              ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.discrepancy_actions    ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.discrepancy_action_log ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.outstanding_reminders  ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.reminder_schedules     ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.reminder_runs          ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.ai_generations         ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.ai_providers           ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.dq_rules               ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.import_history         ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.role_permissions       ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.user_tpa_allocations   ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.whatsapp_templates     ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.app_settings           ALTER COLUMN org_id SET NOT NULL;

ALTER TABLE public.app_settings DROP CONSTRAINT IF EXISTS app_settings_pkey;
ALTER TABLE public.app_settings ADD PRIMARY KEY (org_id, key);

CREATE INDEX idx_claims_org                  ON public.claims(org_id);
CREATE INDEX idx_follow_ups_org              ON public.follow_ups(org_id);
CREATE INDEX idx_hospital_groups_org         ON public.hospital_groups(org_id);
CREATE INDEX idx_hospital_branches_org       ON public.hospital_branches(org_id);
CREATE INDEX idx_insurer_contacts_org        ON public.insurer_contacts(org_id);
CREATE INDEX idx_app_users_org               ON public.app_users(org_id);
CREATE INDEX idx_app_users_auth_user         ON public.app_users(auth_user_id);
CREATE INDEX idx_discrepancy_actions_org     ON public.discrepancy_actions(org_id);
CREATE INDEX idx_discrepancy_action_log_org  ON public.discrepancy_action_log(org_id);
CREATE INDEX idx_outstanding_reminders_org   ON public.outstanding_reminders(org_id);
CREATE INDEX idx_reminder_schedules_org      ON public.reminder_schedules(org_id);
CREATE INDEX idx_reminder_runs_org           ON public.reminder_runs(org_id);
CREATE INDEX idx_ai_generations_org          ON public.ai_generations(org_id);
CREATE INDEX idx_ai_providers_org            ON public.ai_providers(org_id);
CREATE INDEX idx_dq_rules_org                ON public.dq_rules(org_id);
CREATE INDEX idx_import_history_org          ON public.import_history(org_id);
CREATE INDEX idx_role_permissions_org        ON public.role_permissions(org_id);
CREATE INDEX idx_user_tpa_allocations_org    ON public.user_tpa_allocations(org_id);
CREATE INDEX idx_whatsapp_templates_org      ON public.whatsapp_templates(org_id);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'claims','follow_ups','hospital_groups','hospital_branches','insurer_contacts',
    'app_users','discrepancy_actions','discrepancy_action_log','outstanding_reminders',
    'reminder_schedules','reminder_runs','ai_generations','ai_providers','dq_rules',
    'import_history','role_permissions','user_tpa_allocations','whatsapp_templates'
  ] LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_set_org_id ON public.%I;
       CREATE TRIGGER trg_set_org_id BEFORE INSERT ON public.%I
       FOR EACH ROW EXECUTE FUNCTION public.set_default_org_id();', t, t);
  END LOOP;
END $$;

ALTER TABLE public.organizations         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_admins       ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view their org" ON public.organizations FOR SELECT USING (public.is_org_member(id));
CREATE POLICY "Owners/admins can update their org" ON public.organizations FOR UPDATE USING (public.has_org_role(id, ARRAY['owner','admin']::public.org_role[]));
CREATE POLICY "Platform admins can insert orgs" ON public.organizations FOR INSERT WITH CHECK (public.is_platform_admin());
CREATE POLICY "Platform admins can delete orgs" ON public.organizations FOR DELETE USING (public.is_platform_admin());
CREATE POLICY "Platform admins can view all orgs" ON public.organizations FOR SELECT USING (public.is_platform_admin());

CREATE POLICY "Members can view co-members" ON public.organization_members FOR SELECT USING (public.is_org_member(org_id));
CREATE POLICY "Owners/admins can add members" ON public.organization_members FOR INSERT WITH CHECK (public.has_org_role(org_id, ARRAY['owner','admin']::public.org_role[]));
CREATE POLICY "Owners/admins can update members" ON public.organization_members FOR UPDATE USING (public.has_org_role(org_id, ARRAY['owner','admin']::public.org_role[]));
CREATE POLICY "Owners/admins can remove members" ON public.organization_members FOR DELETE USING (public.has_org_role(org_id, ARRAY['owner','admin']::public.org_role[]));

CREATE POLICY "Only platform admins see platform admins" ON public.platform_admins FOR ALL USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'claims','follow_ups','hospital_groups','hospital_branches','insurer_contacts',
    'app_users','app_settings','discrepancy_actions','discrepancy_action_log',
    'outstanding_reminders','reminder_schedules','reminder_runs','ai_generations',
    'dq_rules','import_history','user_tpa_allocations','whatsapp_templates'
  ] LOOP
    EXECUTE format($f$
      CREATE POLICY "org_select_%1$s" ON public.%1$I FOR SELECT USING (public.is_org_member(org_id));
      CREATE POLICY "org_insert_%1$s" ON public.%1$I FOR INSERT WITH CHECK (public.is_org_member(org_id));
      CREATE POLICY "org_update_%1$s" ON public.%1$I FOR UPDATE USING (public.is_org_member(org_id)) WITH CHECK (public.is_org_member(org_id));
      CREATE POLICY "org_delete_%1$s" ON public.%1$I FOR DELETE USING (public.is_org_member(org_id));
    $f$, t);
  END LOOP;
END $$;

-- ai_providers and role_permissions: owners/admins only for writes
CREATE POLICY org_select_ai_providers ON public.ai_providers FOR SELECT TO authenticated USING (public.has_org_role(org_id, ARRAY['owner','admin']::org_role[]));
CREATE POLICY org_insert_ai_providers ON public.ai_providers FOR INSERT TO authenticated WITH CHECK (public.has_org_role(org_id, ARRAY['owner','admin']::org_role[]));
CREATE POLICY org_update_ai_providers ON public.ai_providers FOR UPDATE TO authenticated USING (public.has_org_role(org_id, ARRAY['owner','admin']::org_role[])) WITH CHECK (public.has_org_role(org_id, ARRAY['owner','admin']::org_role[]));
CREATE POLICY org_delete_ai_providers ON public.ai_providers FOR DELETE TO authenticated USING (public.has_org_role(org_id, ARRAY['owner','admin']::org_role[]));

CREATE POLICY org_select_role_permissions ON public.role_permissions FOR SELECT USING (public.is_org_member(org_id));
CREATE POLICY org_insert_role_permissions ON public.role_permissions FOR INSERT TO authenticated WITH CHECK (public.has_org_role(org_id, ARRAY['owner','admin']::org_role[]));
CREATE POLICY org_update_role_permissions ON public.role_permissions FOR UPDATE TO authenticated USING (public.has_org_role(org_id, ARRAY['owner','admin']::org_role[])) WITH CHECK (public.has_org_role(org_id, ARRAY['owner','admin']::org_role[]));
CREATE POLICY org_delete_role_permissions ON public.role_permissions FOR DELETE TO authenticated USING (public.has_org_role(org_id, ARRAY['owner','admin']::org_role[]));

CREATE TRIGGER organizations_updated_at BEFORE UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ====== team_digest_subscriptions/runs ======
CREATE TABLE public.team_digest_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  app_user_id uuid NOT NULL,
  daily boolean NOT NULL DEFAULT false,
  weekly boolean NOT NULL DEFAULT false,
  monthly boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, app_user_id)
);
ALTER TABLE public.team_digest_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_select_team_digest_subscriptions ON public.team_digest_subscriptions FOR SELECT USING (is_org_member(org_id));
CREATE POLICY org_insert_team_digest_subscriptions ON public.team_digest_subscriptions FOR INSERT WITH CHECK (is_org_member(org_id));
CREATE POLICY org_update_team_digest_subscriptions ON public.team_digest_subscriptions FOR UPDATE USING (is_org_member(org_id)) WITH CHECK (is_org_member(org_id));
CREATE POLICY org_delete_team_digest_subscriptions ON public.team_digest_subscriptions FOR DELETE USING (is_org_member(org_id));
CREATE TRIGGER trg_team_digest_subscriptions_updated_at BEFORE UPDATE ON public.team_digest_subscriptions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.team_digest_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  cadence text NOT NULL CHECK (cadence IN ('daily','weekly','monthly')),
  recipients_count integer NOT NULL DEFAULT 0,
  sent_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  trigger_kind text NOT NULL DEFAULT 'cron',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.team_digest_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_select_team_digest_runs ON public.team_digest_runs FOR SELECT USING (is_org_member(org_id));
CREATE POLICY org_insert_team_digest_runs ON public.team_digest_runs FOR INSERT WITH CHECK (is_org_member(org_id));

-- SMTP credential column-level lockdown + safe RPC
REVOKE SELECT (smtp_password, smtp_username, smtp_host, smtp_port, smtp_from_email, smtp_from_name, smtp_reply_to, smtp_use_tls, smtp_verified_at) ON public.app_users FROM authenticated, anon;

CREATE OR REPLACE FUNCTION public.get_own_smtp_settings()
RETURNS TABLE (smtp_host text, smtp_port integer, smtp_username text, smtp_password text, smtp_from_email text, smtp_from_name text, smtp_reply_to text, smtp_use_tls boolean, smtp_verified_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT smtp_host, smtp_port, smtp_username, smtp_password, smtp_from_email, smtp_from_name, smtp_reply_to, smtp_use_tls, smtp_verified_at
  FROM public.app_users WHERE auth_user_id = auth.uid();
$$;
REVOKE EXECUTE ON FUNCTION public.get_own_smtp_settings() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_own_smtp_settings() TO authenticated;

-- Storage policies for ai-attachments (org-prefixed paths)
CREATE POLICY "Org members can read ai-attachments" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'ai-attachments' AND public.is_org_member(((storage.foldername(name))[1])::uuid));
CREATE POLICY "Org members can upload ai-attachments" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'ai-attachments' AND public.is_org_member(((storage.foldername(name))[1])::uuid));
CREATE POLICY "Org members can delete ai-attachments" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'ai-attachments' AND public.is_org_member(((storage.foldername(name))[1])::uuid));

GRANT EXECUTE ON FUNCTION public.is_org_member(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_org_role(uuid, public.org_role[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.user_org_ids() TO anon, authenticated;

-- ====== staff_scorecard_overrides ======
CREATE TABLE public.staff_scorecard_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  app_user_id uuid NOT NULL,
  month text NOT NULL,
  query_resolved integer NOT NULL DEFAULT 0,
  rating_override text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, app_user_id, month)
);
ALTER TABLE public.staff_scorecard_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_select_staff_scorecard_overrides ON public.staff_scorecard_overrides FOR SELECT USING (is_org_member(org_id));
CREATE POLICY org_insert_staff_scorecard_overrides ON public.staff_scorecard_overrides FOR INSERT WITH CHECK (is_org_member(org_id));
CREATE POLICY org_update_staff_scorecard_overrides ON public.staff_scorecard_overrides FOR UPDATE USING (is_org_member(org_id)) WITH CHECK (is_org_member(org_id));
CREATE POLICY org_delete_staff_scorecard_overrides ON public.staff_scorecard_overrides FOR DELETE USING (is_org_member(org_id));
CREATE TRIGGER set_staff_scorecard_overrides_updated_at BEFORE UPDATE ON public.staff_scorecard_overrides FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_staff_scorecard_overrides_org_id BEFORE INSERT ON public.staff_scorecard_overrides FOR EACH ROW EXECUTE FUNCTION public.set_default_org_id();
CREATE INDEX idx_staff_scorecard_overrides_lookup ON public.staff_scorecard_overrides (org_id, app_user_id, month);

-- ====== claim_documents + bucket ======
CREATE TABLE public.claim_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  claim_id uuid NOT NULL,
  file_path text NOT NULL,
  file_name text NOT NULL,
  file_size bigint NOT NULL DEFAULT 0,
  mime_type text,
  uploaded_by uuid,
  uploader_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_claim_documents_claim_id ON public.claim_documents(claim_id);
CREATE INDEX idx_claim_documents_org_id ON public.claim_documents(org_id);
ALTER TABLE public.claim_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_select_claim_documents" ON public.claim_documents FOR SELECT USING (public.is_org_member(org_id));
CREATE POLICY "org_insert_claim_documents" ON public.claim_documents FOR INSERT WITH CHECK (public.is_org_member(org_id));
CREATE POLICY "org_update_claim_documents" ON public.claim_documents FOR UPDATE USING (public.is_org_member(org_id)) WITH CHECK (public.is_org_member(org_id));
CREATE POLICY "org_delete_claim_documents" ON public.claim_documents FOR DELETE USING (public.is_org_member(org_id));

INSERT INTO storage.buckets (id, name, public) VALUES ('claim-documents', 'claim-documents', false) ON CONFLICT (id) DO NOTHING;

CREATE POLICY "claim_documents_select" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'claim-documents' AND EXISTS (SELECT 1 FROM public.claim_documents cd WHERE cd.file_path = name AND public.is_org_member(cd.org_id)));
CREATE POLICY "claim_documents_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'claim-documents' AND auth.uid() IS NOT NULL);
CREATE POLICY "claim_documents_delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'claim-documents' AND EXISTS (SELECT 1 FROM public.claim_documents cd WHERE cd.file_path = name AND public.is_org_member(cd.org_id)));

-- ====== notification prefs + outstanding_notifications ======
CREATE TABLE public.user_notification_prefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  pref_key text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  channel text NOT NULL DEFAULT 'in-app',
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, pref_key)
);
CREATE INDEX idx_unp_user ON public.user_notification_prefs(user_id);
ALTER TABLE public.user_notification_prefs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "unp_select_own" ON public.user_notification_prefs FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "unp_insert_own" ON public.user_notification_prefs FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "unp_update_own" ON public.user_notification_prefs FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "unp_delete_own" ON public.user_notification_prefs FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE TRIGGER trg_unp_updated_at BEFORE UPDATE ON public.user_notification_prefs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.outstanding_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  user_id uuid NOT NULL,
  type text NOT NULL,
  title text NOT NULL,
  message text,
  ref_claim_id uuid,
  dedupe_key text,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_on_user_unread ON public.outstanding_notifications(user_id, read, created_at DESC);
CREATE INDEX idx_on_org ON public.outstanding_notifications(org_id);
CREATE UNIQUE INDEX uq_on_dedupe ON public.outstanding_notifications(user_id, dedupe_key) WHERE dedupe_key IS NOT NULL;
ALTER TABLE public.outstanding_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "on_select_own" ON public.outstanding_notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "on_update_own" ON public.outstanding_notifications FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "on_delete_own" ON public.outstanding_notifications FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "on_insert_org_member" ON public.outstanding_notifications FOR INSERT TO authenticated WITH CHECK (public.is_org_member(org_id));
ALTER PUBLICATION supabase_realtime ADD TABLE public.outstanding_notifications;
ALTER TABLE public.outstanding_notifications REPLICA IDENTITY FULL;

-- ====== Worklist views ======
CREATE OR REPLACE VIEW public.v_claims_priority AS
WITH base AS (
  SELECT c.*, GREATEST(0, (CURRENT_DATE - c.claim_creation_date))::int AS age_days, LOWER(COALESCE(c.claim_status, '')) AS status_lc
  FROM public.claims c
  WHERE LOWER(COALESCE(c.claim_status, '')) NOT LIKE '%settled%'
), scored AS (
  SELECT b.*,
    LEAST(40, GREATEST(0, ROUND(LOG(GREATEST(1, b.outstanding_amount / 1000.0)) * 11)::int)) AS amt_pts,
    CASE WHEN b.age_days >= 90 THEN 30 WHEN b.age_days >= 60 THEN 22 WHEN b.age_days >= 30 THEN 14 WHEN b.age_days >= 14 THEN 6 ELSE 0 END AS age_pts,
    CASE WHEN b.is_irdai_breach THEN 20 ELSE 0 END AS breach_pts,
    CASE WHEN b.status_lc LIKE '%deni%' OR b.status_lc LIKE '%reject%' THEN 10 WHEN b.status_lc LIKE '%query%' OR b.status_lc LIKE '%pending%' THEN 6 ELSE 0 END AS status_pts
  FROM base b
)
SELECT s.*, LEAST(100, s.amt_pts + s.age_pts + s.breach_pts + s.status_pts) AS priority_score,
  CASE WHEN LEAST(100, s.amt_pts + s.age_pts + s.breach_pts + s.status_pts) >= 75 THEN 'critical'
       WHEN LEAST(100, s.amt_pts + s.age_pts + s.breach_pts + s.status_pts) >= 55 THEN 'high'
       WHEN LEAST(100, s.amt_pts + s.age_pts + s.breach_pts + s.status_pts) >= 30 THEN 'medium' ELSE 'low' END AS priority_band
FROM scored s;

CREATE OR REPLACE VIEW public.v_followup_tpa_groups AS
WITH g AS (
  SELECT c.org_id, COALESCE(NULLIF(c.tpa_name, ''), NULLIF(c.insurance_company_name, ''), 'Unknown') AS tpa,
    COUNT(*)::int AS claim_count, COALESCE(SUM(c.outstanding_amount), 0)::numeric AS total_outstanding,
    MAX(GREATEST(0, (CURRENT_DATE - c.claim_creation_date)))::int AS oldest_days,
    COUNT(*) FILTER (WHERE c.is_irdai_breach)::int AS breach_count
  FROM public.claims c WHERE COALESCE(c.outstanding_amount, 0) > 0
  GROUP BY c.org_id, COALESCE(NULLIF(c.tpa_name, ''), NULLIF(c.insurance_company_name, ''), 'Unknown')
)
SELECT g.*, CASE WHEN g.breach_count > 0 OR g.oldest_days > 30 THEN 'high' WHEN g.oldest_days > 15 OR g.total_outstanding > 500000 THEN 'medium' ELSE 'low' END AS priority FROM g;

CREATE OR REPLACE VIEW public.v_discrepancy_rows AS
WITH r AS (
  SELECT org_id, COALESCE((config->>'discrepancy_min_inr')::numeric, 100) AS min_inr,
    COALESCE((config->>'discrepancy_min_pct')::numeric, 1) AS min_pct,
    COALESCE((config->>'discrepancy_low_pct')::numeric, 5) AS low_pct,
    COALESCE((config->>'discrepancy_high_pct')::numeric, 15) AS high_pct
  FROM public.dq_rules
), computed AS (
  SELECT c.*, LOWER(COALESCE(c.claim_status, '')) IN ('settled','paid','closed','completed') AS is_closed,
    GREATEST(0, COALESCE(c.approved_amount,0) - (COALESCE(c.settled_amount,0) + COALESCE(c.tds_amount,0))) AS disc_amount,
    CASE WHEN COALESCE(c.approved_amount,0) > 0 THEN ((COALESCE(c.approved_amount,0) - (COALESCE(c.settled_amount,0) + COALESCE(c.tds_amount,0))) / c.approved_amount) * 100 ELSE 0 END AS disc_pct,
    COALESCE(r.min_inr, 100) AS min_inr, COALESCE(r.min_pct, 1) AS min_pct, COALESCE(r.low_pct, 5) AS low_pct, COALESCE(r.high_pct, 15) AS high_pct
  FROM public.claims c LEFT JOIN r ON r.org_id = c.org_id
), flagged AS (
  SELECT *, GREATEST(min_inr, (COALESCE(approved_amount,0) * min_pct / 100)) AS threshold FROM computed
)
SELECT f.id AS claim_id, f.org_id, f.claim_number, f.patient_name, f.tpa_name, f.insurance_company_name, f.hospital_name,
  f.approved_amount, f.settled_amount, f.tds_amount, f.claim_status, f.claim_creation_date, f.is_irdai_breach,
  f.outstanding_amount, f.disc_amount, f.disc_pct,
  CASE WHEN f.disc_pct < f.low_pct THEN 'low' WHEN f.disc_pct > f.high_pct THEN 'high' ELSE 'medium' END AS band,
  COALESCE(da.stage, 'discrepancy') AS stage, da.status AS action_status, da.last_action_type, da.last_action_at,
  COALESCE(da.email_sent_count, 0) AS email_sent_count, da.pushed_to_appeal_at
FROM flagged f LEFT JOIN public.discrepancy_actions da ON da.claim_id = f.id
WHERE f.is_closed AND f.approved_amount > 0 AND f.disc_amount > GREATEST(f.min_inr, (f.approved_amount * f.min_pct / 100));

GRANT SELECT ON public.v_claims_priority TO anon, authenticated;
GRANT SELECT ON public.v_followup_tpa_groups TO anon, authenticated;
GRANT SELECT ON public.v_discrepancy_rows TO anon, authenticated;
ALTER VIEW public.v_claims_priority SET (security_invoker = on);
ALTER VIEW public.v_followup_tpa_groups SET (security_invoker = on);
ALTER VIEW public.v_discrepancy_rows SET (security_invoker = on);

-- claims unique constraint per org
CREATE UNIQUE INDEX claims_org_id_claim_number_key ON public.claims (org_id, claim_number);

-- ====== platform_apps + org_app_access + api_tokens + KPIs + access ======
CREATE TABLE public.platform_apps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  base_url text,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.platform_apps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Everyone authed can read platform_apps" ON public.platform_apps FOR SELECT TO authenticated USING (true);
CREATE POLICY "Platform admins manage platform_apps" ON public.platform_apps FOR ALL TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());
CREATE TRIGGER trg_platform_apps_updated BEFORE UPDATE ON public.platform_apps FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.platform_apps (slug, name, description) VALUES
  ('rcm_buddy_pro', 'RCM Buddy Pro', 'Claims tracking, follow-up & settlement'),
  ('rcm_audit', 'RCM Audit', 'Clinical & coding audit'),
  ('rcm_leakage', 'RCM Leakage Analysis', 'Revenue leakage detection & recovery'),
  ('rcm_training', 'RCM Training', 'Staff training & certification'),
  ('admin', 'Platform Admin', 'Internal control plane for platform admins');

CREATE TABLE public.org_app_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  app_id uuid NOT NULL REFERENCES public.platform_apps(id) ON DELETE CASCADE,
  plan text NOT NULL DEFAULT 'trial',
  status text NOT NULL DEFAULT 'active',
  mrr_inr numeric NOT NULL DEFAULT 0,
  contract_start date,
  contract_end date,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, app_id)
);
ALTER TABLE public.org_app_access ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view their org app access" ON public.org_app_access FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY "Platform admins manage org_app_access" ON public.org_app_access FOR ALL TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());
CREATE TRIGGER trg_org_app_access_updated BEFORE UPDATE ON public.org_app_access FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_org_app_access_org ON public.org_app_access(org_id);
CREATE INDEX idx_org_app_access_app ON public.org_app_access(app_id);

CREATE TABLE public.api_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  name text NOT NULL,
  prefix text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  scopes text[] NOT NULL DEFAULT '{}',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz
);
ALTER TABLE public.api_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Platform admins manage api_tokens" ON public.api_tokens FOR ALL TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());
CREATE INDEX idx_api_tokens_org ON public.api_tokens(org_id);

CREATE TABLE public.api_token_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id uuid NOT NULL REFERENCES public.api_tokens(id) ON DELETE CASCADE,
  org_id uuid NOT NULL,
  app_id uuid NOT NULL REFERENCES public.platform_apps(id) ON DELETE CASCADE,
  day date NOT NULL,
  calls integer NOT NULL DEFAULT 0,
  tokens_in integer NOT NULL DEFAULT 0,
  tokens_out integer NOT NULL DEFAULT 0,
  cost_inr numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (token_id, app_id, day)
);
ALTER TABLE public.api_token_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Platform admins read api_token_usage" ON public.api_token_usage FOR SELECT TO authenticated USING (public.is_platform_admin());
CREATE POLICY "Platform admins write api_token_usage" ON public.api_token_usage FOR ALL TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());
CREATE INDEX idx_api_token_usage_org_day ON public.api_token_usage(org_id, day DESC);

CREATE TABLE public.hospital_kpis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  app_id uuid NOT NULL REFERENCES public.platform_apps(id) ON DELETE CASCADE,
  period text NOT NULL,
  metric text NOT NULL,
  value numeric NOT NULL DEFAULT 0,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, app_id, period, metric)
);
ALTER TABLE public.hospital_kpis ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view their hospital_kpis" ON public.hospital_kpis FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY "Platform admins manage hospital_kpis" ON public.hospital_kpis FOR ALL TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());
CREATE INDEX idx_hospital_kpis_lookup ON public.hospital_kpis(org_id, app_id, period);

CREATE TABLE public.app_user_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_user_id uuid NOT NULL,
  org_id uuid NOT NULL,
  app_id uuid NOT NULL REFERENCES public.platform_apps(id) ON DELETE CASCADE,
  can_login boolean NOT NULL DEFAULT true,
  role text NOT NULL DEFAULT 'member',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (app_user_id, app_id)
);
ALTER TABLE public.app_user_access ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view app_user_access in their org" ON public.app_user_access FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY "Platform admins manage app_user_access" ON public.app_user_access FOR ALL TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());
CREATE TRIGGER trg_app_user_access_updated BEFORE UPDATE ON public.app_user_access FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_app_user_access_org ON public.app_user_access(org_id);

-- ====== launch_checklist ======
CREATE TABLE public.launch_checklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  key text NOT NULL,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','green','red')),
  note text,
  sort_order int NOT NULL DEFAULT 0,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, key)
);
ALTER TABLE public.launch_checklist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Platform admins manage launch_checklist" ON public.launch_checklist FOR ALL TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());
CREATE TRIGGER trg_launch_checklist_updated_at BEFORE UPDATE ON public.launch_checklist FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.seed_launch_checklist(_org_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'forbidden: platform admin only';
  END IF;
  INSERT INTO public.launch_checklist (org_id, key, title, description, sort_order)
  VALUES
    (_org_id, 'cypress_pass',    'Cypress suites pass on published URL', 'All E2E suites green within the last hour.', 1),
    (_org_id, 'rls_clean',       'Supabase scan: 0 unresolved HIGH/CRITICAL', 'Auto-checked by the preflight probe below.', 2),
    (_org_id, 'users_login',     'All launch users can log in & reach dashboard', 'Manually verified with each role.', 3),
    (_org_id, 'import_ok',       'Claim import works at expected volume', '1k and 10k rehearsal both succeeded.', 4),
    (_org_id, 'db_backup',       'DB backup taken in the last hour', 'Snapshot timestamp recorded in note.', 5),
    (_org_id, 'oncall_ready',    'On-call rota confirmed', 'Names + numbers + escalation in note.', 6),
    (_org_id, 'rollback_tested', 'Rollback plan written & tested once', 'Procedure linked in note.', 7)
  ON CONFLICT (org_id, key) DO NOTHING;
END $$;
GRANT EXECUTE ON FUNCTION public.seed_launch_checklist(uuid) TO authenticated;

-- ====== demo_leads ======
CREATE TABLE public.demo_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_name text NOT NULL,
  contact_name  text NOT NULL,
  email         text NOT NULL,
  phone         text,
  role          text,
  notes         text,
  source        text NOT NULL DEFAULT 'landing_page',
  status        text NOT NULL DEFAULT 'new',
  user_agent    text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.demo_leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can submit a demo lead" ON public.demo_leads FOR INSERT TO public
  WITH CHECK (
    length(trim(hospital_name)) BETWEEN 1 AND 200
    AND length(trim(contact_name)) BETWEEN 1 AND 200
    AND length(trim(email)) BETWEEN 3 AND 254
    AND email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
    AND (phone IS NULL OR length(phone) <= 32)
    AND (role IS NULL OR length(role) <= 64)
    AND (notes IS NULL OR length(notes) <= 2000)
  );
CREATE POLICY "Platform admins manage demo_leads" ON public.demo_leads FOR ALL TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());
CREATE INDEX demo_leads_created_at_idx ON public.demo_leads (created_at DESC);

-- ====== org_designations ======
CREATE TABLE public.org_designations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  label text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, label)
);
ALTER TABLE public.org_designations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_select_designations" ON public.org_designations FOR SELECT USING (is_org_member(org_id));
CREATE POLICY "org_insert_designations" ON public.org_designations FOR INSERT WITH CHECK (is_org_member(org_id));
CREATE POLICY "org_update_designations" ON public.org_designations FOR UPDATE USING (has_org_role(org_id, ARRAY['owner'::org_role,'admin'::org_role])) WITH CHECK (has_org_role(org_id, ARRAY['owner'::org_role,'admin'::org_role]));
CREATE POLICY "org_delete_designations" ON public.org_designations FOR DELETE USING (has_org_role(org_id, ARRAY['owner'::org_role,'admin'::org_role]));
CREATE TRIGGER trg_org_designations_updated BEFORE UPDATE ON public.org_designations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ====== GOV SCHEMES ======
CREATE TABLE public.gov_schemes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  scheme_type text NOT NULL DEFAULT 'central',
  state_code text,
  payer_authority text,
  tat_preauth_hrs integer NOT NULL DEFAULT 24,
  tat_claim_days integer NOT NULL DEFAULT 15,
  tat_payment_days integer NOT NULL DEFAULT 15,
  portal_url text,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, code)
);
ALTER TABLE public.gov_schemes ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_select_gov_schemes ON public.gov_schemes FOR SELECT USING (is_org_member(org_id));
CREATE POLICY org_insert_gov_schemes ON public.gov_schemes FOR INSERT WITH CHECK (is_org_member(org_id));
CREATE POLICY org_update_gov_schemes ON public.gov_schemes FOR UPDATE USING (is_org_member(org_id)) WITH CHECK (is_org_member(org_id));
CREATE POLICY org_delete_gov_schemes ON public.gov_schemes FOR DELETE USING (is_org_member(org_id));
CREATE TRIGGER trg_gov_schemes_updated BEFORE UPDATE ON public.gov_schemes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.gov_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  scheme_id uuid NOT NULL REFERENCES public.gov_schemes(id) ON DELETE CASCADE,
  package_code text NOT NULL,
  package_name text NOT NULL,
  specialty text,
  rate numeric NOT NULL DEFAULT 0,
  stratification text,
  implant_allowed boolean NOT NULL DEFAULT false,
  required_documents jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, scheme_id, package_code)
);
ALTER TABLE public.gov_packages ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_select_gov_packages ON public.gov_packages FOR SELECT USING (is_org_member(org_id));
CREATE POLICY org_insert_gov_packages ON public.gov_packages FOR INSERT WITH CHECK (is_org_member(org_id));
CREATE POLICY org_update_gov_packages ON public.gov_packages FOR UPDATE USING (is_org_member(org_id)) WITH CHECK (is_org_member(org_id));
CREATE POLICY org_delete_gov_packages ON public.gov_packages FOR DELETE USING (is_org_member(org_id));
CREATE TRIGGER trg_gov_packages_updated BEFORE UPDATE ON public.gov_packages FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.gov_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  scheme_id uuid NOT NULL REFERENCES public.gov_schemes(id),
  hospital_branch_id uuid,
  hospital_group_id uuid,
  beneficiary_id text,
  beneficiary_name text NOT NULL,
  beneficiary_contact text,
  package_code text,
  package_name text,
  pre_auth_no text,
  pre_auth_requested_at timestamptz,
  pre_auth_approved_at timestamptz,
  pre_auth_tat_deadline timestamptz,
  claim_no text,
  date_of_admission date,
  date_of_discharge date,
  claim_submitted_at timestamptz,
  claim_status text NOT NULL DEFAULT 'preauth_pending',
  claimed_amount numeric NOT NULL DEFAULT 0,
  approved_amount numeric NOT NULL DEFAULT 0,
  paid_amount numeric NOT NULL DEFAULT 0,
  deduction_amount numeric NOT NULL DEFAULT 0,
  outstanding_amount numeric NOT NULL DEFAULT 0,
  query_count integer NOT NULL DEFAULT 0,
  doc_completeness_pct numeric NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.gov_claims ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_select_gov_claims ON public.gov_claims FOR SELECT USING (is_org_member(org_id));
CREATE POLICY org_insert_gov_claims ON public.gov_claims FOR INSERT WITH CHECK (is_org_member(org_id));
CREATE POLICY org_update_gov_claims ON public.gov_claims FOR UPDATE USING (is_org_member(org_id)) WITH CHECK (is_org_member(org_id));
CREATE POLICY org_delete_gov_claims ON public.gov_claims FOR DELETE USING (is_org_member(org_id));
CREATE TRIGGER trg_gov_claims_updated BEFORE UPDATE ON public.gov_claims FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_gov_claims_org_status ON public.gov_claims(org_id, claim_status);
CREATE INDEX idx_gov_claims_scheme ON public.gov_claims(scheme_id);

CREATE TABLE public.gov_claim_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  claim_id uuid NOT NULL REFERENCES public.gov_claims(id) ON DELETE CASCADE,
  doc_type text NOT NULL,
  file_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  uploaded_by uuid,
  verified boolean NOT NULL DEFAULT false,
  verified_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
ALTER TABLE public.gov_claim_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_select_gov_claim_docs ON public.gov_claim_documents FOR SELECT USING (is_org_member(org_id));
CREATE POLICY org_insert_gov_claim_docs ON public.gov_claim_documents FOR INSERT WITH CHECK (is_org_member(org_id));
CREATE POLICY org_update_gov_claim_docs ON public.gov_claim_documents FOR UPDATE USING (is_org_member(org_id)) WITH CHECK (is_org_member(org_id));
CREATE POLICY org_delete_gov_claim_docs ON public.gov_claim_documents FOR DELETE USING (is_org_member(org_id));

CREATE TABLE public.gov_claim_deductions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  claim_id uuid NOT NULL REFERENCES public.gov_claims(id) ON DELETE CASCADE,
  head text NOT NULL,
  reason_code text,
  reason_text text,
  amount numeric NOT NULL DEFAULT 0,
  recoverable boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.gov_claim_deductions ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_select_gov_claim_deductions ON public.gov_claim_deductions FOR SELECT USING (is_org_member(org_id));
CREATE POLICY org_insert_gov_claim_deductions ON public.gov_claim_deductions FOR INSERT WITH CHECK (is_org_member(org_id));
CREATE POLICY org_update_gov_claim_deductions ON public.gov_claim_deductions FOR UPDATE USING (is_org_member(org_id)) WITH CHECK (is_org_member(org_id));
CREATE POLICY org_delete_gov_claim_deductions ON public.gov_claim_deductions FOR DELETE USING (is_org_member(org_id));

CREATE TABLE public.gov_empanelment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  scheme_id uuid NOT NULL REFERENCES public.gov_schemes(id) ON DELETE CASCADE,
  hospital_branch_id uuid,
  hospital_id_on_portal text,
  mou_start date,
  mou_end date,
  renewal_status text NOT NULL DEFAULT 'active',
  portal_credentials_ref text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.gov_empanelment ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_select_gov_empanelment ON public.gov_empanelment FOR SELECT USING (is_org_member(org_id));
CREATE POLICY org_insert_gov_empanelment ON public.gov_empanelment FOR INSERT WITH CHECK (is_org_member(org_id));
CREATE POLICY org_update_gov_empanelment ON public.gov_empanelment FOR UPDATE USING (is_org_member(org_id)) WITH CHECK (is_org_member(org_id));
CREATE POLICY org_delete_gov_empanelment ON public.gov_empanelment FOR DELETE USING (is_org_member(org_id));
CREATE TRIGGER trg_gov_empanelment_updated BEFORE UPDATE ON public.gov_empanelment FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ====== OPD / WELLNESS ======
CREATE TABLE public.opd_corporates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  hospital_branch_id uuid,
  name text NOT NULL,
  aggregator text,
  contract_start date,
  contract_end date,
  rate_sheet jsonb NOT NULL DEFAULT '{}'::jsonb,
  spoc_name text,
  spoc_email text,
  spoc_phone text,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.opd_corporates ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_select_opd_corporates ON public.opd_corporates FOR SELECT USING (is_org_member(org_id));
CREATE POLICY org_insert_opd_corporates ON public.opd_corporates FOR INSERT WITH CHECK (is_org_member(org_id));
CREATE POLICY org_update_opd_corporates ON public.opd_corporates FOR UPDATE USING (is_org_member(org_id)) WITH CHECK (is_org_member(org_id));
CREATE POLICY org_delete_opd_corporates ON public.opd_corporates FOR DELETE USING (is_org_member(org_id));
CREATE TRIGGER trg_opd_corporates_updated BEFORE UPDATE ON public.opd_corporates FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.opd_employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  corporate_id uuid NOT NULL REFERENCES public.opd_corporates(id) ON DELETE CASCADE,
  employee_code text NOT NULL,
  employee_name text NOT NULL,
  email text,
  phone text,
  family_members jsonb NOT NULL DEFAULT '[]'::jsonb,
  wallet_balance numeric NOT NULL DEFAULT 0,
  wallet_total numeric NOT NULL DEFAULT 0,
  valid_from date,
  valid_to date,
  eligibility_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, corporate_id, employee_code)
);
ALTER TABLE public.opd_employees ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_select_opd_employees ON public.opd_employees FOR SELECT USING (is_org_member(org_id));
CREATE POLICY org_insert_opd_employees ON public.opd_employees FOR INSERT WITH CHECK (is_org_member(org_id));
CREATE POLICY org_update_opd_employees ON public.opd_employees FOR UPDATE USING (is_org_member(org_id)) WITH CHECK (is_org_member(org_id));
CREATE POLICY org_delete_opd_employees ON public.opd_employees FOR DELETE USING (is_org_member(org_id));
CREATE TRIGGER trg_opd_employees_updated BEFORE UPDATE ON public.opd_employees FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.opd_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  hospital_branch_id uuid,
  corporate_id uuid REFERENCES public.opd_corporates(id),
  employee_id uuid REFERENCES public.opd_employees(id),
  visit_date date NOT NULL,
  patient_name text NOT NULL,
  patient_relation text,
  doctor_name text,
  department text,
  services jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_amount numeric NOT NULL DEFAULT 0,
  payable_amount numeric NOT NULL DEFAULT 0,
  copay numeric NOT NULL DEFAULT 0,
  patient_paid numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'captured',
  aggregator_claim_id text,
  batch_id uuid,
  submitted_at timestamptz,
  settled_at timestamptz,
  rejection_reason text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.opd_visits ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_select_opd_visits ON public.opd_visits FOR SELECT USING (is_org_member(org_id));
CREATE POLICY org_insert_opd_visits ON public.opd_visits FOR INSERT WITH CHECK (is_org_member(org_id));
CREATE POLICY org_update_opd_visits ON public.opd_visits FOR UPDATE USING (is_org_member(org_id)) WITH CHECK (is_org_member(org_id));
CREATE POLICY org_delete_opd_visits ON public.opd_visits FOR DELETE USING (is_org_member(org_id));
CREATE TRIGGER trg_opd_visits_updated BEFORE UPDATE ON public.opd_visits FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_opd_visits_org_status ON public.opd_visits(org_id, status);
CREATE INDEX idx_opd_visits_date ON public.opd_visits(visit_date);

CREATE TABLE public.opd_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  batch_no text NOT NULL,
  aggregator text,
  corporate_id uuid REFERENCES public.opd_corporates(id),
  submission_date date,
  claim_count integer NOT NULL DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft',
  ack_no text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.opd_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_select_opd_batches ON public.opd_batches FOR SELECT USING (is_org_member(org_id));
CREATE POLICY org_insert_opd_batches ON public.opd_batches FOR INSERT WITH CHECK (is_org_member(org_id));
CREATE POLICY org_update_opd_batches ON public.opd_batches FOR UPDATE USING (is_org_member(org_id)) WITH CHECK (is_org_member(org_id));
CREATE POLICY org_delete_opd_batches ON public.opd_batches FOR DELETE USING (is_org_member(org_id));
CREATE TRIGGER trg_opd_batches_updated BEFORE UPDATE ON public.opd_batches FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.ahc_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  inclusions jsonb NOT NULL DEFAULT '[]'::jsonb,
  price numeric NOT NULL DEFAULT 0,
  age_band text,
  gender text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, code)
);
ALTER TABLE public.ahc_packages ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_select_ahc_packages ON public.ahc_packages FOR SELECT USING (is_org_member(org_id));
CREATE POLICY org_insert_ahc_packages ON public.ahc_packages FOR INSERT WITH CHECK (is_org_member(org_id));
CREATE POLICY org_update_ahc_packages ON public.ahc_packages FOR UPDATE USING (is_org_member(org_id)) WITH CHECK (is_org_member(org_id));
CREATE POLICY org_delete_ahc_packages ON public.ahc_packages FOR DELETE USING (is_org_member(org_id));
CREATE TRIGGER trg_ahc_packages_updated BEFORE UPDATE ON public.ahc_packages FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.ahc_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  corporate_id uuid REFERENCES public.opd_corporates(id),
  employee_id uuid REFERENCES public.opd_employees(id),
  package_id uuid REFERENCES public.ahc_packages(id),
  beneficiary_name text NOT NULL,
  scheduled_date date,
  fulfilled_date date,
  status text NOT NULL DEFAULT 'booked',
  report_delivered_at timestamptz,
  invoice_amount numeric NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ahc_bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_select_ahc_bookings ON public.ahc_bookings FOR SELECT USING (is_org_member(org_id));
CREATE POLICY org_insert_ahc_bookings ON public.ahc_bookings FOR INSERT WITH CHECK (is_org_member(org_id));
CREATE POLICY org_update_ahc_bookings ON public.ahc_bookings FOR UPDATE USING (is_org_member(org_id)) WITH CHECK (is_org_member(org_id));
CREATE POLICY org_delete_ahc_bookings ON public.ahc_bookings FOR DELETE USING (is_org_member(org_id));
CREATE TRIGGER trg_ahc_bookings_updated BEFORE UPDATE ON public.ahc_bookings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.wellness_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  hospital_branch_id uuid,
  corporate_id uuid REFERENCES public.opd_corporates(id),
  event_type text NOT NULL,
  title text NOT NULL,
  event_date date NOT NULL,
  location text,
  planned_count integer NOT NULL DEFAULT 0,
  actual_count integer NOT NULL DEFAULT 0,
  revenue numeric NOT NULL DEFAULT 0,
  expenses numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'planned',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.wellness_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_select_wellness_events ON public.wellness_events FOR SELECT USING (is_org_member(org_id));
CREATE POLICY org_insert_wellness_events ON public.wellness_events FOR INSERT WITH CHECK (is_org_member(org_id));
CREATE POLICY org_update_wellness_events ON public.wellness_events FOR UPDATE USING (is_org_member(org_id)) WITH CHECK (is_org_member(org_id));
CREATE POLICY org_delete_wellness_events ON public.wellness_events FOR DELETE USING (is_org_member(org_id));
CREATE TRIGGER trg_wellness_events_updated BEFORE UPDATE ON public.wellness_events FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Final blanket grants
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', r.tablename);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', r.tablename);
  END LOOP;
END $$;