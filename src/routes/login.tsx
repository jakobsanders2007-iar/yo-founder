import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useAuth } from "@/lib/auth";
import { Logo } from "@/components/Logo";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  head: () => ({
    meta: [
      { title: "Sign in — YoFounder" },
      { name: "description", content: "Sign in to YoFounder and vibe code with your co-founder." },
    ],
  }),
});

function LoginPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [ghBusy, setGhBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      const pendingInvite = typeof window !== "undefined" ? sessionStorage.getItem("pending_invite") : null;
      if (pendingInvite) {
        sessionStorage.removeItem("pending_invite");
        navigate({ to: "/invite/$token", params: { token: pendingInvite } });
      } else {
        navigate({ to: "/dashboard" });
      }
    }
  }, [user, loading, navigate]);

  const continueWithGoogle = async () => {
    setGhBusy(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin + "/dashboard",
      });
      if (result.error) throw result.error;
      if (result.redirected) return;
    } catch {
      toast.error("Couldn't connect Google right now — please try again or use email to sign in");
      setGhBusy(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: `${window.location.origin}/dashboard` },
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <Logo className="text-4xl" />
          <p className="mt-3 text-sm text-muted-foreground">Vibe code with your co-founder.</p>
        </div>

        <button
          onClick={continueWithGoogle}
          disabled={ghBusy}
          className="w-full bg-brand text-primary-foreground font-semibold py-3.5 rounded-lg text-base hover:opacity-90 disabled:opacity-50 transition inline-flex items-center justify-center gap-2.5 shadow-sm"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#fff" d="M21.6 12.227c0-.708-.064-1.39-.182-2.045H12v3.868h5.382a4.6 4.6 0 0 1-1.995 3.018v2.51h3.232c1.89-1.742 2.981-4.305 2.981-7.35z"/>
            <path fill="#fff" d="M12 22c2.7 0 4.964-.895 6.619-2.422l-3.232-2.51c-.896.6-2.04.955-3.387.955-2.605 0-4.81-1.76-5.598-4.124H3.064v2.59A9.997 9.997 0 0 0 12 22z" opacity=".85"/>
            <path fill="#fff" d="M6.402 13.9a6.005 6.005 0 0 1 0-3.8V7.51H3.064a10.003 10.003 0 0 0 0 8.98l3.338-2.59z" opacity=".7"/>
            <path fill="#fff" d="M12 5.977c1.468 0 2.786.505 3.823 1.496l2.868-2.868C16.96 2.99 14.697 2 12 2A9.997 9.997 0 0 0 3.064 7.51L6.402 10.1C7.19 7.736 9.395 5.977 12 5.977z" opacity=".55"/>
          </svg>
          {ghBusy ? "Connecting..." : "Continue with Google"}
        </button>


        <div className="flex items-center gap-3 my-5">
          <div className="flex-1 h-px bg-border" />
          <span className="text-xs text-muted-foreground">or continue with email</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        <form onSubmit={submit} className="space-y-3 bg-surface border border-border rounded-lg p-6">
          <div>
            <label className="text-xs text-muted-foreground">Email</label>
            <input
              type="email" value={email} required
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full bg-background border border-border rounded px-3 py-2 text-sm focus:outline-none focus:border-brand"
              placeholder="you@founder.com"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Password</label>
            <input
              type="password" value={password} required minLength={6}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full bg-background border border-border rounded px-3 py-2 text-sm focus:outline-none focus:border-brand"
              placeholder="••••••••"
            />
          </div>
          <button
            type="submit" disabled={busy}
            className="w-full bg-foreground/10 hover:bg-foreground/15 text-foreground font-medium py-2.5 rounded text-sm disabled:opacity-50 transition"
          >
            {busy ? "..." : mode === "signin" ? "Sign in with email" : "Create account"}
          </button>
          <button
            type="button"
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            className="w-full text-xs text-muted-foreground hover:text-foreground pt-2"
          >
            {mode === "signin" ? "Need an account? Sign up" : "Have an account? Sign in"}
          </button>
        </form>

        <p className="mt-8 text-center text-xs text-muted-foreground">
          <a href="https://yo-founder.com" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition">
            yo-founder.com
          </a>
        </p>
      </div>
    </div>
  );
}
