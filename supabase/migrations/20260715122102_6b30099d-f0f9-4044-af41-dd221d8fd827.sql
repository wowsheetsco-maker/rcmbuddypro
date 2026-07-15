ALTER TABLE public.claims
  ADD COLUMN IF NOT EXISTS treating_doctor text,
  ADD COLUMN IF NOT EXISTS ward text,
  ADD COLUMN IF NOT EXISTS coder_name text;

CREATE INDEX IF NOT EXISTS idx_claims_treating_doctor ON public.claims (treating_doctor);
CREATE INDEX IF NOT EXISTS idx_claims_ward ON public.claims (ward);
CREATE INDEX IF NOT EXISTS idx_claims_coder_name ON public.claims (coder_name);