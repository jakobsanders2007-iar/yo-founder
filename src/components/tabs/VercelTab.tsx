import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { ExternalLink, Check, Rocket, Loader2, RefreshCw, Trash2, Plus, ScrollText, ListChecks, KeyRound, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import {
  getVercelDeployments,
  getVercelBuildLogs,
  getVercelEnvVars,
  addVercelEnvVar,
  deleteVercelEnvVar,
  triggerVercelDeploy,
  listVercelProjects,
  saveVercelConnection,
  startVercelOAuth,
} from "@/lib/integrations.functions";

type SubTab = "deployments" | "logs" | "env";

export function VercelTab({ ws, onWsUpdate }: { ws: any; onWsUpdate: () => void }) {
  const [url, setUrl] = useState(ws.vercel_project_url ?? "");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  // OAuth flow
  const startOAuth = useServerFn(startVercelOAuth);
  const [oauthBusy, setOAuthBusy] = useState(false);

  // Token + project-picker flow
  const listProjects = useServerFn(listVercelProjects);
  const saveConn = useServerFn(saveVercelConnection);
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [projects, setProjects] = useState<any[] | null>(null);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [showManual, setShowManual] = useState(false);

  const save = async () => {
    const v = url.trim();
    if (!v) return;
    if (!/^https?:\/\//.test(v)) return toast.error("Please paste a full URL starting with https://");
    setBusy(true);
    const { error } = await supabase.from("workspaces")
      .update({ vercel_project_url: v })
      .eq("id", ws.id);
    setBusy(false);
    if (error) return toast.error("Couldn't save — please try again");
    toast.success("Your app URL is saved ✓");
    setEditing(false);
    onWsUpdate();
  };

  const connectVercel = async () => {
    setOAuthBusy(true);
    try {
      const { url } = await startOAuth({ data: { workspaceId: ws.id, origin: window.location.origin } });
      window.location.href = url;
    } catch (e: any) {
      toast.error(e?.message ?? "Couldn't start Vercel connect");
      setOAuthBusy(false);
    }
  };

  const loadProjects = async () => {
    const tkn = token.trim() || (ws.vercel_token ? "from-oauth" : "");
    if (!tkn) return toast.error("Paste a Vercel token first");
    setLoadingProjects(true);
    try {
      const r = await listProjects({ data: { workspaceId: ws.id, token: token.trim() || undefined } });
      setProjects(r.projects);
      if (!r.projects.length) toast.message("No projects found on this Vercel account");
    } catch (e: any) {
      toast.error(e?.message ?? "Couldn't load projects — check your token");
    } finally {
      setLoadingProjects(false);
    }
  };

  const pickProject = async (p: { id: string; name: string }) => {
    setBusy(true);
    try {
      const tkn = token.trim() || ws.vercel_token || "";
      if (!tkn) return toast.error("No token available");
      await saveConn({ data: { workspaceId: ws.id, token: tkn, projectId: p.id, projectName: p.name } });
      // Also set a default URL if none saved yet
      if (!ws.vercel_project_url) {
        await supabase.from("workspaces")
          .update({ vercel_project_url: `https://${p.name}.vercel.app` })
          .eq("id", ws.id);
      }
      toast.success(`Connected to ${p.name} ✓`);
      setToken("");
      setProjects(null);
      onWsUpdate();
    } catch (e: any) {
      toast.error(e?.message ?? "Couldn't save connection");
    } finally {
      setBusy(false);
    }
  };

  const hasVercelConnection = !!ws.vercel_token && !!ws.vercel_project_id;

  // Has token but no project selected
  if (ws.vercel_token && !hasVercelConnection) {
    return (
      <div className="p-6 max-w-3xl space-y-4">
        <div className="bg-surface border border-border rounded-lg p-6">
          <div className="inline-flex items-center gap-1.5 text-xs text-success mb-2">
            <Check className="h-3.5 w-3.5" /> Authorized with Vercel
          </div>
          <h2 className="text-lg font-semibold">Pick a project</h2>
          <p className="text-sm text-muted-foreground mt-1 mb-4">Choose which Vercel project this workspace should use.</p>
          {!projects ? (
            <button onClick={loadProjects} disabled={loadingProjects} className="bg-brand text-primary-foreground px-4 py-2 rounded text-sm font-medium disabled:opacity-50">
              {loadingProjects ? "Loading…" : "Load my projects"}
            </button>
          ) : (
            <ProjectPicker projects={projects} busy={busy} onPick={pickProject} />
          )}
        </div>
      </div>
    );
  }

  // Not connected (no token and no API connection)
  if (!ws.vercel_token && !hasVercelConnection) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="bg-surface border border-border rounded-lg p-10 text-center">
          <div className="mx-auto h-20 w-20 rounded-full bg-foreground/5 flex items-center justify-center mb-5">
            <Rocket className="h-10 w-10" />
          </div>
          <h2 className="text-xl font-semibold">Connect Vercel</h2>
          <p className="text-sm text-muted-foreground mt-2 max-w-sm mx-auto">
            Authorize once and we'll list your projects automatically — no copy/paste needed.
          </p>
          <button
            onClick={connectVercel}
            disabled={oauthBusy}
            className="mt-6 bg-brand text-primary-foreground font-semibold px-6 py-3 rounded-lg text-base hover:opacity-90 disabled:opacity-50 inline-flex items-center justify-center gap-2"
          >
            <Rocket className="h-5 w-5" />
            {oauthBusy ? "Connecting..." : "Connect with Vercel"}
          </button>

          <div className="mt-8 pt-6 border-t border-border text-left">
            {!showManual ? (
              <button
                onClick={() => setShowManual(true)}
                className="text-xs text-muted-foreground hover:text-foreground underline"
              >
                Or paste your app URL manually
              </button>
            ) : (
              <>
                <label className="text-xs text-muted-foreground">Your app URL (simple option — no deployments/logs)</label>
                <input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://my-app.vercel.app"
                  className="mt-1 w-full bg-background border border-border rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-brand"
                />
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={save}
                    disabled={busy || !url.trim()}
                    className="bg-foreground/10 hover:bg-foreground/20 px-4 py-2 rounded text-sm font-medium disabled:opacity-50"
                  >
                    {busy ? "Saving..." : "Save my app URL"}
                  </button>
                  <button
                    onClick={() => { setShowManual(false); setUrl(ws.vercel_project_url ?? ""); }}
                    className="px-4 py-2 border border-border rounded text-sm hover:border-foreground"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }


  return <VercelConnected ws={ws} hasApi={hasVercelConnection} onEditUrl={() => setEditing(true)} />;
}

function ProjectPicker({ projects, busy, onPick }: { projects: any[]; busy: boolean; onPick: (p: { id: string; name: string }) => void }) {
  return (
    <div className="bg-surface border border-border rounded-lg divide-y divide-border">
      {projects.length === 0 && <div className="p-4 text-sm text-muted-foreground">No projects found in your Vercel account.</div>}
      {projects.map((p) => (
        <button
          key={p.id}
          onClick={() => onPick(p)}
          disabled={busy}
          className="w-full text-left p-4 hover:bg-foreground/5 disabled:opacity-50 flex items-center justify-between gap-4"
        >
          <div>
            <div className="font-medium">{p.name}</div>
            {p.framework && <div className="text-xs text-muted-foreground">{p.framework}</div>}
          </div>
          <span className="text-xs text-brand">Connect →</span>
        </button>
      ))}
    </div>
  );
}

function VercelConnected({ ws, hasApi, onEditUrl }: { ws: any; hasApi: boolean; onEditUrl: () => void }) {
  const [sub, setSub] = useState<SubTab>("deployments");
  const [selectedDeployment, setSelectedDeployment] = useState<string | null>(null);

  return (
    <div className="p-6 max-w-5xl space-y-4">
      <div className="bg-surface border border-border rounded-lg p-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-1.5 text-xs text-success">
            <Check className="h-3.5 w-3.5" /> Live
          </div>
          <a href={ws.vercel_project_url} target="_blank" rel="noreferrer"
             className="mt-1 block text-lg font-mono text-brand hover:underline">
            {ws.vercel_project_url.replace(/^https?:\/\//, "")}
          </a>
        </div>
        <div className="flex gap-2">
          <a href={ws.vercel_project_url} target="_blank" rel="noreferrer" className="bg-brand text-primary-foreground px-3 py-1.5 rounded text-sm inline-flex items-center gap-1.5">
            Visit <ExternalLink className="h-3.5 w-3.5" />
          </a>
          <button onClick={onEditUrl} className="px-3 py-1.5 border border-border rounded text-sm hover:border-foreground">
            Change URL
          </button>
        </div>
      </div>

      {!hasApi ? (
        <div className="bg-surface border border-border rounded-lg p-6 text-sm text-muted-foreground">
          Add a Vercel API token in workspace settings to see deployments, logs, and env vars here.
        </div>
      ) : (
        <>
          <div className="flex gap-1 border-b border-border">
            <SubTabBtn active={sub === "deployments"} onClick={() => setSub("deployments")} icon={<ListChecks className="h-4 w-4" />} label="Deployments" />
            <SubTabBtn active={sub === "logs"} onClick={() => setSub("logs")} icon={<ScrollText className="h-4 w-4" />} label="Logs" />
            <SubTabBtn active={sub === "env"} onClick={() => setSub("env")} icon={<KeyRound className="h-4 w-4" />} label="Env vars" />
          </div>

          {sub === "deployments" && (
            <DeploymentsPanel ws={ws} onSelect={(id) => { setSelectedDeployment(id); setSub("logs"); }} />
          )}
          {sub === "logs" && (
            <LogsPanel ws={ws} deploymentId={selectedDeployment} />
          )}
          {sub === "env" && <EnvPanel ws={ws} />}
        </>
      )}
    </div>
  );
}

function SubTabBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm border-b-2 -mb-px inline-flex items-center gap-2 ${
        active ? "text-foreground border-brand" : "text-muted-foreground border-transparent hover:text-foreground"
      }`}
    >
      {icon} {label}
    </button>
  );
}

function DeploymentsPanel({ ws, onSelect }: { ws: any; onSelect: (id: string) => void }) {
  const list = useServerFn(getVercelDeployments);
  const redeploy = useServerFn(triggerVercelDeploy);
  const [deps, setDeps] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await list({ data: { workspaceId: ws.id } });
      setDeps(r.deployments);
    } catch (e: any) {
      toast.error(e?.message ?? "Couldn't load deployments");
    } finally { setLoading(false); }
  }, [list, ws.id]);

  useEffect(() => { load(); }, [load]);

  const trigger = async () => {
    setBusy(true);
    try {
      await redeploy({ data: { workspaceId: ws.id } });
      toast.success("Redeploy queued");
      setTimeout(load, 1500);
    } catch (e: any) {
      toast.error(e?.message ?? "Couldn't redeploy");
    } finally { setBusy(false); }
  };

  return (
    <div className="bg-surface border border-border rounded-lg">
      <div className="flex items-center justify-between p-3 border-b border-border">
        <div className="text-sm font-medium">Recent deployments</div>
        <div className="flex gap-2">
          <button onClick={load} disabled={loading} className="text-xs border border-border rounded px-2 py-1 inline-flex items-center gap-1 hover:border-foreground disabled:opacity-50">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
          <button onClick={trigger} disabled={busy} className="text-xs bg-brand text-primary-foreground rounded px-3 py-1 disabled:opacity-50">
            {busy ? "Deploying…" : "Redeploy prod"}
          </button>
        </div>
      </div>
      {loading && !deps && <div className="p-6 text-sm text-muted-foreground inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>}
      {deps?.length === 0 && <div className="p-6 text-sm text-muted-foreground">No deployments yet.</div>}
      <div className="divide-y divide-border">
        {(deps ?? []).map((d) => (
          <button key={d.id} onClick={() => onSelect(d.id)} className="w-full text-left p-3 hover:bg-foreground/5 flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <StateBadge state={d.state} />
                <span className="text-sm font-medium truncate">{d.commitMessage || d.branch || "deployment"}</span>
              </div>
              <div className="text-xs text-muted-foreground font-mono truncate mt-0.5">
                {d.branch ? `${d.branch} · ` : ""}{d.url ?? d.id}
              </div>
            </div>
            <div className="text-xs text-muted-foreground whitespace-nowrap">{d.created ? new Date(d.created).toLocaleString() : ""}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function StateBadge({ state }: { state: string }) {
  const s = (state || "").toLowerCase();
  const cls =
    s === "ready" ? "bg-success/15 text-success" :
    s === "error" || s === "canceled" ? "bg-error/15 text-error" :
    s === "building" || s === "queued" || s === "initializing" ? "bg-brand/15 text-brand" :
    "bg-foreground/10 text-muted-foreground";
  return <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${cls}`}>{state || "?"}</span>;
}

function LogsPanel({ ws, deploymentId }: { ws: any; deploymentId: string | null }) {
  const getLogs = useServerFn(getVercelBuildLogs);
  const [lines, setLines] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!deploymentId) return;
    setLoading(true);
    try {
      const r = await getLogs({ data: { workspaceId: ws.id, deploymentId } });
      setLines(r.lines);
    } catch (e: any) {
      toast.error(e?.message ?? "Couldn't load logs");
    } finally { setLoading(false); }
  }, [getLogs, ws.id, deploymentId]);

  useEffect(() => { load(); }, [load]);

  if (!deploymentId) {
    return <div className="bg-surface border border-border rounded-lg p-6 text-sm text-muted-foreground">Pick a deployment from the Deployments tab to see its build logs.</div>;
  }

  return (
    <div className="bg-surface border border-border rounded-lg">
      <div className="flex items-center justify-between p-3 border-b border-border">
        <div className="text-xs font-mono text-muted-foreground truncate">{deploymentId}</div>
        <button onClick={load} disabled={loading} className="text-xs border border-border rounded px-2 py-1 inline-flex items-center gap-1 hover:border-foreground disabled:opacity-50">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>
      <pre className="p-4 text-xs font-mono bg-background max-h-[500px] overflow-auto whitespace-pre-wrap">
        {loading && !lines ? "Loading…" : (lines ?? []).map((l: any, i: number) => `${l.text}\n`).join("") || "No output."}
      </pre>
    </div>
  );
}

function EnvPanel({ ws }: { ws: any }) {
  const listEnv = useServerFn(getVercelEnvVars);
  const addEnv = useServerFn(addVercelEnvVar);
  const delEnv = useServerFn(deleteVercelEnvVar);
  const [envs, setEnvs] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [k, setK] = useState("");
  const [v, setV] = useState("");
  const [targets, setTargets] = useState<Record<string, boolean>>({ production: true, preview: true, development: false });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await listEnv({ data: { workspaceId: ws.id } });
      setEnvs(r.envs);
    } catch (e: any) {
      toast.error(e?.message ?? "Couldn't load env vars");
    } finally { setLoading(false); }
  }, [listEnv, ws.id]);

  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!k.trim() || !v.trim()) return;
    const target = Object.entries(targets).filter(([_, on]) => on).map(([n]) => n) as any;
    if (!target.length) return toast.error("Pick at least one environment");
    setBusy(true);
    try {
      await addEnv({ data: { workspaceId: ws.id, key: k.trim(), value: v, target } });
      setK(""); setV("");
      toast.success("Env var added");
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Couldn't add");
    } finally { setBusy(false); }
  };

  const remove = async (envId: string) => {
    if (!confirm("Delete this env var?")) return;
    try {
      await delEnv({ data: { workspaceId: ws.id, envId } });
      toast.success("Deleted");
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Couldn't delete");
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-surface border border-border rounded-lg p-4">
        <div className="text-sm font-medium mb-2 inline-flex items-center gap-2"><Plus className="h-4 w-4" /> Add env var</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input value={k} onChange={(e) => setK(e.target.value.toUpperCase())} placeholder="KEY_NAME" className="bg-background border border-border rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-brand" />
          <input value={v} onChange={(e) => setV(e.target.value)} placeholder="value" className="bg-background border border-border rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-brand" />
        </div>
        <div className="mt-2 flex flex-wrap gap-3 text-xs">
          {(["production","preview","development"] as const).map((t) => (
            <label key={t} className="inline-flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={!!targets[t]} onChange={(e) => setTargets((p) => ({ ...p, [t]: e.target.checked }))} />
              {t}
            </label>
          ))}
        </div>
        <button onClick={add} disabled={busy || !k.trim() || !v.trim()} className="mt-3 bg-brand text-primary-foreground rounded px-4 py-2 text-sm font-medium disabled:opacity-50">
          {busy ? "Adding…" : "Add"}
        </button>
      </div>

      <div className="bg-surface border border-border rounded-lg">
        <div className="flex items-center justify-between p-3 border-b border-border">
          <div className="text-sm font-medium">Env vars</div>
          <button onClick={load} disabled={loading} className="text-xs border border-border rounded px-2 py-1 inline-flex items-center gap-1 hover:border-foreground disabled:opacity-50">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
        {loading && !envs && <div className="p-6 text-sm text-muted-foreground inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>}
        {envs?.length === 0 && <div className="p-6 text-sm text-muted-foreground">No env vars yet.</div>}
        <div className="divide-y divide-border">
          {(envs ?? []).map((e: any) => (
            <div key={e.id} className="p-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-mono text-sm truncate">{e.key}</div>
                <div className="text-xs text-muted-foreground">{(e.target ?? []).join(", ") || "—"} · {e.type}</div>
              </div>
              <button onClick={() => remove(e.id)} className="text-xs text-muted-foreground hover:text-error inline-flex items-center gap-1">
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
