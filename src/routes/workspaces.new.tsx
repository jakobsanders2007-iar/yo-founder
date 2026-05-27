import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/Logo";
import { toast } from "sonner";
import { ArrowLeft, Copy } from "lucide-react";

export const Route = createFileRoute("/workspaces/new")({
  component: NewWorkspacePage,
  head: () => ({ meta: [{ title: "New Workspace — YoFounder" }] }),
});

function NewWorkspacePage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [name, setName] = useState("");
  const [repo, setRepo] = useState("");
  const [vercelUrl, setVercelUrl] = useState("");
  const [supaUrl, setSupaUrl] = useState("");
  const [domain, setDomain] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [user, loading, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !repo.trim()) return toast.error("Name and GitHub repo required");
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo.trim())) return toast.error("Repo must be in owner/repo format");
    setBusy(true);
    try {
      const { data: ws, error } = await supabase.from("workspaces").insert({
        name: name.trim(),
        created_by: user!.id,
        github_repo: repo.trim(),
        vercel_project_url: vercelUrl.trim() || null,
        supabase_project_url: supaUrl.trim() || null,
        godaddy_domain: domain.trim() || null,
      }).select().single();
      if (error) throw error;
      const { error: mErr } = await supabase.from("workspace_members").insert({
        workspace_id: ws.id, user_id: user!.id, role: "owner",
      });
      if (mErr) throw mErr;
      if (inviteEmail.trim()) {
        const { data: inv, error: iErr } = await supabase.from("workspace_invites").insert({
          workspace_id: ws.id, invited_by: user!.id, email: inviteEmail.trim(),
        }).select().single();
        if (iErr) throw iErr;
        const link = `${window.location.origin}/invite/${inv.token}`;
        setInviteLink(link);
        toast.success("Workspace created. Share the invite link below.");
      } else {
        navigate({ to: "/workspaces/$id", params: { id: ws.id } });
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="max-w-2xl mx-auto px-6 h-14 flex items-center justify-between">
          <Logo className="text-xl" />
          <Link to="/dashboard" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
            <ArrowLeft className="h-3 w-3" /> Dashboard
          </Link>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-semibold mb-6">New Workspace</h1>

        {inviteLink ? (
          <div className="bg-surface border border-border rounded-lg p-6 space-y-4">
            <p className="text-sm">Workspace created. Share this link with your co-founder:</p>
            <div className="flex gap-2">
              <input readOnly value={inviteLink}
                className="flex-1 bg-background border border-border rounded px-3 py-2 text-sm font-mono" />
              <button onClick={() => { navigator.clipboard.writeText(inviteLink); toast.success("Copied"); }}
                className="px-3 border border-border rounded hover:border-foreground">
                <Copy className="h-4 w-4" />
              </button>
            </div>
            <Link to="/dashboard" className="block text-center bg-brand text-primary-foreground font-medium py-2.5 rounded text-sm hover:opacity-90">
              Go to dashboard
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="bg-surface border border-border rounded-lg p-6 space-y-4">
            <Field label="Workspace name" value={name} onChange={setName} placeholder="Our startup" required />
            <Field label="GitHub repo" value={repo} onChange={setRepo} placeholder="owner/repo" mono required />
            <Field label="Vercel project URL (optional)" value={vercelUrl} onChange={setVercelUrl}
              placeholder="https://vercel.com/team/project" />
            <Field label="Supabase project URL (optional)" value={supaUrl} onChange={setSupaUrl}
              placeholder="https://supabase.com/dashboard/project/xxx" />
            <Field label="GoDaddy domain (optional)" value={domain} onChange={setDomain} placeholder="yofounder.com" />
            <Field label="Invite co-founder (email, optional)" value={inviteEmail} onChange={setInviteEmail}
              placeholder="cofounder@startup.com" type="email" />
            <button type="submit" disabled={busy}
              className="w-full bg-brand text-primary-foreground font-medium py-2.5 rounded text-sm hover:opacity-90 disabled:opacity-50">
              {busy ? "..." : "Create workspace"}
            </button>
          </form>
        )}
      </main>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, required, type = "text", mono }: any) {
  return (
    <div>
      <label className="text-xs text-muted-foreground">{label}</label>
      <input
        type={type} value={value} required={required} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={`mt-1 w-full bg-background border border-border rounded px-3 py-2 text-sm focus:outline-none focus:border-brand ${mono ? "font-mono" : ""}`}
      />
    </div>
  );
}
