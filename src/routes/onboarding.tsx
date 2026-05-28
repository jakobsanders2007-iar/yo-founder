import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/Logo";
import { testAiKey, testGithubToken, saveAiKey, saveGithubToken } from "@/lib/yofounder.functions";
import { toast } from "sonner";
import { Check, X } from "lucide-react";

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
  const [ghToken, setGhToken] = useState("");
  const [ghLogin, setGhLogin] = useState<string | null>(null);
  const [ghErr, setGhErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const testAi = useServerFn(testAiKey);
  const testGh = useServerFn(testGithubToken);
  const saveAi = useServerFn(saveAiKey);
  const saveGh = useServerFn(saveGithubToken);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [user, loading, navigate]);

  const finishStep1 = async () => {
    if (!name.trim()) return toast.error("Enter a display name");
    setBusy(true);
    const { error } = await supabase.from("profiles")
      .update({ display_name: name.trim(), avatar_color: color })
      .eq("id", user!.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    setStep(2);
  };

  const testAiBtn = async () => {
    if (!aiKey.trim()) return;
    setBusy(true); setAiErr(null); setAiOk(null);
    const r = await testAi({ data: { provider, apiKey: aiKey.trim() } });
    setBusy(false);
    if (r.success) setAiOk(true);
    else { setAiOk(false); setAiErr(r.error); }
  };

  const finishStep2 = async () => {
    if (!aiOk) return toast.error("Test the key first");
    setBusy(true);
    await saveAi({ data: { provider, apiKey: aiKey.trim() } });
    setBusy(false);
    setStep(3);
  };

  const testGhBtn = async () => {
    if (!ghToken.trim()) return;
    setBusy(true); setGhErr(null); setGhLogin(null);
    const r = await testGh({ data: { token: ghToken.trim() } });
    setBusy(false);
    if (r.success) setGhLogin(r.login);
    else setGhErr(r.error);
  };

  const finishStep3 = async () => {
    if (!ghLogin) return toast.error("Test the token first");
    setBusy(true);
    await saveGh({ data: { token: ghToken.trim(), login: ghLogin } });
    setBusy(false);
    navigate({ to: "/dashboard" });
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
              <h2 className="text-lg font-semibold mb-1">Connect your AI</h2>
              <p className="text-sm text-muted-foreground mb-6">Pick your model. Your co-founder picks the other one.</p>
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
              <label className="text-xs text-muted-foreground mt-6 block">
                {provider === "claude" ? "Anthropic secret key" : provider === "gpt" ? "OpenAI secret key" : "Google AI key"}
              </label>
              <input
                type="password" value={aiKey}
                onChange={(e) => { setAiKey(e.target.value); setAiOk(null); setAiErr(null); }}
                className="mt-1 w-full bg-background border border-border rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-brand"
                placeholder={provider === "claude" ? "sk-ant-..." : provider === "gpt" ? "sk-..." : "AIza..."}
              />
              {provider === "gemini" && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Get your free key at{" "}
                  <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-brand hover:underline">
                    aistudio.google.com →
                  </a>
                </p>
              )}
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

          {step === 3 && (
            <>
              <h2 className="text-lg font-semibold mb-1">Connect GitHub</h2>
              <p className="text-sm text-muted-foreground mb-6">Used to create issues from generated prompts.</p>
              <label className="text-xs text-muted-foreground">Personal Access Token</label>
              <input
                type="password" value={ghToken}
                onChange={(e) => { setGhToken(e.target.value); setGhLogin(null); setGhErr(null); }}
                className="mt-1 w-full bg-background border border-border rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-brand"
                placeholder="ghp_..."
              />
              <p className="mt-2 text-xs text-muted-foreground">
                Needs <code>repo</code> scope. Create one at github.com/settings/tokens
              </p>
              <div className="mt-3 flex items-center gap-3">
                <button onClick={testGhBtn} disabled={busy || !ghToken.trim()}
                  className="px-4 py-2 border border-border rounded text-sm hover:border-foreground disabled:opacity-50">
                  Test token
                </button>
                {ghLogin && <span className="text-success text-sm flex items-center gap-1"><Check className="h-4 w-4" /> @{ghLogin}</span>}
                {ghErr && <span className="text-error text-sm flex items-center gap-1"><X className="h-4 w-4" /> {ghErr}</span>}
              </div>
              <button onClick={finishStep3} disabled={busy || !ghLogin}
                className="mt-8 w-full bg-brand text-primary-foreground font-medium py-2.5 rounded text-sm hover:opacity-90 disabled:opacity-50">
                Finish
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
