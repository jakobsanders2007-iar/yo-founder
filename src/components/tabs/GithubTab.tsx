import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/Card";
import { Github, ExternalLink, Eye, EyeOff, Check } from "lucide-react";
import { toast } from "sonner";
import {
  saveWorkspaceRepo,
  updateSetupProgress,
} from "@/lib/integrations.functions";
import { testGithubToken, saveGithubToken } from "@/lib/yofounder.functions";
import { useAuth } from "@/lib/auth";

export function GithubTab({ ws, onWsUpdate }: { ws: any; onWsUpdate: () => void }) {
  const { user } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const saveRepo = useServerFn(saveWorkspaceRepo);
  const testTok = useServerFn(testGithubToken);
  const saveTok = useServerFn(saveGithubToken);
  const updateProg = useServerFn(updateSetupProgress);

  const [repo, setRepo] = useState(ws.github_repo ?? "");
  const [savingRepo, setSavingRepo] = useState(false);
  const [token, setToken] = useState("");
  const [showTok, setShowTok] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("*").eq("id", user.id).single().then(({ data }) => setProfile(data));
  }, [user]);

  const step: number = ws.setup_progress?.github ?? 0;
  const setStep = async (n: number) => {
    await updateProg({ data: { workspaceId: ws.id, key: "github", step: n } });
    onWsUpdate();
  };

  const handleSaveRepo = async () => {
    setSavingRepo(true);
    try {
      await saveRepo({ data: { workspaceId: ws.id, repo: repo.trim() } });
      toast.success("Repo saved");
      onWsUpdate();
      if (step < 3) await setStep(3);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    } finally {
      setSavingRepo(false);
    }
  };

  const handleSaveToken = async () => {
    if (!token.trim()) return;
    setBusy(true);
    try {
      const r = await testTok({ data: { token: token.trim() } });
      if (!r.success) throw new Error(r.error);
      await saveTok({ data: { token: token.trim(), login: r.login } });
      toast.success(`Connected as ${r.login}`);
      setToken("");
      setProfile({ ...(profile ?? {}), github_token: "set", github_username: r.login });
      await setStep(4);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  };

  const connected = !!profile?.github_token && !!ws.github_repo;

  if (connected) {
    return (
      <div className="p-6 max-w-3xl space-y-6">
        <Card title="GitHub" right={<span className="inline-flex items-center gap-1.5 text-xs text-success"><Check className="h-3.5 w-3.5" /> Connected</span>}>
          <div className="space-y-2 text-sm">
            <div><span className="text-muted-foreground">User: </span><span className="font-mono">{profile.github_username}</span></div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Repo: </span>
              <a href={`https://github.com/${ws.github_repo}`} target="_blank" rel="noreferrer" className="font-mono text-brand hover:underline inline-flex items-center gap-1">
                {ws.github_repo} <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <a href={`https://github.com/${ws.github_repo}/issues`} target="_blank" rel="noreferrer"
              className="text-xs border border-border rounded px-3 py-1.5 hover:border-foreground inline-flex items-center gap-1.5">
              Issues <ExternalLink className="h-3 w-3" />
            </a>
            <a href={`https://github.com/${ws.github_repo}/commits`} target="_blank" rel="noreferrer"
              className="text-xs border border-border rounded px-3 py-1.5 hover:border-foreground inline-flex items-center gap-1.5">
              Commits <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </Card>
        <Card title="Change Repository">
          <div className="flex gap-2">
            <input value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="owner/repo"
              className="flex-1 bg-background border border-border rounded px-3 py-2 text-sm font-mono" />
            <button onClick={handleSaveRepo} disabled={savingRepo || !repo.trim()}
              className="px-4 py-2 bg-brand text-primary-foreground rounded text-sm hover:opacity-90 disabled:opacity-50">
              Save
            </button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div className="text-xs text-muted-foreground">
        Set up GitHub to push prompts as issues to your repository. <span className="text-success">Free</span> — GitHub's free tier covers unlimited public + private repos.
      </div>

      <SetupStep n={1} title="Create a GitHub account" done={step >= 1} active={step === 0}>
        <p className="text-sm text-muted-foreground mb-3">GitHub is where your code lives. Sign up free, then come back.</p>
        <div className="flex gap-2">
          <a href="https://github.com/signup" target="_blank" rel="noreferrer" onClick={() => setStep(1)}
            className="bg-brand text-primary-foreground px-4 py-2 rounded text-sm font-medium hover:opacity-90 inline-flex items-center gap-1.5">
            Create GitHub Account <ExternalLink className="h-3.5 w-3.5" />
          </a>
          <button onClick={() => setStep(1)} className="px-4 py-2 border border-border rounded text-sm hover:border-foreground">
            I already have one
          </button>
        </div>
      </SetupStep>

      <SetupStep n={2} title="Create a repository" done={step >= 2 || !!ws.github_repo} active={step === 1}>
        <p className="text-sm text-muted-foreground mb-3">
          A repository (repo) is where your code lives. Give it the same name as your project.
        </p>
        <div className="flex gap-2 mb-3">
          <a href="https://github.com/new" target="_blank" rel="noreferrer"
            className="bg-brand text-primary-foreground px-4 py-2 rounded text-sm font-medium hover:opacity-90 inline-flex items-center gap-1.5">
            Create New Repo <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
        <label className="text-xs text-muted-foreground">Paste your repo (owner/repo)</label>
        <div className="flex gap-2 mt-1">
          <input value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="jakob/yofounder"
            className="flex-1 bg-background border border-border rounded px-3 py-2 text-sm font-mono" />
          <button onClick={handleSaveRepo} disabled={savingRepo || !repo.trim()}
            className="px-4 py-2 bg-brand text-primary-foreground rounded text-sm hover:opacity-90 disabled:opacity-50">
            Save
          </button>
        </div>
      </SetupStep>

      <SetupStep n={3} title="Create your access token" done={step >= 4} active={step >= 2 && step < 4}>
        <p className="text-sm text-muted-foreground mb-3">
          An access token is like a password for apps. YoFounder uses it to create issues in your repo.
        </p>
        <ol className="text-sm space-y-2 mb-4 pl-5 list-decimal text-muted-foreground">
          <li>Go to <a className="text-brand hover:underline" href="https://github.com/settings/tokens" target="_blank" rel="noreferrer">github.com/settings/tokens</a></li>
          <li>Click <span className="font-mono text-foreground">Generate new token (classic)</span></li>
          <li>Name it <span className="font-mono text-foreground">YoFounder</span></li>
          <li>Check the box next to <span className="font-mono text-foreground">repo</span></li>
          <li>Scroll down and click <span className="font-mono text-foreground">Generate token</span></li>
          <li>Copy the token — you'll only see it once</li>
        </ol>
        <label className="text-xs text-muted-foreground">Paste your token</label>
        <div className="flex gap-2 mt-1">
          <div className="flex-1 relative">
            <input type={showTok ? "text" : "password"} value={token} onChange={(e) => setToken(e.target.value)}
              placeholder="ghp_..."
              className="w-full bg-background border border-border rounded px-3 py-2 pr-9 text-sm font-mono" />
            <button onClick={() => setShowTok(!showTok)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              {showTok ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          </div>
          <button onClick={handleSaveToken} disabled={busy || !token.trim()}
            className="px-4 py-2 bg-brand text-primary-foreground rounded text-sm hover:opacity-90 disabled:opacity-50">
            {busy ? "Testing..." : "Test & Save"}
          </button>
        </div>
      </SetupStep>
    </div>
  );
}

export function SetupStep({
  n, title, children, done, active,
}: {
  n: number; title: string; children: React.ReactNode; done?: boolean; active?: boolean;
}) {
  return (
    <div className={`border rounded-lg p-5 transition ${done ? "border-success/40 bg-success/5" : active ? "border-brand bg-surface" : "border-border bg-surface opacity-70"}`}>
      <div className="flex items-center gap-3 mb-3">
        <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-semibold ${done ? "bg-success text-background" : "bg-brand text-primary-foreground"}`}>
          {done ? <Check className="h-4 w-4" /> : n}
        </div>
        <h3 className="font-semibold text-sm">{title}</h3>
      </div>
      <div className="pl-10">{children}</div>
    </div>
  );
}
