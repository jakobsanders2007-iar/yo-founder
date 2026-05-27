
ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS vercel_token text,
  ADD COLUMN IF NOT EXISTS vercel_project_id text,
  ADD COLUMN IF NOT EXISTS vercel_project_name text,
  ADD COLUMN IF NOT EXISTS supabase_url text,
  ADD COLUMN IF NOT EXISTS supabase_service_key text,
  ADD COLUMN IF NOT EXISTS domain_last_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS domain_last_status integer,
  ADD COLUMN IF NOT EXISTS setup_progress jsonb NOT NULL DEFAULT '{}'::jsonb;
