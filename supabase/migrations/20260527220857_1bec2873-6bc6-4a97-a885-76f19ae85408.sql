-- Drop old two-argument overloaded versions
DROP FUNCTION IF EXISTS public.is_workspace_member(uuid, uuid);
DROP FUNCTION IF EXISTS public.is_workspace_owner(uuid, uuid);
DROP FUNCTION IF EXISTS public.shares_workspace_with(uuid, uuid);
