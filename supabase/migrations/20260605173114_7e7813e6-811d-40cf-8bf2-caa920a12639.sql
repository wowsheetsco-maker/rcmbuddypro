
CREATE TABLE public.bank_statement_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  name text NOT NULL,
  bank_name text,
  header_row int NOT NULL DEFAULT 1,
  column_map jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_default boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_statement_mappings TO authenticated;
GRANT ALL ON public.bank_statement_mappings TO service_role;

ALTER TABLE public.bank_statement_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read mappings" ON public.bank_statement_mappings
  FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY "org members insert mappings" ON public.bank_statement_mappings
  FOR INSERT TO authenticated WITH CHECK (public.is_org_member(org_id));
CREATE POLICY "org members update mappings" ON public.bank_statement_mappings
  FOR UPDATE TO authenticated USING (public.is_org_member(org_id)) WITH CHECK (public.is_org_member(org_id));
CREATE POLICY "org members delete mappings" ON public.bank_statement_mappings
  FOR DELETE TO authenticated USING (public.is_org_member(org_id));

CREATE TRIGGER bank_statement_mappings_set_updated_at
  BEFORE UPDATE ON public.bank_statement_mappings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER bank_statement_mappings_set_org
  BEFORE INSERT ON public.bank_statement_mappings
  FOR EACH ROW EXECUTE FUNCTION public.set_default_org_id();
