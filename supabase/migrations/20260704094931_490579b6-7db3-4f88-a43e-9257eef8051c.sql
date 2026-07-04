ALTER TABLE public.workspace_secrets
  ADD COLUMN IF NOT EXISTS custom_ai_keys jsonb NOT NULL DEFAULT '{}'::jsonb;