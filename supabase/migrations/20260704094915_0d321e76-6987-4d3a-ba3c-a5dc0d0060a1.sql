ALTER TABLE public.workspace_secrets
  ADD COLUMN IF NOT EXISTS vercel_project_id text,
  ADD COLUMN IF NOT EXISTS vercel_project_name text;