
CREATE TABLE public.claim_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  claim_id UUID NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  event_label TEXT NOT NULL,
  event_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_name TEXT,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_claim_events_claim ON public.claim_events(claim_id, event_at DESC);

GRANT SELECT, INSERT ON public.claim_events TO authenticated;
GRANT ALL ON public.claim_events TO service_role;

ALTER TABLE public.claim_events ENABLE ROW LEVEL SECURITY;

-- Org members can read events for claims they can access (mirrors claims RLS via
-- the FK: if a user can SELECT the claim row, they can SELECT its events).
CREATE POLICY "Read events for accessible claims"
  ON public.claim_events FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.claims c WHERE c.id = claim_events.claim_id)
  );

CREATE POLICY "Insert events for accessible claims"
  ON public.claim_events FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.claims c WHERE c.id = claim_events.claim_id)
    AND (actor_id IS NULL OR actor_id = auth.uid())
  );
