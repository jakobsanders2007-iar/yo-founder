ALTER TABLE public.prompts
  ADD COLUMN IF NOT EXISTS summary text,
  ADD COLUMN IF NOT EXISTS files_affected text[],
  ADD COLUMN IF NOT EXISTS next_steps text[],
  ADD COLUMN IF NOT EXISTS vercel_preview_url text;