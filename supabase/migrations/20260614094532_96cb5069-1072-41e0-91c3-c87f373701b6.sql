
-- 1. Enums
DO $$ BEGIN
  CREATE TYPE public.claim_status_code AS ENUM (
    'pre_auth_submitted','pre_auth_query','pre_auth_query_replied','pre_auth_approved','pre_auth_denied',
    'discharge_initiated','discharge_query','discharge_query_replied','discharge_approved','discharge_denied',
    'enhancement_submitted','enhancement_query','enhancement_query_replied','enhancement_approved','enhancement_denied',
    'claim_submitted','claim_query','claim_query_replied','claim_approved','claim_denied',
    'reconsideration_submitted','settlement_initiated','settlement_reminder','settled',
    'rejected','closed'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.claim_status_bucket AS ENUM (
    'pre_auth','in_progress','query','approved','denied','settled','closed'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Normalize free-text -> canonical code
CREATE OR REPLACE FUNCTION public.normalize_claim_status(_raw text)
RETURNS public.claim_status_code
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE lower(btrim(coalesce(_raw,'')))
    WHEN 'settled' THEN 'settled'
    WHEN 'claim settled' THEN 'settled'
    WHEN 'paid' THEN 'settled'
    WHEN 'settlement initiated' THEN 'settlement_initiated'
    WHEN 'settlementreminder' THEN 'settlement_reminder'
    WHEN 'settlement reminder' THEN 'settlement_reminder'
    WHEN 'pre auth submitted to payer' THEN 'pre_auth_submitted'
    WHEN 'pre auth submitted' THEN 'pre_auth_submitted'
    WHEN 'pre auth query' THEN 'pre_auth_query'
    WHEN 'pre auth query replied' THEN 'pre_auth_query_replied'
    WHEN 'pre auth approved' THEN 'pre_auth_approved'
    WHEN 'pre auth denied' THEN 'pre_auth_denied'
    WHEN 'discharge initiated' THEN 'discharge_initiated'
    WHEN 'discharge query' THEN 'discharge_query'
    WHEN 'discharge query replied' THEN 'discharge_query_replied'
    WHEN 'discharge approved' THEN 'discharge_approved'
    WHEN 'discharge denied' THEN 'discharge_denied'
    WHEN 'enhancement submitted' THEN 'enhancement_submitted'
    WHEN 'enhancement query' THEN 'enhancement_query'
    WHEN 'enhancement query replied' THEN 'enhancement_query_replied'
    WHEN 'enhancement approved' THEN 'enhancement_approved'
    WHEN 'enhancement denied' THEN 'enhancement_denied'
    WHEN 'claim submitted' THEN 'claim_submitted'
    WHEN 'claim in progress' THEN 'claim_submitted'
    WHEN 'processing' THEN 'claim_submitted'
    WHEN 'claim query' THEN 'claim_query'
    WHEN 'claim query replied' THEN 'claim_query_replied'
    WHEN 'claim approved' THEN 'claim_approved'
    WHEN 'claim denied' THEN 'claim_denied'
    WHEN 'reconsideration submitted' THEN 'reconsideration_submitted'
    WHEN 'rejected' THEN 'rejected'
    WHEN 'cancelled' THEN 'closed'
    WHEN 'closed' THEN 'closed'
    ELSE NULL
  END::public.claim_status_code;
$$;

-- 3. Bucket helper
CREATE OR REPLACE FUNCTION public.claim_status_bucket_for(_code public.claim_status_code)
RETURNS public.claim_status_bucket
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE _code
    WHEN 'pre_auth_submitted' THEN 'pre_auth'
    WHEN 'pre_auth_query' THEN 'query'
    WHEN 'pre_auth_query_replied' THEN 'in_progress'
    WHEN 'pre_auth_approved' THEN 'approved'
    WHEN 'pre_auth_denied' THEN 'denied'
    WHEN 'discharge_initiated' THEN 'in_progress'
    WHEN 'discharge_query' THEN 'query'
    WHEN 'discharge_query_replied' THEN 'in_progress'
    WHEN 'discharge_approved' THEN 'approved'
    WHEN 'discharge_denied' THEN 'denied'
    WHEN 'enhancement_submitted' THEN 'in_progress'
    WHEN 'enhancement_query' THEN 'query'
    WHEN 'enhancement_query_replied' THEN 'in_progress'
    WHEN 'enhancement_approved' THEN 'approved'
    WHEN 'enhancement_denied' THEN 'denied'
    WHEN 'claim_submitted' THEN 'in_progress'
    WHEN 'claim_query' THEN 'query'
    WHEN 'claim_query_replied' THEN 'in_progress'
    WHEN 'claim_approved' THEN 'approved'
    WHEN 'claim_denied' THEN 'denied'
    WHEN 'reconsideration_submitted' THEN 'in_progress'
    WHEN 'settlement_initiated' THEN 'approved'
    WHEN 'settlement_reminder' THEN 'approved'
    WHEN 'settled' THEN 'settled'
    WHEN 'rejected' THEN 'denied'
    WHEN 'closed' THEN 'closed'
  END::public.claim_status_bucket;
$$;

-- 4. Add column to claims
ALTER TABLE public.claims
  ADD COLUMN IF NOT EXISTS claim_status_code public.claim_status_code,
  ADD COLUMN IF NOT EXISTS claim_status_bucket public.claim_status_bucket;

-- 5. Backfill
UPDATE public.claims
SET claim_status_code = public.normalize_claim_status(claim_status),
    claim_status_bucket = public.claim_status_bucket_for(public.normalize_claim_status(claim_status))
WHERE claim_status_code IS NULL;

-- 6. Trigger to keep code/bucket in sync with free-text writes
CREATE OR REPLACE FUNCTION public.sync_claim_status_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.claim_status_code IS NULL AND NEW.claim_status IS NOT NULL THEN
    NEW.claim_status_code := public.normalize_claim_status(NEW.claim_status);
  END IF;
  IF NEW.claim_status_code IS NOT NULL THEN
    NEW.claim_status_bucket := public.claim_status_bucket_for(NEW.claim_status_code);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sync_claim_status_code ON public.claims;
CREATE TRIGGER trg_sync_claim_status_code
  BEFORE INSERT OR UPDATE OF claim_status, claim_status_code ON public.claims
  FOR EACH ROW EXECUTE FUNCTION public.sync_claim_status_code();

-- 7. Indexes for report grouping
CREATE INDEX IF NOT EXISTS idx_claims_status_code ON public.claims(org_id, claim_status_code);
CREATE INDEX IF NOT EXISTS idx_claims_status_bucket ON public.claims(org_id, claim_status_bucket);

-- 8. Meta reference table
CREATE TABLE IF NOT EXISTS public.claim_status_meta (
  code public.claim_status_code PRIMARY KEY,
  label text NOT NULL,
  bucket public.claim_status_bucket NOT NULL,
  sort_order int NOT NULL DEFAULT 100,
  is_terminal boolean NOT NULL DEFAULT false,
  description text
);

GRANT SELECT ON public.claim_status_meta TO authenticated, anon;
GRANT ALL ON public.claim_status_meta TO service_role;
ALTER TABLE public.claim_status_meta ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "status meta readable to all" ON public.claim_status_meta;
CREATE POLICY "status meta readable to all" ON public.claim_status_meta FOR SELECT USING (true);

INSERT INTO public.claim_status_meta (code, label, bucket, sort_order, is_terminal) VALUES
  ('pre_auth_submitted','Pre-Auth Submitted','pre_auth',10,false),
  ('pre_auth_query','Pre-Auth Query','query',15,false),
  ('pre_auth_query_replied','Pre-Auth Query Replied','in_progress',16,false),
  ('pre_auth_approved','Pre-Auth Approved','approved',20,false),
  ('pre_auth_denied','Pre-Auth Denied','denied',25,false),
  ('discharge_initiated','Discharge Initiated','in_progress',30,false),
  ('discharge_query','Discharge Query','query',35,false),
  ('discharge_query_replied','Discharge Query Replied','in_progress',36,false),
  ('discharge_approved','Discharge Approved','approved',40,false),
  ('discharge_denied','Discharge Denied','denied',45,false),
  ('enhancement_submitted','Enhancement Submitted','in_progress',50,false),
  ('enhancement_query','Enhancement Query','query',55,false),
  ('enhancement_query_replied','Enhancement Query Replied','in_progress',56,false),
  ('enhancement_approved','Enhancement Approved','approved',60,false),
  ('enhancement_denied','Enhancement Denied','denied',65,false),
  ('claim_submitted','Claim Submitted','in_progress',70,false),
  ('claim_query','Claim Query','query',75,false),
  ('claim_query_replied','Claim Query Replied','in_progress',76,false),
  ('claim_approved','Claim Approved','approved',80,false),
  ('claim_denied','Claim Denied','denied',85,false),
  ('reconsideration_submitted','Reconsideration Submitted','in_progress',90,false),
  ('settlement_initiated','Settlement Initiated','approved',95,false),
  ('settlement_reminder','Settlement Reminder','approved',96,false),
  ('settled','Settled','settled',100,true),
  ('rejected','Rejected','denied',110,true),
  ('closed','Closed','closed',120,true)
ON CONFLICT (code) DO UPDATE SET label = EXCLUDED.label, bucket = EXCLUDED.bucket, sort_order = EXCLUDED.sort_order, is_terminal = EXCLUDED.is_terminal;
