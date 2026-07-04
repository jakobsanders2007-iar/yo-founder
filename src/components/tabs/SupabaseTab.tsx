import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, Check, Database, Loader2, Eye, EyeOff, RefreshCw, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import {
  startSupabaseMgmtOAuth,
  listSupabaseMgmtProjects,
  connectSupabaseMgmtProject,
  getSupabaseConnection,
  saveSupabaseConnection,
  disconnectSupabase,
} from "@/lib/integrations.functions";

function isScopeError(e: any): boolean {
  const msg = String(e?.message ?? "").toLowerCase();
  return msg.includes("403") || msg.includes("missing required scopes") || msg.includes("couldn't read service_role key");
}

export function SupabaseTab({ ws, onWsUpdate }: { ws: any; onWsUpdate: () => void }) {
  const startOAuth = useServerFn(startSupabaseMgmtOAuth);
  const listProjects = useServerFn(listSupabaseMgmtProjects);
  const connectProject = useServerFn(connectSupabaseMgmtProject);
  const getConn = useServerFn(getSupabaseConnection);
  const saveManual = useServerFn(saveSupabaseConnection);
  const disconnectFn = useServerFn(disconnectSupabase);

  const [conn, setConn] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<any[] | null>(null);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [busy, setBusy] = useState(false);
  const [scopeError, setScopeError] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [manualUrl, setManualUrl] = useState("");
  const [manualKey, setManualKey] = useState("");
  const [showManual, setShowManual] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const c = await getConn({ data: { workspaceId: ws.id } });
      setConn(c);
    } finally {
      setLoading(false);
    }
  }, [getConn, ws.id]);

  useEffect(() => { reload(); }, [reload]);

  const connect = async () => {
    try {
      const { url } = await startOAuth({ data: { workspaceId: ws.id, origin: window.location.origin } });
      window.location.href = url;
    } catch (e: any) {
      toast.error(e?.message ?? "Couldn't start Supabase connect");
    }
  };

  const loadProjects = async () => {
    setLoadingProjects(true);
    try {
      const r = await listProjects({ data: { workspaceId: ws.id } });
      setProjects(r.projects);
    } catch (e: any) {
      if (isScopeError(e)) setScopeError(true);
      else toast.error(e?.message ?? "Couldn't load projects");
    } finally {
      setLoadingProjects(false);
    }
  };

  const pick = async (projectRef: string) => {
    setBusy(true);
    try {
      await connectProject({ data: { workspaceId: ws.id, projectRef } });
      toast.success("Project connected");
      await reload();
      onWsUpdate();
    } catch (e: any) {
      if (isScopeError(e)) setScopeError(true);
      else toast.error(e?.message ?? "Couldn't connect project");
    } finally {
      setBusy(false);
    }
  };

  // Clears the stale mgmt token and immediately restarts OAuth for a fresh one with correct scopes
  const reconnectSupabase = async () => {
    setBusy(true);
    try {
      await disconnectFn({ data: { workspaceId: ws.id } });
      setScopeError(false);
      setProjects(null);
      await connect();
      await reload();
    } catch (e: any) {
      toast.error(e?.message ?? "Couldn't reconnect");
    } finally {
      setBusy(false);
    }
  };

  const saveManualConn = async () => {
    if (!manualUrl.trim() || !manualKey.trim()) return;
    setBusy(true);
    try {
      await saveManual({ data: { workspaceId: ws.id, url: manualUrl.trim(), serviceKey: manualKey.trim() } });
      toast.success("Saved");
      setManualUrl(""); setManualKey(""); setShowManual(false);
      await reload();
      onWsUpdate();
    } catch (e: any) {
      toast.error(e?.message ?? "Couldn't save");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>;
  }

  // Connected view
  if (conn?.url && conn?.serviceKey) {
    return (
      <div className="p-6 max-w-3xl space-y-4">
        {scopeError && <ScopeErrorBanner busy={busy} onReconnect={reconnectSupabase} />}
        <div className="bg-surface border border-border rounded-lg p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="inline-flex items-center gap-1.5 text-xs text-success">
                <Check className="h-3.5 w-3.5" /> Connected
              </div>
              <div className="mt-1 text-lg font-semibold">{conn.projectName || conn.projectRef || "Supabase project"}</div>
            </div>
            <a href={conn.url} target="_blank" rel="noreferrer" className="text-sm inline-flex items-center gap-1.5 text-brand hover:underline">
              Open <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>

          <Row label="Project URL" value={conn.url} mono />
          {conn.anonKey && <Row label="Anon / publishable key" value={conn.anonKey} mono />}
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Service role key</div>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-background border border-border rounded px-3 py-2 text-xs font-mono break-all">
                {showKey ? conn.serviceKey : "•".repeat(48)}
              </code>
              <button onClick={() => setShowKey((s) => !s)} className="border border-border rounded p-2 hover:border-foreground">
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Keep this secret — it bypasses row-level security.</p>
          </div>

          <div className="flex gap-2 pt-2 border-t border-border">
            {conn.hasMgmt && (
              <button onClick={loadProjects} className="px-3 py-1.5 border border-border rounded text-xs hover:border-foreground inline-flex items-center gap-1.5">
                <RefreshCw className="h-3.5 w-3.5" /> Switch project
              </button>
            )}
            <button onClick={connect} className="px-3 py-1.5 border border-border rounded text-xs hover:border-foreground">
              Reconnect
            </button>
          </div>
        </div>

        {projects && (
          <ProjectPicker projects={projects} busy={busy} onPick={pick} />
        )}
      </div>
    );
  }

  // Has mgmt token but no project selected
  if (conn?.hasMgmt) {
    return (
      <div className="p-6 max-w-3xl space-y-4">
        {scopeError && <ScopeErrorBanner busy={busy} onReconnect={reconnectSupabase} />}
        <div className="bg-surface border border-border rounded-lg p-6">
          <div className="inline-flex items-center gap-1.5 text-xs text-success mb-2">
            <Check className="h-3.5 w-3.5" /> Authorized with Supabase
          </div>
          <h2 className="text-lg font-semibold">Pick a project</h2>
          <p className="text-sm text-muted-foreground mt-1 mb-4">Choose which Supabase project this workspace should use.</p>
          {!projects ? (
            <button onClick={loadProjects} disabled={loadingProjects} className="bg-brand text-primary-foreground px-4 py-2 rounded text-sm font-medium disabled:opacity-50">
              {loadingProjects ? "Loading…" : "Load my projects"}
            </button>
          ) : (
            <ProjectPicker projects={projects} busy={busy} onPick={pick} />
          )}
        </div>
      </div>
    );
  }

  // Not connected at all
  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="bg-surface border border-border rounded-lg p-10 text-center">
        <div className="mx-auto h-20 w-20 rounded-full bg-foreground/5 flex items-center justify-center mb-5">
          <Database className="h-10 w-10" />
        </div>
        <h2 className="text-xl font-semibold">Connect Supabase</h2>
        <p className="text-sm text-muted-foreground mt-2 max-w-sm mx-auto">
          Authorize once and we'll list your projects and pull the keys automatically — no copy/paste needed.
        </p>
        <button
          onClick={connect}
          className="mt-6 inline-flex items-center justify-center gap-2 bg-brand text-primary-foreground font-semibold px-6 py-3 rounded-lg text-base hover:opacity-90"
        >
          <Database className="h-4 w-4" /> Connect with Supabase
        </button>

        <div className="mt-8 pt-6 border-t border-border text-left">
          <button onClick={() => setShowManual((s) => !s)} className="text-xs text-muted-foreground underline">
            {showManual ? "Hide" : "Or paste a project URL + service key manually"}
          </button>
          {showManual && (
            <div className="mt-3 space-y-2">
              <input
                value={manualUrl}
                onChange={(e) => setManualUrl(e.target.value)}
                placeholder="https://xxxx.supabase.co"
                className="w-full bg-background border border-border rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-brand"
              />
              <input
                value={manualKey}
                onChange={(e) => setManualKey(e.target.value)}
                placeholder="service role key (starts with eyJ or sb_secret_)"
                className="w-full bg-background border border-border rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-brand"
              />
              <button
                onClick={saveManualConn}
                disabled={busy || !manualUrl.trim() || !manualKey.trim()}
                className="bg-brand text-primary-foreground px-4 py-2 rounded text-sm font-medium hover:opacity-90 disabled:opacity-50"
              >
                {busy ? "Saving…" : "Save connection"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ScopeErrorBanner({ busy, onReconnect }: { busy: boolean; onReconnect: () => void }) {
  return (
    <div className="bg-error/10 border border-error/40 rounded-lg p-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-start gap-2.5 min-w-0">
        <AlertTriangle className="h-4 w-4 text-error mt-0.5 shrink-0" />
        <p className="text-sm text-foreground/90">
          Your Supabase connection needs updated permissions. Disconnect and reconnect to fix this.
        </p>
      </div>
      <button
        onClick={onReconnect}
        disabled={busy}
        className="bg-brand text-primary-foreground px-4 py-2 rounded text-sm font-medium hover:opacity-90 disabled:opacity-50 shrink-0"
      >
        {busy ? "Reconnecting…" : "Reconnect Supabase"}
      </button>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">{label}</div>
      <code className={`block bg-background border border-border rounded px-3 py-2 text-xs break-all ${mono ? "font-mono" : ""}`}>{value}</code>
    </div>
  );
}

function ProjectPicker({ projects, busy, onPick }: { projects: any[]; busy: boolean; onPick: (ref: string) => void }) {
  return (
    <div className="bg-surface border border-border rounded-lg divide-y divide-border">
      {projects.length === 0 && <div className="p-4 text-sm text-muted-foreground">No projects found in your Supabase account.</div>}
      {projects.map((p) => (
        <button
          key={p.id}
          onClick={() => onPick(p.id)}
          disabled={busy}
          className="w-full text-left p-4 hover:bg-foreground/5 disabled:opacity-50 flex items-center justify-between gap-4"
        >
          <div>
            <div className="font-medium">{p.name}</div>
            <div className="text-xs text-muted-foreground font-mono">{p.id} · {p.region} · {p.status}</div>
          </div>
          <span className="text-xs text-brand">Connect →</span>
        </button>
      ))}
    </div>
  );
}
