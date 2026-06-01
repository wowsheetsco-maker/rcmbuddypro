
-- Backfill admin_role_assignments from organization_members and keep them in sync.

-- 1) Backfill: every owner -> org_owner, every admin -> org_admin in their org.
INSERT INTO public.admin_role_assignments (org_id, user_id, subrole, granted_by)
SELECT om.org_id, om.user_id,
       CASE om.role WHEN 'owner' THEN 'org_owner'::admin_subrole
                    WHEN 'admin' THEN 'org_admin'::admin_subrole END,
       om.user_id
FROM public.organization_members om
WHERE om.role IN ('owner','admin')
ON CONFLICT (org_id, user_id, subrole) DO NOTHING;

-- 2) Trigger function to sync on insert/update/delete of organization_members.
CREATE OR REPLACE FUNCTION public.sync_admin_subroles_from_membership()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP IN ('INSERT','UPDATE') THEN
    -- Remove implicit subroles that no longer apply
    DELETE FROM public.admin_role_assignments
    WHERE org_id = NEW.org_id
      AND user_id = NEW.user_id
      AND subrole IN ('org_owner','org_admin')
      AND subrole <> CASE NEW.role WHEN 'owner' THEN 'org_owner'::admin_subrole
                                   WHEN 'admin' THEN 'org_admin'::admin_subrole
                                   ELSE NULL END;
    -- Add the new implicit subrole
    IF NEW.role IN ('owner','admin') THEN
      INSERT INTO public.admin_role_assignments (org_id, user_id, subrole, granted_by)
      VALUES (NEW.org_id, NEW.user_id,
              CASE NEW.role WHEN 'owner' THEN 'org_owner'::admin_subrole
                            WHEN 'admin' THEN 'org_admin'::admin_subrole END,
              NEW.user_id)
      ON CONFLICT (org_id, user_id, subrole) DO NOTHING;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    DELETE FROM public.admin_role_assignments
    WHERE org_id = OLD.org_id
      AND user_id = OLD.user_id
      AND subrole IN ('org_owner','org_admin');
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_admin_subroles ON public.organization_members;
CREATE TRIGGER trg_sync_admin_subroles
AFTER INSERT OR UPDATE OF role OR DELETE ON public.organization_members
FOR EACH ROW EXECUTE FUNCTION public.sync_admin_subroles_from_membership();
