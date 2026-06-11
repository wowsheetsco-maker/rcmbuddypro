
-- Seed default system WhatsApp templates for every organization so the
-- WhatsApp composer (Discrepancy, Outstanding, Denials, etc.) always has
-- ready-to-use messages. Idempotent via (org_id, name) match.

DO $$
DECLARE
  o RECORD;
BEGIN
  FOR o IN SELECT id FROM public.organizations LOOP

    -- BILLING role (payment / outstanding chase)
    INSERT INTO public.whatsapp_templates (org_id, name, category, audience_role, subject_hint, body, sort_order, is_active, is_system)
    SELECT o.id, 'Discrepancy — Short Payment Follow-up', 'insurer', 'billing',
      'Short payment query',
      'Hello {{tpa_spoc_name}}, this is regarding claim {{claim_number}} (patient: {{patient_name}}, hospital: {{hospital_name}}). We have received a short payment with an outstanding balance of ₹{{outstanding_amount}}. Kindly share the deduction reason and revised settlement at the earliest. Thank you.',
      10, true, true
    WHERE NOT EXISTS (SELECT 1 FROM public.whatsapp_templates WHERE org_id=o.id AND name='Discrepancy — Short Payment Follow-up');

    INSERT INTO public.whatsapp_templates (org_id, name, category, audience_role, subject_hint, body, sort_order, is_active, is_system)
    SELECT o.id, 'Outstanding — Gentle Reminder', 'tpa', 'billing',
      'Pending settlement reminder',
      'Hi {{tpa_spoc_name}}, gentle reminder on claim {{claim_number}} for {{patient_name}} ({{hospital_name}}). Outstanding ₹{{outstanding_amount}}, pending {{days_since_claim}} days. Please share the latest status and expected settlement date. Thanks.',
      20, true, true
    WHERE NOT EXISTS (SELECT 1 FROM public.whatsapp_templates WHERE org_id=o.id AND name='Outstanding — Gentle Reminder');

    -- CLAIMS role (status check)
    INSERT INTO public.whatsapp_templates (org_id, name, category, audience_role, subject_hint, body, sort_order, is_active, is_system)
    SELECT o.id, 'Claim Status Check', 'tpa', 'claims',
      'Status request',
      'Hello {{tpa_spoc_name}}, requesting a status update on claim {{claim_number}} (patient: {{patient_name}}, hospital: {{hospital_name}}, pending {{days_since_claim}} days). Please confirm current stage and any pending requirement from our side. Thank you.',
      30, true, true
    WHERE NOT EXISTS (SELECT 1 FROM public.whatsapp_templates WHERE org_id=o.id AND name='Claim Status Check');

    INSERT INTO public.whatsapp_templates (org_id, name, category, audience_role, subject_hint, body, sort_order, is_active, is_system)
    SELECT o.id, 'Query Response Submitted', 'tpa', 'claims',
      'Query closed',
      'Hi {{tpa_spoc_name}}, we have submitted the requested documents/clarification for claim {{claim_number}} ({{patient_name}}). Kindly acknowledge and move the claim to processing. Thanks.',
      40, true, true
    WHERE NOT EXISTS (SELECT 1 FROM public.whatsapp_templates WHERE org_id=o.id AND name='Query Response Submitted');

    -- SPOC role (escalation)
    INSERT INTO public.whatsapp_templates (org_id, name, category, audience_role, subject_hint, body, sort_order, is_active, is_system)
    SELECT o.id, 'SPOC Escalation — Aged Claim', 'insurer', 'spoc',
      'Escalation',
      'Dear {{tpa_spoc_name}}, escalating claim {{claim_number}} ({{patient_name}}, {{hospital_name}}) pending {{days_since_claim}} days with ₹{{outstanding_amount}} outstanding — beyond IRDAI 15-day TAT. Request your personal intervention to close this on priority. Regards.',
      50, true, true
    WHERE NOT EXISTS (SELECT 1 FROM public.whatsapp_templates WHERE org_id=o.id AND name='SPOC Escalation — Aged Claim');

    INSERT INTO public.whatsapp_templates (org_id, name, category, audience_role, subject_hint, body, sort_order, is_active, is_system)
    SELECT o.id, 'SPOC Escalation — Discrepancy Dispute', 'insurer', 'spoc',
      'Discrepancy escalation',
      'Dear {{tpa_spoc_name}}, we are disputing the short settlement on claim {{claim_number}} ({{patient_name}}). Approved vs settled gap of ₹{{outstanding_amount}} appears non-contractual. Request review and revised payment within 7 working days. Regards.',
      60, true, true
    WHERE NOT EXISTS (SELECT 1 FROM public.whatsapp_templates WHERE org_id=o.id AND name='SPOC Escalation — Discrepancy Dispute');

    -- ANY role (generic)
    INSERT INTO public.whatsapp_templates (org_id, name, category, audience_role, subject_hint, body, sort_order, is_active, is_system)
    SELECT o.id, 'Generic Follow-up', 'tpa', 'any',
      'Follow-up',
      'Hello {{tpa_spoc_name}}, following up on claim {{claim_number}} for {{patient_name}} ({{hospital_name}}). Outstanding ₹{{outstanding_amount}}, pending {{days_since_claim}} days. Please share an update. Thank you.',
      70, true, true
    WHERE NOT EXISTS (SELECT 1 FROM public.whatsapp_templates WHERE org_id=o.id AND name='Generic Follow-up');

    INSERT INTO public.whatsapp_templates (org_id, name, category, audience_role, subject_hint, body, sort_order, is_active, is_system)
    SELECT o.id, 'UTR / Payment Confirmation Request', 'tpa', 'any',
      'UTR request',
      'Hi {{tpa_spoc_name}}, kindly share the UTR / NEFT details for claim {{claim_number}} ({{patient_name}}) settled recently. We will then update our reconciliation. Thanks.',
      80, true, true
    WHERE NOT EXISTS (SELECT 1 FROM public.whatsapp_templates WHERE org_id=o.id AND name='UTR / Payment Confirmation Request');

  END LOOP;
END $$;
