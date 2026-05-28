
-- ============================================================
-- 1. profile_secrets table
-- ============================================================
CREATE TABLE public.profile_secrets (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  github_token text,
  anthropic_key text,
  openai_key text,
  gemini_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profile_secrets TO authenticated;
GRANT ALL ON public.profile_secrets TO service_role;

ALTER TABLE public.profile_secrets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profile_secrets_self_select" ON public.profile_secrets
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "profile_secrets_self_insert" ON public.profile_secrets
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "profile_secrets_self_update" ON public.profile_secrets
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "profile_secrets_self_delete" ON public.profile_secrets
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Migrate existing data
INSERT INTO public.profile_secrets (user_id, github_token, anthropic_key, openai_key, gemini_key)
SELECT id, github_token, anthropic_key, openai_key, gemini_key
FROM public.profiles
WHERE github_token IS NOT NULL
   OR anthropic_key IS NOT NULL
   OR openai_key IS NOT NULL
   OR gemini_key IS NOT NULL
ON CONFLICT (user_id) DO NOTHING;

-- Drop sensitive columns from profiles
ALTER TABLE public.profiles DROP COLUMN IF EXISTS github_token;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS anthropic_key;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS openai_key;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS gemini_key;

-- ============================================================
-- 2. workspace_secrets table
-- ============================================================
CREATE TABLE public.workspace_secrets (
  workspace_id uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  vercel_token text,
  supabase_service_key text,
  supabase_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_secrets TO authenticated;
GRANT ALL ON public.workspace_secrets TO service_role;

ALTER TABLE public.workspace_secrets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_secrets_owner_select" ON public.workspace_secrets
  FOR SELECT TO authenticated USING (public.is_workspace_owner(workspace_id));
CREATE POLICY "workspace_secrets_owner_insert" ON public.workspace_secrets
  FOR INSERT TO authenticated WITH CHECK (public.is_workspace_owner(workspace_id));
CREATE POLICY "workspace_secrets_owner_update" ON public.workspace_secrets
  FOR UPDATE TO authenticated USING (public.is_workspace_owner(workspace_id)) WITH CHECK (public.is_workspace_owner(workspace_id));
CREATE POLICY "workspace_secrets_owner_delete" ON public.workspace_secrets
  FOR DELETE TO authenticated USING (public.is_workspace_owner(workspace_id));

INSERT INTO public.workspace_secrets (workspace_id, vercel_token, supabase_service_key, supabase_url)
SELECT id, vercel_token, supabase_service_key, supabase_url
FROM public.workspaces
WHERE vercel_token IS NOT NULL
   OR supabase_service_key IS NOT NULL
   OR supabase_url IS NOT NULL
ON CONFLICT (workspace_id) DO NOTHING;

ALTER TABLE public.workspaces DROP COLUMN IF EXISTS vercel_token;
ALTER TABLE public.workspaces DROP COLUMN IF EXISTS supabase_service_key;
ALTER TABLE public.workspaces DROP COLUMN IF EXISTS supabase_url;

-- ============================================================
-- 3. Fix workspace_invites policies
-- ============================================================
DROP POLICY IF EXISTS invites_select_anon ON public.workspace_invites;
DROP POLICY IF EXISTS invites_select_auth ON public.workspace_invites;
DROP POLICY IF EXISTS invites_update_members ON public.workspace_invites;

CREATE POLICY invites_select_members ON public.workspace_invites
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY invites_update_owners ON public.workspace_invites
  FOR UPDATE TO authenticated
  USING (public.is_workspace_owner(workspace_id))
  WITH CHECK (public.is_workspace_owner(workspace_id));

-- ============================================================
-- 4. Realtime channel authorization for workspace topics
-- ============================================================
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ws_topic_select" ON realtime.messages;
DROP POLICY IF EXISTS "ws_topic_insert" ON realtime.messages;

CREATE POLICY "ws_topic_select" ON realtime.messages
  FOR SELECT TO authenticated
  USING (
    CASE
      WHEN realtime.topic() LIKE 'ws-%' THEN
        public.is_workspace_member(substring(realtime.topic() from 4)::uuid)
      ELSE false
    END
  );

CREATE POLICY "ws_topic_insert" ON realtime.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    CASE
      WHEN realtime.topic() LIKE 'ws-%' THEN
        public.is_workspace_member(substring(realtime.topic() from 4)::uuid)
      ELSE false
    END
  );

-- ============================================================
-- 5. Restrict EXECUTE on SECURITY DEFINER helpers
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.is_workspace_member(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_workspace_owner(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.shares_workspace_with(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.touch_last_seen() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.is_workspace_member(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_workspace_owner(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.shares_workspace_with(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.touch_last_seen() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
