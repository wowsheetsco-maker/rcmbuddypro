
ALTER TABLE public.wellness_request_events
  ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS resent_from_event_id uuid REFERENCES public.wellness_request_events(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_wre_resent_from ON public.wellness_request_events(resent_from_event_id);
