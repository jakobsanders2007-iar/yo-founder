ALTER TABLE public.workspace_secrets
  ADD COLUMN IF NOT EXISTS supabase_mgmt_token text,
  ADD COLUMN IF NOT EXISTS supabase_mgmt_refresh text,
  ADD COLUMN IF NOT EXISTS supabase_anon_key text,
  ADD COLUMN IF NOT EXISTS supabase_project_ref text,
  ADD COLUMN IF NOT EXISTS supabase_project_name text;