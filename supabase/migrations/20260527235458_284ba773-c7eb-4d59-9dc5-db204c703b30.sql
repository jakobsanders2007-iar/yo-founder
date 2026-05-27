
-- Allow deleting own human messages
CREATE POLICY "messages_delete_own_human"
ON public.messages
FOR DELETE
TO authenticated
USING (sender_user_id = auth.uid() AND sender_type = 'human');

-- Extend prompt_status enum
ALTER TYPE prompt_status ADD VALUE IF NOT EXISTS 'ready';
ALTER TYPE prompt_status ADD VALUE IF NOT EXISTS 'pushed';

-- Make sure realtime captures deletes with full old row
ALTER TABLE public.messages REPLICA IDENTITY FULL;
