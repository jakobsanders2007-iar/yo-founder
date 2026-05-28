import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/Card";
import { ExternalLink, Check, RefreshCw, GitPullRequest, GitCommit, AlertCircle, ChevronDown, ChevronRight, X, Github, Folder, FileText } from "lucide-react";
import { toast } from "sonner";
import {
  saveWorkspaceRepo,
  listGithubRepos,
  getGithubRepoInfo,
  getGithubPRs,
  getGithubPRDetail,
  getGithubCommits,
  mergeGithubPR,
  listGithubRepoFiles,
} from "@/lib/integrations.functions";
import { useAuth } from "@/lib/auth";

type Repo = { full_name: string; private: boolean; updated_at: string; description: string | null };

export function GithubTab({ ws, onWsUpdate }: { ws: any; onWsUpdate: () => void }) {
  const { user } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [ghBusy, setGhBusy] = useState(false);

  const saveRepo = useServerFn(saveWorkspaceRepo);
  const listRepos = useServerFn(listGithubRepos);

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
    } catch {
      toast.error("Couldn't load your repos — try refreshing");
    } finally {
      setLoadingRepos(false);
    }
  }, [listRepos, ws.id]);

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

  const handlePickRepo = async (full_name: string) => {
    try {
      await saveRepo({ data: { workspaceId: ws.id, repo: full_name } });
      toast.success(`Connected to ${full_name} ✓`);
      setShowRepoPicker(false);
      onWsUpdate();
    } catch {
      toast.error("Couldn't save your code link — please try again");
    }
  };

  if (loadingProfile) return <div className="p-6 text-sm text-muted-foreground">Loading...</div>;

  const hasToken = !!profile?.github_token;
  const hasRepo = !!ws.github_repo;

  // ───────── Not connected: OAuth button only ─────────
  if (!hasToken) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="bg-surface border border-border rounded-lg p-10 text-center">
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
            className="mt-6 bg-brand text-primary-foreground font-semibold px-6 py-3 rounded-lg text-base hover:opacity-90 disabled:opacity-50 inline-flex items-center justify-center gap-2"
          >
            <Github className="h-5 w-5" />
            {ghBusy ? "Connecting..." : "Connect GitHub"}
          </button>
          <p className="text-xs text-muted-foreground mt-4">
            We never post or change anything without your approval.
          </p>
        </div>
      </div>
    );
  }

  // ───────── Connected, no repo picked: dropdown ─────────
  if (!hasRepo || showRepoPicker) {
    return (
      <div className="p-6 max-w-3xl space-y-4">
        <Card
          title={showRepoPicker ? "Change which code this workspace uses" : "Pick which code this workspace uses"}
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
              Show my projects
            </button>
          )}
          {loadingRepos && <div className="text-sm text-muted-foreground">Loading your projects…</div>}
          {repos && repos.length === 0 && <div className="text-sm text-muted-foreground">No projects found on your GitHub yet.</div>}
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

  // ───────── Connected dashboard ─────────
  return <RepoDashboard ws={ws} onChangeRepo={() => { setRepos(null); setShowRepoPicker(true); fetchRepos(); }} />;
}

function RepoDashboard({ ws, onChangeRepo }: { ws: any; onChangeRepo: () => void }) {
  const getInfo = useServerFn(getGithubRepoInfo);
  const getPRs = useServerFn(getGithubPRs);
  const getPRDetail = useServerFn(getGithubPRDetail);
  const getCommits = useServerFn(getGithubCommits);
  const mergePR = useServerFn(mergeGithubPR);

  const [info, setInfo] = useState<any>(null);
  const [prs, setPrs] = useState<any[] | null>(null);
  const [commits, setCommits] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [merging, setMerging] = useState<number | null>(null);
  const [confirmMerge, setConfirmMerge] = useState<any>(null);
  const [showCommits, setShowCommits] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [details, setDetails] = useState<Record<number, any>>({});
  const [loadingDetail, setLoadingDetail] = useState<number | null>(null);

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
    } catch {
      setError("Couldn't load the latest from GitHub — try refresh");
    } finally {
      setRefreshing(false);
    }
  }, [getInfo, getPRs, getCommits, ws.id]);

  useEffect(() => {
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [load]);

  const toggleDiff = async (num: number) => {
    if (expanded === num) { setExpanded(null); return; }
    setExpanded(num);
    if (!details[num]) {
      setLoadingDetail(num);
      try {
        const d = await getPRDetail({ data: { workspaceId: ws.id, prNumber: num } });
        setDetails((prev) => ({ ...prev, [num]: d }));
      } catch {
        toast.error("Couldn't load the changes — try again");
      } finally {
        setLoadingDetail(null);
      }
    }
  };

  const doMerge = async () => {
    if (!confirmMerge) return;
    const num = confirmMerge.number;
    setConfirmMerge(null);
    setMerging(num);
    try {
      const r = await mergePR({ data: { workspaceId: ws.id, prNumber: num } });
      if (r.merged) toast.success("Change approved ✓");
      else toast.error("Couldn't approve this change — try again");
      await load();
    } catch {
      toast.error("Something went wrong — please try again");
    } finally {
      setMerging(null);
    }
  };

  return (
    <div className="p-6 max-w-5xl space-y-6">
      <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
        <div className="flex items-center gap-2 text-sm min-w-0">
          <span className="font-mono truncate">{ws.github_repo}</span>
          {info?.private !== undefined && (
            <span className={`text-[10px] uppercase px-1.5 py-0.5 rounded shrink-0 ${info.private ? "bg-muted text-muted-foreground" : "bg-success/15 text-success"}`}>
              {info.private ? "private" : "public"}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <a href={`https://github.com/${ws.github_repo}`} target="_blank" rel="noreferrer"
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
            Open on GitHub <ExternalLink className="h-3 w-3" />
          </a>
          <button onClick={onChangeRepo} className="text-xs border border-border rounded px-2 py-1 hover:border-foreground">
            Change project
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

      <div>
        <h2 className="text-sm uppercase tracking-wide text-muted-foreground mb-3 inline-flex items-center gap-2">
          <GitPullRequest className="h-4 w-4" /> Open change requests{prs ? ` (${prs.length})` : ""}
        </h2>
        {prs === null ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : prs.length === 0 ? (
          <div className="border border-border rounded-lg bg-surface p-10 text-center">
            <GitPullRequest className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
            <div className="text-base font-medium">No changes waiting for review 🎉</div>
            <div className="text-sm text-muted-foreground mt-1">
              When new changes are ready, they'll show up here
            </div>
          </div>
        ) : (
          <ul className="space-y-3">
            {prs.map((p) => (
              <li key={p.number} className="border border-border rounded-lg bg-surface overflow-hidden">
                <div className="p-4">
                  <div className="flex items-start gap-3">
                    <GitPullRequest className="h-4 w-4 text-success mt-1 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">#{p.number} {p.title}</div>
                      <div className="text-xs text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span>by <span className="font-mono">{p.author}</span></span>
                        <span>·</span>
                        <span>{timeAgo(p.created_at)}</span>
                        {p.changed_files != null && <><span>·</span><span>{p.changed_files} files</span></>}
                      </div>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <button onClick={() => toggleDiff(p.number)}
                        className="text-xs border border-border rounded px-2 py-1 hover:border-foreground inline-flex items-center gap-1">
                        {expanded === p.number ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                        View changes
                      </button>
                      <a href={p.html_url} target="_blank" rel="noreferrer"
                        className="text-xs border border-border rounded px-2 py-1 hover:border-foreground inline-flex items-center gap-1">
                        Open <ExternalLink className="h-3 w-3" />
                      </a>
                      <button onClick={() => setConfirmMerge(p)} disabled={merging === p.number}
                        className="text-xs bg-brand text-primary-foreground rounded px-2 py-1 hover:opacity-90 disabled:opacity-50">
                        {merging === p.number ? "Approving…" : "Approve change"}
                      </button>
                    </div>
                  </div>
                </div>

                {expanded === p.number && (
                  <div className="border-t border-border bg-background/50">
                    {loadingDetail === p.number ? (
                      <div className="p-4 text-sm text-muted-foreground">Loading changes…</div>
                    ) : details[p.number] ? (
                      <div className="p-4 space-y-3">
                        {details[p.number].body && (
                          <div className="text-xs text-muted-foreground whitespace-pre-wrap mb-3 max-h-40 overflow-y-auto scrollbar-thin">
                            {details[p.number].body.slice(0, 500)}
                          </div>
                        )}
                        {details[p.number].files.length === 0 ? (
                          <div className="text-xs text-muted-foreground">No file changes</div>
                        ) : details[p.number].files.map((f: any) => (
                          <FileDiff key={f.filename} file={f} />
                        ))}
                      </div>
                    ) : null}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <button onClick={() => setShowCommits(!showCommits)}
          className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5">
          {showCommits ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          {showCommits ? "Hide recent updates" : "Show recent updates"}
        </button>
        {showCommits && (
          <Card className="mt-3" title="Recent updates" right={
            <a href={`https://github.com/${ws.github_repo}/commits`} target="_blank" rel="noreferrer"
              className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
              View all <ExternalLink className="h-3 w-3" />
            </a>
          }>
            {commits === null ? (
              <div className="text-sm text-muted-foreground">Loading…</div>
            ) : commits.length === 0 ? (
              <div className="text-sm text-muted-foreground">No updates yet</div>
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
        )}
      </div>

      {confirmMerge && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center px-4" onClick={() => setConfirmMerge(null)}>
          <div className="bg-surface border border-border rounded-lg w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h3 className="font-semibold">Approve this change?</h3>
              <button onClick={() => setConfirmMerge(null)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>
            <div className="p-4">
              <p className="text-sm">Once approved, this change becomes part of your code.</p>
              <p className="text-xs text-muted-foreground mt-2">This can't be undone.</p>
              <div className="flex gap-2 justify-end mt-4">
                <button onClick={() => setConfirmMerge(null)} className="px-4 py-2 border border-border rounded text-sm hover:border-foreground">Cancel</button>
                <button onClick={doMerge} className="px-4 py-2 bg-brand text-primary-foreground rounded text-sm hover:opacity-90">Approve</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FileDiff({ file }: { file: any }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-border rounded overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-2 px-3 py-2 bg-surface hover:bg-accent/50 text-left">
        {open ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
        <span className="font-mono text-xs flex-1 truncate">{file.filename}</span>
        <span className="text-[10px] text-success">+{file.additions}</span>
        <span className="text-[10px] text-error">−{file.deletions}</span>
      </button>
      {open && file.patch && (
        <pre className="text-[11px] font-mono leading-relaxed overflow-x-auto bg-background p-3 m-0">
          {file.patch.split("\n").map((line: string, i: number) => {
            const cls = line.startsWith("+") && !line.startsWith("+++")
              ? "text-success bg-success/5"
              : line.startsWith("-") && !line.startsWith("---")
              ? "text-error bg-error/5"
              : line.startsWith("@@")
              ? "text-brand"
              : "text-muted-foreground";
            return <div key={i} className={cls}>{line || " "}</div>;
          })}
        </pre>
      )}
      {open && !file.patch && (
        <div className="text-xs text-muted-foreground px-3 py-2">No preview available for this file</div>
      )}
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

// Kept for backward compatibility — other tabs may still import it.
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
