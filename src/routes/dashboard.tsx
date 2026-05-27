import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/Logo";
import { Avatar } from "@/components/UserAvatar";
import { Plus, LogOut, Settings } from "lucide-react";

export const Route = createFileRoute("/dashboard")({
  component: DashboardPage,
  head: () => ({ meta: [{ title: "Dashboard — YoFounder" }] }),
});

interface Workspace {
  id: string;
  name: string;
  github_repo: string;
  members: { profiles: { display_name: string; avatar_color: string } }[];
  last_message?: { content: string } | null;
}

function DashboardPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate({ to: "/login" }); return; }
    (async () => {
      const { data: prof } = await supabase.from("profiles")
        .select("display_name, avatar_color, onboarded").eq("id", user.id).single();
      if (!prof?.onboarded) { navigate({ to: "/onboarding" }); return; }
      setProfile(prof);

      const { data: mems } = await supabase
        .from("workspace_members")
        .select("workspace_id, workspaces(id, name, github_repo)")
        .eq("user_id", user.id);

      const ids = (mems ?? []).map((m: any) => m.workspace_id);
      if (ids.length === 0) { setWorkspaces([]); setBusy(false); return; }

      const { data: members } = await supabase
        .from("workspace_members")
        .select("workspace_id, profiles(display_name, avatar_color)")
        .in("workspace_id", ids);

      const wsList: Workspace[] = (mems ?? []).map((m: any) => ({
        ...m.workspaces,
        members: (members ?? []).filter((x: any) => x.workspace_id === m.workspace_id),
        last_message: null,
      }));
      setWorkspaces(wsList);
      setBusy(false);
    })();
  }, [user, loading, navigate]);

  const firstName = (profile?.display_name ?? "").split(" ")[0] || "founder";

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <Logo className="text-xl" />
          <div className="flex items-center gap-4">
            <Link to="/settings" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5">
              <Settings className="h-3.5 w-3.5" /> Settings
            </Link>
            <button
              onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/login" }); }}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5"
            >
              <LogOut className="h-3.5 w-3.5" /> Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-semibold">Yo, {firstName} 👋</h1>
          <Link to="/workspaces/new"
            className="inline-flex items-center gap-2 bg-brand text-primary-foreground font-medium px-4 py-2 rounded text-sm hover:opacity-90">
            <Plus className="h-4 w-4" /> New Workspace
          </Link>
        </div>

        {busy ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : workspaces.length === 0 ? (
          <div className="border border-border rounded-lg p-12 text-center bg-surface">
            <p className="text-muted-foreground">No workspaces yet. Create your first one to start vibing.</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {workspaces.map((ws) => (
              <Link key={ws.id} to="/workspaces/$id" params={{ id: ws.id }}
                className="bg-surface border border-border rounded-lg p-5 hover:border-muted-foreground transition block">
                <div className="font-semibold truncate">{ws.name}</div>
                <div className="text-xs text-muted-foreground font-mono mt-1 truncate">{ws.github_repo}</div>
                <div className="mt-4 flex -space-x-2">
                  {ws.members.slice(0, 5).map((m: any, i) => (
                    <Avatar key={i} name={m.profiles?.display_name ?? "?"} color={m.profiles?.avatar_color ?? "#666"} size="sm" />
                  ))}
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
