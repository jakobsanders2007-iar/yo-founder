
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS gemini_key text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid WHERE t.typname = 'ai_provider' AND e.enumlabel = 'gemini') THEN
    ALTER TYPE public.ai_provider ADD VALUE 'gemini';
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid WHERE t.typname = 'prompt_status' AND e.enumlabel = 'reading') THEN
    ALTER TYPE public.prompt_status ADD VALUE 'reading';
  END IF;
END$$;
