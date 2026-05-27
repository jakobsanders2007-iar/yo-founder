import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/Card";
import { ExternalLink, Eye, EyeOff, Check, RefreshCw, GitPullRequest, GitCommit, Star, GitFork, AlertCircle, Lock, Globe } from "lucide-react";
import { toast } from "sonner";
import {
  saveWorkspaceRepo,
  updateSetupProgress,
  listGithubRepos,
  getGithubRepoInfo,
  getGithubPRs,
  getGithubCommits,
  mergeGithubPR,
} from "@/lib/integrations.functions";
import { testGithubToken, saveGithubToken } from "@/lib/yofounder.functions";
import { useAuth } from "@/lib/auth";

type Repo = { full_name: string; private: boolean; updated_at: string; description: string | null };

export function GithubTab({ ws, onWsUpdate }: { ws: any; onWsUpdate: () => void }) {
  const { user } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  const saveRepo = useServerFn(saveWorkspaceRepo);
  const testTok = useServerFn(testGithubToken);
  const saveTok = useServerFn(saveGithubToken);
  const updateProg = useServerFn(updateSetupProgress);
  const listRepos = useServerFn(listGithubRepos);

  const [token, setToken] = useState("");
  const [showTok, setShowTok] = useState(false);
  const [busy, setBusy] = useState(false);

  const [repos, setRepos] = useState<Repo[] | null>(null);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [showRepoPicker, setShowRepoPicker] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("github_token, github_username").eq("id", user.id).single()
      .then(({ data }) => { setProfile(data); setLoadingProfile(false); });
  }, [user]);

  const fetchRepos = useCallback(async () => {
    setLoadingRepos(true);
    try {
      const r = await listRepos({ data: { workspaceId: ws.id } });
      setRepos(r.repos);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load repos");
    } finally {
      setLoadingRepos(false);
    }
  }, [listRepos, ws.id]);

  const handleSaveToken = async () => {
    if (!token.trim()) return;
    setBusy(true);
    try {
      const r = await testTok({ data: { token: token.trim() } });
      if (!r.success) throw new Error(r.error);
      await saveTok({ data: { token: token.trim(), login: r.login } });
      toast.success(`Connected as @${r.login}`);
      setToken("");
      setProfile({ ...(profile ?? {}), github_token: "set", github_username: r.login });
      await updateProg({ data: { workspaceId: ws.id, key: "github", step: 4 } });
      onWsUpdate();
      await fetchRepos();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  };

  const handlePickRepo = async (full_name: string) => {
    try {
      await saveRepo({ data: { workspaceId: ws.id, repo: full_name } });
      toast.success(`Connected to ${full_name}`);
      setShowRepoPicker(false);
      onWsUpdate();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    }
  };

  if (loadingProfile) return <div className="p-6 text-sm text-muted-foreground">Loading...</div>;

  const hasToken = !!profile?.github_token;
  const hasRepo = !!ws.github_repo;

  // ───────── Step 1: token ─────────
  if (!hasToken) {
    return (
      <div className="p-6 max-w-3xl space-y-6">
        <Card title="Connect GitHub">
          <p className="text-sm text-muted-foreground mb-3">
            YoFounder needs a GitHub Personal Access Token to read your repos and create issues.
          </p>
          <ol className="text-sm space-y-1.5 mb-4 pl-5 list-decimal text-muted-foreground">
            <li>Go to <a className="text-brand hover:underline" href="https://github.com/settings/tokens" target="_blank" rel="noreferrer">github.com/settings/tokens</a></li>
            <li>Click <span className="font-mono text-foreground">Generate new token (classic)</span></li>
            <li>Check the <span className="font-mono text-foreground">repo</span> scope, generate, copy</li>
          </ol>
          <label className="text-xs text-muted-foreground">Personal Access Token</label>
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
        </Card>
      </div>
    );
  }

  // ───────── Step 2: pick repo ─────────
  if (!hasRepo || showRepoPicker) {
    return (
      <div className="p-6 max-w-3xl space-y-4">
        <Card
          title={showRepoPicker ? "Change repository" : "Select a repository"}
          right={
            <div className="flex items-center gap-2">
              <span className="text-xs text-success inline-flex items-center gap-1"><Check className="h-3 w-3" /> @{profile.github_username}</span>
              <button onClick={fetchRepos} disabled={loadingRepos} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                <RefreshCw className={`h-3 w-3 ${loadingRepos ? "animate-spin" : ""}`} /> Refresh
              </button>
            </div>
          }
        >
          {repos === null && !loadingRepos && (
            <button onClick={fetchRepos} className="text-sm px-3 py-2 border border-border rounded hover:border-foreground">
              Load my repos
            </button>
          )}
          {loadingRepos && <div className="text-sm text-muted-foreground">Loading repos…</div>}
          {repos && repos.length === 0 && <div className="text-sm text-muted-foreground">No repos found.</div>}
          {repos && repos.length > 0 && (
            <ul className="divide-y divide-border max-h-[60vh] overflow-y-auto -mx-2">
              {repos.map((r) => (
                <li key={r.full_name}>
                  <button
                    onClick={() => handlePickRepo(r.full_name)}
                    className="w-full text-left px-2 py-2.5 hover:bg-accent/50 rounded flex items-center gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm truncate">{r.full_name}</span>
                        <span className={`text-[10px] uppercase px-1.5 py-0.5 rounded ${r.private ? "bg-muted text-muted-foreground" : "bg-success/15 text-success"}`}>
                          {r.private ? "private" : "public"}
                        </span>
                      </div>
                      {r.description && <div className="text-xs text-muted-foreground truncate mt-0.5">{r.description}</div>}
                    </div>
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">{new Date(r.updated_at).toLocaleDateString()}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {showRepoPicker && (
            <button onClick={() => setShowRepoPicker(false)} className="mt-3 text-xs text-muted-foreground hover:text-foreground">Cancel</button>
          )}
        </Card>
      </div>
    );
  }

  // ───────── Step 3: connected dashboard ─────────
  return <RepoDashboard ws={ws} onChangeRepo={() => { setRepos(null); setShowRepoPicker(true); fetchRepos(); }} />;
}

function RepoDashboard({ ws, onChangeRepo }: { ws: any; onChangeRepo: () => void }) {
  const getInfo = useServerFn(getGithubRepoInfo);
  const getPRs = useServerFn(getGithubPRs);
  const getCommits = useServerFn(getGithubCommits);
  const mergePR = useServerFn(mergeGithubPR);

  const [info, setInfo] = useState<any>(null);
  const [prs, setPrs] = useState<any[] | null>(null);
  const [commits, setCommits] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [merging, setMerging] = useState<number | null>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const [i, p, c] = await Promise.all([
        getInfo({ data: { workspaceId: ws.id } }),
        getPRs({ data: { workspaceId: ws.id } }),
        getCommits({ data: { workspaceId: ws.id } }),
      ]);
      setInfo(i);
      setPrs(p.prs);
      setCommits(c.commits);
    } catch (e: any) {
      setError(e?.message ?? "Failed");
    } finally {
      setRefreshing(false);
    }
  }, [getInfo, getPRs, getCommits, ws.id]);

  useEffect(() => {
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [load]);

  const handleMerge = async (num: number) => {
    setMerging(num);
    try {
      const r = await mergePR({ data: { workspaceId: ws.id, prNumber: num } });
      if (r.merged) toast.success(`Merged PR #${num}`);
      else toast.error("Merge failed");
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    } finally {
      setMerging(null);
    }
  };

  return (
    <div className="p-6 max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground font-mono">{ws.github_repo}</div>
        <div className="flex items-center gap-2">
          <button onClick={onChangeRepo} className="text-xs border border-border rounded px-2 py-1 hover:border-foreground">
            Change repo
          </button>
          <button onClick={load} disabled={refreshing} className="text-xs border border-border rounded px-2 py-1 hover:border-foreground inline-flex items-center gap-1">
            <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="border border-error/40 bg-error/5 text-error rounded p-3 text-sm inline-flex items-start gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" /> {error}
        </div>
      )}

      {/* SECTION 1 — Repository */}
      <Card title="Repository">
        {!info ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <a href={info.html_url} target="_blank" rel="noreferrer" className="font-mono text-sm font-medium text-brand hover:underline">{info.full_name}</a>
                  <span className={`text-[10px] uppercase px-1.5 py-0.5 rounded inline-flex items-center gap-1 ${info.private ? "bg-muted text-muted-foreground" : "bg-success/15 text-success"}`}>
                    {info.private ? <Lock className="h-2.5 w-2.5" /> : <Globe className="h-2.5 w-2.5" />}
                    {info.private ? "private" : "public"}
                  </span>
                  <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">{info.default_branch}</span>
                </div>
                {info.description && <p className="text-sm text-muted-foreground mt-1">{info.description}</p>}
                <p className="text-xs text-muted-foreground mt-1">Updated {timeAgo(info.updated_at)}</p>
              </div>
              <a href={info.html_url} target="_blank" rel="noreferrer"
                className="text-xs bg-brand text-primary-foreground rounded px-3 py-1.5 hover:opacity-90 inline-flex items-center gap-1.5 shrink-0">
                Open on GitHub <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <div className="flex gap-4 text-xs text-muted-foreground pt-2 border-t border-border">
              <span className="inline-flex items-center gap-1"><Star className="h-3 w-3" /> {info.stargazers_count}</span>
              <span className="inline-flex items-center gap-1"><GitFork className="h-3 w-3" /> {info.forks_count}</span>
              <span className="inline-flex items-center gap-1"><AlertCircle className="h-3 w-3" /> {info.open_issues_count} open issues</span>
            </div>
          </div>
        )}
      </Card>

      {/* SECTION 2 — Pull Requests */}
      <Card title={`Open Pull Requests${prs ? ` (${prs.length})` : ""}`}>
        {prs === null ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : prs.length === 0 ? (
          <div className="text-sm text-muted-foreground inline-flex items-center gap-2"><GitPullRequest className="h-4 w-4" /> No open pull requests</div>
        ) : (
          <ul className="divide-y divide-border -mx-2">
            {prs.map((p) => (
              <li key={p.number} className="px-2 py-3">
                <div className="flex items-start gap-3">
                  <GitPullRequest className="h-4 w-4 text-success mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">#{p.number} {p.title}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      by <span className="font-mono">{p.author}</span> · <span className="font-mono">{p.head}</span> → <span className="font-mono">{p.base}</span> · {timeAgo(p.created_at)}
                    </div>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <a href={p.html_url} target="_blank" rel="noreferrer"
                      className="text-xs border border-border rounded px-2 py-1 hover:border-foreground inline-flex items-center gap-1">
                      View <ExternalLink className="h-3 w-3" />
                    </a>
                    <button onClick={() => handleMerge(p.number)} disabled={merging === p.number}
                      className="text-xs bg-brand text-primary-foreground rounded px-2 py-1 hover:opacity-90 disabled:opacity-50">
                      {merging === p.number ? "Merging…" : "Merge"}
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* SECTION 3 — Commits */}
      <Card title="Recent Commits" right={
        <a href={`https://github.com/${ws.github_repo}/commits`} target="_blank" rel="noreferrer"
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          View all <ExternalLink className="h-3 w-3" />
        </a>
      }>
        {commits === null ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : commits.length === 0 ? (
          <div className="text-sm text-muted-foreground">No commits yet</div>
        ) : (
          <ul className="divide-y divide-border -mx-2">
            {commits.map((c) => (
              <li key={c.sha} className="px-2 py-2">
                <a href={c.html_url} target="_blank" rel="noreferrer" className="flex items-center gap-3 hover:bg-accent/50 rounded px-1 -mx-1 py-1">
                  <GitCommit className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="font-mono text-xs text-muted-foreground">{c.short_sha}</span>
                  <span className="text-sm flex-1 truncate">{c.message}</span>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{c.author} · {timeAgo(c.date)}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
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
