
-- 1. Submission events / audit log
CREATE TABLE public.claim_submission_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  submission_id uuid REFERENCES public.claim_submissions(id) ON DELETE CASCADE,
  claim_id uuid NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES public.app_users(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN (
    'created','assigned','status_changed','submitted','ack_uploaded',
    'document_attached','document_removed','document_marked_na',
    'reminder_sent','auto_task_created','reassigned','note_added','due_date_changed'
  )),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.claim_submission_events TO authenticated;
GRANT ALL ON public.claim_submission_events TO service_role;
ALTER TABLE public.claim_submission_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "evt_select_org" ON public.claim_submission_events FOR SELECT TO authenticated USING (is_org_member(org_id));
CREATE POLICY "evt_insert_org" ON public.claim_submission_events FOR INSERT TO authenticated WITH CHECK (is_org_member(org_id));
CREATE INDEX idx_csev_claim ON public.claim_submission_events(claim_id, created_at DESC);
CREATE INDEX idx_csev_sub ON public.claim_submission_events(submission_id, created_at DESC);
CREATE INDEX idx_csev_org ON public.claim_submission_events(org_id);
CREATE TRIGGER trg_csev_org BEFORE INSERT ON public.claim_submission_events FOR EACH ROW EXECUTE FUNCTION public.set_default_org_id();

-- 2. Per-claim document checklist
CREATE TABLE public.claim_submission_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  submission_id uuid NOT NULL REFERENCES public.claim_submissions(id) ON DELETE CASCADE,
  claim_id uuid NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
  doc_key text NOT NULL,
  label text NOT NULL,
  required_for_portal boolean NOT NULL DEFAULT true,
  required_for_courier boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'missing' CHECK (status IN ('missing','attached','not_applicable')),
  doc_path text,
  doc_url text,
  uploaded_by uuid REFERENCES public.app_users(id) ON DELETE SET NULL,
  uploaded_at timestamptz,
  notes text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (submission_id, doc_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.claim_submission_documents TO authenticated;
GRANT ALL ON public.claim_submission_documents TO service_role;
ALTER TABLE public.claim_submission_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "csd_select_org" ON public.claim_submission_documents FOR SELECT TO authenticated USING (is_org_member(org_id));
CREATE POLICY "csd_insert_org" ON public.claim_submission_documents FOR INSERT TO authenticated WITH CHECK (is_org_member(org_id));
CREATE POLICY "csd_update_org" ON public.claim_submission_documents FOR UPDATE TO authenticated USING (is_org_member(org_id)) WITH CHECK (is_org_member(org_id));
CREATE POLICY "csd_delete_org" ON public.claim_submission_documents FOR DELETE TO authenticated USING (is_org_member(org_id));
CREATE INDEX idx_csd_submission ON public.claim_submission_documents(submission_id);
CREATE INDEX idx_csd_claim ON public.claim_submission_documents(claim_id);
CREATE INDEX idx_csd_org ON public.claim_submission_documents(org_id);
CREATE TRIGGER trg_csd_org BEFORE INSERT ON public.claim_submission_documents FOR EACH ROW EXECUTE FUNCTION public.set_default_org_id();
CREATE TRIGGER trg_csd_updated BEFORE UPDATE ON public.claim_submission_documents FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. Default checklist seeder + audit logger triggers on claim_submissions
CREATE OR REPLACE FUNCTION public.seed_submission_checklist(_submission_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  _claim uuid;
  _org uuid;
BEGIN
  SELECT claim_id, org_id INTO _claim, _org FROM public.claim_submissions WHERE id=_submission_id;
  IF _claim IS NULL THEN RETURN; END IF;
  INSERT INTO public.claim_submission_documents (org_id, submission_id, claim_id, doc_key, label, required_for_portal, required_for_courier, sort_order)
  VALUES
    (_org,_submission_id,_claim,'discharge_summary','Discharge Summary',true,true,1),
    (_org,_submission_id,_claim,'final_bill','Final Bill / Itemised Bill',true,true,2),
    (_org,_submission_id,_claim,'investigation_reports','Investigation Reports',true,true,3),
    (_org,_submission_id,_claim,'pre_auth_form','Pre-Auth Approval Letter',true,true,4),
    (_org,_submission_id,_claim,'claim_form','Signed Claim Form',true,true,5),
    (_org,_submission_id,_claim,'kyc_id_proof','Patient KYC / ID Proof',true,true,6),
    (_org,_submission_id,_claim,'cancelled_cheque','Cancelled Cheque / NEFT Mandate',true,true,7),
    (_org,_submission_id,_claim,'consultation_notes','Consultation / OT Notes',true,true,8),
    (_org,_submission_id,_claim,'pharmacy_bills','Pharmacy Bills with Prescriptions',true,true,9),
    (_org,_submission_id,_claim,'implant_invoice','Implant Invoice / Sticker (if any)',false,false,10),
    (_org,_submission_id,_claim,'portal_ack_screenshot','Portal Acknowledgement Screenshot',true,false,11),
    (_org,_submission_id,_claim,'courier_pod','Courier POD / AWB Receipt',false,true,12),
    (_org,_submission_id,_claim,'forwarding_letter','Hospital Forwarding Letter',false,true,13)
  ON CONFLICT (submission_id, doc_key) DO NOTHING;
END $$;

CREATE OR REPLACE FUNCTION public.log_submission_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  _actor uuid;
BEGIN
  SELECT id INTO _actor FROM public.app_users WHERE auth_user_id = auth.uid() LIMIT 1;
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.claim_submission_events(org_id, submission_id, claim_id, actor_id, event_type, payload)
    VALUES (NEW.org_id, NEW.id, NEW.claim_id, _actor, 'created',
      jsonb_build_object('assignee_id', NEW.assignee_id, 'due_date', NEW.due_date, 'status', NEW.status));
    IF NEW.assignee_id IS NOT NULL THEN
      INSERT INTO public.claim_submission_events(org_id, submission_id, claim_id, actor_id, event_type, payload)
      VALUES (NEW.org_id, NEW.id, NEW.claim_id, _actor, 'assigned',
        jsonb_build_object('assignee_id', NEW.assignee_id));
    END IF;
    PERFORM public.seed_submission_checklist(NEW.id);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.assignee_id IS DISTINCT FROM OLD.assignee_id THEN
      INSERT INTO public.claim_submission_events(org_id, submission_id, claim_id, actor_id, event_type, payload)
      VALUES (NEW.org_id, NEW.id, NEW.claim_id, _actor, 'reassigned',
        jsonb_build_object('from', OLD.assignee_id, 'to', NEW.assignee_id));
    END IF;
    IF NEW.due_date IS DISTINCT FROM OLD.due_date THEN
      INSERT INTO public.claim_submission_events(org_id, submission_id, claim_id, actor_id, event_type, payload)
      VALUES (NEW.org_id, NEW.id, NEW.claim_id, _actor, 'due_date_changed',
        jsonb_build_object('from', OLD.due_date, 'to', NEW.due_date));
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      INSERT INTO public.claim_submission_events(org_id, submission_id, claim_id, actor_id, event_type, payload)
      VALUES (NEW.org_id, NEW.id, NEW.claim_id, _actor, 'status_changed',
        jsonb_build_object('from', OLD.status, 'to', NEW.status));
    END IF;
    IF NEW.submitted_at IS DISTINCT FROM OLD.submitted_at AND NEW.submitted_at IS NOT NULL THEN
      INSERT INTO public.claim_submission_events(org_id, submission_id, claim_id, actor_id, event_type, payload)
      VALUES (NEW.org_id, NEW.id, NEW.claim_id, _actor, 'submitted',
        jsonb_build_object('mode', NEW.submission_mode, 'portal_ref', NEW.portal_ref, 'courier_awb', NEW.courier_awb, 'courier_partner', NEW.courier_partner));
    END IF;
    IF NEW.ack_received_at IS DISTINCT FROM OLD.ack_received_at AND NEW.ack_received_at IS NOT NULL THEN
      INSERT INTO public.claim_submission_events(org_id, submission_id, claim_id, actor_id, event_type, payload)
      VALUES (NEW.org_id, NEW.id, NEW.claim_id, _actor, 'ack_uploaded',
        jsonb_build_object('doc_url', NEW.ack_doc_url));
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER trg_cs_log_events
AFTER INSERT OR UPDATE ON public.claim_submissions
FOR EACH ROW EXECUTE FUNCTION public.log_submission_event();

-- 4. Auto-create submission tasks for newly discharged claims (dispatcher RPC)
CREATE OR REPLACE FUNCTION public.auto_create_submission_tasks()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  _count int := 0;
BEGIN
  WITH new_subs AS (
    INSERT INTO public.claim_submissions (org_id, claim_id, branch_id, assignee_id, status, due_date)
    SELECT c.org_id, c.id, c.hospital_branch_id, b.submission_officer_id, 'pending',
           (c.date_of_discharge::date + INTERVAL '7 days')::date
    FROM public.claims c
    LEFT JOIN public.hospital_branches b ON b.id = c.hospital_branch_id
    LEFT JOIN public.claim_submissions cs ON cs.claim_id = c.id
    WHERE c.date_of_discharge IS NOT NULL
      AND c.date_of_discharge::date <= CURRENT_DATE
      AND (c.doc_submission_date IS NULL)
      AND cs.id IS NULL
      AND lower(coalesce(c.claim_status,'')) NOT IN ('settled','paid','closed','claim settled','rejected','cancelled')
    RETURNING id, claim_id, org_id
  )
  SELECT count(*) INTO _count FROM new_subs;
  RETURN _count;
END $$;

GRANT EXECUTE ON FUNCTION public.auto_create_submission_tasks() TO service_role;
GRANT EXECUTE ON FUNCTION public.seed_submission_checklist(uuid) TO authenticated, service_role;
