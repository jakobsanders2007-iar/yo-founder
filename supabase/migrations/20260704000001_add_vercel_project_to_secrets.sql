-- Add missing Vercel columns to workspace_secrets table
ALTER TABLE public.workspace_secrets
  ADD COLUMN IF NOT EXISTS vercel_project_id text,
  ADD COLUMN IF NOT EXISTS vercel_project_name text;

-- Add additional Supabase management columns for consistency
ALTER TABLE public.workspace_secrets
  ADD COLUMN IF NOT EXISTS supabase_mgmt_token text,
  ADD COLUMN IF NOT EXISTS supabase_mgmt_refresh text,
  ADD COLUMN IF NOT EXISTS supabase_anon_key text,
  ADD COLUMN IF NOT EXISTS supabase_project_ref text,
  ADD COLUMN IF NOT EXISTS supabase_project_name text;
