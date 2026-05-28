import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/Logo";
import { testAiKey, saveAiKey } from "@/lib/yofounder.functions";
import { toast } from "sonner";
import { Check, X, Github } from "lucide-react";

const COLORS = ["#6366f1","#10b981","#f59e0b","#ef4444","#8b5cf6","#06b6d4","#f97316","#ec4899"];

export const Route = createFileRoute("/onboarding")({
  component: OnboardingPage,
  head: () => ({ meta: [{ title: "Onboarding — YoFounder" }] }),
});

function OnboardingPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [provider, setProvider] = useState<"claude" | "gpt" | "gemini">("claude");
  const [aiKey, setAiKey] = useState("");
  const [aiOk, setAiOk] = useState<null | boolean>(null);
  const [aiErr, setAiErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ghUsername, setGhUsername] = useState<string | null>(null);
  const [ghBusy, setGhBusy] = useState(false);

  const testAi = useServerFn(testAiKey);
  const saveAi = useServerFn(saveAiKey);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [user, loading, navigate]);

  // Detect if user signed in via GitHub
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from("profiles")
        .select("github_username, display_name, avatar_color")
        .eq("id", user.id).single();
      if (data?.github_username) setGhUsername(data.github_username);
      if (data?.display_name && !name) setName(data.display_name);
      if (data?.avatar_color) setColor(data.avatar_color);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Auto-advance step 3 if already connected
  useEffect(() => {
    if (step !== 3 || !ghUsername) return;
    const t = setTimeout(async () => {
      await supabase.from("profiles").update({ onboarded: true }).eq("id", user!.id);
      navigate({ to: "/dashboard" });
    }, 1500);
    return () => clearTimeout(t);
  }, [step, ghUsername, navigate, user]);

  const finishStep1 = async () => {
    if (!name.trim()) return toast.error("Please add your name");
    setBusy(true);
    const { error } = await supabase.from("profiles")
      .update({ display_name: name.trim(), avatar_color: color })
      .eq("id", user!.id);
    setBusy(false);
    if (error) return toast.error("Couldn't save — please try again");
    setStep(2);
  };

  const testAiBtn = async () => {
    if (!aiKey.trim()) return;
    setBusy(true); setAiErr(null); setAiOk(null);
    const r = await testAi({ data: { provider, apiKey: aiKey.trim() } });
    setBusy(false);
    if (r.success) setAiOk(true);
    else { setAiOk(false); setAiErr("That key didn't work — double-check and try again"); }
  };

  const finishStep2 = async () => {
    if (provider !== "gemini" && !aiOk) return toast.error("Please test your key first");
    setBusy(true);
    await saveAi({ data: { provider, apiKey: provider === "gemini" ? "" : aiKey.trim() } });
    setBusy(false);
    setStep(3);
  };


  const connectGithub = async () => {
    setGhBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "github",
        options: {
          redirectTo: window.location.origin + "/onboarding",
          scopes: "repo read:user user:email",
        },
      });
      if (error) throw error;
    } catch {
      toast.error("Couldn't connect GitHub right now — please try again or use email to sign in");
      setGhBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <Logo className="text-3xl" />
          <div className="mt-6 flex justify-center gap-2">
            {[1,2,3].map((s) => (
              <div key={s} className={`h-1 w-12 rounded ${s <= step ? "bg-brand" : "bg-border"}`} />
            ))}
          </div>
        </div>

        <div className="bg-surface border border-border rounded-lg p-8">
          {step === 1 && (
            <>
              <h2 className="text-lg font-semibold mb-1">Your identity</h2>
              <p className="text-sm text-muted-foreground mb-6">How should your co-founder see you?</p>
              <label className="text-xs text-muted-foreground">Display name</label>
              <input
                value={name} onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full bg-background border border-border rounded px-3 py-2 text-sm focus:outline-none focus:border-brand"
                placeholder="Tanner"
              />
              <label className="text-xs text-muted-foreground mt-6 block">Avatar color</label>
              <div className="mt-2 grid grid-cols-8 gap-2">
                {COLORS.map((c) => (
                  <button key={c} onClick={() => setColor(c)}
                    className={`h-9 w-9 rounded-full transition ${color === c ? "ring-2 ring-foreground ring-offset-2 ring-offset-surface" : ""}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
              <button onClick={finishStep1} disabled={busy}
                className="mt-8 w-full bg-brand text-primary-foreground font-medium py-2.5 rounded text-sm hover:opacity-90 disabled:opacity-50">
                Continue
              </button>
            </>
          )}

          {step === 2 && (
            <>
              <h2 className="text-lg font-semibold mb-1">Choose your AI</h2>
              <p className="text-sm text-muted-foreground mb-6">Pick your model. Your co-founder picks theirs.</p>
              <div className="grid grid-cols-3 gap-3">
                {(["claude","gpt","gemini"] as const).map((p) => {
                  const accent = p === "claude" ? "#6366f1" : p === "gpt" ? "#10b981" : "#4285F4";
                  const label = p === "claude" ? "Claude" : p === "gpt" ? "ChatGPT" : "Gemini";
                  const desc = p === "claude" ? "Great for coding and analysis"
                    : p === "gpt" ? "Great for writing and creativity"
                    : "Google's AI — free to start";
                  return (
                    <button key={p} onClick={() => { setProvider(p); setAiOk(null); setAiErr(null); }}
                      className={`p-4 border rounded text-left transition ${provider === p ? "bg-accent" : "border-border hover:border-muted-foreground"}`}
                      style={provider === p ? { borderColor: accent } : undefined}>
                      <div className="font-medium flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: accent }} />
                        {label}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">{desc}</div>
                    </button>
                  );
                })}
              </div>
              {provider === "gemini" ? (
                <div className="mt-6 p-4 bg-background border border-border rounded">
                  <div className="text-sm font-medium text-success flex items-center gap-1.5">
                    <Check className="h-4 w-4" /> Free — no key needed
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Gemini is powered by YoFounder's server. Just click below to start.
                  </p>
                  <button onClick={finishStep2} disabled={busy}
                    className="mt-4 w-full bg-brand text-primary-foreground font-medium py-2.5 rounded text-sm hover:opacity-90 disabled:opacity-50">
                    Use Gemini
                  </button>
                </div>
              ) : (
                <>
                  <label className="text-xs text-muted-foreground mt-6 block">
                    {provider === "claude" ? "Anthropic secret key" : "OpenAI secret key"}
                  </label>
                  <input
                    type="password" value={aiKey}
                    onChange={(e) => { setAiKey(e.target.value); setAiOk(null); setAiErr(null); }}
                    className="mt-1 w-full bg-background border border-border rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-brand"
                    placeholder={provider === "claude" ? "sk-ant-..." : "sk-..."}
                  />
                  <div className="mt-3 flex items-center gap-3">
                    <button onClick={testAiBtn} disabled={busy || !aiKey.trim()}
                      className="px-4 py-2 border border-border rounded text-sm hover:border-foreground disabled:opacity-50">
                      Test key
                    </button>
                    {aiOk === true && <span className="text-success text-sm flex items-center gap-1"><Check className="h-4 w-4" /> Working</span>}
                    {aiOk === false && <span className="text-error text-sm flex items-center gap-1"><X className="h-4 w-4" /> {aiErr}</span>}
                  </div>
                  <button onClick={finishStep2} disabled={busy || !aiOk}
                    className="mt-8 w-full bg-brand text-primary-foreground font-medium py-2.5 rounded text-sm hover:opacity-90 disabled:opacity-50">
                    Continue
                  </button>
                </>
              )}
            </>
          )}

          {step === 3 && (
            <div className="text-center py-4">
              {ghUsername ? (
                <>
                  <div className="mx-auto h-16 w-16 rounded-full bg-success/10 flex items-center justify-center mb-4">
                    <Check className="h-8 w-8 text-success" />
                  </div>
                  <h2 className="text-lg font-semibold">GitHub connected!</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Welcome, <span className="text-foreground font-medium">@{ghUsername}</span> 🎉
                  </p>
                  <p className="text-xs text-muted-foreground mt-4">Taking you to your dashboard...</p>
                </>
              ) : (
                <>
                  <div className="mx-auto h-20 w-20 rounded-full bg-foreground/5 flex items-center justify-center mb-5">
                    <Github className="h-10 w-10" />
                  </div>
                  <h2 className="text-xl font-semibold">Connect your GitHub</h2>
                  <p className="text-sm text-muted-foreground mt-2 max-w-sm mx-auto">
                    This links your code so YoFounder can manage your projects. One click.
                  </p>
                  <button
                    onClick={connectGithub}
                    disabled={ghBusy}
                    className="mt-6 w-full bg-brand text-primary-foreground font-semibold py-3 rounded-lg text-base hover:opacity-90 disabled:opacity-50 inline-flex items-center justify-center gap-2"
                  >
                    <Github className="h-5 w-5" />
                    {ghBusy ? "Connecting..." : "Connect GitHub"}
                  </button>
                  <p className="text-xs text-muted-foreground mt-4">
                    We never post or change anything without your approval.
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
