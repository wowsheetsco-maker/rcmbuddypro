
CREATE POLICY "wellness_reports_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'wellness-reports' AND public.is_org_member((storage.foldername(name))[1]::uuid));
CREATE POLICY "wellness_reports_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'wellness-reports' AND public.is_org_member((storage.foldername(name))[1]::uuid));
CREATE POLICY "wellness_reports_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'wellness-reports' AND public.is_org_member((storage.foldername(name))[1]::uuid));
CREATE POLICY "wellness_reports_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'wellness-reports' AND public.is_org_member((storage.foldername(name))[1]::uuid));
