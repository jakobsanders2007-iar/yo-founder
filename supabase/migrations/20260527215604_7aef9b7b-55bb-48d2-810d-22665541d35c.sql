
create type public.ai_provider as enum ('claude', 'gpt');
create type public.sender_type as enum ('human', 'ai');
create type public.member_role as enum ('owner', 'cofounder');
create type public.prompt_status as enum ('draft', 'sent');

-- Tables
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  avatar_color text not null default '#f59e0b',
  ai_provider public.ai_provider,
  anthropic_key text,
  openai_key text,
  github_token text,
  github_username text,
  onboarded boolean not null default false,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references public.profiles(id) on delete cascade,
  github_repo text not null,
  github_branch text not null default 'main',
  vercel_project_url text,
  supabase_project_url text,
  godaddy_domain text,
  dns_notes text,
  dns_checklist jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.workspaces to authenticated;
grant all on public.workspaces to service_role;
alter table public.workspaces enable row level security;

create table public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.member_role not null default 'cofounder',
  joined_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);
grant select, insert, update, delete on public.workspace_members to authenticated;
grant all on public.workspace_members to service_role;
alter table public.workspace_members enable row level security;

create table public.workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  invited_by uuid not null references public.profiles(id) on delete cascade,
  email text not null,
  token text not null unique default encode(gen_random_bytes(18), 'hex'),
  accepted boolean not null default false,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.workspace_invites to authenticated;
grant select on public.workspace_invites to anon;
grant all on public.workspace_invites to service_role;
alter table public.workspace_invites enable row level security;

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  sender_user_id uuid not null references public.profiles(id) on delete cascade,
  sender_type public.sender_type not null,
  ai_provider public.ai_provider,
  content text not null,
  is_error boolean not null default false,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.messages to authenticated;
grant all on public.messages to service_role;
alter table public.messages enable row level security;
create index messages_workspace_created_idx on public.messages(workspace_id, created_at);

create table public.prompts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  content text not null,
  github_issue_url text,
  github_issue_number int,
  status public.prompt_status not null default 'draft',
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.prompts to authenticated;
grant all on public.prompts to service_role;
alter table public.prompts enable row level security;
create index prompts_workspace_idx on public.prompts(workspace_id, created_at desc);

-- Security-definer helpers (avoid recursive RLS)
create or replace function public.is_workspace_member(_workspace_id uuid, _user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.workspace_members where workspace_id = _workspace_id and user_id = _user_id);
$$;

create or replace function public.is_workspace_owner(_workspace_id uuid, _user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.workspace_members where workspace_id = _workspace_id and user_id = _user_id and role = 'owner');
$$;

create or replace function public.shares_workspace_with(_user_a uuid, _user_b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.workspace_members a
    join public.workspace_members b on a.workspace_id = b.workspace_id
    where a.user_id = _user_a and b.user_id = _user_b
  );
$$;

-- Policies
create policy "profiles_select_self" on public.profiles for select to authenticated using (auth.uid() = id);
create policy "profiles_select_shared" on public.profiles for select to authenticated
  using (public.shares_workspace_with(auth.uid(), id));
create policy "profiles_insert_self" on public.profiles for insert to authenticated with check (auth.uid() = id);
create policy "profiles_update_self" on public.profiles for update to authenticated using (auth.uid() = id);

create policy "workspaces_select_members" on public.workspaces for select to authenticated
  using (public.is_workspace_member(id, auth.uid()));
create policy "workspaces_insert_self" on public.workspaces for insert to authenticated with check (created_by = auth.uid());
create policy "workspaces_update_owner" on public.workspaces for update to authenticated
  using (public.is_workspace_owner(id, auth.uid()));
create policy "workspaces_update_members" on public.workspaces for update to authenticated
  using (public.is_workspace_member(id, auth.uid()));
create policy "workspaces_delete_owner" on public.workspaces for delete to authenticated
  using (public.is_workspace_owner(id, auth.uid()));

create policy "wm_select_members" on public.workspace_members for select to authenticated
  using (public.is_workspace_member(workspace_id, auth.uid()));
create policy "wm_insert_self" on public.workspace_members for insert to authenticated with check (user_id = auth.uid());
create policy "wm_delete_self_or_owner" on public.workspace_members for delete to authenticated
  using (user_id = auth.uid() or public.is_workspace_owner(workspace_id, auth.uid()));

create policy "invites_select_anon" on public.workspace_invites for select to anon using (true);
create policy "invites_select_auth" on public.workspace_invites for select to authenticated using (true);
create policy "invites_insert_members" on public.workspace_invites for insert to authenticated
  with check (public.is_workspace_member(workspace_id, auth.uid()) and invited_by = auth.uid());
create policy "invites_update_members" on public.workspace_invites for update to authenticated
  using (public.is_workspace_member(workspace_id, auth.uid()) or true);

create policy "messages_select_members" on public.messages for select to authenticated
  using (public.is_workspace_member(workspace_id, auth.uid()));
create policy "messages_insert_member_human" on public.messages for insert to authenticated
  with check (public.is_workspace_member(workspace_id, auth.uid()) and sender_user_id = auth.uid());

create policy "prompts_select_members" on public.prompts for select to authenticated
  using (public.is_workspace_member(workspace_id, auth.uid()));
create policy "prompts_insert_members" on public.prompts for insert to authenticated
  with check (public.is_workspace_member(workspace_id, auth.uid()) and created_by = auth.uid());
create policy "prompts_update_members" on public.prompts for update to authenticated
  using (public.is_workspace_member(workspace_id, auth.uid()));
create policy "prompts_delete_members" on public.prompts for delete to authenticated
  using (public.is_workspace_member(workspace_id, auth.uid()));

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- Realtime
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.prompts;
alter table public.messages replica identity full;
alter table public.prompts replica identity full;
