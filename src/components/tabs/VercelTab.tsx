import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/Card";
import { SetupStep } from "@/components/tabs/GithubTab";
import { ExternalLink, Eye, EyeOff, Check, RefreshCw, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  testVercelToken, listVercelProjects, saveVercelConnection,
  getVercelDeployments, triggerVercelDeploy, getVercelEnvVars,
  addVercelEnvVar, deleteVercelEnvVar, getVercelBuildLogs, updateSetupProgress,
} from "@/lib/integrations.functions";

export function VercelTab({ ws, onWsUpdate }: { ws: any; onWsUpdate: () => void }) {
  const connected = !!ws.vercel_token && !!ws.vercel_project_id;
  if (!connected) return <VercelSetup ws={ws} onWsUpdate={onWsUpdate} />;
  return <VercelDashboard ws={ws} onWsUpdate={onWsUpdate} />;
}

function VercelSetup({ ws, onWsUpdate }: { ws: any; onWsUpdate: () => void }) {
  const testTok = useServerFn(testVercelToken);
  const listProj = useServerFn(listVercelProjects);
  const saveConn = useServerFn(saveVercelConnection);
  const updateProg = useServerFn(updateSetupProgress);

  const step: number = ws.setup_progress?.vercel ?? 0;
  const setStep = async (n: number) => {
    await updateProg({ data: { workspaceId: ws.id, key: "vercel", step: n } });
    onWsUpdate();
  };

  const [token, setToken] = useState("");
  const [showTok, setShowTok] = useState(false);
  const [busy, setBusy] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProj, setSelectedProj] = useState<string>("");

  const testAndLoad = async () => {
    setBusy(true);
    try {
      const r = await testTok({ data: { token: token.trim() } });
      if (!r.success) throw new Error(r.error);
      setUsername(r.username);
      toast.success(`Hello ${r.username}`);
      const p = await listProj({ data: { token: token.trim() } });
      setProjects(p.projects);
      await setStep(2);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  };

  const connect = async () => {
    if (!selectedProj) return;
    const proj = projects.find((p) => p.id === selectedProj);
    if (!proj) return;
    setBusy(true);
    try {
      await saveConn({
        data: {
          workspaceId: ws.id,
          token: token.trim(),
          projectId: proj.id,
          projectName: proj.name,
        },
      });
      toast.success(`Connected to ${proj.name}`);
      await setStep(3);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div className="text-xs text-muted-foreground">
        Vercel hosts your app on the internet. <span className="text-success">Free tier</span>: unlimited projects, 100GB bandwidth/month.
      </div>

      <SetupStep n={1} title="Create a Vercel account" done={step >= 1} active={step === 0}>
        <p className="text-sm text-muted-foreground mb-3">Sign up free with GitHub.</p>
        <div className="flex gap-2">
          <a href="https://vercel.com/signup" target="_blank" rel="noreferrer" onClick={() => setStep(1)}
            className="bg-brand text-primary-foreground px-4 py-2 rounded text-sm font-medium hover:opacity-90 inline-flex items-center gap-1.5">
            Create Vercel Account <ExternalLink className="h-3.5 w-3.5" />
          </a>
          <button onClick={() => setStep(1)} className="px-4 py-2 border border-border rounded text-sm hover:border-foreground">
            I already have one
          </button>
        </div>
      </SetupStep>

      <SetupStep n={2} title="Get your Vercel API token" done={step >= 2} active={step === 1}>
        <ol className="text-sm space-y-2 mb-4 pl-5 list-decimal text-muted-foreground">
          <li>Go to <a className="text-brand hover:underline" href="https://vercel.com/account/tokens" target="_blank" rel="noreferrer">vercel.com/account/tokens</a></li>
          <li>Click <span className="font-mono text-foreground">Create Token</span></li>
          <li>Name it <span className="font-mono text-foreground">YoFounder</span></li>
          <li>Set scope to <span className="font-mono text-foreground">Full Account</span></li>
          <li>Copy the token</li>
        </ol>
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <input type={showTok ? "text" : "password"} value={token} onChange={(e) => setToken(e.target.value)}
              placeholder="paste token..."
              className="w-full bg-background border border-border rounded px-3 py-2 pr-9 text-sm font-mono" />
            <button onClick={() => setShowTok(!showTok)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              {showTok ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          </div>
          <button onClick={testAndLoad} disabled={busy || !token.trim()}
            className="px-4 py-2 bg-brand text-primary-foreground rounded text-sm hover:opacity-90 disabled:opacity-50">
            {busy ? "Testing..." : "Test"}
          </button>
        </div>
        {username && <div className="mt-3 text-xs text-success inline-flex items-center gap-1.5"><Check className="h-3.5 w-3.5" /> Authenticated as {username}</div>}
      </SetupStep>

      <SetupStep n={3} title="Connect your project" done={step >= 3} active={step === 2}>
        {projects.length === 0 ? (
          <p className="text-sm text-muted-foreground">Complete step 2 to load your projects.</p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground mb-3">Pick the Vercel project for this workspace.</p>
            <div className="flex gap-2">
              <select value={selectedProj} onChange={(e) => setSelectedProj(e.target.value)}
                className="flex-1 bg-background border border-border rounded px-3 py-2 text-sm">
                <option value="">-- select a project --</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <button onClick={connect} disabled={busy || !selectedProj}
                className="px-4 py-2 bg-brand text-primary-foreground rounded text-sm hover:opacity-90 disabled:opacity-50">
                Connect
              </button>
            </div>
          </>
        )}
      </SetupStep>
    </div>
  );
}

function statusColor(state: string) {
  if (state === "READY") return "bg-success";
  if (state === "ERROR" || state === "CANCELED") return "bg-error";
  if (state === "BUILDING" || state === "QUEUED" || state === "INITIALIZING") return "bg-warning animate-pulse";
  return "bg-muted-foreground/50";
}

function VercelDashboard({ ws, onWsUpdate }: { ws: any; onWsUpdate: () => void }) {
  const getDeps = useServerFn(getVercelDeployments);
  const trigger = useServerFn(triggerVercelDeploy);
  const getEnvs = useServerFn(getVercelEnvVars);
  const addEnv = useServerFn(addVercelEnvVar);
  const delEnv = useServerFn(deleteVercelEnvVar);
  const getLogs = useServerFn(getVercelBuildLogs);

  const [deployments, setDeployments] = useState<any[]>([]);
  const [envs, setEnvs] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [deploying, setDeploying] = useState(false);
  const [showAddEnv, setShowAddEnv] = useState(false);

  const current = deployments[0];

  const load = async () => {
    try {
      const [d, e] = await Promise.all([
        getDeps({ data: { workspaceId: ws.id } }),
        getEnvs({ data: { workspaceId: ws.id } }).catch(() => ({ envs: [] })),
      ]);
      setDeployments(d.deployments);
      setEnvs(e.envs);
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [ws.id]);

  // poll while building
  useEffect(() => {
    if (!current) return;
    if (!["BUILDING", "QUEUED", "INITIALIZING"].includes(current.state)) return;
    const t = setInterval(() => {
      load();
      if (current.id) getLogs({ data: { workspaceId: ws.id, deploymentId: current.id } })
        .then((r) => setLogs(r.lines)).catch(() => {});
    }, 3000);
    return () => clearInterval(t);
    // eslint-disable-next-line
  }, [current?.id, current?.state]);

  // load logs for current
  useEffect(() => {
    if (!current?.id) return;
    getLogs({ data: { workspaceId: ws.id, deploymentId: current.id } })
      .then((r) => setLogs(r.lines)).catch(() => setLogs([]));
    // eslint-disable-next-line
  }, [current?.id]);

  const redeploy = async () => {
    setDeploying(true);
    try {
      await trigger({ data: { workspaceId: ws.id } });
      toast.success("Deployment triggered");
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    } finally {
      setDeploying(false);
    }
  };

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Loading Vercel…</div>;

  return (
    <div className="p-6 max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Project</div>
          <div className="font-semibold">{ws.vercel_project_name}</div>
        </div>
        <button onClick={load} className="text-xs border border-border rounded px-3 py-1.5 hover:border-foreground inline-flex items-center gap-1.5">
          <RefreshCw className="h-3 w-3" /> Refresh
        </button>
      </div>

      {current && (
        <Card title="Current deployment">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${statusColor(current.state)}`} />
                <span className="text-sm font-medium">{current.state}</span>
                {current.target && <span className="text-[10px] uppercase text-muted-foreground">{current.target}</span>}
              </div>
              {current.url && (
                <a href={current.url} target="_blank" rel="noreferrer" className="text-sm text-brand hover:underline inline-flex items-center gap-1 font-mono">
                  {current.url.replace("https://", "")} <ExternalLink className="h-3 w-3" />
                </a>
              )}
              {current.branch && <div className="text-xs text-muted-foreground">Branch: <span className="font-mono">{current.branch}</span></div>}
              {current.commitMessage && <div className="text-xs text-muted-foreground truncate max-w-md">{current.commitMessage}</div>}
              <div className="text-xs text-muted-foreground">{new Date(current.created).toLocaleString()}</div>
            </div>
            <div className="flex gap-2">
              {current.url && (
                <a href={current.url} target="_blank" rel="noreferrer"
                  className="px-3 py-1.5 border border-border rounded text-xs hover:border-foreground inline-flex items-center gap-1.5">
                  Open <ExternalLink className="h-3 w-3" />
                </a>
              )}
              <button onClick={redeploy} disabled={deploying}
                className="px-3 py-1.5 bg-brand text-primary-foreground rounded text-xs hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-1.5">
                <RefreshCw className="h-3 w-3" /> {deploying ? "Triggering…" : "Redeploy"}
              </button>
            </div>
          </div>
        </Card>
      )}

      <Card title="Deployment history">
        <ul className="divide-y divide-border -mx-5">
          {deployments.map((d) => (
            <li key={d.id} className="px-5 py-2.5 flex items-center gap-3 text-sm">
              <span className={`h-2 w-2 rounded-full ${statusColor(d.state)}`} />
              <div className="flex-1 min-w-0">
                <div className="truncate">{d.commitMessage || "—"}</div>
                <div className="text-xs text-muted-foreground font-mono truncate">
                  {d.branch ?? ""}{d.commitSha ? ` · ${d.commitSha.slice(0, 7)}` : ""}
                </div>
              </div>
              <span className="text-xs text-muted-foreground">{new Date(d.created).toLocaleString()}</span>
              {d.url && <a href={d.url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground"><ExternalLink className="h-3 w-3" /></a>}
            </li>
          ))}
        </ul>
      </Card>

      {logs.length > 0 && (
        <Card title={`Build logs · ${current?.state ?? ""}`}>
          <div className="bg-background border border-border rounded p-3 max-h-72 overflow-y-auto scrollbar-thin font-mono text-[11px] leading-relaxed">
            {logs.map((l, i) => (
              <div key={i} className="whitespace-pre-wrap"><span className="text-muted-foreground">{new Date(l.ts).toLocaleTimeString()}</span> {l.text}</div>
            ))}
          </div>
        </Card>
      )}

      <Card title="Environment variables" right={
        <button onClick={() => setShowAddEnv(!showAddEnv)} className="text-xs border border-border rounded px-2.5 py-1 hover:border-foreground inline-flex items-center gap-1">
          <Plus className="h-3 w-3" /> Add
        </button>
      }>
        {showAddEnv && (
          <AddEnvForm
            onAdd={async (key, value, target) => {
              try {
                await addEnv({ data: { workspaceId: ws.id, key, value, target } });
                toast.success("Added");
                setShowAddEnv(false);
                load();
              } catch (e: any) { toast.error(e?.message ?? "Failed"); }
            }}
            onCancel={() => setShowAddEnv(false)}
          />
        )}
        {envs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No environment variables.</p>
        ) : (
          <ul className="divide-y divide-border -mx-5">
            {envs.map((e) => (
              <li key={e.id} className="px-5 py-2 flex items-center gap-3 text-sm">
                <span className="font-mono flex-1">{e.key}</span>
                <span className="text-xs text-muted-foreground">{Array.isArray(e.target) ? e.target.join(",") : e.target}</span>
                <button onClick={async () => {
                  if (!confirm(`Delete ${e.key}?`)) return;
                  try { await delEnv({ data: { workspaceId: ws.id, envId: e.id } }); toast.success("Deleted"); load(); }
                  catch (err: any) { toast.error(err?.message ?? "Failed"); }
                }} className="text-muted-foreground hover:text-error">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function AddEnvForm({
  onAdd, onCancel,
}: { onAdd: (k: string, v: string, t: ("production" | "preview" | "development")[]) => void; onCancel: () => void }) {
  const [k, setK] = useState("");
  const [v, setV] = useState("");
  const [targets, setTargets] = useState<Record<string, boolean>>({ production: true, preview: true, development: false });
  const sel = (Object.keys(targets).filter((x) => targets[x]) as ("production" | "preview" | "development")[]);
  return (
    <div className="mb-4 p-3 border border-border rounded bg-background space-y-2">
      <input value={k} onChange={(e) => setK(e.target.value.toUpperCase())} placeholder="KEY_NAME"
        className="w-full bg-surface border border-border rounded px-3 py-2 text-sm font-mono" />
      <input value={v} onChange={(e) => setV(e.target.value)} placeholder="value"
        className="w-full bg-surface border border-border rounded px-3 py-2 text-sm font-mono" />
      <div className="flex gap-3 text-xs">
        {(["production", "preview", "development"] as const).map((t) => (
          <label key={t} className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={targets[t]} onChange={(e) => setTargets({ ...targets, [t]: e.target.checked })} className="accent-brand" />
            {t}
          </label>
        ))}
      </div>
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="px-3 py-1.5 border border-border rounded text-xs hover:border-foreground">Cancel</button>
        <button onClick={() => onAdd(k, v, sel)} disabled={!k || !v || sel.length === 0}
          className="px-3 py-1.5 bg-brand text-primary-foreground rounded text-xs hover:opacity-90 disabled:opacity-50">
          Add
        </button>
      </div>
    </div>
  );
}
