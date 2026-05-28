
-- Add ai_chat_settings to workspaces
ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS ai_chat_settings jsonb NOT NULL DEFAULT
    '{"who_responds":"everyone","response_style":"simultaneous","response_trigger":"every_message","active_members":[]}'::jsonb;

-- Message reactions table
CREATE TABLE IF NOT EXISTS public.message_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  emoji text NOT NULL CHECK (emoji IN ('👍','✅','🔥','💡')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(message_id, user_id, emoji)
);

GRANT SELECT, INSERT, DELETE ON public.message_reactions TO authenticated;
GRANT ALL ON public.message_reactions TO service_role;

ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

-- Members of a workspace can see reactions on its messages
CREATE POLICY "reactions_select_members" ON public.message_reactions
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.messages m
    WHERE m.id = message_id AND public.is_workspace_member(m.workspace_id)
  ));

CREATE POLICY "reactions_insert_self" ON public.message_reactions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.messages m
    WHERE m.id = message_id AND public.is_workspace_member(m.workspace_id)
  ));

CREATE POLICY "reactions_delete_self" ON public.message_reactions
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Helper RPC to bump last_seen_at without an UPDATE round-trip from client
CREATE OR REPLACE FUNCTION public.touch_last_seen()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.profiles SET last_seen_at = now() WHERE id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.touch_last_seen() TO authenticated;

-- Enable realtime on reactions and messages (idempotent guard)
DO $$ BEGIN
  PERFORM 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='message_reactions';
  IF NOT FOUND THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions';
  END IF;
END $$;
