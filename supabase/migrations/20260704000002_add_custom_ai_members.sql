-- Create custom_ai_members table for BYOM support
CREATE TABLE public.custom_ai_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  added_by uuid NOT NULL REFERENCES public.profiles(id),
  provider_name text NOT NULL,
  model text NOT NULL,
  endpoint_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.custom_ai_members ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, DELETE ON public.custom_ai_members TO authenticated;
GRANT ALL ON public.custom_ai_members TO service_role;

CREATE POLICY "custom_ai_members_workspace_select" ON public.custom_ai_members
  FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id));

CREATE POLICY "custom_ai_members_workspace_insert" ON public.custom_ai_members
  FOR INSERT TO authenticated WITH CHECK (public.is_workspace_member(workspace_id) AND added_by = auth.uid());

CREATE POLICY "custom_ai_members_owner_delete" ON public.custom_ai_members
  FOR DELETE TO authenticated USING (public.is_workspace_owner(workspace_id));

-- Add custom_ai_keys JSONB field to workspace_secrets
ALTER TABLE public.workspace_secrets
  ADD COLUMN IF NOT EXISTS custom_ai_keys jsonb;
