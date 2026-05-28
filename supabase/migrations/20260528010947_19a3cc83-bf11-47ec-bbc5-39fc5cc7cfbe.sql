
ALTER TABLE public.claude_code_jobs REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.claude_code_jobs;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
