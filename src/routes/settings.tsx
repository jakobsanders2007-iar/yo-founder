import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/Logo";
import { testAiKey, saveAiKey } from "@/lib/yofounder.functions";
import { toast } from "sonner";
import { ArrowLeft, Check, Eye, EyeOff, X, Github } from "lucide-react";

const COLORS = ["#6366f1","#10b981","#f59e0b","#ef4444","#8b5cf6","#06b6d4","#f97316","#ec4899"];

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
  head: () => ({ meta: [{ title: "Settings — YoFounder" }] }),
});

function SettingsPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [profile, setProfile] = useState<any>(null);

  const [provider, setProvider] = useState<"claude" | "gpt" | "gemini">("claude");
  const [aiKey, setAiKey] = useState("");
  const [showAi, setShowAi] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiState, setAiState] = useState<{ ok: boolean; msg: string } | null>(null);

  const [name, setName] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [profBusy, setProfBusy] = useState(false);
  const [ghBusy, setGhBusy] = useState(false);

  const testAi = useServerFn(testAiKey);
  const saveAi = useServerFn(saveAiKey);

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate({ to: "/login" }); return; }
    (async () => {
      const { data } = await supabase.from("profiles")
        .select("display_name, avatar_color, ai_provider, github_username, anthropic_key, openai_key, gemini_key, github_token")
        .eq("id", user.id).single();
      if (data) {
        setProfile({
          display_name: data.display_name,
          avatar_color: data.avatar_color,
          ai_provider: data.ai_provider,
          github_username: data.github_username,
          has_anthropic: !!data.anthropic_key,
          has_openai: !!data.openai_key,
          has_gemini: !!data.gemini_key,
          has_github: !!data.github_token,
        });
        setName(data.display_name ?? "");
        setColor(data.avatar_color ?? COLORS[0]);
        if (data.ai_provider) setProvider(data.ai_provider as any);
      }
    })();
  }, [user, loading, navigate]);

  const handleAiSave = async () => {
    if (provider !== "gemini" && !aiKey.trim()) return toast.error("Please add a key first");
    setAiBusy(true); setAiState(null);
    if (provider !== "gemini") {
      const t = await testAi({ data: { provider, apiKey: aiKey.trim() } });
      if (!t.success) {
        setAiBusy(false);
        setAiState({ ok: false, msg: "That key didn't work — please double-check it" });
        return;
      }
    }
    await saveAi({ data: { provider, apiKey: provider === "gemini" ? "" : aiKey.trim() } });
    setAiBusy(false);
    setAiKey("");
    setAiState({ ok: true, msg: "Saved!" });
    setProfile((p: any) => ({
      ...p,
      ai_provider: provider,
      has_anthropic: provider === "claude" ? true : p?.has_anthropic,
      has_openai: provider === "gpt" ? true : p?.has_openai,
      has_gemini: provider === "gemini" ? true : p?.has_gemini,
    }));
    toast.success("AI saved ✓");
  };

  const connectGithub = async () => {
    setGhBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "github",
        options: {
          redirectTo: window.location.origin + "/dashboard",
          scopes: "repo read:user user:email",
        },
      });
      if (error) throw error;
    } catch {
      toast.error("Couldn't connect GitHub right now — please try again or use email to sign in");
      setGhBusy(false);
    }
  };

  const disconnectGithub = async () => {
    if (!confirm("Disconnect GitHub? You'll need to reconnect to manage your code.")) return;
    await supabase.from("profiles").update({ github_token: null, github_username: null }).eq("id", user!.id);
    setProfile((p: any) => ({ ...p, github_username: null, has_github: false }));
    toast.success("GitHub disconnected");
  };

  const handleProfileSave = async () => {
    if (!name.trim()) return toast.error("Please add your name");
    setProfBusy(true);
    const { error } = await supabase.from("profiles")
      .update({ display_name: name.trim(), avatar_color: color })
      .eq("id", user!.id);
    setProfBusy(false);
    if (error) return toast.error("Couldn't save — please try again");
    toast.success("Profile saved ✓");
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

        {/* GitHub */}
        <section className="bg-surface border border-border rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4 inline-flex items-center gap-2"><Github className="h-5 w-5" /> GitHub</h2>
          {profile.has_github && profile.github_username ? (
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <img
                  src={`https://github.com/${profile.github_username}.png?size=80`}
                  alt={profile.github_username}
                  className="h-10 w-10 rounded-full border border-border"
                />
                <div>
                  <div className="font-medium">@{profile.github_username}</div>
                  <div className="text-xs text-success inline-flex items-center gap-1"><Check className="h-3 w-3" /> Connected</div>
                </div>
              </div>
              <button
                onClick={disconnectGithub}
                className="text-xs border border-border rounded px-3 py-1.5 hover:border-error hover:text-error"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <div>
              <p className="text-sm text-muted-foreground mb-4">Connect your GitHub to manage your code.</p>
              <button
                onClick={connectGithub}
                disabled={ghBusy}
                className="bg-brand text-primary-foreground font-semibold px-5 py-2.5 rounded-lg text-sm hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-2"
              >
                <Github className="h-4 w-4" />
                {ghBusy ? "Connecting..." : "Connect GitHub"}
              </button>
            </div>
          )}
        </section>

        {/* AI Provider */}
        <section className="bg-surface border border-border rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-1">AI Provider</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Current: <span className="text-foreground font-medium">
              {profile.ai_provider === "claude" ? "Claude" : profile.ai_provider === "gpt" ? "ChatGPT" : profile.ai_provider === "gemini" ? "Gemini" : "Not set"}
            </span>
            {((profile.ai_provider === "claude" && profile.has_anthropic) || (profile.ai_provider === "gpt" && profile.has_openai) || (profile.ai_provider === "gemini" && profile.has_gemini)) && (
              <span className="ml-2 inline-flex items-center gap-1 text-success text-xs"><Check className="h-3.5 w-3.5" /> Connected</span>
            )}
          </p>
          <div className="grid grid-cols-3 gap-3 mb-4">
            {(["claude","gpt","gemini"] as const).map((p) => {
              const connected = p === "claude" ? profile.has_anthropic : p === "gpt" ? profile.has_openai : profile.has_gemini;
              const accent = p === "claude" ? "#6366f1" : p === "gpt" ? "#10b981" : "#4285F4";
              const label = p === "claude" ? "Claude" : p === "gpt" ? "ChatGPT" : "Gemini";
              const sub = p === "claude" ? "Anthropic" : p === "gpt" ? "OpenAI" : "Google";
              return (
                <button key={p} onClick={() => { setProvider(p); setAiState(null); }}
                  className={`p-3 border rounded text-left transition relative ${provider === p ? "bg-accent" : "border-border hover:border-muted-foreground"}`}
                  style={provider === p ? { borderColor: accent } : undefined}>
                  <div className="font-medium text-sm flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: accent }} />
                    {label}
                    {connected && <Check className="h-3.5 w-3.5 text-success" />}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>
                </button>
              );
            })}
          </div>
          {provider === "gemini" ? (
            <div className="p-4 bg-background border border-border rounded">
              <div className="text-sm font-medium text-success flex items-center gap-1.5">
                <Check className="h-4 w-4" /> Free — no key needed
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Gemini runs on YoFounder's server. Just click below to use it.
              </p>
              <p className="text-[11px] text-muted-foreground mt-2">
                Admin note: add <code className="font-mono">GEMINI_API_KEY</code> to your Supabase edge function secrets to enable Gemini for users.
              </p>
              <div className="mt-3 flex items-center gap-3">
                <button onClick={handleAiSave} disabled={aiBusy}
                  className="bg-brand text-primary-foreground font-medium px-4 py-2 rounded text-sm hover:opacity-90 disabled:opacity-50">
                  {aiBusy ? "Saving..." : "Use Gemini"}
                </button>
                {aiState?.ok && <span className="text-success text-sm flex items-center gap-1"><Check className="h-4 w-4" /> {aiState.msg}</span>}
                {aiState && !aiState.ok && <span className="text-error text-sm flex items-center gap-1"><X className="h-4 w-4" /> {aiState.msg}</span>}
              </div>
            </div>
          ) : (
            <>
              <label className="text-xs text-muted-foreground">
                {provider === "claude" ? "Anthropic secret key" : "OpenAI secret key"}
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
            </>
          )}
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
