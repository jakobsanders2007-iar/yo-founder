import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/Logo";
import { testAiKey, testGithubToken, saveAiKey, saveGithubToken } from "@/lib/yofounder.functions";
import { toast } from "sonner";
import { ArrowLeft, Check, Eye, EyeOff, X } from "lucide-react";

const COLORS = ["#6366f1","#10b981","#f59e0b","#ef4444","#8b5cf6","#06b6d4","#f97316","#ec4899"];

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
  head: () => ({ meta: [{ title: "Settings — YoFounder" }] }),
});

function SettingsPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [profile, setProfile] = useState<any>(null);

  // AI
  const [provider, setProvider] = useState<"claude" | "gpt">("claude");
  const [aiKey, setAiKey] = useState("");
  const [showAi, setShowAi] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiState, setAiState] = useState<{ ok: boolean; msg: string } | null>(null);

  // GitHub
  const [ghToken, setGhToken] = useState("");
  const [showGh, setShowGh] = useState(false);
  const [ghBusy, setGhBusy] = useState(false);
  const [ghState, setGhState] = useState<{ ok: boolean; msg: string } | null>(null);
  const [workspaces, setWorkspaces] = useState<{ id: string; name: string; github_repo: string }[]>([]);
  const [repoEdits, setRepoEdits] = useState<Record<string, string>>({});
  const [repoBusy, setRepoBusy] = useState<string | null>(null);

  // Profile
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [profBusy, setProfBusy] = useState(false);

  const testAi = useServerFn(testAiKey);
  const testGh = useServerFn(testGithubToken);
  const saveAi = useServerFn(saveAiKey);
  const saveGh = useServerFn(saveGithubToken);

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate({ to: "/login" }); return; }
    (async () => {
      const { data } = await supabase.from("profiles")
        .select("display_name, avatar_color, ai_provider, github_username, anthropic_key, openai_key, github_token")
        .eq("id", user.id).single();
      if (data) {
        // Don't keep the actual key strings in state — just presence flags
        const p = {
          display_name: data.display_name,
          avatar_color: data.avatar_color,
          ai_provider: data.ai_provider,
          github_username: data.github_username,
          has_anthropic: !!data.anthropic_key,
          has_openai: !!data.openai_key,
          has_github: !!data.github_token,
        };
        setProfile(p);
        setName(data.display_name ?? "");
        setColor(data.avatar_color ?? COLORS[0]);
        if (data.ai_provider) setProvider(data.ai_provider);
      }
      const { data: ws } = await supabase.from("workspaces")
        .select("id, name, github_repo")
        .order("created_at", { ascending: true });
      if (ws) {
        setWorkspaces(ws as any);
        setRepoEdits(Object.fromEntries(ws.map((w: any) => [w.id, w.github_repo ?? ""])));
      }
    })();
  }, [user, loading, navigate]);

  const handleRepoSave = async (id: string) => {
    const val = (repoEdits[id] ?? "").trim();
    if (!/^[\w.-]+\/[\w.-]+$/.test(val)) return toast.error("Repo must be in owner/repo format");
    setRepoBusy(id);
    const { error } = await supabase.from("workspaces").update({ github_repo: val }).eq("id", id);
    setRepoBusy(null);
    if (error) return toast.error(error.message);
    setWorkspaces((ws) => ws.map((w) => w.id === id ? { ...w, github_repo: val } : w));
    toast.success("Repo updated");
  };

  const handleAiSave = async () => {
    if (!aiKey.trim()) return toast.error("Enter an API key");
    setAiBusy(true); setAiState(null);
    const t = await testAi({ data: { provider, apiKey: aiKey.trim() } });
    if (!t.success) {
      setAiBusy(false);
      setAiState({ ok: false, msg: t.error });
      return;
    }
    await saveAi({ data: { provider, apiKey: aiKey.trim() } });
    setAiBusy(false);
    setAiKey("");
    setAiState({ ok: true, msg: "Saved!" });
    setProfile((p: any) => ({
      ...p,
      ai_provider: provider,
      has_anthropic: provider === "claude" ? true : p?.has_anthropic,
      has_openai: provider === "gpt" ? true : p?.has_openai,
    }));
    toast.success("AI key saved");
  };

  const handleGhSave = async () => {
    if (!ghToken.trim()) return toast.error("Enter a token");
    setGhBusy(true); setGhState(null);
    const t = await testGh({ data: { token: ghToken.trim() } });
    if (!t.success) {
      setGhBusy(false);
      setGhState({ ok: false, msg: t.error });
      return;
    }
    await saveGh({ data: { token: ghToken.trim(), login: t.login } });
    setGhBusy(false);
    setGhToken("");
    setGhState({ ok: true, msg: `Connected as @${t.login}` });
    setProfile((p: any) => ({ ...p, github_username: t.login, has_github: true }));
    toast.success(`GitHub connected as @${t.login}`);
  };

  const handleProfileSave = async () => {
    if (!name.trim()) return toast.error("Display name required");
    setProfBusy(true);
    const { error } = await supabase.from("profiles")
      .update({ display_name: name.trim(), avatar_color: color })
      .eq("id", user!.id);
    setProfBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Profile updated");
  };

  if (!profile) return <div className="min-h-screen bg-background flex items-center justify-center text-sm text-muted-foreground">Loading...</div>;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="max-w-3xl mx-auto px-6 h-14 flex items-center gap-4">
          <Link to="/dashboard" className="text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /></Link>
          <Logo className="text-xl" />
          <span className="text-sm text-muted-foreground">/ Settings</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10 space-y-6">
        <h1 className="text-2xl font-semibold">Settings</h1>

        {/* AI Provider */}
        <section className="bg-surface border border-border rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-1">AI Provider</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Current: <span className="text-foreground font-medium">{profile.ai_provider === "claude" ? "Claude" : profile.ai_provider === "gpt" ? "ChatGPT" : "Not set"}</span>
            {((profile.ai_provider === "claude" && profile.has_anthropic) || (profile.ai_provider === "gpt" && profile.has_openai)) && (
              <span className="ml-2 inline-flex items-center gap-1 text-success text-xs"><Check className="h-3.5 w-3.5" /> Connected</span>
            )}
          </p>
          <div className="grid grid-cols-2 gap-3 mb-4">
            {(["claude","gpt"] as const).map((p) => {
              const connected = p === "claude" ? profile.has_anthropic : profile.has_openai;
              return (
                <button key={p} onClick={() => { setProvider(p); setAiState(null); }}
                  className={`p-3 border rounded text-left transition relative ${provider === p ? "border-brand bg-accent" : "border-border hover:border-muted-foreground"}`}>
                  <div className="font-medium text-sm flex items-center gap-1.5">
                    {p === "claude" ? "Claude" : "ChatGPT"}
                    {connected && <Check className="h-3.5 w-3.5 text-success" />}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">{p === "claude" ? "Anthropic" : "OpenAI"}</div>
                </button>
              );
            })}
          </div>
          <label className="text-xs text-muted-foreground">
            {provider === "claude" ? "Anthropic API key" : "OpenAI API key"}
          </label>
          <div className="mt-1 relative">
            <input
              type={showAi ? "text" : "password"}
              value={aiKey}
              onChange={(e) => { setAiKey(e.target.value); setAiState(null); }}
              className="w-full bg-background border border-border rounded px-3 py-2 pr-10 text-sm font-mono focus:outline-none focus:border-brand"
              placeholder={provider === "claude" ? "sk-ant-..." : "sk-..."}
            />
            <button type="button" onClick={() => setShowAi((s) => !s)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              {showAi ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <button onClick={handleAiSave} disabled={aiBusy || !aiKey.trim()}
              className="bg-brand text-primary-foreground font-medium px-4 py-2 rounded text-sm hover:opacity-90 disabled:opacity-50">
              {aiBusy ? "Testing..." : "Test & Save"}
            </button>
            {aiState?.ok && <span className="text-success text-sm flex items-center gap-1"><Check className="h-4 w-4" /> {aiState.msg}</span>}
            {aiState && !aiState.ok && <span className="text-error text-sm flex items-center gap-1"><X className="h-4 w-4" /> {aiState.msg}</span>}
          </div>
        </section>

        {/* GitHub */}
        <section className="bg-surface border border-border rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-1">GitHub</h2>
          <p className="text-sm text-muted-foreground mb-4">
            {profile.github_username
              ? <>Connected as <span className="text-foreground font-medium">@{profile.github_username}</span>
                  <span className="ml-2 inline-flex items-center gap-1 text-success text-xs"><Check className="h-3.5 w-3.5" /> Connected</span>
                </>
              : "Not connected"}
          </p>
          <label className="text-xs text-muted-foreground">Personal Access Token</label>
          <div className="mt-1 relative">
            <input
              type={showGh ? "text" : "password"}
              value={ghToken}
              onChange={(e) => { setGhToken(e.target.value); setGhState(null); }}
              className="w-full bg-background border border-border rounded px-3 py-2 pr-10 text-sm font-mono focus:outline-none focus:border-brand"
              placeholder="ghp_..."
            />
            <button type="button" onClick={() => setShowGh((s) => !s)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              {showGh ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Needs <code>repo</code> scope. Create one at github.com/settings/tokens
          </p>
          <div className="mt-3 flex items-center gap-3">
            <button onClick={handleGhSave} disabled={ghBusy || !ghToken.trim()}
              className="bg-brand text-primary-foreground font-medium px-4 py-2 rounded text-sm hover:opacity-90 disabled:opacity-50">
              {ghBusy ? "Testing..." : "Test & Save"}
            </button>
            {ghState?.ok && <span className="text-success text-sm flex items-center gap-1"><Check className="h-4 w-4" /> {ghState.msg}</span>}
            {ghState && !ghState.ok && <span className="text-error text-sm flex items-center gap-1"><X className="h-4 w-4" /> {ghState.msg}</span>}
          </div>

          <div className="mt-6 pt-6 border-t border-border">
            <h3 className="text-sm font-semibold mb-1">Workspace repositories</h3>
            <p className="text-xs text-muted-foreground mb-3">One GitHub repo per workspace, in <code>owner/repo</code> format.</p>
            {workspaces.length === 0 ? (
              <p className="text-xs text-muted-foreground">No workspaces yet.</p>
            ) : (
              <div className="space-y-3">
                {workspaces.map((w) => (
                  <div key={w.id}>
                    <label className="text-xs text-muted-foreground">{w.name}</label>
                    <div className="mt-1 flex gap-2">
                      <input
                        value={repoEdits[w.id] ?? ""}
                        onChange={(e) => setRepoEdits((r) => ({ ...r, [w.id]: e.target.value }))}
                        placeholder="owner/repo"
                        className="flex-1 bg-background border border-border rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-brand"
                      />
                      <button
                        onClick={() => handleRepoSave(w.id)}
                        disabled={repoBusy === w.id || (repoEdits[w.id] ?? "").trim() === (w.github_repo ?? "")}
                        className="bg-brand text-primary-foreground font-medium px-3 py-2 rounded text-sm hover:opacity-90 disabled:opacity-50">
                        {repoBusy === w.id ? "..." : "Save"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>


        {/* Profile */}
        <section className="bg-surface border border-border rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4">Profile</h2>
          <label className="text-xs text-muted-foreground">Display name</label>
          <input
            value={name} onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full bg-background border border-border rounded px-3 py-2 text-sm focus:outline-none focus:border-brand"
            placeholder="Your name"
          />
          <label className="text-xs text-muted-foreground mt-5 block">Avatar color</label>
          <div className="mt-2 grid grid-cols-8 gap-2">
            {COLORS.map((c) => (
              <button key={c} onClick={() => setColor(c)}
                className={`h-9 w-9 rounded-full transition ${color === c ? "ring-2 ring-foreground ring-offset-2 ring-offset-surface" : ""}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <button onClick={handleProfileSave} disabled={profBusy}
            className="mt-6 bg-brand text-primary-foreground font-medium px-4 py-2 rounded text-sm hover:opacity-90 disabled:opacity-50">
            {profBusy ? "Saving..." : "Save"}
          </button>
        </section>
      </main>
    </div>
  );
}
